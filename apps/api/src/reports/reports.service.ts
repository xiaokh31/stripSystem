import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';
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
import {
  CurrentArtifactRecord,
  CurrentArtifactService,
} from '../generated-files/current-artifact.service';

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
  packageType?: string | null;
  cartons: number;
  volume: { toString(): string } | number | string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  palletRuleCode?: string | null;
  calculationBasisCbm?: { toString(): string } | number | string | null;
  roundingMode?: string | null;
  pallets?: Array<{
    status: string;
    loadJobId: string | null;
    loadedAt: Date | string | null;
  }>;
}

type GeneratedFileRecord = CurrentArtifactRecord;

interface ReportEvidence {
  expectedDestinationCount: number;
  writtenDestinationCount: number;
  orderedDestinationDigest: string;
  layoutModes: Array<'PRIMARY_ONLY' | 'EXPANDED'>;
  pageEvidence: ReportPageEvidence[];
}

interface ReportPageEvidence {
  page: number;
  layoutMode: 'PRIMARY_ONLY' | 'EXPANDED';
  expectedDestinationCount: number;
  writtenDestinationCount: number;
  expectedPhysicalRows: number[];
  writtenPhysicalRows: number[];
}

interface SafeReportFailure {
  code: string;
  details: Record<string, string | number>;
}

const EXCEL_REPORT_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly storageRoot: string;
  private readonly currentArtifacts = new CurrentArtifactService();

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
    const outputDir = join(
      this.storageRoot,
      'reports',
      this.safeFilename(container.containerNo),
      randomUUID(),
    );
    const request = this.toWorkerReportRequest(container);
    const generatedById = auditUserId(actor);

    let payload: WorkerReportPayload;
    try {
      payload = await this.workerReport.writeReport(request, outputDir);
    } catch (error) {
      await this.cleanupAttemptDirectory(outputDir);
      const failed = await this.recordFailedGeneratedFile(
        container,
        this.failureStoragePath(container, outputDir),
        error,
        generatedById,
      );
      throw this.reportFailure(error, failed);
    }

    const outputPath = this.outputPathFromPayload(payload);
    const errors = this.issueArray(payload.errors);
    if (payload.task_status === 'ERROR' || errors.length > 0 || !outputPath) {
      await this.cleanupAttemptDirectory(outputDir);
      const failed = await this.recordFailedGeneratedFile(
        container,
        outputPath ?? this.failureStoragePath(container, outputDir),
        payload,
        generatedById,
      );
      throw this.reportFailure(payload, failed);
    }

    const evidence = this.reportEvidence(payload);
    if (!evidence) {
      const failure = {
        errors: [
          {
            code: 'REPORT_DESTINATION_CONSERVATION_FAILED',
            stage: 'api.worker-evidence',
            expectedCount: request.pallet_result.plans instanceof Array
              ? request.pallet_result.plans.length
              : 0,
            actualCount: 0,
          },
        ],
      };
      await this.cleanupAttemptDirectory(outputDir);
      const failed = await this.recordFailedGeneratedFile(
        container,
        this.failureStoragePath(container, outputDir),
        failure,
        generatedById,
      );
      throw this.reportFailure(failure, failed);
    }

    let containedOutputPath: string;
    try {
      containedOutputPath = this.generatedOutputPath(outputPath, outputDir);
    } catch (error) {
      await this.cleanupAttemptDirectory(outputDir);
      const failed = await this.recordFailedGeneratedFile(
        container,
        this.failureStoragePath(container, outputDir),
        error,
        generatedById,
      );
      throw this.reportFailure(error, failed);
    }
    let generatedFile: GeneratedFileRecord;
    try {
      generatedFile = await this.recordGeneratedReport(
        container,
        containedOutputPath,
        generatedById,
      );
    } catch (error) {
      await this.cleanupAttemptDirectory(outputDir);
      const failed = await this.recordFailedGeneratedFile(
        container,
        this.failureStoragePath(container, outputDir),
        error,
        generatedById,
      );
      throw this.reportFailure(error, failed);
    }

    return {
      generatedFile: this.toGeneratedFileResponse(generatedFile),
      reportEvidence: evidence,
      warnings: this.issueArray(payload.warnings),
      errors: [],
    };
  }

  async listFiles(
    id: string,
    selectedFileId?: string,
  ): Promise<GeneratedFileListResponseDto> {
    await this.findContainerOrThrow(id);
    const records = (await this.prisma.generatedFile.findMany({
      where: {
        containerId: id,
        status: GeneratedFileStatus.GENERATED,
        fileType: {
          in: [
            GeneratedFileType.EXCEL_REPORT,
            GeneratedFileType.PALLET_LABEL_PDF,
          ],
        },
      },
      orderBy: [{ fileType: 'asc' }, { createdAt: 'desc' }],
    })) as GeneratedFileRecord[];

    const byType = new Map(records.map((record) => [record.fileType, record]));
    const items = [
        byType.get(GeneratedFileType.EXCEL_REPORT),
        byType.get(GeneratedFileType.PALLET_LABEL_PDF),
      ]
        .filter((record): record is GeneratedFileRecord => Boolean(record))
        .map((record) => this.toGeneratedFileResponse(record));
    let selection: GeneratedFileListResponseDto['selection'] = null;
    if (selectedFileId && !items.some((item) => item.id === selectedFileId)) {
      const selected = (await this.prisma.generatedFile.findFirst({
        where: { id: selectedFileId, containerId: id },
      })) as GeneratedFileRecord | null;
      if (
        selected?.status === GeneratedFileStatus.SUPERSEDED &&
        this.currentArtifacts.isCurrentType(selected.fileType)
      ) {
        const current = items.find(
          (item) => item.fileType === selected.fileType,
        );
        if (current) {
          selection = {
            fileType: selected.fileType,
            requestedFileId: selectedFileId,
            resolvedFileId: current.id,
            status: 'SUPERSEDED_REPLACED',
          };
        }
      }
    }
    return {
      items,
      selection,
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

    if (record.status === GeneratedFileStatus.SUPERSEDED) {
      throw new BadRequestException({
        code: 'GENERATED_FILE_SUPERSEDED',
        message: 'GENERATED_FILE_SUPERSEDED',
        labelKey: 'generatedFiles.errors.GENERATED_FILE_SUPERSEDED',
        details: {
          containerId,
          fileId,
          fileType: record.fileType,
        },
      });
    }

    if (
      record.status !== GeneratedFileStatus.GENERATED ||
      !this.currentArtifacts.isCurrentType(record.fileType)
    ) {
      throw new BadRequestException({
        code: 'GENERATED_FILE_NOT_DOWNLOADABLE',
        message: 'GENERATED_FILE_NOT_DOWNLOADABLE',
        labelKey: 'generatedFiles.errors.GENERATED_FILE_NOT_DOWNLOADABLE',
        details: {
          containerId,
          fileId,
          status: record.status,
          fileType: record.fileType,
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
    } catch {
      throw new InternalServerErrorException({
        code: 'GENERATED_FILE_STORAGE_MISSING',
        message: 'GENERATED_FILE_STORAGE_MISSING',
        details: {
          containerId,
          fileId,
        },
      });
    }
  }

  private async findContainerOrThrow(id: string): Promise<ContainerRecord> {
    const container = (await this.prisma.container.findUnique({
      where: { id },
      include: {
        destinations: {
          orderBy: [
            { destinationCode: 'asc' },
            { destinationType: 'asc' },
            { packageType: 'asc' },
          ],
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
      packageType: this.packageTypeOrNull(destination.packageType),
      ruleCode: destination.palletRuleCode ?? null,
      calculationBasisCbm: this.nullableNumberValue(
        destination.calculationBasisCbm,
      ),
      roundingMode: destination.roundingMode ?? null,
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
          packageType: this.packageTypeOrNull(destination.packageType),
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
      const generatedFile = await this.currentArtifacts.activate(
        tx as never,
        {
          importFileId: container.importFileId,
          containerId: container.id,
          fileType: GeneratedFileType.EXCEL_REPORT,
          storagePath: outputPath,
          fileSha256,
          mimeType: EXCEL_REPORT_MIME_TYPE,
          fileSizeBytes: BigInt(fileStat.size),
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
    const failure = this.safeReportFailure(error);
    return await this.currentArtifacts.recordFailure(
      this.prisma as never,
      {
        importFileId: container.importFileId,
        containerId: container.id,
        fileType: GeneratedFileType.EXCEL_REPORT,
        storagePath,
        mimeType: EXCEL_REPORT_MIME_TYPE,
        generatedById,
        errorCode: failure.code,
      },
    );
  }

  private reportFailure(
    error: unknown,
    generatedFile: GeneratedFileRecord,
  ): InternalServerErrorException {
    const failure = this.safeReportFailure(error);
    return new InternalServerErrorException({
      code: failure.code,
      message: failure.code,
      labelKey: `reports.errors.${failure.code}`,
      details: {
        generatedFileId: generatedFile.id,
        ...failure.details,
      },
    });
  }

  private outputPathFromPayload(payload: WorkerReportPayload): string | null {
    const outputPath = payload.report_result?.outputPath;
    return typeof outputPath === 'string' && outputPath.trim()
      ? outputPath
      : null;
  }

  private failureStoragePath(
    container: ContainerRecord,
    outputDir: string,
  ): string {
    return join(
      outputDir,
      `${this.safeFilename(container.containerNo)}卸柜报告-En.xlsx`,
    );
  }

  private generatedOutputPath(outputPath: string, outputDir: string): string {
    const resolvedOutput = resolve(outputPath);
    const resolvedAttempt = resolve(outputDir);
    if (
      !resolvedOutput.startsWith(`${resolvedAttempt}${sep}`) ||
      !resolvedOutput.toLowerCase().endsWith('.xlsx')
    ) {
      throw new InternalServerErrorException({
        code: 'WORKER_REPORT_OUTPUT_PATH_INVALID',
        message: 'WORKER_REPORT_OUTPUT_PATH_INVALID',
        details: { stage: 'validate-output-path' },
      });
    }
    return resolvedOutput;
  }

  private reportEvidence(payload: WorkerReportPayload): ReportEvidence | null {
    const reportResult = payload.report_result;
    const expected = reportResult?.totalDestinationCount;
    const written = reportResult?.writtenDestinationCount;
    const digest = reportResult?.orderedDestinationDigest;
    const layoutModes = reportResult?.layoutModes;
    const rawPageEvidence = reportResult?.pageEvidence;
    if (
      !Number.isInteger(expected) ||
      !Number.isInteger(written) ||
      Number(expected) < 0 ||
      expected !== written ||
      typeof digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(digest) ||
      !this.isLayoutModeArray(layoutModes) ||
      !Array.isArray(rawPageEvidence)
    ) {
      return null;
    }
    const pageEvidence = this.safePageEvidence(rawPageEvidence);
    if (
      pageEvidence === null ||
      pageEvidence.length !== layoutModes.length ||
      pageEvidence.reduce(
        (total, page) => total + page.expectedDestinationCount,
        0,
      ) !== Number(expected) ||
      pageEvidence.some(
        (page, index) =>
          page.page !== index + 1 ||
          page.layoutMode !== layoutModes[index],
      )
    ) {
      return null;
    }
    return {
      expectedDestinationCount: Number(expected),
      writtenDestinationCount: Number(written),
      orderedDestinationDigest: digest,
      layoutModes: [...layoutModes],
      pageEvidence,
    };
  }

  private safePageEvidence(value: unknown[]): ReportPageEvidence[] | null {
    const result: ReportPageEvidence[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const record = item as Record<string, unknown>;
      const page = record.page;
      const layoutMode = record.layoutMode;
      const expectedCount = record.expectedDestinationCount;
      const writtenCount = record.writtenDestinationCount;
      const expectedRows = record.expectedPhysicalRows;
      const writtenRows = record.writtenPhysicalRows;
      if (
        typeof page !== 'number' ||
        !Number.isInteger(page) ||
        page <= 0 ||
        (layoutMode !== 'PRIMARY_ONLY' && layoutMode !== 'EXPANDED') ||
        typeof expectedCount !== 'number' ||
        !Number.isInteger(expectedCount) ||
        expectedCount < 0 ||
        expectedCount > 16 ||
        typeof writtenCount !== 'number' ||
        !Number.isInteger(writtenCount) ||
        expectedCount !== writtenCount ||
        !Array.isArray(expectedRows) ||
        !Array.isArray(writtenRows)
      ) {
        return null;
      }
      const expectedMode =
        expectedCount <= 8 ? 'PRIMARY_ONLY' : 'EXPANDED';
      const independentlyExpectedRows =
        expectedCount <= 8
          ? Array.from(
              { length: expectedCount },
              (_, index) => 4 + index * 2,
            )
          : Array.from(
              { length: expectedCount },
              (_, index) => 4 + index,
            );
      if (
        layoutMode !== expectedMode ||
        !this.integerArraysEqual(expectedRows, independentlyExpectedRows) ||
        !this.integerArraysEqual(writtenRows, independentlyExpectedRows)
      ) {
        return null;
      }
      result.push({
        page,
        layoutMode,
        expectedDestinationCount: expectedCount,
        writtenDestinationCount: writtenCount,
        expectedPhysicalRows: [...expectedRows] as number[],
        writtenPhysicalRows: [...writtenRows] as number[],
      });
    }
    return result;
  }

  private integerArraysEqual(
    value: unknown[],
    expected: number[],
  ): value is number[] {
    return (
      value.length === expected.length &&
      value.every(
        (item, index) =>
          Number.isInteger(item) && Number(item) === expected[index],
      )
    );
  }

  private isLayoutModeArray(
    value: unknown,
  ): value is Array<'PRIMARY_ONLY' | 'EXPANDED'> {
    return (
      Array.isArray(value) &&
      value.every(
        (item) => item === 'PRIMARY_ONLY' || item === 'EXPANDED',
      )
    );
  }

  private async cleanupAttemptDirectory(outputDir: string): Promise<void> {
    const reportsRoot = resolve(this.storageRoot, 'reports');
    const attempt = resolve(outputDir);
    if (!attempt.startsWith(`${reportsRoot}${sep}`)) {
      return;
    }
    for (let attemptNo = 1; attemptNo <= 3; attemptNo += 1) {
      try {
        await rm(attempt, { force: true, recursive: true });
        return;
      } catch {
        if (attemptNo === 3) {
          this.logger.warn(
            'CURRENT_ARTIFACT_CLEANUP_PENDING type=EXCEL_REPORT',
          );
        }
      }
    }
  }

  private safeReportFailure(error: unknown): SafeReportFailure {
    const source = this.issueArray(
      error !== null && typeof error === 'object' && 'errors' in error
        ? (error as { errors?: unknown }).errors
        : null,
    )[0];
    const issue =
      source !== null && typeof source === 'object'
        ? (source as Record<string, unknown>)
        : null;
    const exceptionResponse =
      error !== null &&
      typeof error === 'object' &&
      'getResponse' in error &&
      typeof (error as { getResponse?: unknown }).getResponse === 'function'
        ? (
            (error as { getResponse(): unknown }).getResponse() as Record<
              string,
              unknown
            >
          )
        : null;
    const codeCandidate =
      (typeof issue?.code === 'string' && issue.code) ||
      (typeof exceptionResponse?.code === 'string' && exceptionResponse.code) ||
      'REPORT_GENERATION_FAILED';
    const allowedDetails = issue ?? exceptionResponse?.details;
    const details: Record<string, string | number> = {};
    if (allowedDetails && typeof allowedDetails === 'object') {
      for (const key of [
        'stage',
        'expectedCount',
        'actualCount',
        'sheet',
        'row',
        'ordinal',
      ]) {
        const value = (allowedDetails as Record<string, unknown>)[key];
        if (typeof value === 'string' || typeof value === 'number') {
          details[key] = value;
        }
      }
    }
    return { code: codeCandidate, details };
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

    throw this.storagePathInvalidError(record);
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
    record: GeneratedFileRecord,
  ): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'GENERATED_FILE_STORAGE_PATH_INVALID',
      message: 'GENERATED_FILE_STORAGE_PATH_INVALID',
      details: {
        generatedFileId: record.id,
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
      filename: basename(record.storagePath),
      fileSha256: record.fileSha256,
      mimeType: record.mimeType,
      fileSizeBytes:
        record.fileSizeBytes === null ? null : record.fileSizeBytes.toString(),
      status: record.status,
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

  private nullableNumberValue(
    value: { toString(): string } | number | string | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private packageTypeOrNull(value: string | null | undefined): string | null {
    if (!value || value === 'UNSPECIFIED') {
      return null;
    }
    return value;
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
