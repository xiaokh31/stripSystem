import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  ImportFileListResponseDto,
  ImportFileResponseDto,
  ImportParseResultResponseDto,
  ContainerDestinationResponseDto,
  ContainerLineResponseDto,
  ContainerResponseDto,
} from './dto/import-file-response.dto';
import { ListImportsQueryDto } from './dto/list-imports-query.dto';
import {
  WorkerDestinationSummary,
  WorkerIssue,
  WorkerPalletPlan,
  WorkerParsePayload,
  WorkerParsedLine,
  WorkerParserService,
} from './worker-parser.service';
import { FileFormat, ContainerStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ContainerRecord {
  id: string;
  importFileId: string;
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
  cartons: number;
  volume: { toString(): string } | number | string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  note: string | null;
  warnings: unknown;
  errors: unknown;
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
  ) {
    this.storageRoot = configService.getOrThrow<string>('app.storageRoot');
  }

  async importFile(file: Express.Multer.File): Promise<ImportFileResponseDto> {
    this.validateXlsx(file);

    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.importFile.findUnique({
      where: { fileSha256 },
    });

    if (duplicate) {
      this.throwDuplicate(duplicate);
    }

    const storedPath = await this.preserveOriginalFile(file, fileSha256);

    try {
      const record = await this.prisma.importFile.create({
        data: {
          originalFilename: file.originalname,
          storedPath,
          fileSha256,
          mimeType: file.mimetype || null,
          fileSizeBytes: BigInt(file.size),
          format: 'UNKNOWN',
          importStatus: 'UPLOADED',
          parseStatus: 'NOT_PARSED',
          warningCount: 0,
          errorCount: 0,
          errorMessage: null,
        },
      });

      return this.toResponse(record);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.importFile.findUnique({
          where: { fileSha256 },
        });

        if (existing) {
          this.throwDuplicate(existing);
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
    const record = await this.findImportOrThrow(id);

    return this.toResponse(record);
  }

  async parse(id: string): Promise<ImportParseResultResponseDto> {
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
      payload = await this.workerParser.parseFile(record.storedPath);
    } catch (error) {
      await this.markParseInvocationFailed(record, error);
      throw error;
    }

    try {
      await this.persistParsePayload(record, payload);
    } catch (error) {
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
          orderBy: [{ destinationCode: 'asc' }, { destinationType: 'asc' }],
        },
      },
    })) as ContainerRecord[];

    return this.toParseResult({
      importFile: record,
      containers,
    });
  }

  private async findImportOrThrow(id: string): Promise<ImportFileRecord> {
    const record = await this.prisma.importFile.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'IMPORT_NOT_FOUND',
        message: `Import file ${id} was not found.`,
        details: { id },
      });
    }

    return record as ImportFileRecord;
  }

  private async assertStoredFileExists(record: ImportFileRecord): Promise<void> {
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
        container.id as string,
        parsedResult.lines ?? [],
      );
      if (lineRows.length > 0) {
        await tx.containerLine.createMany({ data: lineRows });
      }

      const destinationRows = this.containerDestinationRows(
        container.id as string,
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
    tx: any,
    importFileId: string,
  ): Promise<void> {
    const existingContainers = (await tx.container.findMany({
      where: { importFileId },
      select: { id: true },
    })) as Array<{ id: string }>;
    const containerIds = existingContainers.map((container) => container.id);

    if (containerIds.length === 0) {
      return;
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
      plans.map((plan) => [this.destinationKey(plan.destinationCode), plan]),
    );

    return summaries.map((summary) => {
      const plan = plansByDestination.get(
        this.destinationKey(summary.destinationCode),
      );
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
      const finalPallets = this.intValue(
        plan?.finalPallets,
        calculatedPallets,
      );

      return {
        containerId,
        destinationCode,
        destinationType: this.stringOrNull(plan?.destinationType),
        cartons,
        volume,
        calculatedPallets,
        manualPallets: this.nullableIntValue(plan?.manualPallets),
        finalPallets,
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
        parserVersion: this.stringOrNull(
          payload.parsed_result?.parserVersion,
        ),
        warningCount: this.issueArray(payload.warnings).length,
        errorCount: Math.max(this.issueArray(payload.errors).length, 1),
        errorMessage: this.errorMessage(error),
        rawMetadata: this.nullableJsonValue({
          storedPath: record.storedPath,
          workerSourceFile: payload.source_file,
          detection: payload.detection,
          warnings: this.issueArray(payload.warnings),
          errors: this.ensureParseError(this.issueArray(payload.errors), payload),
          persistenceError: this.errorMessage(error),
        }),
      },
    });
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
      createdAt: this.toIsoString(record.createdAt),
      updatedAt: this.toIsoString(record.updatedAt),
    };
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
      warnings:
        importWarnings.length > 0 ? importWarnings : containerWarnings,
      errors: importErrors.length > 0 ? importErrors : containerErrors,
    };
  }

  private toContainerResponse(
    record: ContainerRecord,
  ): ContainerResponseDto {
    return {
      id: record.id,
      importFileId: record.importFileId,
      containerNo: record.containerNo,
      sourceFormat: record.sourceFormat,
      parserVersion: record.parserVersion,
      status: record.status,
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
      cartons: record.cartons,
      volume: this.stringValue(record.volume),
      calculatedPallets: record.calculatedPallets,
      manualPallets: record.manualPallets,
      finalPallets: record.finalPallets,
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

  private destinationKey(value: unknown): string {
    return this.stringOrNull(value) ?? '';
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
    value: { toString(): string } | number | string | null,
  ): string | null {
    return value === null ? null : value.toString();
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
      return Prisma.JsonNull;
    }

    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized === 'null') {
      return Prisma.JsonNull;
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

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }
}
