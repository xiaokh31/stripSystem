import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PERMISSIONS, ROLE_CODES } from '../auth/permissions';
import {
  ParserLearningCaseStatus,
  ParserProfileAuditEventCode,
} from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ParserLearningCaseResponseDto } from './dto/parser-learning-case.dto';

const learningCaseInclude = {
  sourceImport: {
    select: {
      id: true,
      originalFilename: true,
      format: true,
      parseStatus: true,
      rawMetadata: true,
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
    },
  },
} as const;

type LearningCaseRecord = Prisma.ParserLearningCaseGetPayload<{
  include: typeof learningCaseInclude;
}>;

@Injectable()
export class ParserLearningCasesService {
  constructor(private readonly prisma: PrismaService) {}

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
          },
        });
        if (!sourceImport) {
          throw new NotFoundException(
            this.error('PARSER_LEARNING_IMPORT_NOT_FOUND', { importFileId }),
          );
        }
        if (
          !this.isEligibleImport(sourceImport.format, sourceImport.parseStatus)
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
        status: ParserLearningCaseStatus.DRAFT,
        linkedContainerId: null,
        sourceImportId: { not: null },
      },
      data: {
        linkedContainerId: containerId,
        status: ParserLearningCaseStatus.LINKED,
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
          status: ParserLearningCaseStatus.DRAFT,
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
      const closedAt = new Date();
      await tx.parserLearningCase.update({
        where: { id },
        data: {
          sourceImportId: null,
          linkedContainerId: null,
          status: ParserLearningCaseStatus.CLOSED,
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
    const [learningCase, evidence] = await Promise.all([
      tx.parserLearningCase.findUnique({
        where: { sourceImportId: importFileId },
        select: { id: true },
      }),
      tx.parserProfileEvidence.findFirst({
        where: { importFileId },
        select: { id: true, profileVersionId: true },
      }),
    ]);
    if (!learningCase && !evidence) {
      return null;
    }

    await tx.parserProfileAuditEvent.create({
      data: {
        eventCode: ParserProfileAuditEventCode.IMPORT_DELETE_BLOCKED,
        actorId: actor.id,
        learningCaseId: learningCase?.id,
        profileVersionId: evidence?.profileVersionId,
        importFileId,
        metadata: {
          sourceImportId: importFileId,
          learningCaseId: learningCase?.id ?? null,
          profileEvidenceId: evidence?.id ?? null,
        },
      },
    });
    const blocked = this.error('IMPORT_USED_BY_PARSER_LEARNING', {
      importFileId,
      learningCaseId: learningCase?.id ?? null,
      profileEvidenceId: evidence?.id ?? null,
    });
    if (throwOnBlocked) {
      throw new ConflictException(blocked);
    }
    return blocked;
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

  private isEligibleImport(format: string, parseStatus: string): boolean {
    return (
      parseStatus === 'ERROR' ||
      parseStatus === 'WARNING' ||
      (parseStatus === 'NOT_PARSED' && format === 'UNKNOWN')
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
      completionSnapshot: record.completionSnapshot ?? null,
      replaySummary: record.replaySummary ?? null,
      createdById: record.createdById,
      updatedById: record.updatedById,
      closedById: record.closedById,
      closedAt: record.closedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
