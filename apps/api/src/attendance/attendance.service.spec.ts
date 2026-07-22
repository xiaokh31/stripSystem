import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AttendanceService } from './attendance.service';
import { WorkerWagePayload } from './worker-attendance.service';

describe('AttendanceService', () => {
  const officeActor = {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: [
      'attendance.create',
      'attendance.parse',
      'attendance.generate',
    ],
  };
  const fixturePath = resolve(
    process.cwd(),
    '..',
    '..',
    'samples',
    'wage',
    'workAttendanceRecordForm_June.xls',
  );

  let storageRoot: string;
  let prisma: any;
  let workerAttendance: {
    parseAttendance: jest.Mock;
    generateWageRecord: jest.Mock;
  };
  let service: AttendanceService;
  let importRecord: any;
  let rowRecords: any[];
  let generatedFiles: any[];
  let auditEvents: any[];

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'attendance-service-'));
    importRecord = undefined;
    rowRecords = [];
    generatedFiles = [];
    auditEvents = [];
    prisma = {
      $transaction: jest.fn(async (callback) => {
        const importSnapshot = importRecord
          ? structuredClone(importRecord)
          : undefined;
        const rowSnapshot = structuredClone(rowRecords);
        const generatedFileSnapshot = structuredClone(generatedFiles);
        const auditEventSnapshot = structuredClone(auditEvents);
        try {
          return await callback(prisma);
        } catch (error) {
          importRecord = importSnapshot;
          rowRecords = rowSnapshot;
          generatedFiles = generatedFileSnapshot;
          auditEvents = auditEventSnapshot;
          throw error;
        }
      }),
      attendanceImport: {
        findUnique: jest.fn(({ where }) => {
          if (
            where.fileSha256 &&
            importRecord?.fileSha256 === where.fileSha256
          ) {
            return Promise.resolve(importRecord);
          }
          if (where.id && importRecord?.id === where.id) {
            return Promise.resolve(importRecord);
          }
          return Promise.resolve(null);
        }),
        create: jest.fn(({ data }) => {
          importRecord = {
            id: 'attendance-import-1',
            ...data,
            parserVersion: null,
            settlementMonth: null,
            periodStart: null,
            periodEnd: null,
            employeeCount: 0,
            dayCount: 0,
            dataRevision: 0,
            rawMetadata: null,
            createdAt: new Date('2026-07-04T10:00:00.000Z'),
            updatedAt: new Date('2026-07-04T10:00:00.000Z'),
          };
          return Promise.resolve(importRecord);
        }),
        findMany: jest.fn(() =>
          Promise.resolve(importRecord ? [importRecord] : []),
        ),
        update: jest.fn(({ data }) => {
          importRecord = {
            ...importRecord,
            ...data,
            dataRevision:
              data.dataRevision?.increment !== undefined
                ? (importRecord.dataRevision ?? 0) + data.dataRevision.increment
                : (data.dataRevision ?? importRecord.dataRevision ?? 0),
            updatedAt: new Date('2026-07-04T10:05:00.000Z'),
          };
          return Promise.resolve(importRecord);
        }),
      },
      attendanceRow: {
        deleteMany: jest.fn(() => {
          const active = rowRecords.filter((row) => !row.deletedAt);
          rowRecords = rowRecords.filter((row) => row.deletedAt);
          const count = active.length;
          return Promise.resolve({ count });
        }),
        createMany: jest.fn(({ data }) => {
          const created = data
            .filter(
              (row: any) =>
                !rowRecords.some(
                  (existing) =>
                    existing.attendanceImportId === row.attendanceImportId &&
                    existing.rowKey === row.rowKey,
                ),
            )
            .map((row: any, index: number) => ({
              id: `attendance-row-${rowRecords.length + index + 1}`,
              deletedAt: null,
              deletedById: null,
              deletionReason: null,
              ...row,
            }));
          rowRecords.push(...created);
          return Promise.resolve({ count: created.length });
        }),
        findMany: jest.fn(({ where } = { where: {} }) =>
          Promise.resolve(
            rowRecords.filter(
              (row) =>
                (!where.attendanceImportId ||
                  row.attendanceImportId === where.attendanceImportId) &&
                (where.deletedAt === null ? !row.deletedAt : true),
            ),
          ),
        ),
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            rowRecords.find(
              (row) =>
                row.id === where.id &&
                row.attendanceImportId === where.attendanceImportId,
            ) ?? null,
          ),
        ),
        update: jest.fn(({ where, data }) => {
          const row = rowRecords.find((item) => item.id === where.id);
          Object.assign(row, data);
          return Promise.resolve(row);
        }),
        count: jest.fn(({ where }) =>
          Promise.resolve(
            rowRecords.filter(
              (row) =>
                row.attendanceImportId === where.attendanceImportId &&
                (where.deletedAt === null
                  ? !row.deletedAt
                  : where.deletedAt?.not === null
                    ? Boolean(row.deletedAt)
                    : true),
            ).length,
          ),
        ),
      },
      attendanceRowAuditEvent: {
        create: jest.fn(({ data }) => {
          const event = { id: `audit-${auditEvents.length + 1}`, ...data };
          auditEvents.push(event);
          return Promise.resolve(event);
        }),
        findUnique: jest.fn(({ where }) => {
          const key = where.attendanceImportId_rowKey_eventCode;
          return Promise.resolve(
            auditEvents.find(
              (event) =>
                event.attendanceImportId === key.attendanceImportId &&
                event.rowKey === key.rowKey &&
                event.eventCode === key.eventCode,
            ) ?? null,
          );
        }),
        findMany: jest.fn(({ take, skip } = { take: 50, skip: 0 }) =>
          Promise.resolve(
            [...auditEvents]
              .reverse()
              .slice(skip ?? 0, (skip ?? 0) + (take ?? auditEvents.length)),
          ),
        ),
        count: jest.fn(() => Promise.resolve(auditEvents.length)),
      },
      asyncJob: {
        findFirst: jest.fn(() => Promise.resolve(null)),
      },
      wageGeneratedFile: {
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            generatedFiles.find(
              (file) =>
                file.id === where.id &&
                file.attendanceImportId === where.attendanceImportId,
            ) ?? null,
          ),
        ),
        create: jest.fn(({ data }) => {
          const record = {
            id: `wage-file-${generatedFiles.length + 1}`,
            unloadingWageSettlementId: null,
            ...data,
            createdAt: new Date('2026-07-04T10:06:00.000Z'),
            updatedAt: new Date('2026-07-04T10:06:00.000Z'),
          };
          generatedFiles.push(record);
          return Promise.resolve(record);
        }),
        findMany: jest.fn(() => Promise.resolve(generatedFiles)),
        updateMany: jest.fn(({ where, data }) => {
          const ids = where.id?.in as string[] | undefined;
          let count = 0;
          for (const file of generatedFiles) {
            if (!ids || ids.includes(file.id)) {
              Object.assign(file, data);
              count += 1;
            }
          }
          return Promise.resolve({ count });
        }),
        update: jest.fn(({ where, data }) => {
          const file = generatedFiles.find((item) => item.id === where.id);
          Object.assign(file, data);
          return Promise.resolve(file);
        }),
      },
    };
    workerAttendance = {
      parseAttendance: jest.fn(),
      generateWageRecord: jest.fn(),
    };
    service = new AttendanceService(
      prisma,
      {
        getOrThrow: jest.fn((key: string) => {
          if (key === 'app.storageRoot') {
            return storageRoot;
          }
          throw new Error(`Unexpected config key ${key}`);
        }),
      } as unknown as ConfigService,
      workerAttendance as never,
    );
  });

  it('preserves a real xls fixture and writes attendance import metadata', async () => {
    const file = await loadFixtureFile();
    const expectedSha256 = createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    const response = await service.importFile(file, officeActor);

    expect(response).toMatchObject({
      id: 'attendance-import-1',
      originalFilename: 'workAttendanceRecordForm_June.xls',
      fileSha256: expectedSha256,
      importStatus: 'UPLOADED',
      parseStatus: 'NOT_PARSED',
    });
    expect(response.storedPath).toContain(
      join('attendance_original_files', expectedSha256),
    );
    await expect(stat(response.storedPath)).resolves.toBeDefined();
    await expect(readFile(response.storedPath)).resolves.toEqual(file.buffer);
    expect(importRecord.importedById).toBe('auth-office');
    expect(workerAttendance.parseAttendance).not.toHaveBeenCalled();
    expect(workerAttendance.generateWageRecord).not.toHaveBeenCalled();
  });

  it('rejects duplicate attendance uploads before writing metadata', async () => {
    const file = await loadFixtureFile();
    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    importRecord = {
      id: 'existing-attendance-import',
      originalFilename: file.originalname,
      fileSha256,
    };

    await expect(service.importFile(file, officeActor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.attendanceImport.create).not.toHaveBeenCalled();
  });

  it('returns list and detail import state without parsing', async () => {
    const file = await loadFixtureFile();
    const uploaded = await service.importFile(file, officeActor);

    const list = await service.list({ limit: 25, offset: 0 });
    const detail = await service.getById(uploaded.id);

    expect(list).toMatchObject({
      limit: 25,
      offset: 0,
      items: [
        {
          id: uploaded.id,
          importStatus: 'UPLOADED',
          parseStatus: 'NOT_PARSED',
          warningCount: 0,
          errorCount: 0,
        },
      ],
    });
    expect(detail).toMatchObject({
      id: uploaded.id,
      originalFilename: 'workAttendanceRecordForm_June.xls',
      importStatus: 'UPLOADED',
      parseStatus: 'NOT_PARSED',
      warningCount: 0,
      errorCount: 0,
    });
  });

  it('returns duplicate conflict when a concurrent insert hits the SHA unique key', async () => {
    const file = await loadFixtureFile();
    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');
    prisma.attendanceImport.create.mockImplementationOnce(() => {
      importRecord = {
        id: 'race-attendance-import',
        originalFilename: file.originalname,
        fileSha256,
      };
      const error = new Error('Unique constraint failed') as Error & {
        code: string;
      };
      error.code = 'P2002';
      return Promise.reject(error);
    });

    await expect(service.importFile(file, officeActor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects non-xls uploads', async () => {
    const file = {
      originalname: 'attendance.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 4,
      buffer: Buffer.from('xlsx'),
    } as Express.Multer.File;

    await expect(service.importFile(file, officeActor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.attendanceImport.findUnique).not.toHaveBeenCalled();
  });

  it('rejects xls filenames whose bytes are not legacy Excel workbook bytes', async () => {
    const file = {
      originalname: 'attendance.xls',
      mimetype: 'application/vnd.ms-excel',
      size: 12,
      buffer: Buffer.from('not real xls'),
    } as Express.Multer.File;

    await expect(service.importFile(file, officeActor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.attendanceImport.findUnique).not.toHaveBeenCalled();
  });

  it('persists worker parse rows and generated parse artifacts', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    const parsedJsonPath = join(storageRoot, 'parsed.json');
    const taskReportPath = join(storageRoot, 'report.html');
    await writeFile(parsedJsonPath, '{"ok": true}', 'utf8');
    await writeFile(taskReportPath, '<html></html>', 'utf8');
    workerAttendance.parseAttendance.mockResolvedValue(
      parsePayload(parsedJsonPath, taskReportPath),
    );

    const response = await service.parse(importRecord.id);

    expect(workerAttendance.parseAttendance).toHaveBeenCalledWith(
      importRecord.storedPath,
      join(storageRoot, 'attendance_imports', importRecord.id),
    );
    expect(response.attendanceImport).toMatchObject({
      parseStatus: 'WARNING',
      parserVersion: 'wage-attendance-v2',
      settlementMonth: '2026-06',
      employeeCount: 1,
      dayCount: 1,
      warningCount: 1,
      errorCount: 0,
    });
    expect(response.rows).toHaveLength(1);
    expect(response.rows[0]).toMatchObject({
      employeeId: 'E-001',
      employeeName: 'Test Worker',
      workDate: '2026-06-01',
      calculatedHours: '7.50',
      lunchHours: '0.50',
      calculationMethod: 'PAIRED_INTERVALS',
      workIntervals: [
        { start: '08:00', end: '16:00', minutes: 480, hours: 8 },
      ],
    });
    expect(generatedFiles.map((file) => file.fileType)).toEqual([
      'ATTENDANCE_PARSED_JSON',
      'TASK_REPORT_HTML',
    ]);
    expect(workerAttendance.generateWageRecord).not.toHaveBeenCalled();
  });

  it('rebuilds attendance rows on repeat parse without duplicating rows', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    const parsedJsonPath = join(storageRoot, 'repeat-parsed.json');
    const taskReportPath = join(storageRoot, 'repeat-report.html');
    await writeFile(parsedJsonPath, '{"ok": true}', 'utf8');
    await writeFile(taskReportPath, '<html></html>', 'utf8');
    const firstPayload = parsePayload(parsedJsonPath, taskReportPath);
    const secondPayload = parsePayload(parsedJsonPath, taskReportPath);
    secondPayload.employee_count = 2;
    secondPayload.day_count = 2;
    secondPayload.parsed_result?.days?.push({
      employeeId: 'E-002',
      employeeName: 'Second Worker',
      department: 'Warehouse',
      workDate: '2026-06-02',
      dayNumber: 2,
      punchTimes: ['09:00', '17:00'],
      calculationMethod: 'PAIRED_INTERVALS',
      workIntervals: [
        { start: '09:00', end: '17:00', minutes: 480, hours: 8 },
      ],
      pairedGrossHours: 8,
      lunchHours: 0.5,
      calculatedHours: 7.5,
      firstPunch: '09:00',
      lastPunch: '17:00',
      rawCellValues: ['09:00', '17:00'],
      rowNumbers: [12, 13],
      warnings: [],
      errors: [],
    });
    workerAttendance.parseAttendance
      .mockResolvedValueOnce(firstPayload)
      .mockResolvedValueOnce(secondPayload);

    await service.parse(importRecord.id);
    const response = await service.parse(importRecord.id);

    expect(prisma.attendanceRow.deleteMany).toHaveBeenCalledTimes(2);
    expect(response.attendanceImport).toMatchObject({
      employeeCount: 2,
      dayCount: 2,
    });
    expect(response.rows).toHaveLength(2);
    expect(rowRecords).toHaveLength(2);
    expect(new Set(rowRecords.map((row) => row.rowKey)).size).toBe(2);
  });

  it('persists parser error status and generated diagnostics before returning an API error', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    const parsedJsonPath = join(storageRoot, 'error-parsed.json');
    const taskReportPath = join(storageRoot, 'error-report.html');
    await writeFile(parsedJsonPath, '{"ok": false}', 'utf8');
    await writeFile(taskReportPath, '<html></html>', 'utf8');
    const payload = parsePayload(parsedJsonPath, taskReportPath);
    payload.task_status = 'ERROR';
    payload.employee_count = 0;
    payload.day_count = 0;
    payload.parsed_result!.days = [];
    payload.errors = [
      {
        code: 'ATTENDANCE_PARSE_ERROR',
        message: 'Workbook layout is unsupported.',
      },
    ];
    payload.warnings = [];
    workerAttendance.parseAttendance.mockResolvedValue(payload);

    await expect(service.parse(importRecord.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(importRecord).toMatchObject({
      parseStatus: 'ERROR',
      errorCount: 1,
      warningCount: 0,
      errorMessage: 'Workbook layout is unsupported.',
    });
    expect(rowRecords).toHaveLength(0);
    expect(generatedFiles.map((file) => file.fileType)).toEqual([
      'ATTENDANCE_PARSED_JSON',
      'TASK_REPORT_HTML',
    ]);
  });

  it('marks parse status as error when the worker invocation fails without clearing the original file', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    const originalStoredPath = importRecord.storedPath;
    workerAttendance.parseAttendance.mockRejectedValue(new Error('uv failed'));

    await expect(service.parse(importRecord.id)).rejects.toThrow('uv failed');

    expect(importRecord).toMatchObject({
      storedPath: originalStoredPath,
      parseStatus: 'ERROR',
      errorCount: 1,
      errorMessage: 'uv failed',
    });
    expect(rowRecords).toHaveLength(0);
    expect(generatedFiles).toHaveLength(0);
  });

  it('records generated wage record and task report files', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    markParsedImport();
    const wageRecordPath = join(storageRoot, 'wage-record.xls');
    const taskReportPath = join(storageRoot, 'wage-report.html');
    await writeFile(wageRecordPath, 'xls', 'utf8');
    await writeFile(taskReportPath, '<html></html>', 'utf8');
    workerAttendance.generateWageRecord.mockResolvedValue(
      generatePayload(wageRecordPath, taskReportPath),
    );

    const response = await service.generateWageRecord(
      importRecord.id,
      officeActor,
    );

    expect(workerAttendance.generateWageRecord).toHaveBeenCalledWith(
      importRecord.storedPath,
      join(storageRoot, 'attendance_imports', importRecord.id),
      join(
        storageRoot,
        'attendance_imports',
        importRecord.id,
        'generation_inputs',
        'active-rows-revision-0.json',
      ),
    );
    expect(response.generatedFile).toMatchObject({
      fileType: 'WAGE_RECORD_XLS',
      status: 'GENERATED',
      storagePath: wageRecordPath,
    });
    expect(response.taskReport).toMatchObject({
      fileType: 'TASK_REPORT_HTML',
      storagePath: taskReportPath,
    });
    expect(generatedFiles).toHaveLength(2);
    expect(generatedFiles[0]).toMatchObject({
      generatedById: 'auth-office',
      status: 'GENERATED',
    });
  });

  it('soft deletes idempotently, preserves the actor snapshot on reparse, and generates from active rows only', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    const firstParsedJson = join(storageRoot, 'first-parsed.json');
    const firstReport = join(storageRoot, 'first-report.html');
    await writeFile(firstParsedJson, '{}', 'utf8');
    await writeFile(firstReport, '<html></html>', 'utf8');
    workerAttendance.parseAttendance.mockResolvedValue(
      parsePayload(firstParsedJson, firstReport),
    );
    await service.parse(importRecord.id);
    const deletedRow = rowRecords[0];

    const firstDelete = await service.deleteRow(
      importRecord.id,
      deletedRow.id,
      'Incorrect employee-day record',
      officeActor,
    );
    const repeatedDelete = await service.deleteRow(
      importRecord.id,
      deletedRow.id,
      'A different reason must not replace history',
      { ...officeActor, name: 'Renamed Office User' },
    );

    expect(firstDelete).toMatchObject({
      code: 'ATTENDANCE_ROW_DELETED',
      deleted: true,
      activeRowCount: 0,
      deletedRowCount: 1,
      event: {
        actor: { id: officeActor.id, displayLabel: 'Office User' },
        reason: 'Incorrect employee-day record',
      },
    });
    expect(repeatedDelete).toMatchObject({
      code: 'ATTENDANCE_ROW_ALREADY_DELETED',
      alreadyDeleted: true,
      event: {
        actor: { displayLabel: 'Office User' },
        reason: 'Incorrect employee-day record',
      },
    });
    expect(auditEvents).toHaveLength(1);

    const secondParsedJson = join(storageRoot, 'second-parsed.json');
    const secondReport = join(storageRoot, 'second-report.html');
    await writeFile(secondParsedJson, '{}', 'utf8');
    await writeFile(secondReport, '<html></html>', 'utf8');
    workerAttendance.parseAttendance.mockResolvedValue(
      parsePayload(secondParsedJson, secondReport),
    );
    const reparsed = await service.parse(importRecord.id);
    expect(reparsed).toMatchObject({ activeRowCount: 0, deletedRowCount: 1 });
    expect(auditEvents).toHaveLength(1);
    expect(rowRecords).toHaveLength(1);
    expect(rowRecords[0].deletedAt).toEqual(expect.any(Date));

    const wageRecordPath = join(storageRoot, 'active-only.xls');
    const wageReportPath = join(storageRoot, 'active-only.html');
    await writeFile(wageRecordPath, 'xls', 'utf8');
    await writeFile(wageReportPath, '<html></html>', 'utf8');
    workerAttendance.generateWageRecord.mockResolvedValue(
      generatePayload(wageRecordPath, wageReportPath),
    );
    await service.generateWageRecord(importRecord.id, officeActor);
    const normalizedInputPath = workerAttendance.generateWageRecord.mock.calls.at(-1)?.[2];
    const normalizedInput = JSON.parse(
      await readFile(normalizedInputPath, 'utf8'),
    ) as { source: string; parsedResult: { days: unknown[] } };
    expect(normalizedInput).toMatchObject({
      source: 'PERSISTED_ACTIVE_ATTENDANCE_ROWS',
      parsedResult: { days: [] },
    });
  });

  it('rolls back the tombstone when the immutable audit event cannot be written', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    const parsedJsonPath = join(storageRoot, 'rollback-parsed.json');
    const taskReportPath = join(storageRoot, 'rollback-report.html');
    await writeFile(parsedJsonPath, '{}', 'utf8');
    await writeFile(taskReportPath, '<html></html>', 'utf8');
    workerAttendance.parseAttendance.mockResolvedValue(
      parsePayload(parsedJsonPath, taskReportPath),
    );
    await service.parse(importRecord.id);
    const baselineRevision = importRecord.dataRevision;
    const rowId = rowRecords[0].id;
    prisma.attendanceRowAuditEvent.create.mockRejectedValueOnce(
      new Error('audit insert failed'),
    );

    await expect(
      service.deleteRow(importRecord.id, rowId, 'Must roll back', officeActor),
    ).rejects.toThrow('audit insert failed');

    expect(rowRecords[0]).toMatchObject({
      id: rowId,
      deletedAt: null,
      deletionReason: null,
    });
    expect(auditEvents).toHaveLength(0);
    expect(importRecord.dataRevision).toBe(baselineRevision);
  });

  it('rejects deletion with a stable busy code while an attendance job is active', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    const parsedJsonPath = join(storageRoot, 'busy-parsed.json');
    const taskReportPath = join(storageRoot, 'busy-report.html');
    await writeFile(parsedJsonPath, '{}', 'utf8');
    await writeFile(taskReportPath, '<html></html>', 'utf8');
    workerAttendance.parseAttendance.mockResolvedValue(
      parsePayload(parsedJsonPath, taskReportPath),
    );
    await service.parse(importRecord.id);
    prisma.asyncJob.findFirst.mockResolvedValueOnce({
      id: 'active-job',
      jobType: 'WAGE_RECORD_GENERATION',
      status: 'RUNNING',
    });

    await expect(
      service.deleteRow(
        importRecord.id,
        rowRecords[0].id,
        'Blocked by active job',
        officeActor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'ATTENDANCE_IMPORT_BUSY' },
    });
    expect(rowRecords[0].deletedAt).toBeNull();
    expect(auditEvents).toHaveLength(0);
  });

  it('preserves tombstone history when a later parse returns an error', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    const parsedJsonPath = join(storageRoot, 'preserve-parsed.json');
    const taskReportPath = join(storageRoot, 'preserve-report.html');
    await writeFile(parsedJsonPath, '{}', 'utf8');
    await writeFile(taskReportPath, '<html></html>', 'utf8');
    workerAttendance.parseAttendance.mockResolvedValue(
      parsePayload(parsedJsonPath, taskReportPath),
    );
    await service.parse(importRecord.id);
    const rowId = rowRecords[0].id;
    await service.deleteRow(
      importRecord.id,
      rowId,
      'Preserve this durable tombstone',
      officeActor,
    );

    const failedPayload = parsePayload(parsedJsonPath, taskReportPath);
    failedPayload.task_status = 'ERROR';
    failedPayload.errors = [
      { code: 'ATTENDANCE_PARSE_ERROR', message: 'Fixture parse failed.' },
    ];
    workerAttendance.parseAttendance.mockResolvedValueOnce(failedPayload);

    await expect(service.parse(importRecord.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(rowRecords).toHaveLength(1);
    expect(rowRecords[0]).toMatchObject({
      id: rowId,
      deletionReason: 'Preserve this durable tombstone',
    });
    expect(rowRecords[0].deletedAt).toEqual(expect.any(Date));
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actorDisplaySnapshot: 'Office User',
      reason: 'Preserve this durable tombstone',
    });
  });

  it('returns immutable deletion history newest-first with bounded pagination', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    const parsedJsonPath = join(storageRoot, 'history-parsed.json');
    const taskReportPath = join(storageRoot, 'history-report.html');
    await writeFile(parsedJsonPath, '{}', 'utf8');
    await writeFile(taskReportPath, '<html></html>', 'utf8');
    const payload = parsePayload(parsedJsonPath, taskReportPath);
    payload.parsed_result!.days!.push({
      ...payload.parsed_result!.days![0],
      employeeId: 'E-002',
      employeeName: 'Second Worker',
      rowNumbers: [20, 21],
      workDate: '2026-06-02',
      dayNumber: 2,
    });
    workerAttendance.parseAttendance.mockResolvedValue(payload);
    await service.parse(importRecord.id);

    await service.deleteRow(
      importRecord.id,
      rowRecords[0].id,
      'First durable reason',
      officeActor,
    );
    await service.deleteRow(
      importRecord.id,
      rowRecords[1].id,
      'Newest durable reason',
      { ...officeActor, name: 'Renamed Office User' },
    );

    const firstPage = await service.listRowHistory(importRecord.id, {
      limit: 1,
      offset: 0,
    });
    const secondPage = await service.listRowHistory(importRecord.id, {
      limit: 1,
      offset: 1,
    });

    expect(firstPage).toMatchObject({
      limit: 1,
      offset: 0,
      total: 2,
      items: [
        {
          reason: 'Newest durable reason',
          actor: { displayLabel: 'Renamed Office User' },
        },
      ],
    });
    expect(secondPage).toMatchObject({
      limit: 1,
      offset: 1,
      total: 2,
      items: [
        {
          reason: 'First durable reason',
          actor: { displayLabel: 'Office User' },
        },
      ],
    });
    expect(prisma.attendanceRowAuditEvent.findMany).toHaveBeenLastCalledWith({
      where: { attendanceImportId: importRecord.id },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 1,
      skip: 1,
    });
  });

  it('commits generated artifacts as superseded when the data revision changes during generation', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    markParsedImport();
    const wageRecordPath = join(storageRoot, 'revision-race.xls');
    const taskReportPath = join(storageRoot, 'revision-race.html');
    await writeFile(wageRecordPath, 'stale xls', 'utf8');
    await writeFile(taskReportPath, '<html>stale</html>', 'utf8');
    workerAttendance.generateWageRecord.mockImplementation(async () => {
      importRecord.dataRevision += 1;
      return generatePayload(wageRecordPath, taskReportPath);
    });

    await expect(
      service.generateWageRecord(importRecord.id, officeActor),
    ).rejects.toMatchObject({
      response: { code: 'ATTENDANCE_DATA_REVISION_CHANGED' },
    });

    expect(generatedFiles).toHaveLength(2);
    expect(generatedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileType: 'TASK_REPORT_HTML',
          status: 'SUPERSEDED',
        }),
        expect.objectContaining({
          fileType: 'WAGE_RECORD_XLS',
          status: 'SUPERSEDED',
          errorMessage: 'ATTENDANCE_DATA_REVISION_CHANGED',
        }),
      ]),
    );
  });

  it('downloads a generated attendance wage file', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    markParsedImport();
    const wageRecordPath = join(storageRoot, 'wage-record.xls');
    const taskReportPath = join(storageRoot, 'wage-report.html');
    await writeFile(wageRecordPath, 'download xls', 'utf8');
    await writeFile(taskReportPath, '<html></html>', 'utf8');
    workerAttendance.generateWageRecord.mockResolvedValue(
      generatePayload(wageRecordPath, taskReportPath),
    );
    const generated = await service.generateWageRecord(
      importRecord.id,
      officeActor,
    );

    const download = await service.downloadFile(
      importRecord.id,
      generated.generatedFile.id,
    );

    expect(download.filename).toBe('wage-record.xls');
    expect(download.buffer.toString()).toBe('download xls');
    expect(download.mimeType).toBe('application/vnd.ms-excel');
  });

  it('rejects wage record generation before the attendance import has been parsed', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);

    await expect(
      service.generateWageRecord(importRecord.id, officeActor),
    ).rejects.toMatchObject({
      response: {
        code: 'ATTENDANCE_IMPORT_NOT_PARSED',
      },
    });

    expect(workerAttendance.generateWageRecord).not.toHaveBeenCalled();
    expect(generatedFiles).toHaveLength(0);
  });

  it('rejects wage record generation when parser errors are recorded', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    Object.assign(importRecord, {
      parseStatus: 'ERROR',
      errorCount: 1,
      errorMessage: 'Parser failed.',
    });

    await expect(
      service.generateWageRecord(importRecord.id, officeActor),
    ).rejects.toMatchObject({
      response: {
        code: 'ATTENDANCE_IMPORT_HAS_PARSE_ERRORS',
      },
    });

    expect(workerAttendance.generateWageRecord).not.toHaveBeenCalled();
    expect(generatedFiles).toHaveLength(0);
  });

  it('records a failed wage generated file when the worker invocation fails', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
    markParsedImport();
    workerAttendance.generateWageRecord.mockRejectedValue(
      new Error('worker crashed'),
    );

    await expect(
      service.generateWageRecord(importRecord.id, officeActor),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(generatedFiles).toHaveLength(1);
    expect(generatedFiles[0]).toMatchObject({
      attendanceImportId: importRecord.id,
      fileType: 'WAGE_RECORD_XLS',
      status: 'FAILED',
      errorMessage: 'worker crashed',
      generatedById: 'auth-office',
    });
  });

  async function loadFixtureFile(): Promise<Express.Multer.File> {
    const buffer = await readFile(fixturePath);
    return {
      originalname: 'workAttendanceRecordForm_June.xls',
      mimetype: 'application/vnd.ms-excel',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
  }

  function parsePayload(
    parsedJsonPath: string,
    taskReportPath: string,
  ): WorkerWagePayload {
    return {
      task_status: 'WARNING',
      source_file: importRecord.storedPath,
      sha256: importRecord.fileSha256,
      parsed_json_path: parsedJsonPath,
      task_report_path: taskReportPath,
      employee_count: 1,
      day_count: 1,
      parsed_result: {
        parserVersion: 'wage-attendance-v2',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        formatType: 'WAGE_ATTENDANCE',
        warnings: [],
        errors: [],
        days: [
          {
            employeeId: 'E-001',
            employeeName: 'Test Worker',
            department: 'Warehouse',
            workDate: '2026-06-01',
            dayNumber: 1,
            punchTimes: ['08:00', '16:00'],
            calculationMethod: 'PAIRED_INTERVALS',
            workIntervals: [
              { start: '08:00', end: '16:00', minutes: 480, hours: 8 },
            ],
            pairedGrossHours: 8,
            lunchHours: 0.5,
            calculatedHours: 7.5,
            firstPunch: '08:00',
            lastPunch: '16:00',
            rawCellValues: ['08:00', '16:00'],
            rowNumbers: [10, 11],
            warnings: [],
            errors: [],
          },
        ],
      },
      warnings: [{ code: 'REVIEW_DAY', message: 'Review one day.' }],
      errors: [],
    };
  }

  function generatePayload(
    wageRecordPath: string,
    taskReportPath: string,
  ): WorkerWagePayload {
    return {
      task_status: 'WARNING',
      wage_record_path: wageRecordPath,
      task_report_path: taskReportPath,
      wage_record_result: {
        outputPath: wageRecordPath,
        warnings: [{ code: 'UNMATCHED', message: 'One unmatched employee.' }],
        errors: [],
      },
      warnings: [{ code: 'UNMATCHED', message: 'One unmatched employee.' }],
      errors: [],
    };
  }

  function markParsedImport(): void {
    Object.assign(importRecord, {
      parseStatus: 'WARNING',
      parserVersion: 'wage-attendance-v2',
      settlementMonth: '2026-06',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-06-30T00:00:00.000Z'),
      employeeCount: 1,
      dayCount: 1,
      warningCount: 1,
      errorCount: 0,
      errorMessage: null,
    });
  }
});
