import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth-user';
import {
  ContainerStatus,
  FileFormat,
  ParseStatus,
  ParserProfileAuditEventCode,
  ParserProfileEvidenceOutcome,
  ParserProfileLifecycle,
  ParserProfileReviewStatus,
  ParserProfileTrustState,
  ParserSourceKind,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import type { WorkerParsePayload } from '../imports/worker-parser.service';
import {
  calculateDestinationPallets,
  type PalletPackageType,
} from '../pallet-calculation/pallet-calculation';
import {
  ParserProfileWorkerService,
  type ParserProfileExecutionPayload,
  type ParserProfileMatchPayload,
} from '../parser-learning-cases/parser-profile-worker.service';
import { PrismaService } from '../prisma/prisma.service';
import { PalletPolicyResolver } from '../settings/pallet-policy.resolver';
import type { PalletPolicySnapshotDto } from '../settings/dto/operational-settings-response.dto';
import type {
  ParserReviewCorrectDto,
  ParserReviewDecisionDto,
} from './dto/parser-profile-review.dto';
import {
  classifyParserMaterialCorrection,
} from './parser-profile-material';

interface StageImportRecord {
  id: string;
  storedPath: string;
  fileSha256: string;
  originalFilename: string;
}

interface CanonicalLine extends Record<string, unknown> {
  rowNumber: number;
  included: boolean;
  destinationCode: string | null;
  cartons: number | null;
  volumeCbm: string | null;
  packageType: string | null;
  deliveryMethod: string | null;
  waybillNo: string | null;
  referenceNo: string | null;
  poNumber: string | null;
}

interface CanonicalResult extends Record<string, unknown> {
  containerNo: string;
  company: string | null;
  formatType: string;
  parserVersion: string;
  lines: CanonicalLine[];
}

interface DestinationSnapshot extends Record<string, unknown> {
  destinationCode: string;
  destinationType: string | null;
  packageType: PalletPackageType;
  cartons: number;
  volumeCbm: string;
  calculatedPallets: number;
  finalPallets: number;
  palletRuleCode: string;
  calculationBasisCbm: string | null;
  roundingMode: string;
  palletPolicySnapshot: Record<string, unknown>;
  warnings: unknown[];
}

const reviewInclude = {
  profileVersion: { include: { family: true } },
  reviewedBy: { select: { id: true, name: true } },
  acceptedContainer: { select: { id: true, containerNo: true, status: true } },
} as const;

type ReviewRecord = Prisma.ParserProfileReviewGetPayload<{
  include: typeof reviewInclude;
}>;

@Injectable()
export class ParserProfileReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: ParserProfileWorkerService,
    private readonly palletPolicyResolver: PalletPolicyResolver,
  ) {}

  async stageIfMatched(
    importFile: StageImportRecord,
    builtInPayload: WorkerParsePayload,
    actor: AuthenticatedUser,
  ): Promise<boolean> {
    const existing = await this.prisma.parserProfileReview.findUnique({
      where: { importFileId: importFile.id },
      include: reviewInclude,
    });
    if (existing) return true;

    const existingContainer = await this.prisma.container.findFirst({
      where: { importFileId: importFile.id },
      select: { id: true },
    });
    if (existingContainer) return false;

    const profiles = await this.prisma.parserProfileVersion.findMany({
      where: {
        lifecycle: ParserProfileLifecycle.ACTIVE,
        trustState: ParserProfileTrustState.REVIEW_REQUIRED,
      },
      select: {
        id: true,
        familyId: true,
        version: true,
        fingerprintDefinition: true,
        mappingDefinition: true,
        matcherVersion: true,
        mappingVersion: true,
      },
    });
    if (profiles.length === 0) return false;

    let match: ParserProfileMatchPayload;
    try {
      match = await this.worker.matchProfiles(
        importFile.storedPath,
        profiles.map((profile) => ({
          ...this.object(profile.fingerprintDefinition),
          profileId: profile.id,
        })),
      );
    } catch (error) {
      await this.persistAttemptFailure(
        importFile,
        actor,
        ParserProfileAuditEventCode.REVIEW_MATCH_FAILED,
        this.exceptionCode(error, 'PARSER_PROFILE_MATCH_FAILED'),
        { candidateProfileIds: profiles.map((profile) => profile.id) },
        false,
      );
      return false;
    }
    if (match.issues.length > 0 || !match.selectedProfileId || match.issueCode) {
      await this.persistAttemptFailure(
        importFile,
        actor,
        ParserProfileAuditEventCode.REVIEW_MATCH_FAILED,
        match.issueCode ?? 'PARSER_PROFILE_MATCH_INVALID',
        {
          issues: match.issues,
          candidates: match.candidates.map((item) => ({
            profileId: item.profileId,
            matched: item.matched,
            reasons: item.reasons,
          })),
        },
        false,
      );
      return false;
    }
    const profile = profiles.find((item) => item.id === match.selectedProfileId);
    const candidate = match.candidates.find(
      (item) => item.profileId === match.selectedProfileId,
    );
    if (!profile || !candidate?.matched) {
      await this.persistAttemptFailure(
        importFile,
        actor,
        ParserProfileAuditEventCode.REVIEW_MATCH_FAILED,
        'PARSER_PROFILE_MATCH_SELECTION_INVALID',
        { selectedProfileId: match.selectedProfileId },
        false,
      );
      return false;
    }

    let policy: PalletPolicySnapshotDto;
    try {
      policy = await this.palletPolicyResolver.resolve();
    } catch (error) {
      await this.persistAttemptFailure(
        importFile,
        actor,
        ParserProfileAuditEventCode.REVIEW_EXECUTION_FAILED,
        this.exceptionCode(error, 'PARSER_REVIEW_POLICY_RESOLUTION_FAILED'),
        { profileVersionId: profile.id },
        true,
      );
      return true;
    }
    const replayInputHash = this.hash({
      importFileSha256: importFile.fileSha256,
      profileVersionId: profile.id,
      profileVersion: profile.version,
      fingerprintHash: candidate.hash,
      matcherVersion: profile.matcherVersion,
      mappingVersion: profile.mappingVersion,
      palletSettingsRevision: policy.settingsRevision,
    });
    let execution: ParserProfileExecutionPayload;
    try {
      execution = await this.worker.executeMapping(
        importFile.storedPath,
        this.object(profile.mappingDefinition),
        replayInputHash,
      );
    } catch (error) {
      await this.persistAttemptFailure(
        importFile,
        actor,
        ParserProfileAuditEventCode.REVIEW_EXECUTION_FAILED,
        this.exceptionCode(error, 'PARSER_PROFILE_EXECUTION_FAILED'),
        { profileVersionId: profile.id, replayInputHash },
        true,
      );
      return true;
    }
    if (!execution.result || execution.issues.length > 0) {
      await this.persistAttemptFailure(
        importFile,
        actor,
        ParserProfileAuditEventCode.REVIEW_EXECUTION_FAILED,
        execution.issues[0]?.code ?? 'PARSER_PROFILE_EXECUTION_NO_RESULT',
        {
          profileVersionId: profile.id,
          replayInputHash,
          issues: execution.issues,
        },
        true,
      );
      return true;
    }
    const executionResult = execution.result;

    let canonicalResult: CanonicalResult;
    let destinations: DestinationSnapshot[];
    try {
      canonicalResult = this.canonicalResult(executionResult);
      destinations = this.destinationSnapshots(canonicalResult.lines, policy);
    } catch (error) {
      await this.persistAttemptFailure(
        importFile,
        actor,
        ParserProfileAuditEventCode.REVIEW_EXECUTION_FAILED,
        this.exceptionCode(error, 'PARSER_PROFILE_RESULT_INVALID'),
        { profileVersionId: profile.id, replayInputHash },
        true,
      );
      return true;
    }
    const warnings = [
      ...(Array.isArray(executionResult.warnings)
        ? executionResult.warnings
        : []),
      ...destinations.flatMap((destination) => destination.warnings),
    ];
    const errors = Array.isArray(executionResult.errors)
      ? executionResult.errors
      : [];
    const stagedResult = {
      ...canonicalResult,
      rawMetadata: executionResult.rawMetadata ?? {},
      destinationSummaries: destinations,
      palletPolicy: policy,
      pinned: {
        importFileSha256: importFile.fileSha256,
        profileVersionId: profile.id,
        profileVersion: profile.version,
        fingerprintHash: candidate.hash,
        matcherVersion: profile.matcherVersion,
        mappingVersion: profile.mappingVersion,
        workerVersion: execution.workerVersion,
        parserVersion: canonicalResult.parserVersion,
        replayInputHash,
      },
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockImport(tx, importFile.id);
        const current = await tx.importFile.findUnique({
          where: { id: importFile.id, deletedAt: null },
          select: { id: true, fileSha256: true },
        });
        if (!current || current.fileSha256 !== importFile.fileSha256) {
          throw new ConflictException(
            this.error('PARSER_REVIEW_SOURCE_CHANGED', { importFileId: importFile.id }),
          );
        }
        const duplicate = await tx.parserProfileReview.findUnique({
          where: { importFileId: importFile.id },
          select: { id: true },
        });
        if (duplicate) return true;
        const formalContainer = await tx.container.findFirst({
          where: { importFileId: importFile.id },
          select: { id: true },
        });
        if (formalContainer) {
          throw new ConflictException(
            this.error('PARSER_REVIEW_FORMAL_RESULT_EXISTS', {
              importFileId: importFile.id,
              containerId: formalContainer.id,
            }),
          );
        }
        await this.lockVersion(tx, profile.id);
        const currentProfile = await tx.parserProfileVersion.findUnique({
          where: { id: profile.id },
          select: {
            lifecycle: true,
            trustState: true,
            matcherVersion: true,
            mappingVersion: true,
          },
        });
        if (
          !currentProfile ||
          currentProfile.lifecycle !== ParserProfileLifecycle.ACTIVE ||
          currentProfile.trustState !== ParserProfileTrustState.REVIEW_REQUIRED ||
          currentProfile.matcherVersion !== profile.matcherVersion ||
          currentProfile.mappingVersion !== profile.mappingVersion
        ) {
          await tx.parserProfileAuditEvent.create({
            data: {
              eventCode: ParserProfileAuditEventCode.REVIEW_MATCH_FAILED,
              actorId: actor.id,
              profileFamilyId: profile.familyId,
              profileVersionId: profile.id,
              importFileId: importFile.id,
              metadata: this.json({
                code: 'PARSER_REVIEW_PROFILE_STATE_CHANGED',
                lifecycle: currentProfile?.lifecycle ?? null,
                trustState: currentProfile?.trustState ?? null,
              }),
            },
          });
          return false;
        }
        await tx.parserProfileReview.create({
          data: {
            importFileId: importFile.id,
            profileVersionId: profile.id,
            sourceFileSha256: importFile.fileSha256,
            status: ParserProfileReviewStatus.PENDING,
            fingerprintHash: candidate.hash,
            matcherVersion: profile.matcherVersion,
            mappingVersion: profile.mappingVersion,
            workerVersion: execution.workerVersion,
            parserVersion: canonicalResult.parserVersion,
            builtInEvidence: this.nullableJson(builtInPayload.detection ?? null),
            matchEvidence: this.json({
              selectedProfileId: match.selectedProfileId,
              issueCode: match.issueCode,
              reasons: candidate.reasons,
              structuralEvidence: candidate.structuralEvidence,
            }),
            sourcePreview: this.nullableJson(match.inspection),
            stagedResult: this.json(stagedResult),
            destinationSummary: this.json(destinations),
            reportPreview: this.json(this.reportPreview(canonicalResult, destinations)),
            warnings: this.nullableJson(warnings),
            errors: this.nullableJson(errors),
            provenance: this.nullableJson(executionResult.provenance ?? {}),
          },
        });
        await tx.importFile.update({
          where: { id: importFile.id },
          data: {
            format: this.fileFormat(canonicalResult.formatType),
            parseStatus: ParseStatus.REVIEW_REQUIRED,
            parserVersion: canonicalResult.parserVersion,
            warningCount: warnings.length,
            errorCount: errors.length,
            errorMessage: errors.length > 0 ? 'PARSER_PROFILE_REVIEW_HAS_ERRORS' : null,
            rawMetadata: this.json({
              profileReview: {
                profileVersionId: profile.id,
                fingerprintHash: candidate.hash,
                matcherVersion: profile.matcherVersion,
                mappingVersion: profile.mappingVersion,
                workerVersion: execution.workerVersion,
              },
              warnings,
              errors,
            }),
          },
        });
        return true;
      });
    } catch (error) {
      if (this.uniqueConstraint(error)) {
        return Boolean(
          await this.prisma.parserProfileReview.findUnique({
            where: { importFileId: importFile.id },
            select: { id: true },
          }),
        );
      }
      throw error;
    }
  }

  async getByImport(importFileId: string): Promise<unknown> {
    return this.toResponse(await this.findReviewOrThrow(this.prisma, importFileId));
  }

  async hasReview(importFileId: string): Promise<boolean> {
    return Boolean(
      await this.prisma.parserProfileReview.findUnique({
        where: { importFileId },
        select: { id: true },
      }),
    );
  }

  accept(
    importFileId: string,
    dto: ParserReviewDecisionDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.commit(importFileId, dto, actor, null);
  }

  correct(
    importFileId: string,
    dto: ParserReviewCorrectDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.commit(importFileId, dto, actor, dto.canonicalResult);
  }

  async reject(
    importFileId: string,
    dto: ParserReviewDecisionDto & { reason: string },
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockImport(tx, importFileId);
      const review = await this.lockedReview(tx, importFileId);
      if (review.status === ParserProfileReviewStatus.REJECTED) {
        return this.toResponse(review);
      }
      this.assertPendingRevision(review, dto.expectedRevision);
      await this.lockVersion(tx, review.profileVersionId);
      const profile = await tx.parserProfileVersion.findUnique({
        where: { id: review.profileVersionId },
        include: { family: true },
      });
      if (!profile) throw this.notFound('PARSER_PROFILE_VERSION_NOT_FOUND', {});
      const evidence = await tx.parserProfileEvidence.findUnique({
        where: {
          profileVersionId_importFileId: {
            profileVersionId: profile.id,
            importFileId,
          },
        },
      });
      if (!evidence) {
        await tx.parserProfileEvidence.create({
          data: {
            profileVersionId: profile.id,
            importFileId,
            outcome: ParserProfileEvidenceOutcome.REJECTED,
            accepted: false,
            materialCorrection: true,
            resultSnapshot: this.json(review.stagedResult),
            correctionDiff: this.json([
              {
                code: 'PARSER_PROFILE_MATCH_REJECTED',
                field: 'profileMatch',
                material: true,
              },
            ]),
            streakAfter: 0,
            reason: dto.reason,
            reviewedById: actor.id,
          },
        });
        await tx.parserProfileVersion.update({
          where: { id: profile.id },
          data: {
            trustState: ParserProfileTrustState.REVIEW_REQUIRED,
            trustStreak: 0,
          },
        });
        await tx.parserProfileAuditEvent.create({
          data: {
            eventCode: ParserProfileAuditEventCode.EVIDENCE_REJECTED,
            actorId: actor.id,
            profileFamilyId: profile.familyId,
            profileVersionId: profile.id,
            importFileId,
            metadata: { reason: dto.reason, streakAfter: 0 },
          },
        });
      }
      await tx.importFile.update({
        where: { id: importFileId },
        data: {
          parseStatus: ParseStatus.ERROR,
          errorCount: 1,
          errorMessage: 'PARSER_PROFILE_MATCH_REJECTED',
        },
      });
      const updated = await tx.parserProfileReview.update({
        where: { id: review.id },
        data: {
          status: ParserProfileReviewStatus.REJECTED,
          revision: { increment: 1 },
          decisionReason: dto.reason,
          correctionDiff: this.json([
            {
              code: 'PARSER_PROFILE_MATCH_REJECTED',
              field: 'profileMatch',
              material: true,
            },
          ]),
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
        include: reviewInclude,
      });
      return this.toResponse(updated);
    });
  }

  private async commit(
    importFileId: string,
    dto: ParserReviewDecisionDto,
    actor: AuthenticatedUser,
    correctedInput: ParserReviewCorrectDto['canonicalResult'] | null,
  ): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockImport(tx, importFileId);
      const review = await this.lockedReview(tx, importFileId);
      if (
        review.status === ParserProfileReviewStatus.ACCEPTED ||
        review.status === ParserProfileReviewStatus.CORRECTED
      ) {
        return this.toResponse(review);
      }
      this.assertPendingRevision(review, dto.expectedRevision);
      await this.lockVersion(tx, review.profileVersionId);
      const profile = await tx.parserProfileVersion.findUnique({
        where: { id: review.profileVersionId },
        include: { family: true },
      });
      if (!profile) throw this.notFound('PARSER_PROFILE_VERSION_NOT_FOUND', {});
      if (profile.lifecycle !== ParserProfileLifecycle.ACTIVE) {
        throw new ConflictException(
          this.error('PARSER_REVIEW_PROFILE_NOT_ACTIVE', {
            profileVersionId: profile.id,
            lifecycle: profile.lifecycle,
          }),
        );
      }
      const importFile = await tx.importFile.findUnique({
        where: { id: importFileId, deletedAt: null },
        select: { fileSha256: true },
      });
      if (!importFile || importFile.fileSha256 !== review.sourceFileSha256) {
        throw new ConflictException(
          this.error('PARSER_REVIEW_SOURCE_CHANGED', { importFileId }),
        );
      }

      const staged = this.canonicalResult(review.stagedResult);
      const corrected = correctedInput
        ? this.mergeCorrectedResult(staged, correctedInput)
        : staged;
      this.assertNoParserErrors(review.errors, corrected);
      const policy = this.policyFromStaged(review.stagedResult);
      const stagedDestinations = this.destinationSnapshots(staged.lines, policy);
      const destinations = this.destinationSnapshots(corrected.lines, policy);
      const diff = correctedInput
        ? classifyParserMaterialCorrection(staged, corrected, {
            groupingChanged: this.destinationGroupingChanged(
              stagedDestinations,
              destinations,
            ),
            palletOutcomeChanged: this.palletOutcomeChanged(
              stagedDestinations,
              destinations,
            ),
          })
        : [];
      const material = diff.some((item) => item.material);
      if (correctedInput && diff.length === 0) {
        throw new ConflictException(
          this.error('PARSER_REVIEW_NO_CHANGE', { importFileId }),
        );
      }
      const container = await tx.container.create({
        data: {
          importFileId,
          containerNo: corrected.containerNo,
          company: corrected.company,
          sourceFormat: this.fileFormat(corrected.formatType),
          parserVersion: review.parserVersion,
          parserSourceKind: ParserSourceKind.PROFILE,
          parserProfileVersionId: profile.id,
          status: ContainerStatus.PARSED,
          rawJson: this.json({
            ...corrected,
            provenance: review.provenance ?? {},
            profileReviewId: review.id,
          }),
          warnings: review.warnings ?? Prisma.JsonNull,
          errors: review.errors ?? Prisma.JsonNull,
        },
      });
      if (corrected.lines.length > 0) {
        await tx.containerLine.createMany({
          data: corrected.lines
            .filter((line) => line.included)
            .map((line) => ({
              containerId: container.id,
              lineNo: line.rowNumber,
              destinationCode: line.destinationCode,
              destinationType: line.deliveryMethod,
              cartons: line.cartons,
              volume: line.volumeCbm,
              rawJson: this.json({
                ...(this.object(line.raw_json) ?? {}),
                canonical: this.canonicalLinePublic(line),
                provenance: line.provenance ?? null,
              }),
              warnings: this.nullableJson(line.warnings ?? []),
              errors: this.nullableJson(line.errors ?? []),
            })),
        });
      }
      if (destinations.length > 0) {
        await tx.containerDestination.createMany({
          data: destinations.map((destination) => ({
            containerId: container.id,
            destinationCode: destination.destinationCode,
            destinationType: destination.destinationType,
            packageType: destination.packageType,
            cartons: destination.cartons,
            volume: destination.volumeCbm,
            calculatedPallets: destination.calculatedPallets,
            manualPallets: null,
            finalPallets: destination.finalPallets,
            palletRuleCode: destination.palletRuleCode,
            calculationBasisCbm: destination.calculationBasisCbm,
            roundingMode: destination.roundingMode,
            palletPolicySnapshot: this.json(destination.palletPolicySnapshot),
            note: null,
            warnings: this.nullableJson(destination.warnings),
            errors: this.nullableJson([]),
          })),
        });
      }

      const streakAfter = material ? 0 : Math.min(profile.trustStreak + 1, 3);
      const promoted =
        !material &&
        streakAfter === 3 &&
        profile.trustState !== ParserProfileTrustState.TRUSTED;
      const trustStateAfter = material
        ? ParserProfileTrustState.REVIEW_REQUIRED
        : promoted || profile.trustState === ParserProfileTrustState.TRUSTED
          ? ParserProfileTrustState.TRUSTED
          : ParserProfileTrustState.REVIEW_REQUIRED;
      const outcome = material
        ? ParserProfileEvidenceOutcome.MATERIAL_CORRECTION
        : ParserProfileEvidenceOutcome.ACCEPTED;
      await tx.parserProfileEvidence.create({
        data: {
          profileVersionId: profile.id,
          importFileId,
          outcome,
          accepted: !material,
          materialCorrection: material,
          resultSnapshot: this.json({
            stagedCanonicalResult: staged,
            finalCanonicalResult: corrected,
            stagedDestinations,
            finalDestinations: destinations,
            profileVersionId: profile.id,
            sourceFileSha256: review.sourceFileSha256,
          }),
          correctionDiff: correctedInput ? this.json(diff) : Prisma.JsonNull,
          streakAfter,
          reason: dto.reason,
          reviewedById: actor.id,
        },
      });
      await tx.parserProfileVersion.update({
        where: { id: profile.id },
        data: {
          trustStreak: streakAfter,
          trustState: trustStateAfter,
          ...(promoted ? { lifecycleRevision: { increment: 1 } } : {}),
        },
      });
      await tx.parserProfileAuditEvent.create({
        data: {
          eventCode: material
            ? ParserProfileAuditEventCode.EVIDENCE_MATERIAL_CORRECTION
            : ParserProfileAuditEventCode.EVIDENCE_ACCEPTED,
          actorId: actor.id,
          profileFamilyId: profile.familyId,
          profileVersionId: profile.id,
          importFileId,
          containerId: container.id,
          metadata: this.json({
            reason: dto.reason,
            materialCorrection: material,
            correctionDiff: diff,
            streakAfter,
          }),
        },
      });
      if (promoted) {
        await tx.parserProfileAuditEvent.create({
          data: {
            eventCode: ParserProfileAuditEventCode.PROFILE_TRUSTED,
            actorId: actor.id,
            profileFamilyId: profile.familyId,
            profileVersionId: profile.id,
            importFileId,
            containerId: container.id,
            metadata: { streakAfter: 3, trustState: ParserProfileTrustState.TRUSTED },
          },
        });
      }
      const allWarnings = [
        ...this.array(review.warnings),
        ...destinations.flatMap((destination) => destination.warnings),
      ];
      const stagedErrors = this.array(review.errors);
      await tx.importFile.update({
        where: { id: importFileId },
        data: {
          format: this.fileFormat(corrected.formatType),
          parseStatus:
            allWarnings.length > 0 ? ParseStatus.WARNING : ParseStatus.PARSED,
          parserVersion: review.parserVersion,
          warningCount: allWarnings.length,
          errorCount: stagedErrors.length,
          errorMessage:
            stagedErrors.length > 0 ? 'PARSER_PROFILE_REVIEW_HAS_ERRORS' : null,
          rawMetadata: this.json({
            profileReview: {
              id: review.id,
              profileVersionId: profile.id,
              outcome,
              materialCorrection: material,
              streakAfter,
              promoted,
            },
            warnings: allWarnings,
            errors: stagedErrors,
          }),
        },
      });
      const updated = await tx.parserProfileReview.update({
        where: { id: review.id },
        data: {
          status: correctedInput
            ? ParserProfileReviewStatus.CORRECTED
            : ParserProfileReviewStatus.ACCEPTED,
          revision: { increment: 1 },
          acceptedContainerId: container.id,
          finalResult: this.json({
            ...this.object(review.stagedResult),
            ...corrected,
            destinationSummaries: destinations,
            palletPolicy: policy,
          }),
          correctionDiff: correctedInput ? this.json(diff) : Prisma.JsonNull,
          decisionReason: dto.reason,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          finalDestinationSummary: this.json(destinations),
          finalReportPreview: this.json(this.reportPreview(corrected, destinations)),
        },
        include: reviewInclude,
      });
      return this.toResponse(updated, {
        streakAfter,
        trustState: promoted
          ? ParserProfileTrustState.TRUSTED
          : trustStateAfter,
      });
    });
  }

  private async lockedReview(
    tx: Prisma.TransactionClient,
    importFileId: string,
  ): Promise<ReviewRecord> {
    await tx.$queryRaw`SELECT "id" FROM "parser_profile_reviews" WHERE "import_file_id" = ${importFileId} FOR UPDATE`;
    return this.findReviewOrThrow(tx, importFileId);
  }

  private async findReviewOrThrow(
    tx: PrismaService | Prisma.TransactionClient,
    importFileId: string,
  ): Promise<ReviewRecord> {
    const review = await tx.parserProfileReview.findUnique({
      where: { importFileId },
      include: reviewInclude,
    });
    if (!review) {
      throw this.notFound('PARSER_PROFILE_REVIEW_NOT_FOUND', { importFileId });
    }
    return review;
  }

  private async persistAttemptFailure(
    importFile: StageImportRecord,
    actor: AuthenticatedUser,
    eventCode:
      | typeof ParserProfileAuditEventCode.REVIEW_MATCH_FAILED
      | typeof ParserProfileAuditEventCode.REVIEW_EXECUTION_FAILED,
    code: string,
    details: Record<string, unknown>,
    blocksBuiltIn: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockImport(tx, importFile.id);
      const current = await tx.importFile.findUnique({
        where: { id: importFile.id, deletedAt: null },
        select: { id: true, fileSha256: true },
      });
      if (!current || current.fileSha256 !== importFile.fileSha256) {
        throw new ConflictException(
          this.error('PARSER_REVIEW_SOURCE_CHANGED', {
            importFileId: importFile.id,
          }),
        );
      }
      const requestedProfileVersionId = this.string(details.profileVersionId);
      const auditProfile = requestedProfileVersionId
        ? await tx.parserProfileVersion.findUnique({
            where: { id: requestedProfileVersionId },
            select: { id: true, familyId: true },
          })
        : null;
      await tx.parserProfileAuditEvent.create({
        data: {
          eventCode,
          actorId: actor.id,
          profileFamilyId: auditProfile?.familyId,
          profileVersionId: auditProfile?.id,
          importFileId: importFile.id,
          metadata: this.json({ code, blocksBuiltIn, ...details }),
        },
      });
      if (blocksBuiltIn) {
        await tx.importFile.update({
          where: { id: importFile.id },
          data: {
            parseStatus: ParseStatus.ERROR,
            errorCount: 1,
            errorMessage: code,
            rawMetadata: this.json({
              profileReviewAttempt: {
                eventCode,
                code,
                blocksBuiltIn,
                ...details,
              },
            }),
          },
        });
      }
    });
  }

  private assertPendingRevision(review: ReviewRecord, expected: number): void {
    if (review.status !== ParserProfileReviewStatus.PENDING) {
      throw new ConflictException(
        this.error('PARSER_REVIEW_ALREADY_DECIDED', {
          importFileId: review.importFileId,
          status: review.status,
        }),
      );
    }
    if (review.revision !== expected) {
      throw new ConflictException(
        this.error('PARSER_REVIEW_REVISION_CONFLICT', {
          importFileId: review.importFileId,
          expectedRevision: expected,
          actualRevision: review.revision,
        }),
      );
    }
  }

  private assertNoParserErrors(
    value: unknown,
    corrected: CanonicalResult,
  ): void {
    const errors = this.array(value);
    if (errors.length === 0) return;
    throw new ConflictException(
      this.error('PARSER_REVIEW_ERRORS_MUST_BE_RESOLVED', {
        containerNo: corrected.containerNo,
        errorCodes: errors.map((item) => this.string(this.object(item).code)),
      }),
    );
  }

  private async lockImport(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "import_files" WHERE "id" = ${id} FOR UPDATE`;
  }

  private async lockVersion(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "parser_profile_versions" WHERE "id" = ${id} FOR UPDATE`;
  }

  private canonicalResult(value: unknown): CanonicalResult {
    const result = this.object(value);
    const containerNo = this.string(result.containerNo);
    if (!containerNo) {
      throw new ConflictException(
        this.error('PARSER_REVIEW_CONTAINER_REQUIRED', {}),
      );
    }
    return {
      ...result,
      containerNo,
      company: this.string(result.company),
      formatType: this.string(result.formatType) ?? FileFormat.UNKNOWN,
      parserVersion:
        this.string(result.parserVersion) ?? 'parser-profile-engine-v1',
      lines: this.array(result.lines).map((line, index) =>
        this.canonicalLine(line, index),
      ),
    };
  }

  private canonicalLine(value: unknown, index: number): CanonicalLine {
    const line = this.object(value);
    const rowNumber = Number(line.rowNumber ?? index + 1);
    return {
      ...line,
      rowNumber:
        Number.isSafeInteger(rowNumber) && rowNumber > 0 ? rowNumber : index + 1,
      included: line.included !== false,
      destinationCode: this.string(line.destinationCode),
      cartons: this.nullableInt(line.cartons),
      volumeCbm: this.decimal3(line.volumeCbm),
      packageType: this.string(line.packageType),
      deliveryMethod: this.string(line.deliveryMethod),
      waybillNo: this.string(line.waybillNo),
      referenceNo: this.string(line.referenceNo),
      poNumber: this.string(line.poNumber),
    };
  }

  private mergeCorrectedResult(
    staged: CanonicalResult,
    input: ParserReviewCorrectDto['canonicalResult'],
  ): CanonicalResult {
    const stagedByRow = new Map(staged.lines.map((line) => [line.rowNumber, line]));
    return {
      ...staged,
      containerNo: input.containerNo,
      lines: input.lines.map((candidate, index) => {
        const rowNumber = Number(candidate.rowNumber);
        return this.canonicalLine(
          { ...(stagedByRow.get(rowNumber) ?? {}), ...candidate },
          index,
        );
      }),
    };
  }

  private destinationSnapshots(
    lines: CanonicalLine[],
    policy: PalletPolicySnapshotDto,
  ): DestinationSnapshot[] {
    const groups = new Map<
      string,
      {
        destinationCode: string;
        destinationType: string | null;
        packageType: PalletPackageType;
        cartons: number;
        volumeMilli: number;
      }
    >();
    for (const line of lines.filter((item) => item.included)) {
      const destinationCode = line.destinationCode ?? 'NEED_MANUAL_DESTINATION';
      const destinationType = line.deliveryMethod;
      const packageType = this.packageType(line.packageType);
      const key = `${destinationCode}\u0000${destinationType ?? ''}\u0000${packageType}`;
      const current = groups.get(key) ?? {
        destinationCode,
        destinationType,
        packageType,
        cartons: 0,
        volumeMilli: 0,
      };
      current.cartons += line.cartons ?? 0;
      current.volumeMilli += Math.round(Number(line.volumeCbm ?? 0) * 1000);
      groups.set(key, current);
    }
    return [...groups.values()]
      .sort((left, right) =>
        `${left.destinationCode}:${left.destinationType ?? ''}:${left.packageType}`.localeCompare(
          `${right.destinationCode}:${right.destinationType ?? ''}:${right.packageType}`,
        ),
      )
      .map((group) => {
        const volumeCbm = (group.volumeMilli / 1000).toFixed(3);
        const calculation = calculateDestinationPallets(
          {
            destinationCode: group.destinationCode,
            packageType: group.packageType,
            cartons: group.cartons,
            volumeCbm,
            pieceCountSource: 'PARSER_NORMALIZED_CARTONS',
          },
          policy,
        );
        return {
          ...group,
          volumeCbm,
          calculatedPallets: calculation.calculatedPallets,
          finalPallets: calculation.finalPallets,
          palletRuleCode: calculation.palletRuleCode,
          calculationBasisCbm: calculation.calculationBasisCbm,
          roundingMode: calculation.roundingMode,
          palletPolicySnapshot: calculation.palletPolicySnapshot,
          warnings: calculation.warnings,
        };
      });
  }

  private reportPreview(
    result: CanonicalResult,
    destinations: DestinationSnapshot[],
  ): Record<string, unknown> {
    return {
      containerNo: result.containerNo,
      destinationCount: destinations.length,
      totalCartons: destinations.reduce((sum, item) => sum + item.cartons, 0),
      totalVolumeCbm: (
        destinations.reduce(
          (sum, item) => sum + Math.round(Number(item.volumeCbm) * 1000),
          0,
        ) / 1000
      ).toFixed(3),
      totalPallets: destinations.reduce(
        (sum, item) => sum + item.finalPallets,
        0,
      ),
    };
  }

  private destinationGroupingChanged(
    before: DestinationSnapshot[],
    after: DestinationSnapshot[],
  ): boolean {
    const groups = (items: DestinationSnapshot[]) =>
      items
        .map((item) => `${item.destinationCode}\u0000${item.destinationType ?? ''}`)
        .sort();
    return this.stable(groups(before)) !== this.stable(groups(after));
  }

  private palletOutcomeChanged(
    before: DestinationSnapshot[],
    after: DestinationSnapshot[],
  ): boolean {
    const outcomes = (items: DestinationSnapshot[]) =>
      items
        .map((item) => ({
          destinationCode: item.destinationCode,
          destinationType: item.destinationType,
          calculatedPallets: item.calculatedPallets,
          finalPallets: item.finalPallets,
          palletRuleCode: item.palletRuleCode,
        }))
        .sort((left, right) =>
          this.stable(left).localeCompare(this.stable(right)),
        );
    return this.stable(outcomes(before)) !== this.stable(outcomes(after));
  }

  private policyFromStaged(value: unknown): PalletPolicySnapshotDto {
    const policy = this.object(this.object(value).palletPolicy);
    if (!policy.policyVersion || !policy.settingsRevision) {
      throw new ConflictException(
        this.error('PARSER_REVIEW_POLICY_SNAPSHOT_MISSING', {}),
      );
    }
    return policy as unknown as PalletPolicySnapshotDto;
  }

  private toResponse(
    review: ReviewRecord,
    override?: { streakAfter: number; trustState: string },
  ): Record<string, unknown> {
    const staged = this.canonicalResult(review.stagedResult);
    const final = review.finalResult
      ? this.canonicalResult(review.finalResult)
      : null;
    const match = this.object(review.matchEvidence);
    const evidence = this.object(review.sourcePreview);
    const sheets = this.array(evidence.sheets).map((candidate) => {
      const sheet = this.object(candidate);
      return {
        name: sheet.name ?? null,
        index: sheet.index ?? null,
        maxRow: sheet.maxRow ?? null,
        maxColumn: sheet.maxColumn ?? null,
        sampleCells: this.array(sheet.sampleCells).slice(0, 120),
      };
    });
    return {
      id: review.id,
      importFileId: review.importFileId,
      sourceFileShortSha: review.sourceFileSha256.slice(0, 12),
      status: review.status,
      revision: review.revision,
      profile: {
        id: review.profileVersion.id,
        familyId: review.profileVersion.familyId,
        stableName: review.profileVersion.family.stableName,
        customerLabel: review.profileVersion.family.customerLabel,
        version: review.profileVersion.version,
        lifecycle: review.profileVersion.lifecycle,
        trustState: override?.trustState ?? review.profileVersion.trustState,
        trustStreak: override?.streakAfter ?? review.profileVersion.trustStreak,
        matcherVersion: review.matcherVersion,
        mappingVersion: review.mappingVersion,
        workerVersion: review.workerVersion,
        parserVersion: review.parserVersion,
      },
      fingerprintHash: review.fingerprintHash,
      matchReasons: this.array(match.reasons),
      canonicalResult: {
        containerNo: staged.containerNo,
        lines: staged.lines.map((line) => this.canonicalLinePublic(line)),
      },
      finalCanonicalResult: final
        ? {
            containerNo: final.containerNo,
            lines: final.lines.map((line) => this.canonicalLinePublic(line)),
          }
        : null,
      sourcePreview: { sheets },
      provenance: review.provenance ?? {},
      destinationSummary: review.destinationSummary,
      finalDestinationSummary: review.finalDestinationSummary,
      reportPreview: review.reportPreview,
      finalReportPreview: review.finalReportPreview,
      warnings: this.array(review.warnings),
      errors: this.array(review.errors),
      correctionDiff: this.array(review.correctionDiff),
      decisionReason: review.decisionReason,
      reviewedBy: review.reviewedBy
        ? { id: review.reviewedBy.id, name: review.reviewedBy.name }
        : null,
      reviewedAt: review.reviewedAt?.toISOString() ?? null,
      acceptedContainer: review.acceptedContainer,
    };
  }

  private canonicalLinePublic(line: CanonicalLine): Record<string, unknown> {
    return {
      rowNumber: line.rowNumber,
      included: line.included,
      destinationCode: line.destinationCode,
      cartons: line.cartons,
      volumeCbm: line.volumeCbm,
      packageType: line.packageType,
      deliveryMethod: line.deliveryMethod,
      waybillNo: line.waybillNo,
      referenceNo: line.referenceNo,
      poNumber: line.poNumber,
    };
  }

  private fileFormat(value: string): typeof FileFormat[keyof typeof FileFormat] {
    if (value === FileFormat.UNLOADING_PLAN_CN) return FileFormat.UNLOADING_PLAN_CN;
    if (value === FileFormat.BESTAR_RECEIVING) return FileFormat.BESTAR_RECEIVING;
    return FileFormat.UNKNOWN;
  }

  private packageType(value: string | null): PalletPackageType {
    return value === 'WOODEN_CRATE' ? 'WOODEN_CRATE' : 'CARTON';
  }

  private nullableInt(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  private decimal3(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number.toFixed(3) : null;
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(this.stable(value)).digest('hex');
  }

  private stable(value: unknown): string {
    const normalize = (candidate: unknown): unknown => {
      if (Array.isArray(candidate)) return candidate.map(normalize);
      if (candidate && typeof candidate === 'object') {
        return Object.fromEntries(
          Object.entries(candidate as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, normalize(item)]),
        );
      }
      return candidate;
    };
    return JSON.stringify(normalize(value));
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private nullableJson(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    return value === null || value === undefined ? Prisma.JsonNull : this.json(value);
  }

  private uniqueConstraint(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private exceptionCode(error: unknown, fallback: string): string {
    const exception = error as { getResponse?: () => unknown } | null;
    if (typeof exception?.getResponse === 'function') {
      const response = this.object(exception.getResponse());
      return this.string(response.code) ?? fallback;
    }
    return fallback;
  }

  private error(code: string, details: Record<string, unknown>) {
    return { code, message: code, details };
  }

  private notFound(code: string, details: Record<string, unknown>) {
    return new NotFoundException(this.error(code, details));
  }
}
