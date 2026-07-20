import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { access, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { AuthenticatedUser } from '../auth/auth-user';
import {
  ParserProfileAuditEventCode,
  ParserProfileLifecycle,
  ParserProfileTrustState,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ApproveParserProfileDto,
  GovernParserProfileDto,
  ListParserProfilesQueryDto,
} from './dto/parser-profile-governance.dto';

const governanceInclude = {
  family: true,
  createdBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  auditEvents: {
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { occurredAt: 'desc' as const },
    take: 1,
  },
  evidence: {
    include: {
      importFile: { select: { fileSha256: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { reviewedAt: 'asc' as const },
  },
  sourceLearningCase: {
    include: {
      sourceImport: {
        select: {
          id: true,
          storedPath: true,
          fileSha256: true,
          originalFilename: true,
          deletedAt: true,
        },
      },
      linkedContainer: {
        select: { id: true, containerNo: true, status: true },
      },
      completionReplayJob: {
        select: {
          id: true,
          status: true,
          attempts: true,
          maxAttempts: true,
          result: true,
          lastError: true,
          finishedAt: true,
        },
      },
    },
  },
} as const;

type GovernanceRecord = Prisma.ParserProfileVersionGetPayload<{
  include: typeof governanceInclude;
}>;

@Injectable()
export class ParserProfilesService {
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.storageRoot = resolve(config.getOrThrow<string>('app.storageRoot'));
  }

  async list(query: ListParserProfilesQueryDto): Promise<unknown> {
    const records = await this.prisma.parserProfileVersion.findMany({
      where: query.lifecycle ? { lifecycle: query.lifecycle } : undefined,
      include: governanceInclude,
      orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }],
      take: query.limit,
      skip: query.offset,
    });
    return {
      items: records.map((record) => this.summary(record)),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getFamily(id: string): Promise<unknown> {
    const family = await this.prisma.parserProfileFamily.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        versions: {
          include: governanceInclude,
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!family) {
      throw this.notFound('PARSER_PROFILE_FAMILY_NOT_FOUND', { familyId: id });
    }
    return {
      id: family.id,
      stableName: family.stableName,
      customerLabel: family.customerLabel,
      createdBy: this.actor(family.createdBy),
      createdAt: family.createdAt.toISOString(),
      updatedAt: family.updatedAt.toISOString(),
      versions: family.versions.map((version) => this.summary(version)),
    };
  }

  async getVersion(id: string): Promise<unknown> {
    const record = await this.findVersionOrThrow(this.prisma, id);
    const eligibilityCodes = await this.approvalEligibilityCodes(record);
    return this.detail(record, eligibilityCodes);
  }

  async approve(
    id: string,
    dto: ApproveParserProfileDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const approved = await this.prisma.$transaction(async (tx) => {
      await this.lockVersion(tx, id);
      const record = await this.findVersionOrThrow(tx, id);
      await this.lockFamily(tx, record.familyId);
      this.assertExpectedRevision(record, dto.expectedRevision);
      const eligibilityCodes = await this.approvalEligibilityCodes(record);
      const replay = this.object(record.sourceLearningCase?.replaySummary);
      if (replay?.artifactId !== dto.replayId) {
        eligibilityCodes.push('PROFILE_APPROVAL_REPLAY_STALE');
      }
      const conflicts = await this.activeConflicts(tx, record);
      if (conflicts.length > 0) {
        eligibilityCodes.push('PROFILE_APPROVAL_ACTIVE_MATCHER_CONFLICT');
      }
      const codes = [...new Set(eligibilityCodes)];
      if (codes.length > 0) {
        throw new ConflictException(
          this.error('PROFILE_APPROVAL_NOT_ELIGIBLE', {
            profileVersionId: id,
            eligibilityCodes: codes,
            conflictingProfileVersionIds: conflicts,
          }),
        );
      }
      const changed = await tx.parserProfileVersion.updateMany({
        where: {
          id,
          lifecycle: ParserProfileLifecycle.DRAFT,
          lifecycleRevision: dto.expectedRevision,
        },
        data: {
          lifecycle: ParserProfileLifecycle.ACTIVE,
          trustState: ParserProfileTrustState.REVIEW_REQUIRED,
          trustStreak: 0,
          approvedById: actor.id,
          approvedAt: new Date(),
          approvalReason: dto.reason,
          lifecycleReason: dto.reason,
          lifecycleRevision: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw this.revisionConflict(id, dto.expectedRevision);
      }
      await tx.parserProfileAuditEvent.create({
        data: {
          eventCode: ParserProfileAuditEventCode.PROFILE_APPROVED,
          actorId: actor.id,
          profileFamilyId: record.familyId,
          profileVersionId: record.id,
          learningCaseId: record.sourceLearningCaseId,
          importFileId: record.sourceLearningCase?.sourceImportId,
          containerId: record.sourceLearningCase?.linkedContainerId,
          metadata: {
            reason: dto.reason,
            replayId: dto.replayId,
            lifecycle: ParserProfileLifecycle.ACTIVE,
            trustState: ParserProfileTrustState.REVIEW_REQUIRED,
            trustStreak: 0,
          },
        },
      });
      return this.findVersionOrThrow(tx, id);
    });
    return this.detail(approved, []);
  }

  pause(
    id: string,
    dto: GovernParserProfileDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.transition(
      id,
      dto,
      actor,
      ParserProfileLifecycle.ACTIVE,
      ParserProfileLifecycle.PAUSED,
      ParserProfileAuditEventCode.PROFILE_PAUSED,
    );
  }

  async resume(
    id: string,
    dto: GovernParserProfileDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockVersion(tx, id);
      const record = await this.findVersionOrThrow(tx, id);
      await this.lockFamily(tx, record.familyId);
      this.assertExpectedRevision(record, dto.expectedRevision);
      if (record.lifecycle !== ParserProfileLifecycle.PAUSED) {
        throw this.lifecycleConflict(record, ParserProfileLifecycle.PAUSED);
      }
      const conflicts = await this.activeConflicts(tx, record);
      if (conflicts.length > 0) {
        throw new ConflictException(
          this.error('PROFILE_RESUME_ACTIVE_MATCHER_CONFLICT', {
            profileVersionId: id,
            conflictingProfileVersionIds: conflicts,
          }),
        );
      }
      await tx.parserProfileVersion.update({
        where: { id },
        data: {
          lifecycle: ParserProfileLifecycle.ACTIVE,
          lifecycleReason: dto.reason,
          lifecycleRevision: { increment: 1 },
        },
      });
      await this.auditTransition(
        tx,
        record,
        actor,
        dto.reason,
        ParserProfileAuditEventCode.PROFILE_RESUMED,
        ParserProfileLifecycle.ACTIVE,
      );
      return this.detail(await this.findVersionOrThrow(tx, id), []);
    });
  }

  async retire(
    id: string,
    dto: GovernParserProfileDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockVersion(tx, id);
      const record = await this.findVersionOrThrow(tx, id);
      this.assertExpectedRevision(record, dto.expectedRevision);
      if (
        record.lifecycle !== ParserProfileLifecycle.ACTIVE &&
        record.lifecycle !== ParserProfileLifecycle.PAUSED
      ) {
        throw new ConflictException(
          this.error('PROFILE_RETIRE_LIFECYCLE_NOT_ALLOWED', {
            profileVersionId: id,
            lifecycle: record.lifecycle,
          }),
        );
      }
      await tx.parserProfileVersion.update({
        where: { id },
        data: {
          lifecycle: ParserProfileLifecycle.RETIRED,
          lifecycleReason: dto.reason,
          lifecycleRevision: { increment: 1 },
        },
      });
      await this.auditTransition(
        tx,
        record,
        actor,
        dto.reason,
        ParserProfileAuditEventCode.PROFILE_RETIRED,
        ParserProfileLifecycle.RETIRED,
      );
      return this.detail(await this.findVersionOrThrow(tx, id), []);
    });
  }

  async fork(
    id: string,
    dto: GovernParserProfileDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockVersion(tx, id);
      const source = await this.findVersionOrThrow(tx, id);
      this.assertExpectedRevision(source, dto.expectedRevision);
      if (source.lifecycle === ParserProfileLifecycle.DRAFT) {
        throw new ConflictException(
          this.error('PROFILE_FORK_DRAFT_NOT_ALLOWED', {
            profileVersionId: id,
          }),
        );
      }
      await tx.$queryRaw`SELECT "id" FROM "parser_profile_families" WHERE "id" = ${source.familyId} FOR UPDATE`;
      const latest = await tx.parserProfileVersion.findFirst({
        where: { familyId: source.familyId },
        select: { version: true },
        orderBy: { version: 'desc' },
      });
      const created = await tx.parserProfileVersion.create({
        data: {
          familyId: source.familyId,
          version: (latest?.version ?? source.version) + 1,
          lifecycle: ParserProfileLifecycle.DRAFT,
          trustState: ParserProfileTrustState.REVIEW_REQUIRED,
          trustStreak: 0,
          mappingDefinition: this.json(source.mappingDefinition),
          fingerprintDefinition: this.json(source.fingerprintDefinition),
          matcherVersion: source.matcherVersion,
          mappingVersion: source.mappingVersion,
          lifecycleReason: dto.reason,
          createdById: actor.id,
        },
      });
      await tx.parserProfileAuditEvent.create({
        data: {
          eventCode: ParserProfileAuditEventCode.PROFILE_VERSION_FORKED,
          actorId: actor.id,
          profileFamilyId: source.familyId,
          profileVersionId: created.id,
          metadata: {
            reason: dto.reason,
            sourceProfileVersionId: source.id,
            sourceVersion: source.version,
            version: created.version,
            lifecycle: ParserProfileLifecycle.DRAFT,
            trustState: ParserProfileTrustState.REVIEW_REQUIRED,
            trustStreak: 0,
          },
        },
      });
      return this.detail(await this.findVersionOrThrow(tx, created.id), [
        'PROFILE_APPROVAL_LEARNING_CASE_REQUIRED',
      ]);
    });
  }

  private async transition(
    id: string,
    dto: GovernParserProfileDto,
    actor: AuthenticatedUser,
    from: typeof ParserProfileLifecycle.ACTIVE,
    to: typeof ParserProfileLifecycle.PAUSED,
    eventCode: typeof ParserProfileAuditEventCode.PROFILE_PAUSED,
  ): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockVersion(tx, id);
      const record = await this.findVersionOrThrow(tx, id);
      this.assertExpectedRevision(record, dto.expectedRevision);
      if (record.lifecycle !== from) {
        throw this.lifecycleConflict(record, from);
      }
      await tx.parserProfileVersion.update({
        where: { id },
        data: {
          lifecycle: to,
          lifecycleReason: dto.reason,
          lifecycleRevision: { increment: 1 },
        },
      });
      await this.auditTransition(tx, record, actor, dto.reason, eventCode, to);
      return this.detail(await this.findVersionOrThrow(tx, id), []);
    });
  }

  private async approvalEligibilityCodes(
    record: GovernanceRecord,
  ): Promise<string[]> {
    const codes: string[] = [];
    if (record.lifecycle !== ParserProfileLifecycle.DRAFT) {
      codes.push('PROFILE_APPROVAL_DRAFT_REQUIRED');
    }
    if (!record.family.stableName.trim()) {
      codes.push('PROFILE_APPROVAL_NAME_REQUIRED');
    }
    const learningCase = record.sourceLearningCase;
    if (!learningCase) {
      codes.push('PROFILE_APPROVAL_LEARNING_CASE_REQUIRED');
      return codes;
    }
    const source = learningCase.sourceImport;
    if (
      !source ||
      source.deletedAt ||
      source.fileSha256 !== learningCase.sourceFileSha256
    ) {
      codes.push('PROFILE_APPROVAL_SOURCE_NOT_PRESERVED');
    } else if (!(await this.sourceReadable(source.storedPath))) {
      codes.push('PROFILE_APPROVAL_SOURCE_NOT_READABLE');
    }
    if (!learningCase.linkedContainer || !learningCase.completionSnapshot) {
      codes.push('PROFILE_APPROVAL_COMPLETION_SNAPSHOT_REQUIRED');
    } else if (!this.completionSnapshotComplete(learningCase.completionSnapshot)) {
      codes.push('PROFILE_APPROVAL_COMPLETION_SNAPSHOT_INCOMPLETE');
    }
    if (
      record.sourceDraftRevision === null ||
      record.sourceDraftRevision !== learningCase.draftRevision
    ) {
      codes.push('PROFILE_APPROVAL_SUBMITTED_VERSION_STALE');
    }
    if (!this.mappingHasRequiredProvenance(record.mappingDefinition)) {
      codes.push('PROFILE_APPROVAL_PROVENANCE_REQUIRED');
    }
    const replay = this.object(learningCase.replaySummary);
    const pinned = this.object(replay?.pinned);
    const blockerCodes = Array.isArray(replay?.blockingCodes)
      ? replay.blockingCodes
      : [];
    if (
      replay?.passed !== true ||
      blockerCodes.length > 0 ||
      replay?.draftRevision !== record.sourceDraftRevision ||
      !this.replayDiffPassed(replay?.diff)
    ) {
      codes.push('PROFILE_APPROVAL_REPLAY_NOT_PASSED');
    }
    if (
      !learningCase.completionReplayJobId ||
      replay?.asyncJobId !== learningCase.completionReplayJobId ||
      learningCase.completionReplayJob?.status !== 'SUCCEEDED'
    ) {
      codes.push('PROFILE_APPROVAL_COMPLETION_REPLAY_REQUIRED');
    }
    if (
      pinned?.sourceFileSha256 !== learningCase.sourceFileSha256 ||
      !this.string(pinned?.workerVersion) ||
      !this.string(pinned?.mappingSchemaVersion) ||
      !this.string(pinned?.fingerprintVersion)
    ) {
      codes.push('PROFILE_APPROVAL_REPLAY_CONTRACT_STALE');
    }
    const completionManualHash = learningCase.completionSnapshot
      ? this.hash(this.manualSnapshotEvidence(learningCase.completionSnapshot))
      : null;
    if (
      !completionManualHash ||
      pinned?.manualSnapshotHash !== completionManualHash
    ) {
      codes.push('PROFILE_APPROVAL_REPLAY_SNAPSHOT_STALE');
    }
    return [...new Set(codes)];
  }

  private async activeConflicts(
    tx: Prisma.TransactionClient,
    record: GovernanceRecord,
  ): Promise<string[]> {
    const active = await tx.parserProfileVersion.findMany({
      where: {
        familyId: record.familyId,
        lifecycle: ParserProfileLifecycle.ACTIVE,
        id: { not: record.id },
      },
      select: { id: true, fingerprintDefinition: true },
    });
    const scope = this.stable(record.fingerprintDefinition);
    return active
      .filter((candidate) => this.stable(candidate.fingerprintDefinition) === scope)
      .map((candidate) => candidate.id);
  }

  private async sourceReadable(storagePath: string): Promise<boolean> {
    try {
      const candidate = isAbsolute(storagePath)
        ? resolve(storagePath)
        : resolve(this.storageRoot, storagePath);
      const root = await realpath(this.storageRoot);
      const file = await realpath(candidate);
      const pathFromRoot = relative(root, file);
      if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
        return false;
      }
      await access(file);
      return true;
    } catch {
      return false;
    }
  }

  private mappingHasRequiredProvenance(value: unknown): boolean {
    const mapping = this.object(value);
    const container = this.object(mapping?.container);
    const fields = this.object(mapping?.fields);
    const hasSource = (candidate: unknown): boolean => {
      const item = this.object(candidate);
      return Array.isArray(item?.sources) && item.sources.length > 0;
    };
    return Boolean(
      hasSource(container) &&
        fields &&
        hasSource(fields.destinationCode) &&
        hasSource(fields.cartons) &&
        hasSource(fields.volumeCbm),
    );
  }

  private replayDiffPassed(value: unknown): boolean {
    if (!Array.isArray(value) || value.length === 0) return false;
    return value.every((candidate) => {
      const item = this.object(candidate);
      if (!item) return false;
      return !(
        (item.material === true || item.blocking === true) &&
        item.equal !== true
      );
    });
  }

  private completionSnapshotComplete(value: unknown): boolean {
    const snapshot = this.object(value);
    if (!this.string(snapshot?.containerNo)) return false;
    const destinations = snapshot?.destinations;
    if (!Array.isArray(destinations) || destinations.length === 0) return false;
    return destinations.every((candidate) => {
      const item = this.object(candidate);
      return Boolean(
        this.string(item?.destinationCode) &&
          Number.isInteger(Number(item?.cartons)) &&
          Number(item?.cartons) >= 0 &&
          (item?.volumeCbm === null ||
            (typeof item?.volumeCbm === 'string' &&
              /^\d+\.\d{3}$/.test(item.volumeCbm))),
      );
    });
  }

  private manualSnapshotEvidence(value: unknown): Record<string, unknown> {
    const snapshot = this.object(value) ?? {};
    return {
      containerNo: snapshot.containerNo ?? null,
      detailRows: snapshot.detailRows ?? [],
      destinations: snapshot.destinations ?? [],
      referenceEvidence: snapshot.referenceEvidence ?? [],
    };
  }

  private summary(record: GovernanceRecord): Record<string, unknown> {
    const replay = this.object(record.sourceLearningCase?.replaySummary);
    const lastAudit = record.auditEvents[0] ?? null;
    return {
      id: record.id,
      familyId: record.familyId,
      stableName: record.family.stableName,
      customerLabel: record.family.customerLabel,
      version: record.version,
      lifecycle: record.lifecycle,
      trustState: record.trustState,
      trustStreak: record.trustStreak,
      lifecycleRevision: record.lifecycleRevision,
      lastReplay: replay
        ? {
            replayId: replay.artifactId ?? null,
            passed: replay.passed === true,
            blockingCodes: replay.blockingCodes ?? [],
          }
        : null,
      createdBy: this.actor(record.createdBy),
      updatedBy: this.actor(lastAudit?.actor ?? record.createdBy),
      approvedBy: this.actor(record.approvedBy),
      approvedAt: record.approvedAt?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private detail(
    record: GovernanceRecord,
    eligibilityCodes: string[],
  ): Record<string, unknown> {
    const learningCase = record.sourceLearningCase;
    const replay = this.object(learningCase?.replaySummary);
    const mapping = this.object(record.mappingDefinition) ?? {};
    const fields = this.object(mapping.fields) ?? {};
    return {
      ...this.summary(record),
      approvalReason: record.approvalReason,
      lifecycleReason: record.lifecycleReason,
      matcherVersion: record.matcherVersion,
      mappingVersion: record.mappingVersion,
      structuralAnchors: record.fingerprintDefinition,
      mappingSummary: {
        containerMapped: Boolean(this.object(mapping.container)),
        mappedFields: Object.keys(fields).sort(),
      },
      sourceProvenance: learningCase
        ? {
            learningCaseId: learningCase.id,
            sourceImportId: learningCase.sourceImportReferenceId,
            sourceFileSha256: learningCase.sourceFileSha256,
            sourceFilename: learningCase.sourceImport?.originalFilename ?? null,
            linkedContainerId: learningCase.linkedContainerId,
            linkedContainerNo: learningCase.linkedContainer?.containerNo ?? null,
            sourceDraftRevision: record.sourceDraftRevision,
          }
        : null,
      completionSnapshot: learningCase?.completionSnapshot ?? null,
      completionReplayJob: learningCase?.completionReplayJob
        ? {
            id: learningCase.completionReplayJob.id,
            status: learningCase.completionReplayJob.status,
            attempts: learningCase.completionReplayJob.attempts,
            maxAttempts: learningCase.completionReplayJob.maxAttempts,
            errorCode:
              this.object(learningCase.completionReplayJob.result)?.code ??
              null,
            finishedAt:
              learningCase.completionReplayJob.finishedAt?.toISOString() ??
              null,
          }
        : null,
      replay: replay
        ? {
            replayId: replay.artifactId ?? null,
            passed: replay.passed === true,
            blockingCodes: replay.blockingCodes ?? [],
            diffSummary: replay.diffSummary ?? null,
            diff: replay.diff ?? [],
            pinned: replay.pinned ?? null,
          }
        : null,
      approvalEligibility: {
        eligible: eligibilityCodes.length === 0,
        codes: eligibilityCodes,
      },
      evidenceTimeline: (record.evidence ?? []).map((item) => ({
        id: item.id,
        importFileShortSha: item.importFile.fileSha256.slice(0, 12),
        outcome: item.outcome,
        materialCorrection: item.materialCorrection,
        streakAfter: item.streakAfter,
        reason: item.reason,
        reviewedBy: this.actor(item.reviewedBy),
        reviewedAt: item.reviewedAt.toISOString(),
      })),
    };
  }

  private async auditTransition(
    tx: Prisma.TransactionClient,
    record: GovernanceRecord,
    actor: AuthenticatedUser,
    reason: string,
    eventCode:
      | typeof ParserProfileAuditEventCode.PROFILE_PAUSED
      | typeof ParserProfileAuditEventCode.PROFILE_RESUMED
      | typeof ParserProfileAuditEventCode.PROFILE_RETIRED,
    lifecycle:
      | typeof ParserProfileLifecycle.ACTIVE
      | typeof ParserProfileLifecycle.PAUSED
      | typeof ParserProfileLifecycle.RETIRED,
  ): Promise<void> {
    await tx.parserProfileAuditEvent.create({
      data: {
        eventCode,
        actorId: actor.id,
        profileFamilyId: record.familyId,
        profileVersionId: record.id,
        learningCaseId: record.sourceLearningCaseId,
        metadata: {
          reason,
          previousLifecycle: record.lifecycle,
          lifecycle,
          trustState: record.trustState,
          trustStreak: record.trustStreak,
        },
      },
    });
  }

  private async lockVersion(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "parser_profile_versions" WHERE "id" = ${id} FOR UPDATE`;
  }

  private async lockFamily(
    tx: Prisma.TransactionClient,
    familyId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "parser_profile_families" WHERE "id" = ${familyId} FOR UPDATE`;
  }

  private async findVersionOrThrow(
    tx: PrismaService | Prisma.TransactionClient,
    id: string,
  ): Promise<GovernanceRecord> {
    const record = await tx.parserProfileVersion.findUnique({
      where: { id },
      include: governanceInclude,
    });
    if (!record) {
      throw this.notFound('PARSER_PROFILE_VERSION_NOT_FOUND', {
        profileVersionId: id,
      });
    }
    return record;
  }

  private assertExpectedRevision(
    record: GovernanceRecord,
    expectedRevision: number,
  ): void {
    if (record.lifecycleRevision !== expectedRevision) {
      throw this.revisionConflict(record.id, expectedRevision);
    }
  }

  private revisionConflict(id: string, expectedRevision: number) {
    return new ConflictException(
      this.error('PROFILE_LIFECYCLE_REVISION_CONFLICT', {
        profileVersionId: id,
        expectedRevision,
      }),
    );
  }

  private lifecycleConflict(
    record: GovernanceRecord,
    expectedLifecycle: string,
  ) {
    return new ConflictException(
      this.error('PROFILE_LIFECYCLE_TRANSITION_NOT_ALLOWED', {
        profileVersionId: record.id,
        lifecycle: record.lifecycle,
        expectedLifecycle,
      }),
    );
  }

  private actor(
    value: { id: string; name: string | null; email: string | null } | null,
  ): Record<string, unknown> | null {
    return value
      ? { id: value.id, name: value.name, email: value.email }
      : null;
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
    return JSON.stringify(normalize(value)) ?? 'null';
  }

  private object(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private error(code: string, details: Record<string, unknown>) {
    return { code, message: code, details };
  }

  private notFound(code: string, details: Record<string, unknown>) {
    return new NotFoundException(this.error(code, details));
  }
}
