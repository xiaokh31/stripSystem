import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { AsyncJobsService } from '../async-jobs/async-jobs.service';
import { ASYNC_JOB_TARGET_TYPES } from '../async-jobs/async-jobs.types';
import type { AsyncJobResponseDto } from '../async-jobs/async-job-response.dto';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PERMISSIONS, ROLE_CODES } from '../auth/permissions';
import {
  AsyncJobStatus,
  AsyncJobType,
  ContainerStatus,
  GeneratedFileStatus,
  GeneratedFileType,
  ParserLearningCaseStatus,
  ParserProfileAuditEventCode,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ParserLearningCaseListResponseDto,
  ParserLearningCaseResponseDto,
} from './dto/parser-learning-case.dto';
import type {
  ListParserLearningCasesQueryDto,
  ParserProfileRevisionDto,
  QueueParserProfileReplayDto,
  SaveParserProfileDraftDto,
  SubmitParserProfileCandidateDto,
} from './dto/parser-profile-learning.dto';
import {
  ParserProfileExecutionPayload,
  ParserProfileIssue,
  ParserProfileParseResult,
  ParserProfileWorkerService,
} from './parser-profile-worker.service';

const learningCaseInclude = {
  sourceImport: {
    select: {
      id: true,
      originalFilename: true,
      format: true,
      parseStatus: true,
      rawMetadata: true,
      storedPath: true,
      fileSha256: true,
    },
  },
  linkedContainer: {
    select: {
      id: true,
      containerNo: true,
      sourceFormat: true,
      parserSourceKind: true,
      parserVersion: true,
      rawJson: true,
      importFileId: true,
      status: true,
      dockNo: true,
      destinations: {
        select: {
          id: true,
          destinationCode: true,
          destinationType: true,
          packageType: true,
          cartons: true,
          volume: true,
          manualPallets: true,
          finalPallets: true,
          note: true,
          updatedAt: true,
        },
        orderBy: { destinationCode: 'asc' as const },
      },
      lines: {
        select: {
          id: true,
          lineNo: true,
          destinationCode: true,
          destinationType: true,
          cartons: true,
          volume: true,
          rawJson: true,
          updatedAt: true,
        },
        orderBy: { lineNo: 'asc' as const },
      },
    },
  },
  profileVersions: {
    select: {
      id: true,
      familyId: true,
      version: true,
      sourceDraftRevision: true,
      lifecycle: true,
      trustState: true,
      mappingVersion: true,
      matcherVersion: true,
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
} as const;

type LearningCaseRecord = Prisma.ParserLearningCaseGetPayload<{
  include: typeof learningCaseInclude;
}>;

interface DraftDefinitionEnvelope {
  mappingDefinition: Record<string, unknown>;
  fingerprintDefinition: Record<string, unknown>;
  mappingSchemaVersion: string;
  fingerprintVersion: string;
  workerVersion: string;
}

interface ManualParserSnapshot {
  containerNo: string;
  detailRows: Array<Record<string, unknown>>;
  destinations: Array<{
    destinationCode: string;
    destinationType: string | null;
    packageType: string;
    cartons: number;
    volumeCbm: string | null;
  }>;
  referenceEvidence: unknown;
}

interface ReplayDownload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
}

interface ReplayDiffItem {
  field: string;
  key: string | null;
  expected: unknown;
  actual: unknown;
  equal: boolean;
  material: boolean;
  blocking: boolean;
  code: string;
}

interface ReplayDiff {
  items: ReplayDiffItem[];
  summary: {
    compared: number;
    equal: number;
    materialDifferences: number;
    blockers: number;
  };
}

export interface CompletionReplayOutboxResult {
  learningCaseId: string;
  snapshotCreated: boolean;
  snapshotAt: string;
  jobId: string | null;
  draftRevision: number | null;
  replayIdempotencyKey: string | null;
}

@Injectable()
export class ParserLearningCasesService {
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: ParserProfileWorkerService,
    private readonly asyncJobs: AsyncJobsService,
    configService: ConfigService,
  ) {
    this.storageRoot = configService.getOrThrow<string>('app.storageRoot');
  }

  async start(
    importFileId: string,
    actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        await this.lockImportLearningMutation(tx, importFileId);
        const sourceImport = await tx.importFile.findUnique({
          where: { id: importFileId, deletedAt: null },
          select: {
            id: true,
            fileSha256: true,
            format: true,
            parseStatus: true,
            rawMetadata: true,
          },
        });
        if (!sourceImport) {
          throw new NotFoundException(
            this.error('PARSER_LEARNING_IMPORT_NOT_FOUND', { importFileId }),
          );
        }
        if (
          !this.isEligibleImport(
            sourceImport.format,
            sourceImport.parseStatus,
            sourceImport.rawMetadata,
          )
        ) {
          throw new BadRequestException(
            this.error('PARSER_LEARNING_IMPORT_STATUS_NOT_ALLOWED', {
              importFileId,
              format: sourceImport.format,
              parseStatus: sourceImport.parseStatus,
            }),
          );
        }

        const existing = await tx.parserLearningCase.findUnique({
          where: { sourceImportId: importFileId },
          include: learningCaseInclude,
        });
        if (existing) {
          return existing;
        }

        const created = await tx.parserLearningCase.create({
          data: {
            sourceImportId: importFileId,
            sourceImportReferenceId: importFileId,
            sourceFileSha256: sourceImport.fileSha256,
            createdById: actor.id,
            updatedById: actor.id,
            status: ParserLearningCaseStatus.OPEN,
          },
          include: learningCaseInclude,
        });
        await tx.parserProfileAuditEvent.create({
          data: {
            eventCode: ParserProfileAuditEventCode.CASE_CREATED,
            actorId: actor.id,
            learningCaseId: created.id,
            importFileId,
            metadata: {
              sourceImportId: importFileId,
              sourceFileSha256: sourceImport.fileSha256,
            },
          },
        });
        return created;
      });
      return this.toResponse(record);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      const concurrentlyCreated =
        await this.prisma.parserLearningCase.findUnique({
          where: { sourceImportId: importFileId },
          include: learningCaseInclude,
        });
      if (concurrentlyCreated) {
        return this.toResponse(concurrentlyCreated);
      }
      throw new ConflictException(
        this.error('PARSER_LEARNING_CASE_START_CONFLICT', { importFileId }),
      );
    }
  }

  async lockImportLearningMutation(
    tx: Prisma.TransactionClient,
    importFileId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "import_files" WHERE "id" = ${importFileId} FOR UPDATE`;
  }

  async get(id: string): Promise<ParserLearningCaseResponseDto> {
    return this.toResponse(await this.findCaseOrThrow(this.prisma, id));
  }

  async list(
    query: ListParserLearningCasesQueryDto,
  ): Promise<ParserLearningCaseListResponseDto> {
    const records = await this.prisma.parserLearningCase.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: learningCaseInclude,
      orderBy: { updatedAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    });
    return {
      items: records.map((record) => this.toResponse(record)),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async captureCompletionInTransaction(
    tx: Prisma.TransactionClient,
    containerId: string,
    actor: AuthenticatedUser,
  ): Promise<CompletionReplayOutboxResult | null> {
    const record = await tx.parserLearningCase.findUnique({
      where: { linkedContainerId: containerId },
      include: learningCaseInclude,
    });
    if (!record || record.status === ParserLearningCaseStatus.CLOSED) {
      return null;
    }
    if (!record.linkedContainer) {
      return null;
    }
    if (!this.isCompletionStatus(record.linkedContainer.status)) {
      return null;
    }

    if (record.completionSnapshot && record.completionSnapshotAt) {
      const existingJob = record.completionReplayJobId
        ? await tx.asyncJob.findUnique({
            where: { id: record.completionReplayJobId },
            select: { id: true, metadata: true },
          })
        : null;
      const metadata = this.objectValue(existingJob?.metadata);
      if (!existingJob && record.profileVersions[0]?.sourceDraftRevision) {
        const createdJob = await this.createCompletionReplayJobInTransaction(
          tx,
          record,
          record.completionSnapshot,
          record.profileVersions[0].sourceDraftRevision,
          actor,
        );
        await tx.parserLearningCase.update({
          where: { id: record.id },
          data: {
            completionReplayJobId: createdJob.jobId,
            status: ParserLearningCaseStatus.READY_FOR_REPLAY,
            lastErrorCode: null,
            updatedById: actor.id,
          },
        });
        return {
          learningCaseId: record.id,
          snapshotCreated: false,
          snapshotAt: record.completionSnapshotAt.toISOString(),
          ...createdJob,
        };
      }
      return {
        learningCaseId: record.id,
        snapshotCreated: false,
        snapshotAt: record.completionSnapshotAt.toISOString(),
        jobId: existingJob?.id ?? null,
        draftRevision: this.positiveInteger(metadata?.draftRevision),
        replayIdempotencyKey: this.nonEmptyString(
          metadata?.replayIdempotencyKey,
        ),
      };
    }

    const snapshotAt = new Date();
    const snapshot = await this.buildCompletionSnapshot(tx, record, snapshotAt);
    const profileVersion = record.profileVersions[0] ?? null;
    const draftRevision = profileVersion?.sourceDraftRevision ?? null;
    const createdJob = draftRevision
      ? await this.createCompletionReplayJobInTransaction(
          tx,
          record,
          snapshot,
          draftRevision,
          actor,
        )
      : { jobId: null, draftRevision: null, replayIdempotencyKey: null };

    const updated = await tx.parserLearningCase.updateMany({
      where: { id: record.id, completionSnapshot: { equals: Prisma.DbNull } },
      data: {
        completionSnapshot: this.jsonValue(snapshot),
        completionSnapshotAt: snapshotAt,
        completionReplayJobId: createdJob.jobId,
        status: draftRevision
          ? ParserLearningCaseStatus.READY_FOR_REPLAY
          : record.status,
        lastErrorCode: null,
        updatedById: actor.id,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        this.error('PROFILE_COMPLETION_SNAPSHOT_CONFLICT', {
          learningCaseId: record.id,
        }),
      );
    }

    return {
      learningCaseId: record.id,
      snapshotCreated: true,
      snapshotAt: snapshotAt.toISOString(),
      ...createdJob,
    };
  }

  async dispatchCompletionReplay(
    outbox: CompletionReplayOutboxResult | null,
    actor: AuthenticatedUser,
  ): Promise<{ warningCodes: string[]; jobId: string | null }> {
    if (
      !outbox?.jobId ||
      !outbox.draftRevision ||
      !outbox.replayIdempotencyKey
    ) {
      return { warningCodes: [], jobId: outbox?.jobId ?? null };
    }
    try {
      await this.asyncJobs.dispatchRecordedJob({
        asyncJobId: outbox.jobId,
        jobType: AsyncJobType.PARSER_PROFILE_REPLAY,
        targetType: ASYNC_JOB_TARGET_TYPES.parserLearningCase,
        targetId: outbox.learningCaseId,
        actor,
        metadata: {
          draftRevision: outbox.draftRevision,
          replayIdempotencyKey: outbox.replayIdempotencyKey,
        },
      });
      return { warningCodes: [], jobId: outbox.jobId };
    } catch {
      try {
        await this.prisma.parserLearningCase.update({
          where: { id: outbox.learningCaseId },
          data: { lastErrorCode: 'PROFILE_COMPLETION_REPLAY_QUEUE_FAILED' },
        });
      } catch {
        // Warehouse completion is already committed. A later catch-up retries
        // the durable outbox row even when recording this warning also fails.
      }
      return {
        warningCodes: ['PROFILE_COMPLETION_REPLAY_QUEUE_FAILED'],
        jobId: outbox.jobId,
      };
    }
  }

  async captureAndDispatchCompletion(
    containerId: string,
    actor: AuthenticatedUser,
  ): Promise<{
    learningCaseId: string;
    snapshotCreated: boolean;
    replayJobId: string | null;
    warningCodes: string[];
  } | null> {
    try {
      const outbox = await this.prisma.$transaction((tx) =>
        this.captureCompletionInTransaction(tx, containerId, actor),
      );
      if (!outbox) {
        return null;
      }
      const dispatched = await this.dispatchCompletionReplay(outbox, actor);
      return {
        learningCaseId: outbox.learningCaseId,
        snapshotCreated: outbox.snapshotCreated,
        replayJobId: dispatched.jobId,
        warningCodes: dispatched.warningCodes,
      };
    } catch {
      let learningCase: { id: string } | null = null;
      try {
        learningCase = await this.prisma.parserLearningCase.findUnique({
          where: { linkedContainerId: containerId },
          select: { id: true },
        });
      } catch {
        return null;
      }
      if (!learningCase) {
        return null;
      }
      try {
        await this.prisma.parserLearningCase.update({
          where: { id: learningCase.id },
          data: { lastErrorCode: 'PROFILE_COMPLETION_SNAPSHOT_FAILED' },
        });
      } catch {
        // The warehouse transaction must remain successful. The explicit
        // catch-up endpoint can recover snapshot/outbox state later.
      }
      return {
        learningCaseId: learningCase.id,
        snapshotCreated: false,
        replayJobId: null,
        warningCodes: ['PROFILE_COMPLETION_SNAPSHOT_FAILED'],
      };
    }
  }

  async catchUpCompletion(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const record = await this.findCaseOrThrow(this.prisma, id);
    if (!record.linkedContainerId) {
      throw new ConflictException(
        this.error('PROFILE_COMPLETION_CONTAINER_REQUIRED', {
          learningCaseId: id,
        }),
      );
    }
    if (
      !record.linkedContainer ||
      !this.isCompletionStatus(record.linkedContainer.status)
    ) {
      throw new ConflictException(
        this.error('PROFILE_COMPLETION_NOT_REACHED', {
          learningCaseId: id,
          containerStatus: record.linkedContainer?.status ?? null,
        }),
      );
    }
    const result = await this.captureAndDispatchCompletion(
      record.linkedContainerId,
      actor,
    );
    return {
      learningCaseId: id,
      completion: result,
      learningCase: await this.get(id),
    };
  }

  async inspect(id: string): Promise<unknown> {
    const record = await this.findCaseOrThrow(this.prisma, id);
    this.assertCaseOpen(record);
    const sourcePath = await this.resolvePreservedWorkbook(record);
    const payload = await this.worker.inspectFile(sourcePath);
    this.assertWorkerSourceSha(record, payload.inspection?.inputSha256);
    return {
      caseId: record.id,
      draftRevision: record.draftRevision,
      source: {
        importFileId: record.sourceImportReferenceId,
        originalFilename: record.sourceImport?.originalFilename ?? null,
        fileSha256: record.sourceFileSha256,
      },
      contractVersion: payload.contractVersion,
      workerVersion: payload.workerVersion,
      inspection: payload.inspection,
      candidateMappings: payload.candidateMappings,
      issues: payload.issues,
    };
  }

  async saveDraft(
    id: string,
    dto: SaveParserProfileDraftDto,
    actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    const validation = await this.worker.validateDefinition(
      dto.mappingDefinition,
      dto.fingerprintDefinition,
    );
    if (!validation.valid) {
      throw new BadRequestException(
        this.error('PROFILE_MAPPING_DEFINITION_INVALID', {
          issues: validation.issues,
        }),
      );
    }
    const envelope: DraftDefinitionEnvelope = {
      mappingDefinition: dto.mappingDefinition,
      fingerprintDefinition: dto.fingerprintDefinition,
      mappingSchemaVersion: validation.mappingSchemaVersion,
      fingerprintVersion: validation.fingerprintVersion,
      workerVersion: validation.workerVersion,
    };
    const completenessIssues = this.definitionCompletenessIssues(envelope);
    const nextRevision = dto.expectedRevision + 1;
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findCaseOrThrow(tx, id);
      this.assertCaseOpen(existing);
      const changed = await tx.parserLearningCase.updateMany({
        where: {
          id,
          draftRevision: dto.expectedRevision,
          status: { not: ParserLearningCaseStatus.CLOSED },
        },
        data: {
          draftDefinition: this.jsonValue(envelope),
          draftRevision: nextRevision,
          status:
            completenessIssues.length === 0 && existing.linkedContainerId
              ? ParserLearningCaseStatus.READY_FOR_REPLAY
              : ParserLearningCaseStatus.MAPPING,
          replaySummary: Prisma.JsonNull,
          activeReplayToken: null,
          lastErrorCode: null,
          updatedById: actor.id,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          this.error('PROFILE_DRAFT_REVISION_CONFLICT', {
            learningCaseId: id,
            expectedRevision: dto.expectedRevision,
            currentRevision: existing.draftRevision,
          }),
        );
      }
      await tx.parserProfileAuditEvent.create({
        data: {
          eventCode: ParserProfileAuditEventCode.MAPPING_SAVED,
          actorId: actor.id,
          learningCaseId: id,
          importFileId: existing.sourceImportId,
          containerId: existing.linkedContainerId,
          metadata: {
            previousRevision: dto.expectedRevision,
            draftRevision: nextRevision,
            mappingSchemaVersion: validation.mappingSchemaVersion,
            fingerprintVersion: validation.fingerprintVersion,
            workerVersion: validation.workerVersion,
            completenessIssueCodes: completenessIssues.map(
              (issue) => issue.code,
            ),
          },
        },
      });
      return this.findCaseOrThrow(tx, id);
    });
    return this.toResponse(updated);
  }

  async preview(id: string, dto: ParserProfileRevisionDto): Promise<unknown> {
    const record = await this.findCaseOrThrow(this.prisma, id);
    const draft = this.assertDraftRevision(record, dto.revision);
    const sourcePath = await this.resolvePreservedWorkbook(record);
    const replayInputHash = this.replayInputHash(record, draft, dto.revision);
    const executed = await this.worker.executeMapping(
      sourcePath,
      draft.mappingDefinition,
      replayInputHash,
    );
    await this.assertRevisionStillCurrent(id, dto.revision);
    this.assertExecutionSourceSha(record, executed);
    const result = executed.result;
    return {
      caseId: id,
      draftRevision: dto.revision,
      pinned: this.pinnedContract(record, draft, dto.revision, executed),
      totalRows: result?.lines.length ?? 0,
      sampleRows: result?.lines.slice(0, 50) ?? [],
      destinationSummaries: result?.destinationSummaries ?? [],
      provenance: result?.provenance ?? {},
      warnings: result?.warnings ?? [],
      errors: [...executed.issues, ...(result?.errors ?? [])],
    };
  }

  async queueReplay(
    id: string,
    dto: QueueParserProfileReplayDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const record = await this.findCaseOrThrow(this.prisma, id);
    const draft = this.assertDraftRevision(record, dto.revision);
    const completenessIssues = this.definitionCompletenessIssues(draft);
    if (!record.linkedContainerId || completenessIssues.length > 0) {
      throw new ConflictException(
        this.error('PROFILE_REPLAY_NOT_READY', {
          learningCaseId: id,
          revision: dto.revision,
          linkedContainer: Boolean(record.linkedContainerId),
          issues: completenessIssues,
        }),
      );
    }
    try {
      const job = await this.asyncJobs.submitJob({
        jobType: AsyncJobType.PARSER_PROFILE_REPLAY,
        targetType: ASYNC_JOB_TARGET_TYPES.parserLearningCase,
        targetId: id,
        actor,
        importFileId: record.sourceImportId,
        containerId: record.linkedContainerId,
        parserLearningCaseId: id,
        maxAttempts: 3,
        idempotencyScope: `${dto.revision}:${dto.idempotencyKey}`,
        reuseTerminal: true,
        metadata: {
          draftRevision: dto.revision,
          replayIdempotencyKey: dto.idempotencyKey,
          sourceFileSha256: record.sourceFileSha256,
          mappingSchemaVersion: draft.mappingSchemaVersion,
          fingerprintVersion: draft.fingerprintVersion,
          workerVersion: draft.workerVersion,
        },
      });
      return this.toReplayJobResponse(job);
    } catch (error) {
      await this.recordReplayFailure(
        id,
        dto.revision,
        'PROFILE_REPLAY_QUEUE_FAILED',
        actor,
        undefined,
        null,
        record.updatedAt,
      );
      throw error;
    }
  }

  async getReplayJob(id: string, jobId: string): Promise<unknown> {
    await this.findCaseOrThrow(this.prisma, id);
    let job: AsyncJobResponseDto;
    try {
      job = await this.asyncJobs.getJob(jobId);
    } catch (error) {
      if (this.exceptionCode(error, '') === 'ASYNC_JOB_NOT_FOUND') {
        throw new NotFoundException(
          this.error('PROFILE_REPLAY_JOB_NOT_FOUND', {
            learningCaseId: id,
            jobId,
          }),
        );
      }
      throw error;
    }
    if (
      job.jobType !== AsyncJobType.PARSER_PROFILE_REPLAY ||
      job.parserLearningCaseId !== id
    ) {
      throw new NotFoundException(
        this.error('PROFILE_REPLAY_JOB_NOT_FOUND', {
          learningCaseId: id,
          jobId,
        }),
      );
    }
    return this.toReplayJobResponse(job);
  }

  async listReplayArtifacts(id: string): Promise<unknown> {
    await this.findCaseOrThrow(this.prisma, id);
    const records = await this.prisma.generatedFile.findMany({
      where: {
        parserLearningCaseId: id,
        fileType: GeneratedFileType.PARSER_PROFILE_REPLAY_JSON,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items: records.map((record) => this.toReplayArtifact(record)) };
  }

  async downloadReplayArtifact(
    id: string,
    artifactId: string,
  ): Promise<ReplayDownload> {
    const record = await this.prisma.generatedFile.findFirst({
      where: {
        id: artifactId,
        parserLearningCaseId: id,
        fileType: GeneratedFileType.PARSER_PROFILE_REPLAY_JSON,
      },
    });
    if (!record || record.status !== GeneratedFileStatus.GENERATED) {
      throw new NotFoundException(
        this.error('PROFILE_REPLAY_ARTIFACT_NOT_FOUND', {
          learningCaseId: id,
          artifactId,
        }),
      );
    }
    const path = await this.resolveStorageFile(record.storagePath);
    const fileStat = await stat(path);
    return {
      buffer: await readFile(path),
      filename: basename(path),
      mimeType: record.mimeType ?? 'application/json',
      fileSizeBytes: Number(fileStat.size),
    };
  }

  async submitCandidate(
    id: string,
    dto: SubmitParserProfileCandidateDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const result = await this.prisma.$transaction(async (tx) => {
      const record = await this.findCaseOrThrow(tx, id);
      const draft = this.assertDraftRevision(record, dto.revision);
      const completenessIssues = this.definitionCompletenessIssues(draft);
      const replay = this.objectValue(record.replaySummary);
      if (
        completenessIssues.length > 0 ||
        replay?.artifactId !== dto.replayArtifactId ||
        replay?.draftRevision !== dto.revision ||
        replay?.passed !== true
      ) {
        throw new ConflictException(
          this.error('PROFILE_CANDIDATE_NOT_READY', {
            learningCaseId: id,
            revision: dto.revision,
            completenessIssues,
            replayArtifactId: dto.replayArtifactId,
          }),
        );
      }
      const artifact = await tx.generatedFile.findFirst({
        where: {
          id: dto.replayArtifactId,
          parserLearningCaseId: id,
          fileType: GeneratedFileType.PARSER_PROFILE_REPLAY_JSON,
          status: GeneratedFileStatus.GENERATED,
        },
        select: { id: true },
      });
      if (!artifact) {
        throw new ConflictException(
          this.error('PROFILE_REPLAY_ARTIFACT_NOT_READY', {
            learningCaseId: id,
            artifactId: dto.replayArtifactId,
          }),
        );
      }

      const existingVersion = await tx.parserProfileVersion.findFirst({
        where: { sourceLearningCaseId: id, sourceDraftRevision: dto.revision },
        include: { family: true },
      });
      if (existingVersion) {
        if (existingVersion.family.stableName !== dto.stableName) {
          throw new ConflictException(
            this.error('PROFILE_CANDIDATE_FAMILY_CONFLICT', {
              learningCaseId: id,
              revision: dto.revision,
            }),
          );
        }
        return { record, profileVersion: existingVersion };
      }

      const priorVersion = await tx.parserProfileVersion.findFirst({
        where: { sourceLearningCaseId: id },
        include: { family: true },
        orderBy: { version: 'desc' },
      });
      if (priorVersion && priorVersion.family.stableName !== dto.stableName) {
        throw new ConflictException(
          this.error('PROFILE_CANDIDATE_FAMILY_CONFLICT', {
            learningCaseId: id,
            stableName: dto.stableName,
          }),
        );
      }
      const family = priorVersion
        ? priorVersion.family
        : await tx.parserProfileFamily.upsert({
            where: { stableName: dto.stableName },
            update: {},
            create: {
              stableName: dto.stableName,
              customerLabel: dto.customerLabel ?? null,
              createdById: actor.id,
            },
          });
      await tx.$queryRaw`SELECT "id" FROM "parser_profile_families" WHERE "id" = ${family.id} FOR UPDATE`;
      const latest = await tx.parserProfileVersion.findFirst({
        where: { familyId: family.id },
        select: { version: true },
        orderBy: { version: 'desc' },
      });
      const profileVersion = await tx.parserProfileVersion.create({
        data: {
          familyId: family.id,
          sourceLearningCaseId: id,
          sourceDraftRevision: dto.revision,
          version: (latest?.version ?? 0) + 1,
          lifecycle: 'DRAFT',
          trustState: 'REVIEW_REQUIRED',
          mappingDefinition: this.jsonValue(draft.mappingDefinition),
          fingerprintDefinition: this.jsonValue(draft.fingerprintDefinition),
          matcherVersion: draft.fingerprintVersion,
          mappingVersion: draft.mappingSchemaVersion,
          createdById: actor.id,
        },
        include: { family: true },
      });
      const nextStatus = record.completionSnapshot
        ? ParserLearningCaseStatus.AWAITING_APPROVAL
        : ParserLearningCaseStatus.AWAITING_COMPLETION;
      const updated = await tx.parserLearningCase.update({
        where: { id },
        data: {
          status: nextStatus,
          updatedById: actor.id,
          lastErrorCode: null,
        },
        include: learningCaseInclude,
      });
      await tx.parserProfileAuditEvent.createMany({
        data: [
          {
            eventCode: ParserProfileAuditEventCode.PROFILE_CREATED,
            actorId: actor.id,
            profileFamilyId: family.id,
            profileVersionId: profileVersion.id,
            learningCaseId: id,
            importFileId: record.sourceImportId,
            containerId: record.linkedContainerId,
            metadata: {
              sourceDraftRevision: dto.revision,
              lifecycle: 'DRAFT',
              trustState: 'REVIEW_REQUIRED',
            },
          },
          {
            eventCode: ParserProfileAuditEventCode.SUBMITTED,
            actorId: actor.id,
            profileFamilyId: family.id,
            profileVersionId: profileVersion.id,
            learningCaseId: id,
            importFileId: record.sourceImportId,
            containerId: record.linkedContainerId,
            metadata: {
              sourceDraftRevision: dto.revision,
              replayArtifactId: dto.replayArtifactId,
              lifecycle: 'DRAFT',
            },
          },
        ],
      });
      return { record: updated, profileVersion };
    });
    const completionOutbox = result.record.completionSnapshot
      ? await this.prisma.$transaction((tx) =>
          this.captureCompletionInTransaction(
            tx,
            result.record.linkedContainerId!,
            actor,
          ),
        )
      : null;
    const completionDispatch = await this.dispatchCompletionReplay(
      completionOutbox,
      actor,
    );
    return {
      learningCase: this.toResponse(result.record),
      profileVersion: this.toCandidateProfileVersion(result.profileVersion),
      completionReplay: completionOutbox
        ? { ...completionOutbox, ...completionDispatch }
        : null,
    };
  }

  async executeReplayJob(
    id: string,
    actor: AuthenticatedUser,
    asyncJobId: string,
    metadata: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    const revision = this.positiveInteger(metadata?.draftRevision);
    const requestKey = this.nonEmptyString(metadata?.replayIdempotencyKey);
    if (!revision || !requestKey) {
      throw new BadRequestException(
        this.error('PROFILE_REPLAY_JOB_PAYLOAD_INVALID', {
          learningCaseId: id,
          asyncJobId,
        }),
      );
    }
    const artifactKey = `parser-profile-replay:${id}:${revision}:${requestKey}`;
    let artifact: Awaited<
      ReturnType<typeof this.prisma.generatedFile.upsert>
    > | null = null;
    try {
      const record = await this.findCaseOrThrow(this.prisma, id);
      const draft = this.assertDraftRevision(record, revision);
      if (!record.linkedContainer) {
        throw new ConflictException(
          this.error('PROFILE_REPLAY_NOT_READY', {
            learningCaseId: id,
            revision,
          }),
        );
      }
      const existingArtifact = await this.prisma.generatedFile.findFirst({
        where: {
          parserLearningCaseId: id,
          idempotencyKey: artifactKey,
          fileType: GeneratedFileType.PARSER_PROFILE_REPLAY_JSON,
          status: GeneratedFileStatus.GENERATED,
        },
      });
      if (existingArtifact) {
        const replaySummary = this.objectValue(record.replaySummary);
        return {
          replay:
            replaySummary?.artifactId === existingArtifact.id
              ? { ...replaySummary, stale: false, idempotent: true }
              : {
                  artifactId: existingArtifact.id,
                  draftRevision: revision,
                  asyncJobId,
                  stale: false,
                  idempotent: true,
                },
          generatedFile: this.toReplayArtifact(existingArtifact),
        };
      }
      const artifactId = randomUUID();
      const storagePath = join(
        resolve(this.storageRoot),
        'parser-profile-replays',
        id,
        `${artifactId}.json`,
      );
      artifact = await this.prisma.generatedFile.upsert({
        where: { idempotencyKey: artifactKey },
        update: {
          status: GeneratedFileStatus.GENERATING,
          errorMessage: null,
        },
        create: {
          id: artifactId,
          importFileId: record.sourceImportId,
          containerId: record.linkedContainerId,
          parserLearningCaseId: id,
          idempotencyKey: artifactKey,
          fileType: GeneratedFileType.PARSER_PROFILE_REPLAY_JSON,
          storagePath,
          mimeType: 'application/json',
          status: GeneratedFileStatus.GENERATING,
          generatedById: actor.id,
        },
      });
      const claimed = await this.prisma.parserLearningCase.updateMany({
        where: {
          id,
          draftRevision: revision,
          status: { not: ParserLearningCaseStatus.CLOSED },
          OR: [{ activeReplayToken: null }, { activeReplayToken: artifactKey }],
        },
        data: {
          activeReplayToken: artifactKey,
          lastErrorCode: null,
          updatedById: actor.id,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          this.error('PARSER_LEARNING_CASE_REPLAY_RUNNING', {
            learningCaseId: id,
            revision,
          }),
        );
      }

      const manualSnapshot = this.manualSnapshot(record);
      const manualSnapshotHash = this.hashJson(manualSnapshot);
      const sourcePath = await this.resolvePreservedWorkbook(record);
      const replayInputHash = this.replayInputHash(record, draft, revision);
      const execution = await this.worker.executeMapping(
        sourcePath,
        draft.mappingDefinition,
        replayInputHash,
      );
      this.assertExecutionSourceSha(record, execution);
      const diff = this.buildReplayDiff(execution, manualSnapshot);
      const executionErrors = [
        ...execution.issues,
        ...(execution.result?.errors ?? []),
      ];
      const blockingCodes = [
        ...executionErrors.map((issue) => issue.code),
        ...diff.items
          .filter((item) => item.material || item.blocking)
          .map((item) => item.code),
      ].filter((code, index, codes) => codes.indexOf(code) === index);
      let passed = Boolean(execution.result) && blockingCodes.length === 0;
      const current = await this.findCaseOrThrow(this.prisma, id);
      const manualSnapshotChanged =
        current.linkedContainer === null ||
        this.hashJson(this.manualSnapshot(current)) !== manualSnapshotHash;
      if (manualSnapshotChanged) {
        passed = false;
        blockingCodes.push('PROFILE_REPLAY_MANUAL_SNAPSHOT_CHANGED');
      }
      const replayPayload = {
        contractVersion: 'parser-profile-replay-v1',
        artifactId: artifact.id,
        caseId: id,
        draftRevision: revision,
        asyncJobId,
        pinned: {
          ...this.pinnedContract(record, draft, revision, execution),
          manualSnapshotHash,
        },
        passed,
        blockingCodes,
        warnings: execution.result?.warnings ?? [],
        errors: executionErrors,
        result: execution.result,
        manualSnapshot,
        diff,
      };
      const fileMetadata = await this.writeReplayArtifact(
        artifact.storagePath,
        replayPayload,
      );
      const replaySummary = {
        artifactId: artifact.id,
        draftRevision: revision,
        asyncJobId,
        passed,
        blockingCodes,
        diffSummary: diff.summary,
        diff: diff.items,
        pinned: replayPayload.pinned,
      };
      const nextStatus = passed
        ? record.completionSnapshot && record.profileVersions.length > 0
          ? ParserLearningCaseStatus.AWAITING_APPROVAL
          : ParserLearningCaseStatus.READY_FOR_REPLAY
        : ParserLearningCaseStatus.REPLAY_FAILED;
      const completion = await this.prisma.$transaction(async (tx) => {
        const updatedArtifact = await tx.generatedFile.update({
          where: { id: artifact!.id },
          data: {
            status: GeneratedFileStatus.GENERATED,
            fileSha256: fileMetadata.sha256,
            fileSizeBytes: BigInt(fileMetadata.size),
            errorMessage: null,
          },
        });
        const updatedCase = await tx.parserLearningCase.updateMany({
          where: {
            id,
            draftRevision: revision,
            activeReplayToken: artifactKey,
            status: { not: ParserLearningCaseStatus.CLOSED },
          },
          data: {
            status: nextStatus,
            replaySummary: this.jsonValue(replaySummary),
            activeReplayToken: null,
            lastErrorCode: blockingCodes[0] ?? null,
            updatedById: actor.id,
          },
        });
        await tx.parserProfileAuditEvent.create({
          data: {
            eventCode: ParserProfileAuditEventCode.REPLAYED,
            actorId: actor.id,
            learningCaseId: id,
            importFileId: record.sourceImportId,
            containerId: record.linkedContainerId,
            metadata: {
              artifactId: artifact!.id,
              asyncJobId,
              draftRevision: revision,
              passed,
              stale: updatedCase.count !== 1,
              blockingCodes,
              sourceFileSha256: record.sourceFileSha256,
            },
          },
        });
        return { updatedArtifact, stale: updatedCase.count !== 1 };
      });
      return {
        replay: { ...replaySummary, stale: completion.stale },
        generatedFile: this.toReplayArtifact(completion.updatedArtifact),
      };
    } catch (error) {
      const code = this.exceptionCode(error, 'PROFILE_REPLAY_WORKER_FAILED');
      if (artifact) {
        await this.prisma.generatedFile.update({
          where: { id: artifact.id },
          data: {
            status: GeneratedFileStatus.FAILED,
            errorMessage: code,
          },
        });
      }
      await this.recordReplayFailure(
        id,
        revision,
        code,
        actor,
        artifact?.id,
        artifactKey,
      );
      throw error;
    }
  }

  async linkContainer(
    id: string,
    containerId: string,
    actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const container = await tx.container.findUnique({
          where: { id: containerId },
          select: {
            id: true,
            importFileId: true,
            parserSourceKind: true,
            parserVersion: true,
          },
        });
        if (!container) {
          throw new NotFoundException(
            this.error('PARSER_LEARNING_CONTAINER_NOT_FOUND', { containerId }),
          );
        }
        if (
          container.importFileId !== null ||
          container.parserSourceKind !== 'MANUAL' ||
          container.parserVersion !== 'manual-entry-v1'
        ) {
          throw new BadRequestException(
            this.error('PARSER_LEARNING_CONTAINER_NOT_MANUAL', {
              containerId,
            }),
          );
        }
        return this.linkContainerInTransaction(tx, id, containerId, actor);
      });
    } catch (error) {
      this.throwStableLinkConflict(error, id, containerId);
      throw error;
    }
  }

  assertCanTrain(actor: AuthenticatedUser): void {
    if (
      actor.roles.includes(ROLE_CODES.admin) ||
      actor.permissions.includes(PERMISSIONS.parserProfiles.train)
    ) {
      return;
    }
    throw new ForbiddenException(
      this.error('PARSER_PROFILE_TRAIN_FORBIDDEN', {
        requiredPermission: PERMISSIONS.parserProfiles.train,
      }),
    );
  }

  async linkContainerInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
    containerId: string,
    actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    const existing = await this.findCaseOrThrow(tx, id);
    if (existing.status === ParserLearningCaseStatus.CLOSED) {
      throw new ConflictException(
        this.error('PARSER_LEARNING_CASE_CLOSED', { learningCaseId: id }),
      );
    }
    if (existing.linkedContainerId === containerId) {
      return this.toResponse(existing);
    }
    if (existing.linkedContainerId) {
      throw new ConflictException(
        this.error('PARSER_LEARNING_CASE_ALREADY_LINKED', {
          learningCaseId: id,
          linkedContainerId: existing.linkedContainerId,
        }),
      );
    }

    const claimed = await tx.parserLearningCase.updateMany({
      where: {
        id,
        status: { not: ParserLearningCaseStatus.CLOSED },
        linkedContainerId: null,
        sourceImportId: { not: null },
      },
      data: {
        linkedContainerId: containerId,
        status: this.statusForDraft(existing.draftDefinition, true),
        updatedById: actor.id,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        this.error('PARSER_LEARNING_CASE_LINK_CONFLICT', {
          learningCaseId: id,
          containerId,
        }),
      );
    }
    await tx.parserProfileAuditEvent.create({
      data: {
        eventCode: ParserProfileAuditEventCode.CONTAINER_LINKED,
        actorId: actor.id,
        learningCaseId: id,
        importFileId: existing.sourceImportId,
        containerId,
        metadata: {
          sourceImportId: existing.sourceImportReferenceId,
          containerId,
        },
      },
    });
    return this.toResponse(await this.findCaseOrThrow(tx, id));
  }

  async unlinkContainer(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findCaseOrThrow(tx, id);
      if (existing.status === ParserLearningCaseStatus.CLOSED) {
        throw new ConflictException(
          this.error('PARSER_LEARNING_CASE_CLOSED', { learningCaseId: id }),
        );
      }
      if (!existing.linkedContainerId) {
        return existing;
      }
      const containerId = existing.linkedContainerId;
      await tx.parserLearningCase.update({
        where: { id },
        data: {
          linkedContainerId: null,
          status: existing.draftDefinition
            ? ParserLearningCaseStatus.MAPPING
            : ParserLearningCaseStatus.OPEN,
          activeReplayToken: null,
          updatedById: actor.id,
        },
      });
      await tx.parserProfileAuditEvent.create({
        data: {
          eventCode: ParserProfileAuditEventCode.CONTAINER_UNLINKED,
          actorId: actor.id,
          learningCaseId: id,
          importFileId: existing.sourceImportId,
          containerId,
          metadata: {
            sourceImportId: existing.sourceImportReferenceId,
            containerId,
          },
        },
      });
      return this.findCaseOrThrow(tx, id);
    });
    return this.toResponse(record);
  }

  async close(
    id: string,
    reasonCode: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<ParserLearningCaseResponseDto> {
    const record = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findCaseOrThrow(tx, id);
      if (existing.status === ParserLearningCaseStatus.CLOSED) {
        return existing;
      }
      const protectedProfile = await tx.parserProfileVersion.findFirst({
        where: {
          sourceLearningCaseId: id,
          OR: [{ lifecycle: { not: 'DRAFT' } }, { evidence: { some: {} } }],
        },
        select: { id: true, lifecycle: true },
      });
      if (protectedProfile) {
        throw new ConflictException(
          this.error('PARSER_LEARNING_CASE_HAS_PROFILE_DEPENDENCY', {
            learningCaseId: id,
            profileVersionId: protectedProfile.id,
            lifecycle: protectedProfile.lifecycle,
          }),
        );
      }
      const activeReplay = await tx.generatedFile.findFirst({
        where: {
          parserLearningCaseId: id,
          fileType: GeneratedFileType.PARSER_PROFILE_REPLAY_JSON,
          status: GeneratedFileStatus.GENERATING,
        },
        select: { id: true },
      });
      if (activeReplay) {
        throw new ConflictException(
          this.error('PARSER_LEARNING_CASE_REPLAY_RUNNING', {
            learningCaseId: id,
            replayArtifactId: activeReplay.id,
          }),
        );
      }
      const closedAt = new Date();
      await tx.parserLearningCase.update({
        where: { id },
        data: {
          sourceImportId: null,
          linkedContainerId: null,
          status: ParserLearningCaseStatus.CLOSED,
          activeReplayToken: null,
          updatedById: actor.id,
          closedById: actor.id,
          closedAt,
        },
      });
      await tx.parserProfileAuditEvent.create({
        data: {
          eventCode: ParserProfileAuditEventCode.CASE_CLOSED,
          actorId: actor.id,
          learningCaseId: id,
          importFileId: existing.sourceImportId,
          containerId: existing.linkedContainerId,
          metadata: {
            sourceImportId: existing.sourceImportReferenceId,
            linkedContainerId: existing.linkedContainerId,
            reasonCode: reasonCode ?? null,
          },
        },
      });
      return this.findCaseOrThrow(tx, id);
    });
    return this.toResponse(record);
  }

  async assertImportDeletionAllowed(
    importFileId: string,
    actor: AuthenticatedUser,
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
    throwOnBlocked = true,
  ): Promise<ReturnType<ParserLearningCasesService['error']> | null> {
    const [learningCase, evidence, review] = await Promise.all([
      tx.parserLearningCase.findUnique({
        where: { sourceImportId: importFileId },
        select: { id: true },
      }),
      tx.parserProfileEvidence.findFirst({
        where: { importFileId },
        select: { id: true, profileVersionId: true },
      }),
      tx.parserProfileReview.findUnique({
        where: { importFileId },
        select: { id: true, profileVersionId: true, status: true },
      }),
    ]);
    if (!learningCase && !evidence && !review) {
      return null;
    }

    await tx.parserProfileAuditEvent.create({
      data: {
        eventCode: ParserProfileAuditEventCode.IMPORT_DELETE_BLOCKED,
        actorId: actor.id,
        learningCaseId: learningCase?.id,
        profileVersionId:
          evidence?.profileVersionId ?? review?.profileVersionId,
        importFileId,
        metadata: {
          sourceImportId: importFileId,
          learningCaseId: learningCase?.id ?? null,
          profileEvidenceId: evidence?.id ?? null,
          profileReviewId: review?.id ?? null,
          profileReviewStatus: review?.status ?? null,
        },
      },
    });
    const blocked = this.error('IMPORT_USED_BY_PARSER_LEARNING', {
      importFileId,
      learningCaseId: learningCase?.id ?? null,
      profileEvidenceId: evidence?.id ?? null,
      profileReviewId: review?.id ?? null,
    });
    if (throwOnBlocked) {
      throw new ConflictException(blocked);
    }
    return blocked;
  }

  private assertCaseOpen(record: LearningCaseRecord): void {
    if (
      record.status === ParserLearningCaseStatus.CLOSED ||
      !record.sourceImport
    ) {
      throw new ConflictException(
        this.error('PARSER_LEARNING_CASE_CLOSED', {
          learningCaseId: record.id,
        }),
      );
    }
  }

  private assertDraftRevision(
    record: LearningCaseRecord,
    revision: number,
  ): DraftDefinitionEnvelope {
    this.assertCaseOpen(record);
    if (record.draftRevision !== revision) {
      throw new ConflictException(
        this.error('PROFILE_DRAFT_REVISION_CONFLICT', {
          learningCaseId: record.id,
          expectedRevision: revision,
          currentRevision: record.draftRevision,
        }),
      );
    }
    const draft = this.draftEnvelope(record.draftDefinition);
    if (!draft) {
      throw new ConflictException(
        this.error('PROFILE_DRAFT_NOT_FOUND', {
          learningCaseId: record.id,
          revision,
        }),
      );
    }
    return draft;
  }

  private async assertRevisionStillCurrent(
    id: string,
    revision: number,
  ): Promise<void> {
    const current = await this.prisma.parserLearningCase.findUnique({
      where: { id },
      select: { draftRevision: true, status: true },
    });
    if (
      !current ||
      current.draftRevision !== revision ||
      current.status === ParserLearningCaseStatus.CLOSED
    ) {
      throw new ConflictException(
        this.error('PROFILE_PREVIEW_STALE_RESULT', {
          learningCaseId: id,
          revision,
          currentRevision: current?.draftRevision ?? null,
        }),
      );
    }
  }

  private draftEnvelope(value: unknown): DraftDefinitionEnvelope | null {
    const candidate = this.objectValue(value);
    const mappingDefinition = this.objectValue(candidate?.mappingDefinition);
    const fingerprintDefinition = this.objectValue(
      candidate?.fingerprintDefinition,
    );
    const mappingSchemaVersion = this.nonEmptyString(
      candidate?.mappingSchemaVersion,
    );
    const fingerprintVersion = this.nonEmptyString(
      candidate?.fingerprintVersion,
    );
    const workerVersion = this.nonEmptyString(candidate?.workerVersion);
    if (
      !mappingDefinition ||
      !fingerprintDefinition ||
      !mappingSchemaVersion ||
      !fingerprintVersion ||
      !workerVersion
    ) {
      return null;
    }
    return {
      mappingDefinition,
      fingerprintDefinition,
      mappingSchemaVersion,
      fingerprintVersion,
      workerVersion,
    };
  }

  private definitionCompletenessIssues(
    draft: DraftDefinitionEnvelope,
  ): ParserProfileIssue[] {
    const fields = this.objectValue(draft.mappingDefinition.fields) ?? {};
    const required = ['destinationCode', 'cartons', 'volumeCbm'];
    const issues = required
      .filter((field) => !this.objectValue(fields[field]))
      .map((field) => ({
        code: 'PROFILE_MAPPING_REQUIRED_FIELD_MISSING',
        path: `mappingDefinition.fields.${field}`,
        field,
      }));
    return issues;
  }

  private statusForDraft(
    value: unknown,
    linked: boolean,
  ): ParserLearningCaseStatus {
    const draft = this.draftEnvelope(value);
    if (!draft) {
      return ParserLearningCaseStatus.OPEN;
    }
    return linked && this.definitionCompletenessIssues(draft).length === 0
      ? ParserLearningCaseStatus.READY_FOR_REPLAY
      : ParserLearningCaseStatus.MAPPING;
  }

  private pinnedContract(
    record: LearningCaseRecord,
    draft: DraftDefinitionEnvelope,
    revision: number,
    execution: ParserProfileExecutionPayload,
  ): Record<string, unknown> {
    return {
      sourceImportId: record.sourceImportReferenceId,
      sourceFileSha256: record.sourceFileSha256,
      draftRevision: revision,
      mappingSchemaVersion: draft.mappingSchemaVersion,
      fingerprintVersion: draft.fingerprintVersion,
      workerVersion: execution.workerVersion,
      parserVersion: execution.result?.parserVersion ?? draft.workerVersion,
      replayInputHash: this.replayInputHash(record, draft, revision),
    };
  }

  private replayInputHash(
    record: LearningCaseRecord,
    draft: DraftDefinitionEnvelope,
    revision: number,
  ): string {
    return this.hashJson({
      sourceFileSha256: record.sourceFileSha256,
      draftRevision: revision,
      mappingSchemaVersion: draft.mappingSchemaVersion,
      fingerprintVersion: draft.fingerprintVersion,
      mappingDefinition: draft.mappingDefinition,
      fingerprintDefinition: draft.fingerprintDefinition,
    });
  }

  private assertWorkerSourceSha(
    record: LearningCaseRecord,
    value: unknown,
  ): void {
    if (value !== record.sourceFileSha256) {
      throw new ConflictException(
        this.error('PROFILE_SOURCE_SHA_MISMATCH', {
          learningCaseId: record.id,
          expectedSha256: record.sourceFileSha256,
          actualSha256: typeof value === 'string' ? value : null,
        }),
      );
    }
  }

  private assertExecutionSourceSha(
    record: LearningCaseRecord,
    execution: ParserProfileExecutionPayload,
  ): void {
    if (!execution.result) {
      return;
    }
    this.assertWorkerSourceSha(
      record,
      execution.result.rawMetadata.inputSha256,
    );
  }

  private async buildCompletionSnapshot(
    tx: Prisma.TransactionClient,
    record: LearningCaseRecord,
    snapshotAt: Date,
  ): Promise<Record<string, unknown>> {
    const container = record.linkedContainer!;
    const destinationIds = container.destinations.map((item) => item.id);
    const lineIds = container.lines.map((item) => item.id);
    const corrections = await tx.correctionFeedback.findMany({
      where: {
        OR: [
          {
            containerId: container.id,
            fieldName: { in: ['containerNo'] },
          },
          {
            containerDestinationId: { in: destinationIds },
            fieldName: {
              in: [
                'destinationCode',
                'destinationType',
                'cartons',
                'volume',
                'packageType',
                'manualEntry',
              ],
            },
          },
          {
            containerLineId: { in: lineIds },
            fieldName: {
              in: [
                'destinationCode',
                'destinationType',
                'cartons',
                'volume',
                'rawJson',
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        targetType: true,
        containerId: true,
        containerDestinationId: true,
        containerLineId: true,
        fieldName: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const manual = this.manualSnapshot({
      ...record,
      completionSnapshot: null,
    });
    return {
      contractVersion: 'parser-completion-snapshot-v1',
      snapshotAt: snapshotAt.toISOString(),
      completionStatus: container.status,
      learningCaseId: record.id,
      sourceImportId: record.sourceImportReferenceId,
      sourceFileSha256: record.sourceFileSha256,
      linkedContainerId: container.id,
      containerNo: manual.containerNo,
      detailRows: manual.detailRows,
      destinations: manual.destinations,
      referenceEvidence: manual.referenceEvidence,
      parserRelevantCorrectionRevisions: corrections.map((correction) => ({
        id: correction.id,
        targetType: correction.targetType,
        targetId:
          correction.containerLineId ??
          correction.containerDestinationId ??
          correction.containerId,
        fieldName: correction.fieldName,
        createdAt: correction.createdAt.toISOString(),
        revisionAt: correction.updatedAt.toISOString(),
      })),
    };
  }

  private async createCompletionReplayJobInTransaction(
    tx: Prisma.TransactionClient,
    record: LearningCaseRecord,
    snapshot: unknown,
    draftRevision: number,
    actor: AuthenticatedUser,
  ): Promise<{
    jobId: string;
    draftRevision: number;
    replayIdempotencyKey: string;
  }> {
    const snapshotHash = this.hashJson(snapshot);
    const replayIdempotencyKey = `completion-${snapshotHash.slice(0, 40)}`;
    const jobId = randomUUID();
    await tx.asyncJob.create({
      data: {
        id: jobId,
        jobType: AsyncJobType.PARSER_PROFILE_REPLAY,
        status: AsyncJobStatus.QUEUED,
        queueName: this.asyncJobs.getQueueName(),
        targetType: ASYNC_JOB_TARGET_TYPES.parserLearningCase,
        targetId: record.id,
        idempotencyKey: `${AsyncJobType.PARSER_PROFILE_REPLAY}:${ASYNC_JOB_TARGET_TYPES.parserLearningCase}:${record.id}:${replayIdempotencyKey}`,
        importFileId: record.sourceImportId,
        containerId: record.linkedContainerId,
        parserLearningCaseId: record.id,
        actorUserId: actor.id,
        maxAttempts: 3,
        metadata: this.jsonValue({
          draftRevision,
          replayIdempotencyKey,
          completionSnapshotHash: snapshotHash,
          sourceFileSha256: record.sourceFileSha256,
          actor: this.actorSnapshot(actor),
        }),
      },
    });
    return { jobId, draftRevision, replayIdempotencyKey };
  }

  private manualSnapshot(record: LearningCaseRecord): ManualParserSnapshot {
    const frozen = this.objectValue(record.completionSnapshot);
    if (frozen) {
      const detailRows = Array.isArray(frozen.detailRows)
        ? frozen.detailRows.filter((item): item is Record<string, unknown> =>
            Boolean(this.objectValue(item)),
          )
        : [];
      const destinations = Array.isArray(frozen.destinations)
        ? frozen.destinations
            .map((item) => this.objectValue(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
            .map((item) => ({
              destinationCode: this.nonEmptyString(item.destinationCode) ?? '',
              destinationType: this.nonEmptyString(item.destinationType),
              packageType:
                this.nonEmptyString(item.packageType) ?? 'UNSPECIFIED',
              cartons: Number(item.cartons ?? 0),
              volumeCbm:
                item.volumeCbm === null
                  ? null
                  : this.canonicalVolume(item.volumeCbm),
            }))
        : [];
      return {
        containerNo: this.nonEmptyString(frozen.containerNo) ?? '',
        detailRows,
        destinations,
        referenceEvidence: frozen.referenceEvidence ?? [],
      };
    }
    const container = record.linkedContainer;
    if (!container) {
      throw new ConflictException(
        this.error('PROFILE_REPLAY_MANUAL_RESULT_REQUIRED', {
          learningCaseId: record.id,
        }),
      );
    }
    return {
      containerNo: container.containerNo,
      detailRows: container.lines.map((line) => ({
        lineNo: line.lineNo,
        destinationCode: line.destinationCode,
        destinationType: line.destinationType,
        cartons: line.cartons,
        volumeCbm: this.canonicalVolume(line.volume),
        referenceEvidence: this.referenceEvidence(line.rawJson),
      })),
      destinations: container.destinations.map((destination) => ({
        destinationCode: destination.destinationCode,
        destinationType: destination.destinationType,
        packageType: destination.packageType,
        cartons: destination.cartons,
        volumeCbm:
          destination.cartons > 0 && Number(destination.volume) <= 0
            ? null
            : this.canonicalVolume(destination.volume),
      })),
      referenceEvidence: container.lines.map((line) =>
        this.referenceEvidence(line.rawJson),
      ),
    };
  }

  private buildReplayDiff(
    execution: ParserProfileExecutionPayload,
    manual: ManualParserSnapshot,
  ): ReplayDiff {
    const result = execution.result;
    const items: ReplayDiffItem[] = [];
    this.addDiffItem(
      items,
      'containerNo',
      null,
      manual.containerNo,
      result?.containerNo ?? null,
      'PROFILE_REPLAY_CONTAINER_MISMATCH',
      true,
    );

    if (manual.detailRows.length === 0) {
      items.push({
        field: 'detailRowInclusion',
        key: null,
        expected: null,
        actual: result?.lines.map((line) => line.rowNumber) ?? [],
        equal: false,
        material: false,
        blocking: false,
        code: 'PROFILE_EVIDENCE_DETAIL_ROWS_UNVERIFIED',
      });
    } else {
      this.addDiffItem(
        items,
        'detailRowInclusion',
        null,
        manual.detailRows.map((row) => row.lineNo),
        result?.lines.map((line) => line.rowNumber) ?? [],
        'PROFILE_REPLAY_DETAIL_ROWS_MISMATCH',
        true,
      );
    }

    const manualDestinationCodes = [
      ...new Set(manual.destinations.map((item) => item.destinationCode)),
    ].sort();
    const resultDestinations = result?.destinationSummaries ?? [];
    const actualDestinationCodes = [
      ...new Set(
        resultDestinations
          .map((item) => this.nonEmptyString(item.destinationCode))
          .filter((item): item is string => Boolean(item)),
      ),
    ].sort();
    this.addDiffItem(
      items,
      'destinationSet',
      null,
      manualDestinationCodes,
      actualDestinationCodes,
      'PROFILE_REPLAY_DESTINATION_SET_MISMATCH',
      true,
    );

    for (const destinationCode of [
      ...new Set([...manualDestinationCodes, ...actualDestinationCodes]),
    ].sort()) {
      const expectedRows = manual.destinations.filter(
        (item) => item.destinationCode === destinationCode,
      );
      const actualRows = resultDestinations.filter(
        (item) => item.destinationCode === destinationCode,
      );
      this.addDiffItem(
        items,
        'cartons',
        destinationCode,
        expectedRows.reduce((sum, item) => sum + item.cartons, 0),
        actualRows.reduce(
          (sum, item) => sum + Number(item.totalCartons ?? 0),
          0,
        ),
        'PROFILE_REPLAY_CARTONS_MISMATCH',
        true,
      );
      const expectedVolumes = expectedRows.map((item) => item.volumeCbm);
      if (expectedVolumes.some((value) => value === null)) {
        items.push({
          field: 'volumeCbm',
          key: destinationCode,
          expected: null,
          actual: this.sumCanonicalVolume(
            actualRows.map((item) => item.totalVolumeCbm),
          ),
          equal: false,
          material: false,
          blocking: true,
          code: 'PROFILE_EVIDENCE_VOLUME_UNVERIFIED',
        });
      } else {
        this.addDiffItem(
          items,
          'volumeCbm',
          destinationCode,
          this.sumCanonicalVolume(expectedVolumes),
          this.sumCanonicalVolume(
            actualRows.map((item) => item.totalVolumeCbm),
          ),
          'PROFILE_REPLAY_VOLUME_MISMATCH',
          true,
        );
      }
      this.addDiffItem(
        items,
        'packageEvidence',
        destinationCode,
        [...new Set(expectedRows.map((item) => item.packageType))].sort(),
        [
          ...new Set(
            actualRows
              .map((item) => this.nonEmptyString(item.packageType))
              .filter((item): item is string => Boolean(item)),
          ),
        ].sort(),
        'PROFILE_REPLAY_PACKAGE_EVIDENCE_MISMATCH',
        true,
      );
    }
    if (manual.detailRows.length === 0) {
      items.push({
        field: 'referenceEvidence',
        key: null,
        expected: null,
        actual: this.profileReferenceEvidence(result),
        equal: false,
        material: false,
        blocking: false,
        code: 'PROFILE_EVIDENCE_REFERENCE_UNVERIFIED',
      });
    } else {
      this.addDiffItem(
        items,
        'referenceEvidence',
        null,
        manual.referenceEvidence,
        this.profileReferenceEvidence(result),
        'PROFILE_REPLAY_REFERENCE_EVIDENCE_MISMATCH',
        true,
      );
    }
    return {
      items,
      summary: {
        compared: items.length,
        equal: items.filter((item) => item.equal).length,
        materialDifferences: items.filter((item) => item.material).length,
        blockers: items.filter((item) => item.blocking).length,
      },
    };
  }

  private addDiffItem(
    items: ReplayDiffItem[],
    field: string,
    key: string | null,
    expected: unknown,
    actual: unknown,
    mismatchCode: string,
    material: boolean,
  ): void {
    const equal = this.stableJson(expected) === this.stableJson(actual);
    items.push({
      field,
      key,
      expected,
      actual,
      equal,
      material: !equal && material,
      blocking: false,
      code: equal ? 'PROFILE_REPLAY_FIELD_MATCHED' : mismatchCode,
    });
  }

  private profileReferenceEvidence(
    result: ParserProfileParseResult | null,
  ): unknown {
    return (
      result?.lines.map((line) => ({
        waybillNo: line.waybillNo ?? null,
        fbaNo: line.fbaNo ?? null,
        poNumber: line.poNumber ?? null,
        itemNo: line.itemNo ?? null,
      })) ?? []
    );
  }

  private referenceEvidence(value: unknown): unknown {
    const raw = this.objectValue(value) ?? {};
    return {
      waybillNo: raw.waybillNo ?? raw['运单号'] ?? null,
      fbaNo: raw.fbaNo ?? raw['客户单号'] ?? null,
      poNumber: raw.poNumber ?? raw['PO#'] ?? raw['PO Number'] ?? null,
      itemNo: raw.itemNo ?? raw['ITEM#'] ?? null,
    };
  }

  private canonicalVolume(value: unknown): string {
    let number = 0;
    if (typeof value === 'number') {
      number = value;
    } else if (typeof value === 'string' || typeof value === 'bigint') {
      number = Number(value);
    } else if (value && typeof value === 'object') {
      const decimalValue = value as { toNumber?: () => number };
      if (typeof decimalValue.toNumber === 'function') {
        number = decimalValue.toNumber();
      }
    }
    return (Number.isFinite(number) ? number : 0).toFixed(3);
  }

  private sumCanonicalVolume(values: unknown[]): string {
    return values
      .reduce<number>((sum, value) => sum + Number(value ?? 0), 0)
      .toFixed(3);
  }

  private async resolvePreservedWorkbook(
    record: LearningCaseRecord,
  ): Promise<string> {
    this.assertCaseOpen(record);
    if (!record.sourceImport?.storedPath) {
      throw new NotFoundException(
        this.error('PROFILE_SOURCE_WORKBOOK_NOT_FOUND', {
          learningCaseId: record.id,
        }),
      );
    }
    const path = await this.resolveStorageFile(record.sourceImport.storedPath);
    const fileStat = await lstat(path);
    if (!fileStat.isFile()) {
      throw new BadRequestException(
        this.error('PROFILE_SOURCE_STORAGE_PATH_NOT_FILE', {
          learningCaseId: record.id,
        }),
      );
    }
    return path;
  }

  private async resolveStorageFile(storagePath: string): Promise<string> {
    if (!storagePath || storagePath.includes('\0')) {
      throw new BadRequestException(
        this.error('PROFILE_STORAGE_PATH_INVALID', {}),
      );
    }
    const root = resolve(this.storageRoot);
    const resolvedPath = isAbsolute(storagePath)
      ? resolve(storagePath)
      : resolve(root, storagePath);
    if (!this.isPathWithinRoot(resolvedPath, root)) {
      throw new BadRequestException(
        this.error('PROFILE_STORAGE_PATH_OUTSIDE_ROOT', {}),
      );
    }
    let realRoot: string;
    let realPath: string;
    try {
      [realRoot, realPath] = await Promise.all([
        realpath(root),
        realpath(resolvedPath),
      ]);
    } catch {
      throw new NotFoundException(
        this.error('PROFILE_STORAGE_FILE_NOT_FOUND', {}),
      );
    }
    if (!this.isPathWithinRoot(realPath, realRoot)) {
      throw new BadRequestException(
        this.error('PROFILE_STORAGE_PATH_OUTSIDE_ROOT', {}),
      );
    }
    return realPath;
  }

  private isPathWithinRoot(path: string, root: string): boolean {
    const candidate = relative(root, path);
    return (
      Boolean(candidate) &&
      !candidate.startsWith('..') &&
      !isAbsolute(candidate)
    );
  }

  private async writeReplayArtifact(
    storagePath: string,
    payload: unknown,
  ): Promise<{ sha256: string; size: number }> {
    const root = resolve(this.storageRoot);
    const resolvedPath = resolve(storagePath);
    if (!this.isPathWithinRoot(resolvedPath, root)) {
      throw new BadRequestException(
        this.error('PROFILE_STORAGE_PATH_OUTSIDE_ROOT', {}),
      );
    }
    await mkdir(dirname(resolvedPath), { recursive: true });
    const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    const temporaryPath = `${resolvedPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, bytes, { flag: 'wx' });
    await rename(temporaryPath, resolvedPath);
    return {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    };
  }

  private async recordReplayFailure(
    id: string,
    revision: number,
    code: string,
    actor: AuthenticatedUser,
    artifactId?: string,
    replayToken: string | null = null,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.parserLearningCase.updateMany({
        where: {
          id,
          draftRevision: revision,
          linkedContainerId: { not: null },
          status: { not: ParserLearningCaseStatus.CLOSED },
          activeReplayToken: replayToken,
          ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
        },
        data: {
          status: ParserLearningCaseStatus.REPLAY_FAILED,
          activeReplayToken: null,
          lastErrorCode: code,
          updatedById: actor.id,
        },
      });
      if (changed.count > 0) {
        const record = await tx.parserLearningCase.findUnique({
          where: { id },
          select: { sourceImportId: true, linkedContainerId: true },
        });
        await tx.parserProfileAuditEvent.create({
          data: {
            eventCode: ParserProfileAuditEventCode.REPLAYED,
            actorId: actor.id,
            learningCaseId: id,
            importFileId: record?.sourceImportId ?? null,
            containerId: record?.linkedContainerId ?? null,
            metadata: {
              draftRevision: revision,
              artifactId: artifactId ?? null,
              passed: false,
              errorCode: code,
            },
          },
        });
      }
    });
  }

  private toReplayJobResponse(job: AsyncJobResponseDto): unknown {
    return {
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      learningCaseId: job.parserLearningCaseId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastErrorCode: this.errorCodeFromValue(job.result),
      result: job.result,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }

  private toReplayArtifact(record: {
    id: string;
    parserLearningCaseId?: string | null;
    fileType: string;
    status: string;
    fileSha256?: string | null;
    mimeType?: string | null;
    fileSizeBytes?: bigint | number | string | null;
    errorMessage?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  }): unknown {
    return {
      id: record.id,
      learningCaseId: record.parserLearningCaseId ?? null,
      fileType: record.fileType,
      status: record.status,
      fileSha256: record.fileSha256 ?? null,
      mimeType: record.mimeType ?? null,
      fileSizeBytes:
        record.fileSizeBytes === null || record.fileSizeBytes === undefined
          ? null
          : String(record.fileSizeBytes),
      errorCode: record.errorMessage ?? null,
      downloadUrl:
        record.status === GeneratedFileStatus.GENERATED &&
        record.parserLearningCaseId
          ? `/api/parser-learning-cases/${record.parserLearningCaseId}/replays/${record.id}/download`
          : null,
      createdAt: this.isoString(record.createdAt),
      updatedAt: this.isoString(record.updatedAt),
    };
  }

  private toCandidateProfileVersion(record: {
    id: string;
    familyId: string;
    version: number;
    sourceDraftRevision?: number | null;
    lifecycle: string;
    trustState: string;
    matcherVersion: string;
    mappingVersion: string;
    family?: { stableName: string; customerLabel: string | null };
  }): unknown {
    return {
      id: record.id,
      familyId: record.familyId,
      stableName: record.family?.stableName ?? null,
      customerLabel: record.family?.customerLabel ?? null,
      version: record.version,
      sourceDraftRevision: record.sourceDraftRevision ?? null,
      lifecycle: record.lifecycle,
      trustState: record.trustState,
      matcherVersion: record.matcherVersion,
      mappingVersion: record.mappingVersion,
    };
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private hashJson(value: unknown): string {
    return createHash('sha256').update(this.stableJson(value)).digest('hex');
  }

  private actorSnapshot(actor: AuthenticatedUser): Record<string, unknown> {
    return {
      id: actor.id,
      email: actor.email,
      name: actor.name,
      roles: actor.roles,
      permissions: actor.permissions,
    };
  }

  private stableJson(value: unknown): string {
    const normalize = (candidate: unknown): unknown => {
      if (Array.isArray(candidate)) {
        return candidate.map(normalize);
      }
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

  private objectValue(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private nonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private positiveInteger(value: unknown): number | null {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
  }

  private exceptionCode(error: unknown, fallback: string): string {
    if (this.hasExceptionResponse(error)) {
      return this.errorCodeFromValue(error.getResponse()) ?? fallback;
    }
    return fallback;
  }

  private hasExceptionResponse(
    value: unknown,
  ): value is { getResponse(): unknown } {
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as { getResponse?: unknown }).getResponse === 'function'
    );
  }

  private errorCodeFromValue(value: unknown): string | null {
    return this.nonEmptyString(this.objectValue(value)?.code);
  }

  private isoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private async findCaseOrThrow(
    tx: PrismaService | Prisma.TransactionClient,
    id: string,
  ): Promise<LearningCaseRecord> {
    const record = await tx.parserLearningCase.findUnique({
      where: { id },
      include: learningCaseInclude,
    });
    if (!record) {
      throw new NotFoundException(
        this.error('PARSER_LEARNING_CASE_NOT_FOUND', { learningCaseId: id }),
      );
    }
    return record;
  }

  private isEligibleImport(
    format: string,
    parseStatus: string,
    rawMetadata?: unknown,
  ): boolean {
    const selection = this.objectValue(
      this.objectValue(rawMetadata)?.parseSelection,
    );
    const reviewFallbackSource = this.nonEmptyString(selection?.source);
    return (
      parseStatus === 'ERROR' ||
      parseStatus === 'WARNING' ||
      (parseStatus === 'REVIEW_REQUIRED' &&
        (reviewFallbackSource === 'AMBIGUOUS' ||
          reviewFallbackSource === 'DRIFT')) ||
      (parseStatus === 'NOT_PARSED' && format === 'UNKNOWN')
    );
  }

  private isCompletionStatus(status: string): boolean {
    return (
      status === ContainerStatus.UNLOADED ||
      status === ContainerStatus.LOADING_IN_PROGRESS ||
      status === ContainerStatus.LOADED
    );
  }

  private throwStableLinkConflict(
    error: unknown,
    learningCaseId: string,
    containerId: string,
  ): void {
    if (!this.isUniqueConstraintError(error)) {
      return;
    }
    throw new ConflictException(
      this.error('PARSER_LEARNING_CONTAINER_ALREADY_LINKED', {
        learningCaseId,
        containerId,
      }),
    );
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private error(code: string, details: Record<string, unknown>) {
    return { code, message: code, details };
  }

  private toResponse(
    record: LearningCaseRecord,
  ): ParserLearningCaseResponseDto {
    return {
      id: record.id,
      status: record.status,
      sourceImportId: record.sourceImportReferenceId,
      sourceFileSha256: record.sourceFileSha256,
      sourceImport: record.sourceImport
        ? {
            id: record.sourceImport.id,
            originalFilename: record.sourceImport.originalFilename,
            format: record.sourceImport.format,
            parseStatus: record.sourceImport.parseStatus,
            rawMetadata: record.sourceImport.rawMetadata ?? null,
          }
        : null,
      linkedContainer: record.linkedContainer
        ? {
            id: record.linkedContainer.id,
            containerNo: record.linkedContainer.containerNo,
            sourceFormat: record.linkedContainer.sourceFormat,
            parserSourceKind: record.linkedContainer.parserSourceKind,
            parserVersion: record.linkedContainer.parserVersion,
            rawMetadata: record.linkedContainer.rawJson ?? null,
          }
        : null,
      draftDefinition: record.draftDefinition ?? null,
      draftRevision: record.draftRevision,
      completionSnapshot: record.completionSnapshot ?? null,
      replaySummary: record.replaySummary ?? null,
      lastErrorCode: record.lastErrorCode,
      latestProfileVersion: record.profileVersions[0]
        ? {
            id: record.profileVersions[0].id,
            familyId: record.profileVersions[0].familyId,
            version: record.profileVersions[0].version,
            sourceDraftRevision:
              record.profileVersions[0].sourceDraftRevision ?? null,
            lifecycle: record.profileVersions[0].lifecycle,
            trustState: record.profileVersions[0].trustState,
            mappingVersion: record.profileVersions[0].mappingVersion,
            matcherVersion: record.profileVersions[0].matcherVersion,
          }
        : null,
      createdById: record.createdById,
      updatedById: record.updatedById,
      closedById: record.closedById,
      closedAt: record.closedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
