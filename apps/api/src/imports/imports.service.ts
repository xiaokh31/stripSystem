import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import {
  lstat,
  mkdir,
  realpath,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import {
  ImportFileListResponseDto,
  ImportFileResponseDto,
  ImportParseResultResponseDto,
  ContainerDestinationResponseDto,
  ImportFileContainerSummaryDto,
  ContainerLineResponseDto,
  ContainerResponseDto,
} from './dto/import-file-response.dto';
import { DeleteImportDto } from './dto/delete-import.dto';
import { ListImportsQueryDto } from './dto/list-imports-query.dto';
import {
  WorkerDestinationSummary,
  WorkerIssue,
  WorkerPalletPlan,
  WorkerParsePayload,
  WorkerParsedLine,
  WorkerParserService,
} from './worker-parser.service';
import {
  ContainerStatus,
  CorrectionTargetType,
  FileFormat,
  ImportStatus,
  PalletEventType,
  PalletStatus,
  ParseStatus,
} from '../generated/prisma/enums';
import { auditUserId } from '../auth/audit-user';
import { AuthenticatedUser } from '../auth/auth-user';
import { effectiveContainerStatus } from '../common/container-lifecycle';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PalletPolicyResolver } from '../settings/pallet-policy.resolver';
import { ParserLearningCasesService } from '../parser-learning-cases/parser-learning-cases.service';

type FileFormatValue = (typeof FileFormat)[keyof typeof FileFormat];
type NullableJsonInput =
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput;

interface ImportFileRecord {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  mimeType: string | null;
  fileSizeBytes: bigint | number | string | null;
  format: string;
  importStatus: string;
  parseStatus: string;
  parserVersion?: string | null;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  rawMetadata?: unknown;
  importedById?: string | null;
  deletedAt?: Date | string | null;
  deletedById?: string | null;
  deleteReason?: string | null;
  containers?: ImportFileContainerSummaryRecord[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ImportFileContainerSummaryRecord {
  id: string;
  containerNo: string;
  status: string;
  destinations?: Array<{
    pallets?: Array<{
      status: string;
      loadJobId: string | null;
      loadedAt: Date | string | null;
    }>;
  }>;
}

interface ContainerRecord {
  id: string;
  importFileId: string | null;
  containerNo: string;
  sourceFormat: string;
  parserVersion: string | null;
  status: string;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
  lines?: ContainerLineRecord[];
  destinations?: ContainerDestinationRecord[];
}

interface ContainerLineRecord {
  id: string;
  lineNo: number;
  destinationCode: string | null;
  destinationType: string | null;
  cartons: number | null;
  volume: { toString(): string } | number | string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
}

interface ContainerDestinationRecord {
  id: string;
  destinationCode: string;
  destinationType: string | null;
  packageType: string;
  cartons: number;
  volume: { toString(): string } | number | string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  palletRuleCode: string | null;
  calculationBasisCbm: { toString(): string } | number | string | null;
  roundingMode: string | null;
  palletPolicySnapshot?: unknown;
  note: string | null;
  warnings: unknown;
  errors: unknown;
  pallets?: Array<{
    status: string;
    loadJobId: string | null;
    loadedAt: Date | string | null;
  }>;
}

interface ImportFileDeleteRecord {
  id: string;
  storedPath: string;
  fileSha256: string;
  containers: Array<{ id: string; containerNo: string }>;
}

interface GeneratedFileDeleteRecord {
  id: string;
  importFileId: string | null;
  containerId: string | null;
  fileType: string;
  storagePath: string;
}

interface PalletDeleteRecord {
  id: string;
  status: string;
  loadJobId: string | null;
  loadedAt: Date | string | null;
  events?: Array<{
    eventType: string;
    loadJobId?: string | null;
    scanPayload?: string | null;
  }>;
}

interface StorageCleanupTarget {
  storagePath: string;
  resolvedPath: string;
  source: 'IMPORT_ORIGINAL' | 'GENERATED_FILE';
  generatedFileId?: string;
  fileType?: string;
  exists: boolean;
}

interface StorageCleanupResult {
  deletedPaths: string[];
  missingPaths: string[];
}

interface PersistedParseResult {
  importFile: ImportFileRecord;
  containers: ContainerRecord[];
}

@Injectable()
export class ImportsService {
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    private readonly workerParser: WorkerParserService,
    private readonly palletPolicyResolver: PalletPolicyResolver,
    private readonly parserLearningCases: ParserLearningCasesService,
  ) {
    this.storageRoot = configService.getOrThrow<string>('app.storageRoot');
  }

  async importFile(
    file: Express.Multer.File,
    actor: AuthenticatedUser,
  ): Promise<ImportFileResponseDto> {
    this.validateXlsx(file);

    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.importFile.findUnique({
      where: { fileSha256 },
    });

    if (duplicate) {
      if (duplicate.deletedAt) {
        await this.releaseDeletedImportFileSha256(this.prisma, duplicate);
      } else {
        this.throwDuplicate(duplicate);
      }
    }

    const storedPath = await this.preserveOriginalFile(file, fileSha256);
    const createData = {
      originalFilename: file.originalname,
      storedPath,
      fileSha256,
      mimeType: file.mimetype || null,
      fileSizeBytes: BigInt(file.size),
      format: FileFormat.UNKNOWN,
      importStatus: ImportStatus.UPLOADED,
      parseStatus: ParseStatus.NOT_PARSED,
      warningCount: 0,
      errorCount: 0,
      errorMessage: null,
      importedById: auditUserId(actor),
    };

    try {
      const record = await this.prisma.importFile.create({
        data: createData,
      });

      return this.toResponse(record);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.importFile.findUnique({
          where: { fileSha256 },
        });

        if (existing) {
          if (existing.deletedAt) {
            await this.releaseDeletedImportFileSha256(this.prisma, existing);
            const record = await this.prisma.importFile.create({
              data: createData,
            });

            return this.toResponse(record);
          } else {
            this.throwDuplicate(existing);
          }
        }
      }

      throw new InternalServerErrorException({
        code: 'IMPORT_CREATE_FAILED',
        message:
          'The uploaded file was preserved, but import metadata could not be saved.',
        details: {
          errorMessage: this.errorMessage(error),
          fileSha256,
          storedPath,
        },
      });
    }
  }

  async list(query: ListImportsQueryDto): Promise<ImportFileListResponseDto> {
    const records = await this.prisma.importFile.findMany({
      where: { deletedAt: null },
      include: this.importContainersInclude(),
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    });

    return {
      items: records.map((record) =>
        this.toResponse(record as ImportFileRecord),
      ),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getById(id: string): Promise<ImportFileResponseDto> {
    const record = await this.findImportOrThrow(id, true);

    return this.toResponse(record);
  }

  async delete(
    id: string,
    dto: DeleteImportDto,
    actor: AuthenticatedUser,
  ): Promise<ImportFileResponseDto> {
    const deletedAt = new Date();
    const reason = this.stringOrNull(dto.reason);
    const record = (await this.prisma.$transaction(async (tx) => {
      await this.parserLearningCases.lockImportLearningMutation(tx, id);
      const parserLearningBlocker =
        await this.parserLearningCases.assertImportDeletionAllowed(
          id,
          actor,
          tx,
          false,
        );
      if (parserLearningBlocker) {
        return { blocked: parserLearningBlocker, record: null };
      }
      const existingInTransaction = await this.findImportForDeleteOrThrow(
        tx,
        id,
      );
      const txContainerIds = existingInTransaction.containers.map(
        (container) => container.id,
      );
      const deletePlan = await this.assertImportCanBeDeleted(
        tx,
        id,
        txContainerIds,
      );
      const txGeneratedFiles = await this.findGeneratedFilesForDelete(
        tx,
        id,
        txContainerIds,
      );
      const cleanupTargets = await this.prepareStorageCleanupTargets(
        existingInTransaction,
        txGeneratedFiles,
      );
      const cleanupResult = await this.cleanupStorageFiles(cleanupTargets);
      const generatedFileIds = txGeneratedFiles.map((file) => file.id);
      const releasedFileSha256 = this.deletedImportFileSha256(
        existingInTransaction.id,
        existingInTransaction.fileSha256,
      );

      if (deletePlan.palletIds.length > 0) {
        await tx.palletEvent.deleteMany({
          where: { palletId: { in: deletePlan.palletIds } },
        });
        await tx.pallet.deleteMany({
          where: { id: { in: deletePlan.palletIds } },
        });
      }

      if (generatedFileIds.length > 0) {
        await tx.generatedFile.deleteMany({
          where: { id: { in: generatedFileIds } },
        });
      }

      if (txContainerIds.length > 0) {
        await tx.containerLine.deleteMany({
          where: { containerId: { in: txContainerIds } },
        });
        await tx.containerDestination.deleteMany({
          where: { containerId: { in: txContainerIds } },
        });
        await tx.container.deleteMany({
          where: { id: { in: txContainerIds } },
        });
      }

      const updated = await tx.importFile.update({
        where: { id },
        data: {
          fileSha256: releasedFileSha256,
          deletedAt,
          deletedById: auditUserId(actor),
          deleteReason: reason,
        },
        include: this.importContainersInclude(),
      });

      await tx.correctionFeedback.create({
        data: {
          targetType: CorrectionTargetType.IMPORT_FILE,
          importFileId: id,
          fieldName: 'deletedAt',
          oldValue: this.nullableJsonValue(null),
          newValue: this.nullableJsonValue({
            deletedAt: deletedAt.toISOString(),
            deletedStorageFileCount: cleanupResult.deletedPaths.length,
            deletedStoragePaths: cleanupResult.deletedPaths,
            missingStoragePaths: cleanupResult.missingPaths,
            generatedFileCount: txGeneratedFiles.length,
            generatedFileIds,
            palletCount: deletePlan.palletIds.length,
            originalFileSha256: existingInTransaction.fileSha256,
            releasedFileSha256,
          }),
          reason,
          note:
            cleanupResult.missingPaths.length > 0
              ? 'Import deleted from active history. Storage cleanup completed with missing-file warnings.'
              : 'Import deleted from active history. Original and generated storage files were cleaned up.',
          correctedById: auditUserId(actor),
        },
      });

      return { blocked: null, record: updated };
    })) as
      | {
          blocked: { code: string; message: string; details: object };
          record: null;
        }
      | { blocked: null; record: ImportFileRecord };

    if (record.blocked) {
      throw new ConflictException(record.blocked);
    }

    return this.toResponse(record.record);
  }

  async parse(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ImportParseResultResponseDto> {
    void actor;
    const record = await this.findImportOrThrow(id);
    await this.assertStoredFileExists(record);

    await this.prisma.importFile.update({
      where: { id },
      data: {
        parseStatus: 'PARSING',
        errorMessage: null,
      },
    });

    let payload: WorkerParsePayload;
    try {
      payload = await this.workerParser.parseFile(
        record.storedPath,
        await this.palletPolicyResolver.resolve(),
      );
    } catch (error) {
      await this.markParseInvocationFailed(record, error);
      throw error;
    }

    try {
      await this.persistParsePayload(record, payload);
    } catch (error) {
      if (error instanceof ConflictException) {
        await this.restoreParseStatusAfterConflict(record, error);
        throw error;
      }
      await this.markParsePersistenceFailed(record, payload, error);
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException({
          code: 'CONTAINER_PARSE_CONFLICT',
          message:
            'The parsed container conflicts with an existing container record.',
          details: {
            importId: record.id,
            originalFilename: record.originalFilename,
            errorMessage: this.errorMessage(error),
          },
        });
      }

      throw new InternalServerErrorException({
        code: 'IMPORT_PARSE_PERSISTENCE_FAILED',
        message: 'The worker parsed the file, but the result was not saved.',
        details: {
          importId: record.id,
          originalFilename: record.originalFilename,
          errorMessage: this.errorMessage(error),
        },
      });
    }

    return this.getParseResult(id);
  }

  async getParseResult(id: string): Promise<ImportParseResultResponseDto> {
    const record = await this.findImportOrThrow(id);
    const containers = (await this.prisma.container.findMany({
      where: { importFileId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        lines: { orderBy: { lineNo: 'asc' } },
        destinations: {
          include: {
            pallets: {
              select: {
                status: true,
                loadJobId: true,
                loadedAt: true,
              },
            },
          },
          orderBy: [
            { destinationCode: 'asc' },
            { destinationType: 'asc' },
            { packageType: 'asc' },
          ],
        },
      },
    })) as ContainerRecord[];

    return this.toParseResult({
      importFile: record,
      containers,
    });
  }

  private async findImportOrThrow(
    id: string,
    includeContainers = false,
  ): Promise<ImportFileRecord> {
    const record = await this.prisma.importFile.findUnique({
      where: { id, deletedAt: null },
      include: includeContainers ? this.importContainersInclude() : undefined,
    });

    if (!record) {
      throw new NotFoundException({
        code: 'IMPORT_NOT_FOUND',
        message: `Import file ${id} was not found.`,
        details: { id },
      });
    }

    return record;
  }

  private async findImportForDeleteOrThrow(
    tx: Pick<PrismaService, 'importFile'> | Prisma.TransactionClient,
    id: string,
  ): Promise<ImportFileDeleteRecord> {
    const record = await tx.importFile.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        storedPath: true,
        fileSha256: true,
        containers: {
          select: {
            id: true,
            containerNo: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'IMPORT_NOT_FOUND',
        message: `Import file ${id} was not found.`,
        details: { id },
      });
    }

    return record;
  }

  private async findGeneratedFilesForDelete(
    tx: Pick<PrismaService, 'generatedFile'> | Prisma.TransactionClient,
    importFileId: string,
    containerIds: string[],
  ): Promise<GeneratedFileDeleteRecord[]> {
    return await tx.generatedFile.findMany({
      where: {
        OR: [
          { importFileId },
          ...(containerIds.length > 0
            ? [{ containerId: { in: containerIds } }]
            : []),
        ],
      },
      select: {
        id: true,
        importFileId: true,
        containerId: true,
        fileType: true,
        storagePath: true,
      },
    });
  }

  private async assertImportCanBeDeleted(
    tx:
      | Pick<PrismaService, 'pallet' | 'loadJob' | 'payContainerContainer'>
      | Prisma.TransactionClient,
    importFileId: string,
    containerIds: string[],
  ): Promise<{ palletIds: string[] }> {
    const pallets =
      containerIds.length === 0
        ? []
        : ((await tx.pallet.findMany({
            where: {
              containerDestination: {
                containerId: { in: containerIds },
              },
            },
            select: {
              id: true,
              status: true,
              loadJobId: true,
              loadedAt: true,
              events: {
                select: {
                  eventType: true,
                  loadJobId: true,
                  scanPayload: true,
                },
              },
            },
          })) as PalletDeleteRecord[]);
    const operationalPalletCount = pallets.filter((pallet) =>
      this.isOperationalPallet(pallet),
    ).length;
    const loadJobCount =
      containerIds.length === 0
        ? 0
        : await tx.loadJob.count({
            where: {
              OR: [
                { containerId: { in: containerIds } },
                { lines: { some: { containerId: { in: containerIds } } } },
              ],
            },
          });
    const payContainerCount =
      containerIds.length === 0
        ? 0
        : await tx.payContainerContainer.count({
            where: { containerId: { in: containerIds } },
          });

    if (
      loadJobCount === 0 &&
      operationalPalletCount === 0 &&
      payContainerCount === 0
    ) {
      return { palletIds: pallets.map((pallet) => pallet.id) };
    }

    throw new ConflictException({
      code: 'IMPORT_DELETE_BLOCKED_IN_USE',
      message:
        'This import already has business records and cannot be deleted from import history.',
      details: {
        importFileId,
        palletCount: pallets.length,
        operationalPalletCount,
        loadJobCount,
        payContainerCount,
      },
    });
  }

  private isOperationalPallet(pallet: PalletDeleteRecord): boolean {
    const deletablePalletStatuses: string[] = [
      PalletStatus.PLANNED,
      PalletStatus.LABEL_PRINTED,
    ];
    if (
      pallet.loadJobId !== null ||
      pallet.loadedAt !== null ||
      !deletablePalletStatuses.includes(pallet.status)
    ) {
      return true;
    }

    const deletableEventTypes: string[] = [
      PalletEventType.CREATED,
      PalletEventType.LABEL_PRINTED,
    ];
    return (pallet.events ?? []).some((event) => {
      return (
        (event.loadJobId ?? null) !== null ||
        !deletableEventTypes.includes(event.eventType)
      );
    });
  }

  private async prepareStorageCleanupTargets(
    importFile: ImportFileDeleteRecord,
    generatedFiles: GeneratedFileDeleteRecord[],
  ): Promise<StorageCleanupTarget[]> {
    const candidates: Array<{
      storagePath: string;
      source: StorageCleanupTarget['source'];
      generatedFileId?: string;
      fileType?: string;
    }> = [
      {
        storagePath: importFile.storedPath,
        source: 'IMPORT_ORIGINAL',
      },
      ...generatedFiles.map((file) => ({
        storagePath: file.storagePath,
        source: 'GENERATED_FILE' as const,
        generatedFileId: file.id,
        fileType: file.fileType,
      })),
    ];
    const targets: StorageCleanupTarget[] = [];
    const seenResolvedPaths = new Set<string>();

    for (const candidate of candidates) {
      const resolvedPath = await this.resolveStoragePathForDelete(
        candidate.storagePath,
      );
      if (seenResolvedPaths.has(resolvedPath)) {
        continue;
      }
      seenResolvedPaths.add(resolvedPath);

      const existing = await this.storageFileStatus(
        candidate.storagePath,
        resolvedPath,
      );
      targets.push({
        ...candidate,
        resolvedPath,
        exists: existing,
      });
    }

    return targets;
  }

  private async resolveStoragePathForDelete(
    storagePath: string,
  ): Promise<string> {
    if (!storagePath || storagePath.includes('\0')) {
      throw new BadRequestException({
        code: 'IMPORT_DELETE_INVALID_STORAGE_PATH',
        message: 'Import deletion found an invalid storage path.',
        details: { storagePath },
      });
    }

    const storageRoot = resolve(this.storageRoot);
    const realStorageRoot = await this.realStorageRoot();
    const resolvedPath = isAbsolute(storagePath)
      ? resolve(storagePath)
      : resolve(storageRoot, storagePath);

    if (
      resolvedPath === storageRoot ||
      resolvedPath === realStorageRoot ||
      (!this.isPathWithinStorageRoot(resolvedPath, storageRoot) &&
        !this.isPathWithinStorageRoot(resolvedPath, realStorageRoot))
    ) {
      throw new BadRequestException({
        code: 'IMPORT_DELETE_STORAGE_PATH_OUTSIDE_ROOT',
        message:
          'Import deletion refused to remove a file outside the configured storage root.',
        details: {
          storageRoot,
          realStorageRoot,
          storagePath,
          resolvedPath,
        },
      });
    }

    return resolvedPath;
  }

  private async storageFileStatus(
    storagePath: string,
    resolvedPath: string,
  ): Promise<boolean> {
    let fileStat: Stats;
    try {
      fileStat = await lstat(resolvedPath);
    } catch (error) {
      if (this.isFileNotFound(error)) {
        return false;
      }

      throw new InternalServerErrorException({
        code: 'IMPORT_DELETE_STORAGE_STAT_FAILED',
        message: 'Import deletion could not inspect a storage file.',
        details: {
          storagePath,
          resolvedPath,
          errorMessage: this.errorMessage(error),
        },
      });
    }

    if (!fileStat.isFile()) {
      throw new BadRequestException({
        code: 'IMPORT_DELETE_STORAGE_PATH_NOT_FILE',
        message: 'Import deletion only removes individual storage files.',
        details: { storagePath, resolvedPath },
      });
    }

    const realStorageRoot = await this.realStorageRoot();
    let realStoragePath: string;
    try {
      realStoragePath = await realpath(resolvedPath);
    } catch (error) {
      if (this.isFileNotFound(error)) {
        return false;
      }

      throw new InternalServerErrorException({
        code: 'IMPORT_DELETE_STORAGE_REALPATH_FAILED',
        message: 'Import deletion could not resolve a storage file path.',
        details: {
          storagePath,
          resolvedPath,
          errorMessage: this.errorMessage(error),
        },
      });
    }
    if (
      realStoragePath === realStorageRoot ||
      !this.isPathWithinStorageRoot(realStoragePath, realStorageRoot)
    ) {
      throw new BadRequestException({
        code: 'IMPORT_DELETE_STORAGE_PATH_OUTSIDE_ROOT',
        message:
          'Import deletion refused to remove a file outside the configured storage root.',
        details: {
          storageRoot: realStorageRoot,
          storagePath,
          resolvedPath,
          realStoragePath,
        },
      });
    }

    return true;
  }

  private async cleanupStorageFiles(
    targets: StorageCleanupTarget[],
  ): Promise<StorageCleanupResult> {
    const result: StorageCleanupResult = {
      deletedPaths: [],
      missingPaths: [],
    };

    for (const target of targets) {
      if (!target.exists) {
        result.missingPaths.push(target.storagePath);
        continue;
      }

      try {
        await unlink(target.resolvedPath);
        result.deletedPaths.push(target.storagePath);
      } catch (error) {
        if (this.isFileNotFound(error)) {
          result.missingPaths.push(target.storagePath);
          continue;
        }

        throw new InternalServerErrorException({
          code: 'IMPORT_DELETE_STORAGE_CLEANUP_FAILED',
          message: 'Import deletion could not remove a storage file.',
          details: {
            storagePath: target.storagePath,
            resolvedPath: target.resolvedPath,
            errorMessage: this.errorMessage(error),
          },
        });
      }
    }

    return result;
  }

  private async realStorageRoot(): Promise<string> {
    try {
      return await realpath(this.storageRoot);
    } catch (error) {
      if (this.isFileNotFound(error)) {
        return resolve(this.storageRoot);
      }

      throw new InternalServerErrorException({
        code: 'IMPORT_DELETE_STORAGE_ROOT_INVALID',
        message: 'Import deletion could not inspect the storage root.',
        details: {
          storageRoot: this.storageRoot,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  private isPathWithinStorageRoot(
    resolvedPath: string,
    storageRoot = resolve(this.storageRoot),
  ): boolean {
    const pathFromRoot = relative(storageRoot, resolvedPath);
    return (
      pathFromRoot.length > 0 &&
      !pathFromRoot.startsWith('..') &&
      !isAbsolute(pathFromRoot)
    );
  }

  private async assertStoredFileExists(
    record: ImportFileRecord,
  ): Promise<void> {
    try {
      const storedFile = await stat(record.storedPath);
      if (!storedFile.isFile()) {
        throw new Error('Stored path is not a file.');
      }
    } catch (error) {
      await this.prisma.importFile.update({
        where: { id: record.id },
        data: {
          parseStatus: 'ERROR',
          warningCount: 0,
          errorCount: 1,
          errorMessage: `Original stored file is unavailable: ${this.errorMessage(error)}`,
          rawMetadata: this.nullableJsonValue({
            storedPath: record.storedPath,
            warnings: [],
            errors: [
              {
                code: 'IMPORT_ORIGINAL_FILE_MISSING',
                message: this.errorMessage(error),
              },
            ],
            error: this.errorMessage(error),
          }),
        },
      });

      throw new InternalServerErrorException({
        code: 'IMPORT_ORIGINAL_FILE_MISSING',
        message: 'The preserved original Excel file could not be read.',
        details: {
          importId: record.id,
          storedPath: record.storedPath,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  private importContainersInclude() {
    return {
      containers: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          containerNo: true,
          status: true,
          destinations: {
            select: {
              pallets: {
                select: {
                  status: true,
                  loadJobId: true,
                  loadedAt: true,
                },
              },
            },
          },
        },
      },
    } as const;
  }

  private async persistParsePayload(
    record: ImportFileRecord,
    payload: WorkerParsePayload,
  ): Promise<void> {
    const parsedResult = payload.parsed_result ?? null;
    const parserVersion = this.stringOrNull(parsedResult?.parserVersion);
    const format = this.formatFromPayload(payload);
    const warnings = this.issueArray(payload.warnings);
    let errors = this.issueArray(payload.errors);

    if (parsedResult && !parserVersion) {
      errors = [
        ...errors,
        {
          code: 'MISSING_PARSER_VERSION',
          message: 'Worker parsed the file without parserVersion.',
          field: 'parserVersion',
        },
      ];
    }

    if (!parsedResult) {
      errors = this.ensureParseError(errors, payload);
    }

    const containerNo = this.stringOrNull(parsedResult?.containerNo);
    if (parsedResult && !containerNo) {
      errors = this.ensureParseError(errors, payload, {
        code: 'MISSING_CONTAINER_NO',
        message: 'Worker parsed the file without a container number.',
        field: 'containerNo',
      });
    }

    if (parsedResult) {
      errors = [
        ...errors,
        ...this.palletPlanContractErrors(
          parsedResult.destinationSummaries ?? [],
          payload.pallet_result?.plans ?? [],
        ),
      ];
    }

    const parseStatus = this.parseStatus(payload, warnings, errors);
    const shouldCreateContainer =
      parseStatus !== 'ERROR' &&
      parsedResult !== null &&
      containerNo !== null &&
      parserVersion !== null;

    await this.prisma.$transaction(async (tx) => {
      await this.deleteExistingParsedContainers(tx, record.id);

      const updatedImport = await tx.importFile.update({
        where: { id: record.id },
        data: {
          format,
          parseStatus,
          parserVersion,
          warningCount: warnings.length,
          errorCount: errors.length,
          errorMessage:
            parseStatus === 'ERROR'
              ? this.firstIssueMessage(errors, payload)
              : null,
          rawMetadata: this.nullableJsonValue({
            storedPath: record.storedPath,
            workerSourceFile: payload.source_file,
            workerSha256: payload.sha256,
            detection: payload.detection,
            rawMetadata: parsedResult?.rawMetadata ?? null,
            warnings,
            errors,
            exception: payload.exception ?? null,
          }),
        },
      });

      if (!shouldCreateContainer) {
        return {
          importFile: updatedImport,
          containers: [],
        } satisfies PersistedParseResult;
      }

      const container = await tx.container.create({
        data: {
          importFileId: record.id,
          containerNo,
          sourceFormat: format,
          parserVersion,
          status: ContainerStatus.PARSED,
          rawJson: this.jsonValue(parsedResult),
          warnings: this.nullableJsonValue(warnings),
          errors: this.nullableJsonValue(errors),
        },
      });

      const lineRows = this.containerLineRows(
        container.id,
        parsedResult.lines ?? [],
      );
      if (lineRows.length > 0) {
        await tx.containerLine.createMany({ data: lineRows });
      }

      const destinationRows = this.containerDestinationRows(
        container.id,
        parsedResult.destinationSummaries ?? [],
        payload.pallet_result?.plans ?? [],
      );
      if (destinationRows.length > 0) {
        await tx.containerDestination.createMany({ data: destinationRows });
      }

      return {
        importFile: updatedImport,
        containers: [container],
      } satisfies PersistedParseResult;
    });
  }

  private async deleteExistingParsedContainers(
    tx: Prisma.TransactionClient,
    importFileId: string,
  ): Promise<void> {
    const existingContainers = (await tx.container.findMany({
      where: { importFileId },
      select: {
        id: true,
        containerNo: true,
        destinations: {
          select: {
            _count: {
              select: {
                pallets: true,
              },
            },
          },
        },
      },
    })) as Array<{
      id: string;
      containerNo: string;
      destinations: Array<{ _count: { pallets: number } }>;
    }>;
    const containerIds = existingContainers.map((container) => container.id);

    if (containerIds.length === 0) {
      return;
    }

    const blocked = existingContainers.filter((container) =>
      container.destinations.some(
        (destination) => destination._count.pallets > 0,
      ),
    );
    if (blocked.length > 0) {
      throw new ConflictException({
        code: 'IMPORT_REPARSE_CONTAINER_IN_USE',
        message:
          'This import already has generated pallet records, so parsing cannot replace its container structure. Use container corrections or create a new import.',
        details: {
          importFileId,
          containers: blocked.map((container) => ({
            id: container.id,
            containerNo: container.containerNo,
          })),
        },
      });
    }

    await tx.containerLine.deleteMany({
      where: { containerId: { in: containerIds } },
    });
    await tx.containerDestination.deleteMany({
      where: { containerId: { in: containerIds } },
    });
    await tx.container.deleteMany({
      where: { id: { in: containerIds } },
    });
  }

  private containerLineRows(
    containerId: string,
    lines: WorkerParsedLine[],
  ): Prisma.ContainerLineCreateManyInput[] {
    return lines.map((line, index) => ({
      containerId,
      lineNo: this.intValue(line.rowNumber, index + 1),
      destinationCode: this.stringOrNull(line.destinationCode),
      destinationType: this.stringOrNull(line.deliveryMethod),
      cartons: this.nullableIntValue(line.cartons ?? line.totalCartons),
      volume: this.nullableDecimalString(line.volumeCbm),
      rawJson: this.jsonValue(line.raw_json ?? line),
      warnings: this.nullableJsonValue([]),
      errors: this.nullableJsonValue([]),
    }));
  }

  private containerDestinationRows(
    containerId: string,
    summaries: WorkerDestinationSummary[],
    plans: WorkerPalletPlan[],
  ): Prisma.ContainerDestinationCreateManyInput[] {
    const plansByDestination = new Map(
      plans.map((plan) => [this.destinationPlanKey(plan), plan]),
    );

    return summaries.map((summary) => {
      const plan = plansByDestination.get(this.destinationSummaryKey(summary));
      const destinationCode =
        this.stringOrNull(summary.destinationCode) ??
        this.stringOrNull(summary.status) ??
        'NEED_MANUAL_DESTINATION';
      const cartons = this.intValue(
        plan?.totalCartons ?? summary.totalCartons,
        0,
      );
      const volume = this.decimalString(
        plan?.totalVolumeCbm ?? summary.totalVolumeCbm,
        '0.000',
      );
      const calculatedPallets = this.intValue(plan?.calculatedPallets, 0);
      const finalPallets = this.intValue(plan?.finalPallets, calculatedPallets);

      return {
        containerId,
        destinationCode,
        destinationType: this.stringOrNull(plan?.destinationType),
        packageType: this.packageTypeValue(
          plan?.packageType ?? summary.packageType,
        ),
        cartons,
        volume,
        calculatedPallets,
        manualPallets: this.nullableIntValue(plan?.manualPallets),
        finalPallets,
        palletRuleCode: this.stringOrNull(plan?.ruleCode),
        calculationBasisCbm: this.nullableDecimalString(
          plan?.calculationBasisCbm ?? plan?.volumeDivisorCbm,
        ),
        roundingMode: this.stringOrNull(plan?.roundingMode),
        palletPolicySnapshot: this.nullableJsonValue(
          plan?.policySnapshot ?? null,
        ),
        note: null,
        warnings: this.nullableJsonValue(plan?.warnings ?? []),
        errors: this.nullableJsonValue([]),
      };
    });
  }

  private async markParseInvocationFailed(
    record: ImportFileRecord,
    error: unknown,
  ): Promise<void> {
    await this.prisma.importFile.update({
      where: { id: record.id },
      data: {
        parseStatus: 'ERROR',
        warningCount: 0,
        errorCount: 1,
        errorMessage: this.errorMessage(error),
        rawMetadata: this.nullableJsonValue({
          storedPath: record.storedPath,
          warnings: [],
          errors: [
            {
              code: 'WORKER_PARSE_INVOCATION_FAILED',
              message: this.errorMessage(error),
            },
          ],
          workerInvocationError: this.errorMessage(error),
        }),
      },
    });
  }

  private async markParsePersistenceFailed(
    record: ImportFileRecord,
    payload: WorkerParsePayload,
    error: unknown,
  ): Promise<void> {
    await this.prisma.importFile.update({
      where: { id: record.id },
      data: {
        format: this.formatFromPayload(payload),
        parseStatus: 'ERROR',
        parserVersion: this.stringOrNull(payload.parsed_result?.parserVersion),
        warningCount: this.issueArray(payload.warnings).length,
        errorCount: Math.max(this.issueArray(payload.errors).length, 1),
        errorMessage: this.errorMessage(error),
        rawMetadata: this.nullableJsonValue({
          storedPath: record.storedPath,
          workerSourceFile: payload.source_file,
          detection: payload.detection,
          warnings: this.issueArray(payload.warnings),
          errors: this.ensureParseError(
            this.issueArray(payload.errors),
            payload,
          ),
          persistenceError: this.errorMessage(error),
        }),
      },
    });
  }

  private async restoreParseStatusAfterConflict(
    record: ImportFileRecord,
    error: ConflictException,
  ): Promise<void> {
    await this.prisma.importFile.update({
      where: { id: record.id },
      data: {
        parseStatus: this.parseStatusValue(record.parseStatus),
        errorMessage: this.errorMessage(error),
      },
    });
  }

  private parseStatusValue(value: string): ParseStatus {
    if (
      value === ParseStatus.NOT_PARSED ||
      value === ParseStatus.PARSING ||
      value === ParseStatus.PARSED ||
      value === ParseStatus.WARNING ||
      value === ParseStatus.ERROR
    ) {
      return value;
    }

    return ParseStatus.ERROR;
  }

  private validateXlsx(file: Express.Multer.File): void {
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException({
        code: 'INVALID_IMPORT_FILE_TYPE',
        message: 'Only .xlsx import files are accepted.',
        details: {
          originalFilename: file.originalname,
          mimeType: file.mimetype,
        },
      });
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_IMPORT_FILE',
        message: 'The uploaded .xlsx file is empty.',
        details: {
          originalFilename: file.originalname,
        },
      });
    }
  }

  private async preserveOriginalFile(
    file: Express.Multer.File,
    fileSha256: string,
  ): Promise<string> {
    const directory = join(this.storageRoot, 'original_files', fileSha256);
    const storedPath = join(directory, this.safeFilename(file.originalname));

    try {
      await mkdir(directory, { recursive: true });
      await writeFile(storedPath, file.buffer, { flag: 'wx' });
    } catch (error) {
      if (this.isFileAlreadyExists(error)) {
        await stat(storedPath);
        return storedPath;
      }

      throw new InternalServerErrorException({
        code: 'IMPORT_FILE_STORAGE_FAILED',
        message: 'The uploaded original file could not be preserved.',
        details: {
          errorMessage: this.errorMessage(error),
          fileSha256,
        },
      });
    }

    return storedPath;
  }

  private throwDuplicate(record: ImportFileRecord): never {
    throw new ConflictException({
      code: 'DUPLICATE_IMPORT',
      message: 'A file with this SHA-256 already exists.',
      details: {
        existingImport: this.toResponse(record),
      },
    });
  }

  private async releaseDeletedImportFileSha256(
    tx: Pick<PrismaService, 'importFile'> | Prisma.TransactionClient,
    record: ImportFileRecord,
  ): Promise<void> {
    if (!record.deletedAt) {
      return;
    }

    const releasedFileSha256 = this.deletedImportFileSha256(
      record.id,
      record.fileSha256,
    );
    if (releasedFileSha256 === record.fileSha256) {
      return;
    }

    await tx.importFile.update({
      where: { id: record.id },
      data: { fileSha256: releasedFileSha256 },
    });
  }

  private deletedImportFileSha256(
    importFileId: string,
    fileSha256: string,
  ): string {
    const prefix = `deleted:${importFileId}:`;
    return fileSha256.startsWith(prefix)
      ? fileSha256
      : `${prefix}${fileSha256}`;
  }

  private toResponse(record: ImportFileRecord): ImportFileResponseDto {
    return {
      id: record.id,
      originalFilename: record.originalFilename,
      storedPath: record.storedPath,
      fileSha256: record.fileSha256,
      mimeType: record.mimeType,
      fileSizeBytes:
        record.fileSizeBytes === null ? null : record.fileSizeBytes.toString(),
      format: record.format,
      importStatus: record.importStatus,
      parseStatus: record.parseStatus,
      parserVersion: record.parserVersion ?? null,
      warningCount: record.warningCount,
      errorCount: record.errorCount,
      errorMessage: record.errorMessage,
      deletedAt: this.toIsoStringOrNull(record.deletedAt ?? null),
      deletedById: record.deletedById ?? null,
      deleteReason: record.deleteReason ?? null,
      containers: this.importContainerSummaries(record.containers ?? []),
      createdAt: this.toIsoString(record.createdAt),
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private importContainerSummaries(
    containers: ImportFileContainerSummaryRecord[],
  ): ImportFileContainerSummaryDto[] {
    return containers.map((container) => ({
      id: container.id,
      containerNo: container.containerNo,
      status: effectiveContainerStatus(
        container.status,
        container.destinations ?? [],
      ),
    }));
  }

  private toParseResult(
    result: PersistedParseResult,
  ): ImportParseResultResponseDto {
    const containers = result.containers.map((container) =>
      this.toContainerResponse(container),
    );
    const importWarnings = this.rawMetadataArray(
      result.importFile.rawMetadata,
      'warnings',
    );
    const importErrors = this.rawMetadataArray(
      result.importFile.rawMetadata,
      'errors',
    );
    const containerWarnings = containers.flatMap((container) =>
      this.unknownArray(container.warnings),
    );
    const containerErrors = containers.flatMap((container) =>
      this.unknownArray(container.errors),
    );

    return {
      importFile: this.toResponse(result.importFile),
      containers,
      warnings: importWarnings.length > 0 ? importWarnings : containerWarnings,
      errors: importErrors.length > 0 ? importErrors : containerErrors,
    };
  }

  private toContainerResponse(record: ContainerRecord): ContainerResponseDto {
    return {
      id: record.id,
      importFileId: record.importFileId,
      containerNo: record.containerNo,
      sourceFormat: record.sourceFormat,
      parserVersion: record.parserVersion,
      status: effectiveContainerStatus(
        record.status,
        record.destinations ?? [],
      ),
      rawJson: record.rawJson,
      warnings: record.warnings,
      errors: record.errors,
      lines: (record.lines ?? []).map((line) => this.toLineResponse(line)),
      destinations: (record.destinations ?? []).map((destination) =>
        this.toDestinationResponse(destination),
      ),
    };
  }

  private toLineResponse(
    record: ContainerLineRecord,
  ): ContainerLineResponseDto {
    return {
      id: record.id,
      lineNo: record.lineNo,
      destinationCode: record.destinationCode,
      destinationType: record.destinationType,
      cartons: record.cartons,
      volume: this.nullableStringValue(record.volume),
      rawJson: record.rawJson,
      warnings: record.warnings,
      errors: record.errors,
    };
  }

  private toDestinationResponse(
    record: ContainerDestinationRecord,
  ): ContainerDestinationResponseDto {
    return {
      id: record.id,
      destinationCode: record.destinationCode,
      destinationType: record.destinationType,
      packageType: this.packageTypeOrNull(record.packageType),
      cartons: record.cartons,
      volume: this.stringValue(record.volume),
      calculatedPallets: record.calculatedPallets,
      manualPallets: record.manualPallets,
      finalPallets: record.finalPallets,
      palletRuleCode: record.palletRuleCode,
      calculationBasisCbm: this.nullableStringValue(record.calculationBasisCbm),
      roundingMode: record.roundingMode,
      palletPolicySnapshot: record.palletPolicySnapshot ?? null,
      note: record.note,
      warnings: record.warnings,
      errors: record.errors,
    };
  }

  private parseStatus(
    payload: WorkerParsePayload,
    warnings: WorkerIssue[],
    errors: WorkerIssue[],
  ): 'PARSED' | 'WARNING' | 'ERROR' {
    if (errors.length > 0 || payload.task_status === 'ERROR') {
      return 'ERROR';
    }
    if (warnings.length > 0 || payload.task_status === 'WARNING') {
      return 'WARNING';
    }
    return 'PARSED';
  }

  private formatFromPayload(payload: WorkerParsePayload): FileFormatValue {
    const parsedFormat = this.stringOrNull(payload.parsed_result?.formatType);
    if (this.isFileFormat(parsedFormat)) {
      return parsedFormat;
    }

    const detectionFormat = this.stringOrNull(payload.detection?.format_type);
    if (this.isFileFormat(detectionFormat)) {
      return detectionFormat;
    }

    return FileFormat.UNKNOWN;
  }

  private isFileFormat(value: string | null): value is FileFormatValue {
    return (
      value === FileFormat.UNLOADING_PLAN_CN ||
      value === FileFormat.BESTAR_RECEIVING ||
      value === FileFormat.UNKNOWN
    );
  }

  private issueArray(value: unknown): WorkerIssue[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((issue) =>
      issue !== null && typeof issue === 'object'
        ? (issue as WorkerIssue)
        : { code: 'WORKER_PARSE_ISSUE', message: String(issue) },
    );
  }

  private ensureParseError(
    errors: WorkerIssue[],
    payload: WorkerParsePayload,
    fallback?: WorkerIssue,
  ): WorkerIssue[] {
    if (errors.length > 0) {
      return errors;
    }

    return [
      fallback ?? {
        code: 'WORKER_PARSE_FAILED',
        message:
          this.stringOrNull(payload.exception?.message) ??
          'Worker parser did not return a successful parsed result.',
      },
    ];
  }

  private firstIssueMessage(
    errors: WorkerIssue[],
    payload: WorkerParsePayload,
  ): string {
    const firstMessage = this.stringOrNull(errors[0]?.message);
    if (firstMessage) {
      return firstMessage;
    }

    return (
      this.stringOrNull(payload.exception?.message) ??
      'Worker parser returned ERROR.'
    );
  }

  private destinationPlanKey(plan: WorkerPalletPlan): string {
    return this.destinationKey(plan.destinationCode, plan.packageType);
  }

  private destinationSummaryKey(summary: WorkerDestinationSummary): string {
    return this.destinationKey(summary.destinationCode, summary.packageType);
  }

  private palletPlanContractErrors(
    summaries: WorkerDestinationSummary[],
    plans: WorkerPalletPlan[],
  ): WorkerIssue[] {
    const plansByDestination = new Map(
      plans.map((plan) => [this.destinationPlanKey(plan), plan]),
    );
    const errors: WorkerIssue[] = [];

    for (const summary of summaries) {
      const plan = plansByDestination.get(this.destinationSummaryKey(summary));
      const summaryCartons = this.intValue(
        summary.totalCartons ?? summary.totalSkidCount,
        0,
      );
      const summaryVolume = this.numberValue(summary.totalVolumeCbm, 0);
      const hasGoods = summaryCartons > 0 || summaryVolume > 0;

      if (hasGoods && !plan) {
        errors.push({
          code: 'MISSING_PALLET_PLAN',
          destinationCode: this.stringOrNull(summary.destinationCode),
          field: 'pallet_result.plans',
          message:
            'Worker returned a destination summary with goods but no matching pallet plan.',
        });
        continue;
      }

      if (!plan) {
        continue;
      }

      const planCartons = this.intValue(plan.totalCartons, summaryCartons);
      const planVolume = this.numberValue(plan.totalVolumeCbm, summaryVolume);
      const calculatedPallets = this.intValue(plan.calculatedPallets, 0);

      if (planCartons > 0 && planVolume > 0 && calculatedPallets <= 0) {
        errors.push({
          code: 'INVALID_ZERO_CALCULATED_PALLETS',
          destinationCode: this.stringOrNull(
            plan.destinationCode ?? summary.destinationCode,
          ),
          field: 'pallet_result.plans.calculatedPallets',
          message:
            'Worker returned zero calculated pallets for a destination with cartons and volume.',
        });
      }
    }

    return errors;
  }

  private destinationKey(
    destinationCode: unknown,
    packageType: unknown,
  ): string {
    return `${this.stringOrNull(destinationCode) ?? ''}\u0000${this.packageTypeValue(
      packageType,
    )}`;
  }

  private packageTypeValue(value: unknown): string {
    const packageType = this.stringOrNull(value);
    if (!packageType) {
      return 'CARTON';
    }

    const normalized = packageType.trim().toUpperCase().replace(/\s+/g, '_');
    if (
      normalized === 'WOODEN_CRATE' ||
      normalized === 'WOODEN' ||
      normalized === 'WOOD' ||
      normalized === 'CRATE'
    ) {
      return 'WOODEN_CRATE';
    }
    if (
      normalized === 'CARTON' ||
      normalized === 'CTN' ||
      normalized === 'CTNS'
    ) {
      return 'CARTON';
    }
    if (normalized === 'UNKNOWN' || normalized === 'UNSPECIFIED') {
      return 'CARTON';
    }

    return packageType;
  }

  private packageTypeOrNull(value: string | null | undefined): string | null {
    if (!value || value === 'UNSPECIFIED') {
      return null;
    }
    return value;
  }

  private stringOrNull(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private intValue(value: unknown, fallback: number): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return fallback;
    }
    return Math.trunc(numberValue);
  }

  private nullableIntValue(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return null;
    }
    return Math.trunc(numberValue);
  }

  private numberValue(value: unknown, fallback: number): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }

  private decimalString(value: unknown, fallback: string): string {
    if (value === null || value === undefined) {
      return fallback;
    }

    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return fallback;
    }
    return numberValue.toFixed(3);
  }

  private nullableDecimalString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return null;
    }
    return numberValue.toFixed(3);
  }

  private stringValue(value: { toString(): string } | number | string): string {
    return value.toString();
  }

  private nullableStringValue(
    value: { toString(): string } | number | string | null | undefined,
  ): string | null {
    return value === null || value === undefined ? null : value.toString();
  }

  private unknownArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private rawMetadataArray(value: unknown, key: string): unknown[] {
    if (value === null || typeof value !== 'object' || !(key in value)) {
      return [];
    }

    return this.unknownArray((value as Record<string, unknown>)[key]);
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    const serialized = JSON.stringify(value === undefined ? {} : value);
    if (serialized === undefined || serialized === 'null') {
      return {};
    }

    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  private nullableJsonValue(value: unknown): NullableJsonInput {
    if (value === undefined || value === null) {
      return Prisma?.JsonNull ?? (null as unknown as NullableJsonInput);
    }

    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized === 'null') {
      return Prisma?.JsonNull ?? (null as unknown as NullableJsonInput);
    }

    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  private safeFilename(originalFilename: string): string {
    const filename = basename(originalFilename).replace(/[\\/:*?"<>|]/g, '_');
    return filename.length > 0 ? filename : 'upload.xlsx';
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private toIsoStringOrNull(value: Date | string | null): string | null {
    return value ? this.toIsoString(value) : null;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isFileAlreadyExists(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EEXIST'
    );
  }

  private isFileNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    );
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }
}
