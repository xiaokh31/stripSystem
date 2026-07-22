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
  AttendanceRowAuditEventResponseDto,
  AttendanceRowHistoryResponseDto,
  AttendanceRowResponseDto,
  DeleteAttendanceRowResponseDto,
  GenerateWageRecordResponseDto,
  WageGeneratedFileListResponseDto,
  WageGeneratedFileResponseDto,
} from './dto/attendance-response.dto';
import { ListAttendanceImportsQueryDto } from './dto/list-attendance-imports-query.dto';
import { ListAttendanceRowHistoryQueryDto } from './dto/list-attendance-row-history-query.dto';
import {
  WorkerAttendanceDay,
  WorkerAttendanceService,
  WorkerWagePayload,
} from './worker-attendance.service';
import { auditUserId } from '../auth/audit-user';
import { AuthenticatedUser } from '../auth/auth-user';
import {
  AttendanceCalculationMethod,
  AttendanceRowAuditEventCode,
  AsyncJobStatus,
  AsyncJobType,
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
  dataRevision: number;
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
  deletedAt?: Date | string | null;
  deletedById?: string | null;
  deletionReason?: string | null;
}

interface AttendanceRowAuditEventRecord {
  id: string;
  attendanceImportId: string;
  attendanceRowId: string | null;
  rowKey: string;
  eventCode: string;
  employeeId: string | null;
  employeeName: string | null;
  department: string | null;
  workDate: Date | string;
  rowSnapshot: unknown;
  actorUserId: string | null;
  actorDisplaySnapshot: string;
  reason: string;
  occurredAt: Date | string;
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
    const [rows, activeRowCount, deletedRowCount] = await Promise.all([
      this.prisma.attendanceRow.findMany({
        where: { attendanceImportId: id, deletedAt: null },
        orderBy: [{ workDate: 'asc' }, { rowKey: 'asc' }],
      }) as Promise<AttendanceRowRecord[]>,
      this.prisma.attendanceRow.count({
        where: { attendanceImportId: id, deletedAt: null },
      }),
      this.prisma.attendanceRow.count({
        where: { attendanceImportId: id, deletedAt: { not: null } },
      }),
    ]);
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
      activeRowCount,
      deletedRowCount,
    };
  }

  async deleteRow(
    attendanceImportId: string,
    rowId: string,
    reason: string,
    actor: AuthenticatedUser,
  ): Promise<DeleteAttendanceRowResponseDto> {
    const normalizedReason = reason.trim();
    return this.prisma.$transaction(async (tx) => {
      await this.lockAttendanceImport(tx, attendanceImportId);
      const attendanceImport = (await tx.attendanceImport.findUnique({
        where: { id: attendanceImportId },
      })) as AttendanceImportRecord | null;
      if (!attendanceImport) {
        this.throwImportNotFound(attendanceImportId);
      }
      await this.assertNoActiveAttendanceJob(tx, attendanceImportId);
      if (attendanceImport.parseStatus === ParseStatus.PARSING) {
        throw new ConflictException({
          code: 'ATTENDANCE_IMPORT_BUSY',
          message: 'Attendance rows cannot be deleted while parsing is running.',
          details: { attendanceImportId, operation: 'PARSE' },
        });
      }

      const row = (await tx.attendanceRow.findFirst({
        where: { id: rowId, attendanceImportId },
      })) as AttendanceRowRecord | null;
      if (!row) {
        throw new NotFoundException({
          code: 'ATTENDANCE_ROW_NOT_FOUND',
          message: `Attendance row ${rowId} was not found for import ${attendanceImportId}.`,
          details: { attendanceImportId, rowId },
        });
      }

      let event: AttendanceRowAuditEventRecord;
      let deleted = false;
      let affectedGeneratedFiles: Array<{ id: string; status: 'SUPERSEDED' }> = [];
      let responseRow = row;
      if (row.deletedAt) {
        const existingEvent = (await tx.attendanceRowAuditEvent.findUnique({
          where: {
            attendanceImportId_rowKey_eventCode: {
              attendanceImportId,
              rowKey: row.rowKey,
              eventCode: AttendanceRowAuditEventCode.DELETED,
            },
          },
        })) as AttendanceRowAuditEventRecord | null;
        if (!existingEvent) {
          throw new InternalServerErrorException({
            code: 'ATTENDANCE_ROW_AUDIT_INCONSISTENT',
            message: 'The deleted attendance row has no immutable deletion event.',
            details: { attendanceImportId, rowId },
          });
        }
        event = existingEvent;
      } else {
        const occurredAt = new Date();
        const actorDisplaySnapshot = this.actorDisplaySnapshot(actor);
        responseRow = (await tx.attendanceRow.update({
          where: { id: row.id },
          data: {
            deletedAt: occurredAt,
            deletedById: actor.id,
            deletionReason: normalizedReason,
          },
        })) as AttendanceRowRecord;
        event = (await tx.attendanceRowAuditEvent.create({
          data: {
            attendanceImportId,
            attendanceRowId: row.id,
            rowKey: row.rowKey,
            eventCode: AttendanceRowAuditEventCode.DELETED,
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            department: row.department,
            workDate: new Date(row.workDate),
            rowSnapshot: this.jsonValue(this.rowAuditSnapshot(row)),
            actorUserId: actor.id,
            actorDisplaySnapshot,
            reason: normalizedReason,
            occurredAt,
          },
        })) as AttendanceRowAuditEventRecord;
        const activeRows = (await tx.attendanceRow.findMany({
          where: { attendanceImportId, deletedAt: null },
        })) as AttendanceRowRecord[];
        const activeSummary = this.activeAttendanceSummary(activeRows);
        await tx.attendanceImport.update({
          where: { id: attendanceImportId },
          data: {
            dataRevision: { increment: 1 },
            ...activeSummary,
          },
        });
        const affected = (await tx.wageGeneratedFile.findMany({
          where: {
            attendanceImportId,
            status: GeneratedFileStatus.GENERATED,
            fileType: {
              in: [
                WageGeneratedFileType.WAGE_RECORD_XLS,
                WageGeneratedFileType.TASK_REPORT_HTML,
              ],
            },
          },
          select: { id: true },
        })) as Array<{ id: string }>;
        if (affected.length > 0) {
          await tx.wageGeneratedFile.updateMany({
            where: { id: { in: affected.map((file) => file.id) } },
            data: { status: GeneratedFileStatus.SUPERSEDED },
          });
        }
        affectedGeneratedFiles = affected.map((file) => ({
          id: file.id,
          status: 'SUPERSEDED' as const,
        }));
        deleted = true;
      }

      const [activeRowCount, deletedRowCount] = await Promise.all([
        tx.attendanceRow.count({
          where: { attendanceImportId, deletedAt: null },
        }),
        tx.attendanceRow.count({
          where: { attendanceImportId, deletedAt: { not: null } },
        }),
      ]);
      return {
        code: deleted
          ? 'ATTENDANCE_ROW_DELETED'
          : 'ATTENDANCE_ROW_ALREADY_DELETED',
        deleted,
        alreadyDeleted: !deleted,
        activeRowCount,
        deletedRowCount,
        row: this.toRowResponse(responseRow),
        event: this.toAuditEventResponse(event),
        affectedGeneratedFiles,
      };
    });
  }

  async listRowHistory(
    attendanceImportId: string,
    query: ListAttendanceRowHistoryQueryDto,
  ): Promise<AttendanceRowHistoryResponseDto> {
    await this.findImportOrThrow(attendanceImportId);
    const [items, total] = await Promise.all([
      this.prisma.attendanceRowAuditEvent.findMany({
        where: { attendanceImportId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: query.limit,
        skip: query.offset,
      }) as Promise<AttendanceRowAuditEventRecord[]>,
      this.prisma.attendanceRowAuditEvent.count({
        where: { attendanceImportId },
      }),
    ]);
    return {
      items: items.map((event) => this.toAuditEventResponse(event)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async generateWageRecord(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<GenerateWageRecordResponseDto> {
    const record = await this.findImportOrThrow(id);
    this.assertReadyForWageGeneration(record);
    await this.assertStoredFileExists(record);

    const activeRows = (await this.prisma.attendanceRow.findMany({
      where: { attendanceImportId: id, deletedAt: null },
      orderBy: [{ workDate: 'asc' }, { rowKey: 'asc' }],
    })) as AttendanceRowRecord[];
    const normalizedInputPath = await this.writeActiveGenerationInput(
      record,
      activeRows,
    );
    const generationRevision = record.dataRevision;

    const generatedById = auditUserId(actor);
    let payload: WorkerWagePayload;
    try {
      payload = await this.workerAttendance.generateWageRecord(
        record.storedPath,
        join(this.storageRoot, 'attendance_imports', id),
        normalizedInputPath,
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

    const generationCommit = await this.prisma.$transaction(async (tx) => {
      await this.lockAttendanceImport(tx, id);
      const current = (await tx.attendanceImport.findUnique({
        where: { id },
      })) as AttendanceImportRecord | null;
      if (!current || current.dataRevision !== generationRevision) {
        const stale = await this.createGeneratedFileWithClient(tx, {
          attendanceImportId: id,
          fileType: WageGeneratedFileType.WAGE_RECORD_XLS,
          storagePath: wageRecordPath,
          mimeType: 'application/vnd.ms-excel',
          generatedById,
          status: GeneratedFileStatus.SUPERSEDED,
          errorMessage: 'ATTENDANCE_DATA_REVISION_CHANGED',
        });
        if (taskReport) {
          await tx.wageGeneratedFile.update({
            where: { id: taskReport.id },
            data: { status: GeneratedFileStatus.SUPERSEDED },
          });
        }
        return { stale: true as const, generatedFile: stale };
      }
      return {
        stale: false as const,
        generatedFile: await this.createGeneratedFileWithClient(tx, {
          attendanceImportId: id,
          fileType: WageGeneratedFileType.WAGE_RECORD_XLS,
          storagePath: wageRecordPath,
          mimeType: 'application/vnd.ms-excel',
          generatedById,
          status: GeneratedFileStatus.GENERATED,
          errorMessage: null,
        }),
      };
    });
    if (generationCommit.stale) {
      throw new ConflictException({
        code: 'ATTENDANCE_DATA_REVISION_CHANGED',
        message: 'Attendance data changed while the wage record was being generated.',
        details: {
          attendanceImportId: id,
          generatedFileId: generationCommit.generatedFile.id,
        },
      });
    }
    const generatedFile = generationCommit.generatedFile;

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
      await this.lockAttendanceImport(tx, record.id);
      const rows = this.attendanceRows(record.id, parsedResult?.days ?? []);
      if (parseStatus !== ParseStatus.ERROR) {
        await tx.attendanceRow.deleteMany({
          where: { attendanceImportId: record.id, deletedAt: null },
        });
        if (rows.length > 0) {
          await tx.attendanceRow.createMany({ data: rows, skipDuplicates: true });
        }
      }

      const activeSummary =
        parseStatus === ParseStatus.ERROR
          ? null
          : {
              ...this.activeAttendanceSummary(
                (await tx.attendanceRow.findMany({
                  where: { attendanceImportId: record.id, deletedAt: null },
                })) as AttendanceRowRecord[],
              ),
              warningCount: warnings.length,
              errorCount: errors.length,
            };

      await tx.attendanceImport.update({
        where: { id: record.id },
        data: {
          parseStatus,
          parserVersion,
          settlementMonth: this.settlementMonth(periodStart),
          periodStart,
          periodEnd,
          ...(activeSummary ?? {
            employeeCount: this.intValue(payload.employee_count),
            dayCount: rows.length,
            warningCount: warnings.length,
            errorCount: errors.length,
          }),
          errorMessage:
            parseStatus === ParseStatus.ERROR
              ? this.firstIssueMessage(errors, payload)
              : null,
          ...(parseStatus === ParseStatus.ERROR
            ? {}
            : { dataRevision: { increment: 1 } }),
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

      if (parseStatus !== ParseStatus.ERROR) {
        await tx.wageGeneratedFile.updateMany({
          where: {
            attendanceImportId: record.id,
            status: GeneratedFileStatus.GENERATED,
            fileType: {
              in: [
                WageGeneratedFileType.WAGE_RECORD_XLS,
                WageGeneratedFileType.TASK_REPORT_HTML,
              ],
            },
          },
          data: { status: GeneratedFileStatus.SUPERSEDED },
        });
      }

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
      this.throwImportNotFound(id);
    }

    return record;
  }

  private throwImportNotFound(id: string): never {
    throw new NotFoundException({
      code: 'ATTENDANCE_IMPORT_NOT_FOUND',
      message: `Attendance import ${id} was not found.`,
      details: { id },
    });
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

  private async lockAttendanceImport(
    tx: Prisma.TransactionClient,
    attendanceImportId: string,
  ): Promise<void> {
    const queryRawUnsafe = (
      tx as unknown as {
        $queryRawUnsafe?: (query: string, ...values: unknown[]) => Promise<unknown>;
      }
    ).$queryRawUnsafe;
    if (queryRawUnsafe) {
      await queryRawUnsafe.call(
        tx,
        'SELECT id FROM attendance_imports WHERE id = $1 FOR UPDATE',
        attendanceImportId,
      );
    }
  }

  private async assertNoActiveAttendanceJob(
    tx: Prisma.TransactionClient,
    attendanceImportId: string,
  ): Promise<void> {
    const activeJob = await tx.asyncJob.findFirst({
      where: {
        attendanceImportId,
        jobType: {
          in: [
            AsyncJobType.ATTENDANCE_PARSE,
            AsyncJobType.WAGE_RECORD_GENERATION,
          ],
        },
        status: { in: [AsyncJobStatus.QUEUED, AsyncJobStatus.RUNNING] },
      },
      select: { id: true, jobType: true, status: true },
    });
    if (activeJob) {
      throw new ConflictException({
        code: 'ATTENDANCE_IMPORT_BUSY',
        message: 'Attendance rows cannot be deleted while an attendance job is active.',
        details: {
          attendanceImportId,
          jobId: activeJob.id,
          jobType: activeJob.jobType,
          status: activeJob.status,
        },
      });
    }
  }

  private async writeActiveGenerationInput(
    record: AttendanceImportRecord,
    rows: AttendanceRowRecord[],
  ): Promise<string> {
    const targetDir = join(
      this.storageRoot,
      'attendance_imports',
      record.id,
      'generation_inputs',
    );
    await mkdir(targetDir, { recursive: true });
    const targetPath = join(
      targetDir,
      `active-rows-revision-${record.dataRevision}.json`,
    );
    const days = rows.map((row) => ({
      ...(row.rawJson && typeof row.rawJson === 'object' ? row.rawJson : {}),
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      department: row.department,
      workDate: this.dateResponse(row.workDate),
      dayNumber: row.dayNumber,
      punchTimes: row.punchTimes,
      calculationMethod: row.calculationMethod,
      workIntervals: row.workIntervals,
      pairedGrossHours: this.decimalResponse(row.pairedGrossHours),
      lunchHours: this.decimalResponse(row.lunchHours),
      calculatedHours: this.decimalResponse(row.calculatedHours),
      firstPunch: row.firstPunch,
      lastPunch: row.lastPunch,
      warnings: row.warnings ?? [],
      errors: row.errors ?? [],
    }));
    const payload = {
      schemaVersion: 1,
      source: 'PERSISTED_ACTIVE_ATTENDANCE_ROWS',
      attendanceImportId: record.id,
      dataRevision: record.dataRevision,
      originalFilename: record.originalFilename,
      sourceSha256: record.fileSha256,
      parsedResult: {
        formatType: 'WAGE_ATTENDANCE',
        parserVersion: record.parserVersion,
        sourceSheet: this.rawMetadataValue(record.rawMetadata, 'parsedResultMetadata', 'sourceSheet'),
        periodStart: this.dateResponse(record.periodStart),
        periodEnd: this.dateResponse(record.periodEnd),
        confidence: this.rawMetadataValue(record.rawMetadata, 'parsedResultMetadata', 'confidence') ?? 1,
        employees: this.activeEmployeeSummaries(rows),
        days,
        rawRows: [],
        warnings: rows.flatMap((row) => this.issueArray(row.warnings)),
        errors: rows.flatMap((row) => this.issueArray(row.errors)),
        assumptions: ['Generation uses server-persisted active attendance rows.'],
      },
    };
    await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return targetPath;
  }

  private activeEmployeeSummaries(rows: AttendanceRowRecord[]): unknown[] {
    const groups = new Map<string, AttendanceRowRecord[]>();
    for (const row of rows) {
      const key = `${row.employeeId ?? ''}\u0000${row.employeeName ?? ''}\u0000${row.department ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()].map((employeeRows) => ({
      employeeId: employeeRows[0]?.employeeId ?? null,
      employeeName: employeeRows[0]?.employeeName ?? null,
      department: employeeRows[0]?.department ?? null,
      dayCount: employeeRows.length,
      workedDayCount: employeeRows.filter(
        (row) => Number(row.calculatedHours?.toString() ?? 0) > 0,
      ).length,
      reviewDayCount: employeeRows.filter(
        (row) =>
          this.issueArray(row.warnings).length > 0 ||
          this.issueArray(row.errors).length > 0,
      ).length,
      totalCalculatedHours: Number(
        employeeRows
          .reduce(
            (sum, row) =>
              sum + Number(row.calculatedHours?.toString() ?? 0),
            0,
          )
          .toFixed(2),
      ),
    }));
  }

  private activeAttendanceSummary(rows: AttendanceRowRecord[]): {
    employeeCount: number;
    dayCount: number;
    warningCount: number;
    errorCount: number;
  } {
    const employees = new Set(
      rows.map(
        (row) =>
          `${row.employeeId ?? ''}\u0000${row.employeeName ?? ''}\u0000${row.department ?? ''}`,
      ),
    );
    return {
      employeeCount: employees.size,
      dayCount: rows.length,
      warningCount: rows.reduce(
        (count, row) => count + this.issueArray(row.warnings).length,
        0,
      ),
      errorCount: rows.reduce(
        (count, row) => count + this.issueArray(row.errors).length,
        0,
      ),
    };
  }

  private rawMetadataValue(
    value: unknown,
    parent: string,
    key: string,
  ): unknown {
    if (!value || typeof value !== 'object') return null;
    const nested = (value as Record<string, unknown>)[parent];
    if (!nested || typeof nested !== 'object') return null;
    return (nested as Record<string, unknown>)[key] ?? null;
  }

  private rowAuditSnapshot(row: AttendanceRowRecord): Record<string, unknown> {
    return {
      rowKey: row.rowKey,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      department: row.department,
      workDate: this.dateResponse(row.workDate),
      dayNumber: row.dayNumber,
      punchTimes: row.punchTimes,
      calculationMethod: row.calculationMethod,
      workIntervals: row.workIntervals,
      pairedGrossHours: this.decimalResponse(row.pairedGrossHours),
      lunchHours: this.decimalResponse(row.lunchHours),
      calculatedHours: this.decimalResponse(row.calculatedHours),
      firstPunch: row.firstPunch,
      lastPunch: row.lastPunch,
      rawJson: row.rawJson,
      warnings: row.warnings,
      errors: row.errors,
    };
  }

  private actorDisplaySnapshot(actor: AuthenticatedUser): string {
    return actor.name?.trim() || actor.email?.trim() || actor.id;
  }

  private toAuditEventResponse(
    event: AttendanceRowAuditEventRecord,
  ): AttendanceRowAuditEventResponseDto {
    return {
      id: event.id,
      eventCode: 'DELETED',
      attendanceImportId: event.attendanceImportId,
      attendanceRowId: event.attendanceRowId,
      rowKey: event.rowKey,
      employeeId: event.employeeId,
      employeeName: event.employeeName,
      department: event.department,
      workDate: this.dateResponse(event.workDate) ?? this.toIsoString(event.workDate),
      rowSnapshot: event.rowSnapshot,
      actor: {
        id: event.actorUserId,
        displayLabel: event.actorDisplaySnapshot,
      },
      reason: event.reason,
      occurredAt: this.toIsoString(event.occurredAt),
    };
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
      dataRevision: record.dataRevision ?? 0,
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
