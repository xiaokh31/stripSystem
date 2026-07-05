import { BadRequestException, ConflictException } from '@nestjs/common';
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

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'attendance-service-'));
    importRecord = undefined;
    rowRecords = [];
    generatedFiles = [];
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
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
            updatedAt: new Date('2026-07-04T10:05:00.000Z'),
          };
          return Promise.resolve(importRecord);
        }),
      },
      attendanceRow: {
        deleteMany: jest.fn(() =>
          Promise.resolve({ count: rowRecords.length }),
        ),
        createMany: jest.fn(({ data }) => {
          rowRecords = data.map((row: any, index: number) => ({
            id: `attendance-row-${index + 1}`,
            ...row,
          }));
          return Promise.resolve({ count: rowRecords.length });
        }),
        findMany: jest.fn(() => Promise.resolve(rowRecords)),
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
      parserVersion: 'wage-attendance-v1',
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
    });
    expect(generatedFiles.map((file) => file.fileType)).toEqual([
      'ATTENDANCE_PARSED_JSON',
      'TASK_REPORT_HTML',
    ]);
  });

  it('records generated wage record and task report files', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
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
  });

  it('downloads a generated attendance wage file', async () => {
    const file = await loadFixtureFile();
    await service.importFile(file, officeActor);
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
        parserVersion: 'wage-attendance-v1',
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
});
