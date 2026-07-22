import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import {
  AttendanceImportListResponseDto,
  AttendanceImportResponseDto,
  AttendanceParseResultResponseDto,
  AttendanceRowResponseDto,
  GenerateWageRecordResponseDto,
  WageGeneratedFileListResponseDto,
  WageGeneratedFileResponseDto,
} from './dto/attendance-response.dto';
import { ListAttendanceImportsQueryDto } from './dto/list-attendance-imports-query.dto';
import {
  WorkerAttendanceDay,
  WorkerAttendanceService,
  WorkerWagePayload,
} from './worker-attendance.service';
import { auditUserId } from '../auth/audit-user';
import { AuthenticatedUser } from '../auth/auth-user';
import {
  AttendanceCalculationMethod,
  GeneratedFileStatus,
  ImportStatus,
  ParseStatus,
  WageGeneratedFileType,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type NullableJsonInput =
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput;
type ParseStatusValue = (typeof ParseStatus)[keyof typeof ParseStatus];
type WageGeneratedFileTypeValue =
  (typeof WageGeneratedFileType)[keyof typeof WageGeneratedFileType];
type GeneratedFileStatusValue =
  (typeof GeneratedFileStatus)[keyof typeof GeneratedFileStatus];

const LEGACY_XLS_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

interface AttendanceImportRecord {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  mimeType: string | null;
  fileSizeBytes: bigint | number | string | null;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  settlementMonth: string | null;
  periodStart: Date | string | null;
  periodEnd: Date | string | null;
  employeeCount: number;
  dayCount: number;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  rawMetadata?: unknown;
  importedById?: string | null;
  rows?: AttendanceRowRecord[];
  generatedFiles?: WageGeneratedFileRecord[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface AttendanceRowRecord {
  id: string;
  rowKey: string;
  employeeId: string | null;
  employeeName: string | null;
  department: string | null;
  workDate: Date | string;
  dayNumber: number;
  punchTimes: unknown;
  calculationMethod: string;
  workIntervals: unknown;
  pairedGrossHours: { toString(): string } | number | string | null;
  lunchHours: { toString(): string } | number | string;
  calculatedHours: { toString(): string } | number | string | null;
  firstPunch: string | null;
  lastPunch: string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
}

interface WageGeneratedFileRecord {
  id: string;
  attendanceImportId: string | null;
  unloadingWageSettlementId: string | null;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType: string | null;
  fileSizeBytes: bigint | number | string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface WageGeneratedFileDownload {
  buffer: Buffer;
  filename: string;
  fileSizeBytes: number;
  mimeType: string;
}

@Injectable()
export class AttendanceService {
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    private readonly workerAttendance: WorkerAttendanceService,
  ) {
    this.storageRoot = configService.getOrThrow<string>('app.storageRoot');
  }

  async importFile(
    file: Express.Multer.File,
    actor: AuthenticatedUser,
  ): Promise<AttendanceImportResponseDto> {
    this.validateXls(file);

    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.attendanceImport.findUnique({
      where: { fileSha256 },
    });

    if (duplicate) {
      this.throwDuplicate(duplicate);
    }

    const storedPath = await this.preserveOriginalFile(file, fileSha256);

    try {
      const record = (await this.prisma.attendanceImport.create({
        data: {
          originalFilename: file.originalname,
          storedPath,
          fileSha256,
          mimeType: file.mimetype || null,
          fileSizeBytes: BigInt(file.size),
          importStatus: ImportStatus.UPLOADED,
          parseStatus: ParseStatus.NOT_PARSED,
          warningCount: 0,
          errorCount: 0,
          errorMessage: null,
          importedById: auditUserId(actor),
        },
      })) as AttendanceImportRecord;

      return this.toImportResponse(record);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.prisma.attendanceImport.findUnique({
          where: { fileSha256 },
        });

        if (existing) {
          this.throwDuplicate(existing);
        }
      }

      throw new InternalServerErrorException({
        code: 'ATTENDANCE_IMPORT_CREATE_FAILED',
        message:
          'The attendance file was preserved, but import metadata could not be saved.',
        details: {
          fileSha256,
          storedPath,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  async list(
    query: ListAttendanceImportsQueryDto,
  ): Promise<AttendanceImportListResponseDto> {
    const records = (await this.prisma.attendanceImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    })) as AttendanceImportRecord[];

    return {
      items: records.map((record) => this.toImportResponse(record)),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getById(id: string): Promise<AttendanceImportResponseDto> {
    return this.toImportResponse(await this.findImportOrThrow(id));
  }

  async parse(id: string): Promise<AttendanceParseResultResponseDto> {
    const record = await this.findImportOrThrow(id);
    await this.assertStoredFileExists(record);

    await this.prisma.attendanceImport.update({
      where: { id },
      data: {
        parseStatus: ParseStatus.PARSING,
        errorMessage: null,
      },
    });

    const outputDir = join(this.storageRoot, 'attendance_imports', id);
    let payload: WorkerWagePayload;
    try {
      payload = await this.workerAttendance.parseAttendance(
        record.storedPath,
        outputDir,
      );
    } catch (error) {
      await this.markParseInvocationFailed(record, error);
      throw error;
    }

    await this.persistParsePayload(record, payload);
    const result = await this.getParseResult(id);
    this.throwIfParseFailed(payload, result);
    return result;
  }

  async getParseResult(id: string): Promise<AttendanceParseResultResponseDto> {
    const attendanceImport = await this.findImportOrThrow(id);
    const rows = (await this.prisma.attendanceRow.findMany({
      where: { attendanceImportId: id },
      orderBy: [{ workDate: 'asc' }, { rowKey: 'asc' }],
    })) as AttendanceRowRecord[];
    const warnings = this.rawMetadataArray(
      attendanceImport.rawMetadata,
      'warnings',
    );
    const errors = this.rawMetadataArray(
      attendanceImport.rawMetadata,
      'errors',
    );

    return {
      attendanceImport: this.toImportResponse(attendanceImport),
      rows: rows.map((row) => this.toRowResponse(row)),
      warnings,
      errors,
    };
  }

  async generateWageRecord(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<GenerateWageRecordResponseDto> {
    const record = await this.findImportOrThrow(id);
    this.assertReadyForWageGeneration(record);
    await this.assertStoredFileExists(record);

    const generatedById = auditUserId(actor);
    let payload: WorkerWagePayload;
    try {
      payload = await this.workerAttendance.generateWageRecord(
        record.storedPath,
        join(this.storageRoot, 'attendance_imports', id),
      );
    } catch (error) {
      const failed = await this.recordGeneratedFile({
        attendanceImportId: id,
        fileType: WageGeneratedFileType.WAGE_RECORD_XLS,
        storagePath: this.failureStoragePath(record),
        mimeType: 'application/vnd.ms-excel',
        generatedById,
        status: GeneratedFileStatus.FAILED,
        errorMessage: this.errorMessage(error),
      });

      throw new InternalServerErrorException({
        code: 'WAGE_RECORD_GENERATION_FAILED',
        message: 'The wage record worker could not complete.',
        details: {
          generatedFile: this.toGeneratedFileResponse(failed),
          taskReport: null,
          warnings: [],
          errors: [
            {
              code: 'WAGE_RECORD_WORKER_INVOCATION_FAILED',
              message: this.errorMessage(error),
            },
          ],
        },
      });
    }
    const errors = this.issueArray(payload.errors);
    const warnings = this.issueArray(payload.warnings);
    const wageRecordPath = this.stringOrNull(payload.wage_record_path);
    const taskReportPath = this.stringOrNull(payload.task_report_path);

    let taskReport: WageGeneratedFileRecord | null = null;
    if (taskReportPath) {
      taskReport = await this.recordGeneratedFile({
        attendanceImportId: id,
        fileType: WageGeneratedFileType.TASK_REPORT_HTML,
        storagePath: taskReportPath,
        mimeType: 'text/html',
        generatedById,
        status: GeneratedFileStatus.GENERATED,
        errorMessage: null,
      });
    }

    if (
      payload.task_status === 'ERROR' ||
      errors.length > 0 ||
      !wageRecordPath
    ) {
      const failed = await this.recordGeneratedFile({
        attendanceImportId: id,
        fileType: WageGeneratedFileType.WAGE_RECORD_XLS,
        storagePath: wageRecordPath ?? this.failureStoragePath(record),
        mimeType: 'application/vnd.ms-excel',
        generatedById,
        status: GeneratedFileStatus.FAILED,
        errorMessage: this.firstIssueMessage(errors, payload),
      });

      throw new BadRequestException({
        code: 'WAGE_RECORD_GENERATION_FAILED',
        message: 'The wage record workbook could not be generated.',
        details: {
          generatedFile: this.toGeneratedFileResponse(failed),
          taskReport: taskReport
            ? this.toGeneratedFileResponse(taskReport)
            : null,
          warnings,
          errors,
        },
      });
    }

    const generatedFile = await this.recordGeneratedFile({
      attendanceImportId: id,
      fileType: WageGeneratedFileType.WAGE_RECORD_XLS,
      storagePath: wageRecordPath,
      mimeType: 'application/vnd.ms-excel',
      generatedById,
      status: GeneratedFileStatus.GENERATED,
      errorMessage: null,
    });

    return {
      generatedFile: this.toGeneratedFileResponse(generatedFile),
      taskReport: taskReport ? this.toGeneratedFileResponse(taskReport) : null,
      warnings,
      errors: [],
    };
  }

  async listFiles(id: string): Promise<WageGeneratedFileListResponseDto> {
    await this.findImportOrThrow(id);
    const records = (await this.prisma.wageGeneratedFile.findMany({
      where: { attendanceImportId: id },
      orderBy: { updatedAt: 'desc' },
    })) as WageGeneratedFileRecord[];

    return {
      items: records.map((record) => this.toGeneratedFileResponse(record)),
    };
  }

  async downloadFile(
    attendanceImportId: string,
    fileId: string,
  ): Promise<WageGeneratedFileDownload> {
    await this.findImportOrThrow(attendanceImportId);
    const record = (await this.prisma.wageGeneratedFile.findFirst({
      where: { id: fileId, attendanceImportId },
    })) as WageGeneratedFileRecord | null;

    if (!record) {
      throw new NotFoundException({
        code: 'WAGE_GENERATED_FILE_NOT_FOUND',
        message: `Generated wage file ${fileId} was not found for attendance import ${attendanceImportId}.`,
        details: { attendanceImportId, fileId },
      });
    }

    if (record.status !== GeneratedFileStatus.GENERATED) {
      throw new BadRequestException({
        code: 'WAGE_GENERATED_FILE_NOT_DOWNLOADABLE',
        message: `Generated wage file ${fileId} is not downloadable because its status is ${record.status}.`,
        details: { attendanceImportId, fileId, status: record.status },
      });
    }

    return this.downloadWageGeneratedFile(record, {
      attendanceImportId,
      fileId,
    });
  }

  private async persistParsePayload(
    record: AttendanceImportRecord,
    payload: WorkerWagePayload,
  ): Promise<void> {
    const parsedResult = payload.parsed_result ?? null;
    const warnings = this.issueArray(payload.warnings);
    const errors = this.issueArray(payload.errors);
    const parseStatus = this.parseStatus(payload, warnings, errors);
    const parserVersion = this.stringOrNull(parsedResult?.parserVersion);
    const periodStart = this.dateOnlyOrNull(parsedResult?.periodStart);
    const periodEnd = this.dateOnlyOrNull(parsedResult?.periodEnd);
    const generatedById = record.importedById ?? null;
    const parsedJsonPath = this.stringOrNull(payload.parsed_json_path);
    const taskReportPath = this.stringOrNull(payload.task_report_path);

    await this.prisma.$transaction(async (tx) => {
      await tx.attendanceRow.deleteMany({
        where: { attendanceImportId: record.id },
      });

      const rows = this.attendanceRows(record.id, parsedResult?.days ?? []);
      if (rows.length > 0) {
        await tx.attendanceRow.createMany({ data: rows });
      }

      await tx.attendanceImport.update({
        where: { id: record.id },
        data: {
          parseStatus,
          parserVersion,
          settlementMonth: this.settlementMonth(periodStart),
          periodStart,
          periodEnd,
          employeeCount: this.intValue(payload.employee_count),
          dayCount: rows.length,
          warningCount: warnings.length,
          errorCount: errors.length,
          errorMessage:
            parseStatus === ParseStatus.ERROR
              ? this.firstIssueMessage(errors, payload)
              : null,
          rawMetadata: this.nullableJsonValue({
            sourceFile: payload.source_file,
            workerSha256: payload.sha256,
            detection: payload.detection ?? null,
            parsedResultMetadata: {
              formatType: parsedResult?.formatType ?? null,
              sourceSheet: parsedResult?.sourceSheet ?? null,
              confidence: parsedResult?.confidence ?? null,
              assumptions: parsedResult?.assumptions ?? [],
            },
            warnings,
            errors,
            exception: payload.exception ?? null,
          }),
        },
      });

      if (parsedJsonPath) {
        await this.createGeneratedFileWithClient(tx, {
          attendanceImportId: record.id,
          fileType: WageGeneratedFileType.ATTENDANCE_PARSED_JSON,
          storagePath: parsedJsonPath,
          mimeType: 'application/json',
          generatedById,
          status: GeneratedFileStatus.GENERATED,
          errorMessage: null,
        });
      }

      if (taskReportPath) {
        await this.createGeneratedFileWithClient(tx, {
          attendanceImportId: record.id,
          fileType: WageGeneratedFileType.TASK_REPORT_HTML,
          storagePath: taskReportPath,
          mimeType: 'text/html',
          generatedById,
          status: GeneratedFileStatus.GENERATED,
          errorMessage: null,
        });
      }
    });
  }

  private attendanceRows(
    attendanceImportId: string,
    days: WorkerAttendanceDay[],
  ): Prisma.AttendanceRowCreateManyInput[] {
    return days
      .filter((day) => this.stringOrNull(day.workDate))
      .map((day, index) => ({
        attendanceImportId,
        rowKey: this.rowKey(day, index),
        employeeId: this.stringOrNull(day.employeeId),
        employeeName: this.stringOrNull(day.employeeName),
        department: this.stringOrNull(day.department),
        workDate: this.dateOnlyOrNull(day.workDate) ?? new Date(0),
        dayNumber: this.intValue(day.dayNumber),
        punchTimes: this.jsonValue(day.punchTimes ?? []),
        calculationMethod:
          day.calculationMethod ?? AttendanceCalculationMethod.LEGACY_UNKNOWN,
        workIntervals: this.jsonValue(day.workIntervals ?? []),
        pairedGrossHours: this.nullableDecimalString(day.pairedGrossHours),
        lunchHours: this.decimalString(day.lunchHours ?? 0.5),
        calculatedHours: this.nullableDecimalString(day.calculatedHours),
        firstPunch: this.stringOrNull(day.firstPunch),
        lastPunch: this.stringOrNull(day.lastPunch),
        rawJson: this.jsonValue(day),
        warnings: this.nullableJsonValue(day.warnings ?? []),
        errors: this.nullableJsonValue(day.errors ?? []),
      }));
  }

  private throwIfParseFailed(
    payload: WorkerWagePayload,
    result: AttendanceParseResultResponseDto,
  ): void {
    const errors = this.issueArray(payload.errors);
    if (payload.task_status !== 'ERROR' && errors.length === 0) {
      return;
    }

    throw new BadRequestException({
      code: 'ATTENDANCE_PARSE_FAILED',
      message: 'The attendance file could not be parsed.',
      details: {
        attendanceImport: result.attendanceImport,
        warnings: result.warnings,
        errors: result.errors,
      },
    });
  }

  private assertReadyForWageGeneration(record: AttendanceImportRecord): void {
    const parsedWithoutErrors =
      (record.parseStatus === ParseStatus.PARSED ||
        record.parseStatus === ParseStatus.WARNING) &&
      record.errorCount === 0;

    if (parsedWithoutErrors) {
      return;
    }

    if (
      record.parseStatus === ParseStatus.NOT_PARSED ||
      record.parseStatus === ParseStatus.PARSING
    ) {
      throw new BadRequestException({
        code: 'ATTENDANCE_IMPORT_NOT_PARSED',
        message:
          'Attendance import must be parsed before generating a wage record.',
        details: {
          attendanceImportId: record.id,
          parseStatus: record.parseStatus,
        },
      });
    }

    throw new BadRequestException({
      code: 'ATTENDANCE_IMPORT_HAS_PARSE_ERRORS',
      message:
        'Attendance import has parser errors and cannot generate a wage record.',
      details: {
        attendanceImportId: record.id,
        parseStatus: record.parseStatus,
        errorCount: record.errorCount,
        errorMessage: record.errorMessage,
      },
    });
  }

  private async recordGeneratedFile(input: {
    attendanceImportId: string;
    fileType: WageGeneratedFileTypeValue;
    storagePath: string;
    mimeType: string;
    generatedById: string | null;
    status: GeneratedFileStatusValue;
    errorMessage: string | null;
  }): Promise<WageGeneratedFileRecord> {
    return this.createGeneratedFileWithClient(this.prisma, input);
  }

  private async createGeneratedFileWithClient(
    client: Pick<PrismaService, 'wageGeneratedFile'> | Prisma.TransactionClient,
    input: {
      attendanceImportId: string;
      fileType: WageGeneratedFileTypeValue;
      storagePath: string;
      mimeType: string;
      generatedById: string | null;
      status: GeneratedFileStatusValue;
      errorMessage: string | null;
    },
  ): Promise<WageGeneratedFileRecord> {
    const metadata = await this.fileMetadata(input.storagePath);
    return await client.wageGeneratedFile.create({
      data: {
        attendanceImportId: input.attendanceImportId,
        fileType: input.fileType,
        storagePath: input.storagePath,
        fileSha256: metadata.fileSha256,
        mimeType: input.mimeType,
        fileSizeBytes: metadata.fileSizeBytes,
        status: input.status,
        errorMessage: input.errorMessage,
        generatedById: input.generatedById,
      },
    });
  }

  private async fileMetadata(
    storagePath: string,
  ): Promise<{ fileSha256: string | null; fileSizeBytes: bigint | null }> {
    try {
      const fileStat = await stat(storagePath);
      if (!fileStat.isFile()) {
        throw new Error('Generated path is not a file.');
      }
      const buffer = await readFile(storagePath);
      return {
        fileSha256: createHash('sha256').update(buffer).digest('hex'),
        fileSizeBytes: BigInt(fileStat.size),
      };
    } catch {
      return { fileSha256: null, fileSizeBytes: null };
    }
  }

  private async downloadWageGeneratedFile(
    record: WageGeneratedFileRecord,
    details: Record<string, string>,
  ): Promise<WageGeneratedFileDownload> {
    const storagePath = await this.resolveDownloadStoragePath(
      record.storagePath,
    );

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
        code: 'WAGE_GENERATED_FILE_STORAGE_MISSING',
        message:
          'The generated wage file record exists, but the file cannot be read.',
        details: {
          ...details,
          storagePath: record.storagePath,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  private async resolveDownloadStoragePath(
    storagePath: string,
  ): Promise<string> {
    const resolvedStorageRoot = resolve(this.storageRoot);
    const resolvedPath = resolve(storagePath);
    const realStorageRoot = await this.realPathOrNull(this.storageRoot);
    const realStoragePath = await this.realPathOrNull(storagePath);
    if (this.isPathAtOrInside(realStoragePath, realStorageRoot)) {
      return realStoragePath;
    }
    if (
      !realStoragePath &&
      this.isPathAtOrInside(resolvedPath, resolvedStorageRoot)
    ) {
      return resolvedPath;
    }

    const remappedPath = this.remapLegacyStoragePath(storagePath);
    if (remappedPath) {
      return remappedPath;
    }

    throw new BadRequestException({
      code: 'WAGE_GENERATED_FILE_STORAGE_PATH_INVALID',
      message: 'Generated wage file storage path is outside storage root.',
      details: { storagePath },
    });
  }

  private remapLegacyStoragePath(storagePath: string): string | null {
    const normalizedPath = storagePath.replace(/\\/g, '/');
    const marker = '/storage/';
    const markerIndex = normalizedPath.lastIndexOf(marker);
    if (markerIndex === -1) {
      return null;
    }

    const relativePath = normalizedPath.slice(markerIndex + marker.length);
    const candidate = resolve(this.storageRoot, relativePath);
    const resolvedStorageRoot = resolve(this.storageRoot);
    if (this.isPathAtOrInside(candidate, resolvedStorageRoot)) {
      return candidate;
    }

    return null;
  }

  private async realPathOrNull(path: string): Promise<string | null> {
    try {
      return await realpath(path);
    } catch {
      return null;
    }
  }

  private isPathAtOrInside(
    candidate: string | null,
    root: string | null,
  ): candidate is string {
    if (!candidate || !root) {
      return false;
    }
    return candidate === root || candidate.startsWith(`${root}${sep}`);
  }

  private async findImportOrThrow(id: string): Promise<AttendanceImportRecord> {
    const record = (await this.prisma.attendanceImport.findUnique({
      where: { id },
    })) as AttendanceImportRecord | null;

    if (!record) {
      throw new NotFoundException({
        code: 'ATTENDANCE_IMPORT_NOT_FOUND',
        message: `Attendance import ${id} was not found.`,
        details: { id },
      });
    }

    return record;
  }

  private async assertStoredFileExists(
    record: AttendanceImportRecord,
  ): Promise<void> {
    try {
      const storedFile = await stat(record.storedPath);
      if (!storedFile.isFile()) {
        throw new Error('Stored path is not a file.');
      }
    } catch (error) {
      await this.prisma.attendanceImport.update({
        where: { id: record.id },
        data: {
          parseStatus: ParseStatus.ERROR,
          warningCount: 0,
          errorCount: 1,
          errorMessage: `Original attendance file is unavailable: ${this.errorMessage(error)}`,
          rawMetadata: this.nullableJsonValue({
            storedPath: record.storedPath,
            warnings: [],
            errors: [
              {
                code: 'ATTENDANCE_ORIGINAL_FILE_MISSING',
                message: this.errorMessage(error),
              },
            ],
          }),
        },
      });
      throw new InternalServerErrorException({
        code: 'ATTENDANCE_ORIGINAL_FILE_MISSING',
        message: 'The preserved attendance file could not be read.',
        details: {
          attendanceImportId: record.id,
          storedPath: record.storedPath,
          errorMessage: this.errorMessage(error),
        },
      });
    }
  }

  private async markParseInvocationFailed(
    record: AttendanceImportRecord,
    error: unknown,
  ): Promise<void> {
    await this.prisma.attendanceImport.update({
      where: { id: record.id },
      data: {
        parseStatus: ParseStatus.ERROR,
        warningCount: 0,
        errorCount: 1,
        errorMessage: this.errorMessage(error),
        rawMetadata: this.nullableJsonValue({
          storedPath: record.storedPath,
          warnings: [],
          errors: [
            {
              code: 'ATTENDANCE_WORKER_INVOCATION_FAILED',
              message: this.errorMessage(error),
            },
          ],
        }),
      },
    });
  }

  private validateXls(file: Express.Multer.File): void {
    if (!file.originalname.toLowerCase().endsWith('.xls')) {
      throw new BadRequestException({
        code: 'ATTENDANCE_FILE_TYPE_UNSUPPORTED',
        message: 'Attendance imports must be legacy .xls workbooks.',
        details: { originalFilename: file.originalname },
      });
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'ATTENDANCE_FILE_EMPTY',
        message: 'The uploaded attendance file is empty.',
        details: { originalFilename: file.originalname },
      });
    }
    if (
      file.buffer.length < LEGACY_XLS_SIGNATURE.length ||
      !file.buffer
        .subarray(0, LEGACY_XLS_SIGNATURE.length)
        .equals(LEGACY_XLS_SIGNATURE)
    ) {
      throw new BadRequestException({
        code: 'ATTENDANCE_FILE_TYPE_UNSUPPORTED',
        message: 'Attendance imports must be legacy Excel .xls workbook bytes.',
        details: { originalFilename: file.originalname },
      });
    }
  }

  private throwDuplicate(record: {
    id: string;
    fileSha256: string;
    originalFilename: string;
    importStatus?: string | null;
    parseStatus?: string | null;
    warningCount?: number | null;
    errorCount?: number | null;
  }): never {
    throw new ConflictException({
      code: 'DUPLICATE_ATTENDANCE_IMPORT',
      message: 'Attendance file content already exists by SHA-256.',
      details: {
        existingImportId: record.id,
        fileSha256: record.fileSha256,
        originalFilename: record.originalFilename,
        existingImport: {
          id: record.id,
          originalFilename: record.originalFilename,
          fileSha256: record.fileSha256,
          importStatus: record.importStatus ?? null,
          parseStatus: record.parseStatus ?? null,
          warningCount: record.warningCount ?? null,
          errorCount: record.errorCount ?? null,
        },
      },
    });
  }

  private async preserveOriginalFile(
    file: Express.Multer.File,
    fileSha256: string,
  ): Promise<string> {
    const targetDir = join(
      this.storageRoot,
      'attendance_original_files',
      fileSha256,
    );
    await mkdir(targetDir, { recursive: true });
    const targetPath = join(targetDir, this.safeFilename(file.originalname));
    await writeFile(targetPath, file.buffer);
    return targetPath;
  }

  private parseStatus(
    payload: WorkerWagePayload,
    warnings: unknown[],
    errors: unknown[],
  ): ParseStatusValue {
    if (payload.task_status === 'ERROR' || errors.length > 0) {
      return ParseStatus.ERROR;
    }
    if (payload.task_status === 'WARNING' || warnings.length > 0) {
      return ParseStatus.WARNING;
    }
    return ParseStatus.PARSED;
  }

  private rowKey(day: WorkerAttendanceDay, index: number): string {
    const employee =
      this.stringOrNull(day.employeeId) ??
      this.stringOrNull(day.employeeName) ??
      'unknown';
    const workDate = this.stringOrNull(day.workDate) ?? 'unknown-date';
    return `${employee}:${workDate}:${index + 1}`;
  }

  private settlementMonth(value: Date | null): string | null {
    if (!value) {
      return null;
    }
    return value.toISOString().slice(0, 7);
  }

  private issueArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private rawMetadataArray(value: unknown, key: string): unknown[] {
    if (value === null || typeof value !== 'object' || !(key in value)) {
      return [];
    }
    return this.issueArray((value as Record<string, unknown>)[key]);
  }

  private firstIssueMessage(
    errors: unknown[],
    payload: WorkerWagePayload,
  ): string {
    const first = errors[0];
    if (first && typeof first === 'object' && 'message' in first) {
      return (
        this.stringOrNull((first as { message?: unknown }).message) ??
        'Unknown error'
      );
    }
    return (
      this.stringOrNull(payload.exception?.message) ??
      'Unknown wage processing error'
    );
  }

  private intValue(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
  }

  private decimalString(value: unknown): string {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : '0.00';
  }

  private nullableDecimalString(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : null;
  }

  private dateOnlyOrNull(value: unknown): Date | null {
    const text = this.stringOrNull(value);
    if (!text) {
      return null;
    }
    const parsed = new Date(`${text.slice(0, 10)}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private stringOrNull(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean' &&
      typeof value !== 'bigint'
    ) {
      return null;
    }
    const text = value.toString().trim();
    return text.length > 0 ? text : null;
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
    return filename.length > 0 ? filename : 'attendance.xls';
  }

  private failureStoragePath(record: AttendanceImportRecord): string {
    return join(
      this.storageRoot,
      'attendance_imports',
      record.id,
      'wage_records',
      'wage-record-not-generated.xls',
    );
  }

  private toImportResponse(
    record: AttendanceImportRecord,
  ): AttendanceImportResponseDto {
    return {
      id: record.id,
      originalFilename: record.originalFilename,
      storedPath: record.storedPath,
      fileSha256: record.fileSha256,
      mimeType: record.mimeType,
      fileSizeBytes:
        record.fileSizeBytes === null || record.fileSizeBytes === undefined
          ? null
          : record.fileSizeBytes.toString(),
      importStatus: record.importStatus,
      parseStatus: record.parseStatus,
      parserVersion: record.parserVersion,
      settlementMonth: record.settlementMonth,
      periodStart: this.dateResponse(record.periodStart),
      periodEnd: this.dateResponse(record.periodEnd),
      employeeCount: record.employeeCount,
      dayCount: record.dayCount,
      warningCount: record.warningCount,
      errorCount: record.errorCount,
      errorMessage: record.errorMessage,
      createdAt: this.toIsoString(record.createdAt),
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private toRowResponse(row: AttendanceRowRecord): AttendanceRowResponseDto {
    return {
      id: row.id,
      rowKey: row.rowKey,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      department: row.department,
      workDate:
        this.dateResponse(row.workDate) ?? this.toIsoString(row.workDate),
      dayNumber: row.dayNumber,
      punchTimes: row.punchTimes,
      calculationMethod:
        row.calculationMethod as AttendanceRowResponseDto['calculationMethod'],
      workIntervals: row.workIntervals,
      pairedGrossHours: this.decimalResponse(row.pairedGrossHours),
      lunchHours: this.decimalResponse(row.lunchHours) ?? '0.00',
      calculatedHours: this.decimalResponse(row.calculatedHours),
      firstPunch: row.firstPunch,
      lastPunch: row.lastPunch,
      rawJson: row.rawJson,
      warnings: row.warnings,
      errors: row.errors,
    };
  }

  private toGeneratedFileResponse(
    record: WageGeneratedFileRecord,
  ): WageGeneratedFileResponseDto {
    return {
      id: record.id,
      attendanceImportId: record.attendanceImportId,
      unloadingWageSettlementId: record.unloadingWageSettlementId,
      fileType: record.fileType,
      storagePath: record.storagePath,
      fileSha256: record.fileSha256,
      mimeType: record.mimeType,
      fileSizeBytes:
        record.fileSizeBytes === null || record.fileSizeBytes === undefined
          ? null
          : record.fileSizeBytes.toString(),
      status: record.status,
      errorMessage: record.errorMessage,
      createdAt: this.toIsoString(record.createdAt),
      updatedAt: this.toIsoString(record.updatedAt),
    };
  }

  private decimalResponse(
    value: { toString(): string } | number | string | null,
  ): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value.toString();
  }

  private dateResponse(value: Date | string | null): string | null {
    if (!value) {
      return null;
    }
    return this.toIsoString(value).slice(0, 10);
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown attendance processing error';
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
