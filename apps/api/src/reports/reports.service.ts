import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import {
  GeneratedFileDownloadDto,
  GeneratedFileListResponseDto,
  GeneratedFileResponseDto,
  GenerateReportResponseDto,
} from './dto/generated-file-response.dto';
import {
  WorkerReportPayload,
  WorkerReportRequest,
  WorkerReportService,
} from './worker-report.service';
import {
  ContainerStatus,
  GeneratedFileStatus,
  GeneratedFileType,
} from '../generated/prisma/enums';
import { auditUserId } from '../auth/audit-user';
import { AuthenticatedUser } from '../auth/auth-user';
import {
  effectiveContainerStatus,
  isContainerGenerationLocked,
} from '../common/container-lifecycle';
import { PrismaService } from '../prisma/prisma.service';

interface ContainerRecord {
  id: string;
  importFileId: string | null;
  containerNo: string;
  sourceFormat: string;
  parserVersion: string | null;
  company: string | null;
  status: string;
  rawJson?: unknown;
  destinations?: ContainerDestinationRecord[];
}

interface ContainerDestinationRecord {
  id: string;
  destinationCode: string;
  destinationType: string | null;
  cartons: number;
  volume: { toString(): string } | number | string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  pallets?: Array<{
    status: string;
    loadJobId: string | null;
    loadedAt: Date | string | null;
  }>;
}

interface GeneratedFileRecord {
  id: string;
  importFileId: string | null;
  containerId: string | null;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType: string | null;
  fileSizeBytes: bigint | number | string | null;
  status: string;
  errorMessage: string | null;
  generatedById?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface GeneratedFileUpsertInput {
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType: string;
  fileSizeBytes: bigint | null;
  status: string;
  errorMessage: string | null;
  generatedById: string;
}

interface GeneratedFileUpsertData extends GeneratedFileUpsertInput {
  importFileId: string | null;
  containerId: string;
}

interface GeneratedFileWriteClient {
  generatedFile: {
    findFirst(args: {
      where: { containerId: string; fileType: string };
      orderBy: { updatedAt: 'desc' };
    }): Promise<GeneratedFileRecord | null>;
    update(args: {
      where: { id: string };
      data: GeneratedFileUpsertData;
    }): Promise<GeneratedFileRecord>;
    create(args: {
      data: GeneratedFileUpsertData;
    }): Promise<GeneratedFileRecord>;
  };
}

const EXCEL_REPORT_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class ReportsService {
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workerReport: WorkerReportService,
    configService: ConfigService,
  ) {
    this.storageRoot = configService.getOrThrow<string>('app.storageRoot');
  }

  async generateReport(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<GenerateReportResponseDto> {
    const container = await this.findContainerOrThrow(id);
    const outputDir = join(this.storageRoot, 'reports');
    const request = this.toWorkerReportRequest(container);
    const generatedById = auditUserId(actor);

    let payload: WorkerReportPayload;
    try {
      payload = await this.workerReport.writeReport(request, outputDir);
    } catch (error) {
      const failed = await this.recordFailedGeneratedFile(
        container,
        this.failureStoragePath(container),
        error,
        generatedById,
      );
      throw this.reportFailure(error, failed);
    }

    const outputPath = this.outputPathFromPayload(payload);
    const errors = this.issueArray(payload.errors);
    if (payload.task_status === 'ERROR' || errors.length > 0 || !outputPath) {
      const failed = await this.recordFailedGeneratedFile(
        container,
        outputPath ?? this.failureStoragePath(container),
        payload,
        generatedById,
      );
      throw this.reportFailure(payload, failed);
    }

    const generatedFile = await this.recordGeneratedReport(
      container,
      outputPath,
      generatedById,
    );

    return {
      generatedFile: this.toGeneratedFileResponse(generatedFile),
      warnings: this.issueArray(payload.warnings),
      errors: [],
    };
  }

  async listFiles(id: string): Promise<GeneratedFileListResponseDto> {
    await this.findContainerOrThrow(id);
    const records = (await this.prisma.generatedFile.findMany({
      where: { containerId: id },
      orderBy: { updatedAt: 'desc' },
    })) as GeneratedFileRecord[];

    return {
      items: records.map((record) => this.toGeneratedFileResponse(record)),
    };
  }

  async downloadFile(
    containerId: string,
    fileId: string,
  ): Promise<GeneratedFileDownloadDto> {
    await this.findContainerOrThrow(containerId);
    const record = (await this.prisma.generatedFile.findFirst({
      where: { id: fileId, containerId },
    })) as GeneratedFileRecord | null;

    if (!record) {
      throw new NotFoundException({
        code: 'GENERATED_FILE_NOT_FOUND',
        message: `Generated file ${fileId} was not found for container ${containerId}.`,
        details: { containerId, fileId },
      });
    }

    if (record.status !== GeneratedFileStatus.GENERATED) {
      throw new BadRequestException({
        code: 'GENERATED_FILE_NOT_DOWNLOADABLE',
        message: `Generated file ${fileId} is not downloadable because its status is ${record.status}.`,
        details: {
          containerId,
          fileId,
          status: record.status,
          errorMessage: record.errorMessage,
        },
      });
    }

    const storagePath = this.resolveDownloadStoragePath(record);

    try {
      const fileStat = await stat(storagePath);
      if (!fileStat.isFile()) {
        throw new Error('Generated path is not a file.');
      }

      return {
        buffer: await readFile(storagePath),
        filename: basename(storagePath),
        fileSizeBytes: fileStat.size,
        mimeType: record.mimeType ?? 'application/octet-stream',
      };
    } catch (error) {
      throw new InternalServerErrorException({
        code: 'GENERATED_FILE_STORAGE_MISSING',
        message:
          'The generated file record exists, but the file cannot be read.',
        details: {
          containerId,
          fileId,
          storagePath: record.storagePath,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  private async findContainerOrThrow(id: string): Promise<ContainerRecord> {
    const container = (await this.prisma.container.findUnique({
      where: { id },
      include: {
        destinations: {
          orderBy: [{ destinationCode: 'asc' }, { destinationType: 'asc' }],
          include: {
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
    })) as ContainerRecord | null;

    if (!container) {
      throw new NotFoundException({
        code: 'CONTAINER_NOT_FOUND',
        message: `Container ${id} was not found.`,
        details: { id },
      });
    }

    return container;
  }

  private toWorkerReportRequest(
    container: ContainerRecord,
  ): WorkerReportRequest {
    const destinations = container.destinations ?? [];
    const plans = destinations.map((destination) => ({
      destinationCode: destination.destinationCode,
      destinationType: destination.destinationType ?? 'UNKNOWN',
      totalCartons: destination.cartons,
      totalVolumeCbm: this.numberValue(destination.volume),
      lineCount: 0,
      calculatedPallets: destination.calculatedPallets,
      manualPallets: destination.manualPallets,
      finalPallets: destination.finalPallets,
      palletIds: [],
      warnings: [],
    }));

    return {
      company: container.company ?? 'Bestar',
      parsed_result: {
        containerNo: container.containerNo,
        formatType: container.sourceFormat,
        parserVersion: container.parserVersion,
        destinationSummaries: destinations.map((destination) => ({
          destinationCode: destination.destinationCode,
          totalCartons: destination.cartons,
          totalVolumeCbm: this.numberValue(destination.volume),
          lineCount: 0,
        })),
        lines: [],
        warnings: [],
        errors: [],
        rawMetadata: {
          source: 'api-database',
          containerId: container.id,
        },
      },
      pallet_result: {
        plans,
        warnings: [],
        errors: [],
        totalCalculatedPallets: plans.reduce(
          (total, plan) => total + plan.calculatedPallets,
          0,
        ),
        totalFinalPallets: plans.reduce(
          (total, plan) => total + plan.finalPallets,
          0,
        ),
      },
    };
  }

  private async recordGeneratedReport(
    container: ContainerRecord,
    outputPath: string,
    generatedById: string,
  ): Promise<GeneratedFileRecord> {
    const fileBuffer = await readFile(outputPath);
    const fileStat = await stat(outputPath);
    const fileSha256 = createHash('sha256').update(fileBuffer).digest('hex');

    return await this.prisma.$transaction(async (tx) => {
      const generatedFile = await this.upsertGeneratedFile(
        tx as unknown as GeneratedFileWriteClient,
        container,
        {
          fileType: GeneratedFileType.EXCEL_REPORT,
          storagePath: outputPath,
          fileSha256,
          mimeType: EXCEL_REPORT_MIME_TYPE,
          fileSizeBytes: BigInt(fileStat.size),
          status: GeneratedFileStatus.GENERATED,
          errorMessage: null,
          generatedById,
        },
      );
      if (this.shouldMarkReportGenerated(container)) {
        await tx.container.update({
          where: { id: container.id },
          data: { status: ContainerStatus.REPORT_GENERATED },
        });
      }

      return generatedFile;
    });
  }

  private shouldMarkReportGenerated(container: ContainerRecord): boolean {
    const effectiveStatus = effectiveContainerStatus(
      container.status,
      container.destinations ?? [],
    );

    return !isContainerGenerationLocked(effectiveStatus);
  }

  private async recordFailedGeneratedFile(
    container: ContainerRecord,
    storagePath: string,
    error: unknown,
    generatedById: string,
  ): Promise<GeneratedFileRecord> {
    return await this.upsertGeneratedFile(
      this.prisma as unknown as GeneratedFileWriteClient,
      container,
      {
        fileType: GeneratedFileType.EXCEL_REPORT,
        storagePath,
        fileSha256: null,
        mimeType: EXCEL_REPORT_MIME_TYPE,
        fileSizeBytes: null,
        status: GeneratedFileStatus.FAILED,
        errorMessage: this.errorMessage(error),
        generatedById,
      },
    );
  }

  private async upsertGeneratedFile(
    tx: GeneratedFileWriteClient,
    container: ContainerRecord,
    data: GeneratedFileUpsertInput,
  ): Promise<GeneratedFileRecord> {
    const existing = await tx.generatedFile.findFirst({
      where: { containerId: container.id, fileType: data.fileType },
      orderBy: { updatedAt: 'desc' },
    });
    const recordData: GeneratedFileUpsertData = {
      importFileId: container.importFileId,
      containerId: container.id,
      ...data,
    };

    if (existing) {
      return await tx.generatedFile.update({
        where: { id: existing.id },
        data: recordData,
      });
    }

    return await tx.generatedFile.create({
      data: recordData,
    });
  }

  private reportFailure(
    error: unknown,
    generatedFile: GeneratedFileRecord,
  ): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'REPORT_GENERATION_FAILED',
      message: 'The unloading report could not be generated.',
      details: {
        generatedFile: this.toGeneratedFileResponse(generatedFile),
        errorMessage: this.errorMessage(error),
      },
    });
  }

  private outputPathFromPayload(payload: WorkerReportPayload): string | null {
    const outputPath = payload.report_result?.outputPath;
    return typeof outputPath === 'string' && outputPath.trim()
      ? outputPath
      : null;
  }

  private failureStoragePath(container: ContainerRecord): string {
    return join(
      this.storageRoot,
      'reports',
      `${this.safeFilename(container.containerNo)}卸柜报告-En.xlsx`,
    );
  }

  private resolveDownloadStoragePath(record: GeneratedFileRecord): string {
    const resolvedPath = resolve(record.storagePath);
    if (this.isPathWithinStorageRoot(resolvedPath)) {
      return resolvedPath;
    }

    const remappedPath = this.remapLegacyStoragePath(record.storagePath);
    if (remappedPath && this.isPathWithinStorageRoot(remappedPath)) {
      return remappedPath;
    }

    throw this.storagePathInvalidError(record.storagePath, record);
  }

  private isPathWithinStorageRoot(resolvedPath: string): boolean {
    const root = resolve(this.storageRoot);
    return resolvedPath === root || resolvedPath.startsWith(`${root}${sep}`);
  }

  private remapLegacyStoragePath(storagePath: string): string | null {
    const normalizedPath = storagePath.replace(/\\/g, '/');
    const storageMarker = '/storage/';
    const markerIndex = normalizedPath.lastIndexOf(storageMarker);

    if (markerIndex < 0) {
      return null;
    }

    const relativePath = normalizedPath.slice(
      markerIndex + storageMarker.length,
    );
    if (!relativePath || relativePath.includes('\0')) {
      return null;
    }

    return resolve(
      this.storageRoot,
      ...relativePath.split('/').filter(Boolean),
    );
  }

  private storagePathInvalidError(
    storagePath: string,
    record: GeneratedFileRecord,
  ): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'GENERATED_FILE_STORAGE_PATH_INVALID',
      message:
        'The generated file path is outside the configured storage root.',
      details: {
        generatedFileId: record.id,
        storagePath,
      },
    });
  }

  private toGeneratedFileResponse(
    record: GeneratedFileRecord,
  ): GeneratedFileResponseDto {
    return {
      id: record.id,
      importFileId: record.importFileId,
      containerId: record.containerId,
      fileType: record.fileType,
      storagePath: record.storagePath,
      fileSha256: record.fileSha256,
      mimeType: record.mimeType,
      fileSizeBytes:
        record.fileSizeBytes === null ? null : record.fileSizeBytes.toString(),
      status: record.status,
      errorMessage: record.errorMessage,
      createdAt: this.toIsoString(record.createdAt),
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private issueArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private numberValue(value: { toString(): string } | number | string): number {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private safeFilename(value: string): string {
    return (
      value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') ||
      'UNKNOWN-CONTAINER'
    );
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (
      error !== null &&
      typeof error === 'object' &&
      'errors' in error &&
      Array.isArray(error.errors) &&
      error.errors.length > 0
    ) {
      const first = error.errors[0] as { message?: unknown };
      if (typeof first.message === 'string') {
        return first.message;
      }
    }
    return 'Unknown report generation error';
  }
}
