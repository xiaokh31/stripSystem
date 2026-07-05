import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  authorizedRequest,
  configureAuthTestEnv,
  installAuthMock,
  officeAuthHeader,
} from './auth-test-helpers';

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
  rawMetadata: unknown;
  importedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AttendanceRowRecord {
  id: string;
  attendanceImportId: string;
  rowKey: string;
  employeeId: string | null;
  employeeName: string | null;
  department: string | null;
  workDate: Date | string;
  dayNumber: number;
  punchTimes: unknown;
  pairedGrossHours: string | null;
  lunchHours: string;
  calculatedHours: string | null;
  firstPunch: string | null;
  lastPunch: string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
  createdAt: Date;
  updatedAt: Date;
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
  generatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AttendanceImportBody {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  settlementMonth: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  employeeCount: number;
  dayCount: number;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
}

interface AttendanceParseBody {
  attendanceImport: AttendanceImportBody;
  rows: Array<{
    rowKey: string;
    employeeId: string | null;
    employeeName: string | null;
    workDate: string;
    lunchHours: string;
    calculatedHours: string | null;
    rawJson: unknown;
    warnings: unknown;
    errors: unknown;
  }>;
  warnings: unknown[];
  errors: unknown[];
}

interface WageGeneratedFilesBody {
  items: Array<{
    id: string;
    attendanceImportId: string | null;
    fileType: string;
    storagePath: string;
    fileSha256: string | null;
    fileSizeBytes: string | null;
    status: string;
    errorMessage: string | null;
  }>;
}

interface FindUniqueArgs {
  where: {
    id?: string;
    fileSha256?: string;
  };
}

interface CreateAttendanceImportArgs {
  data: {
    originalFilename: string;
    storedPath: string;
    fileSha256: string;
    mimeType: string | null;
    fileSizeBytes: bigint | number | string | null;
    importStatus: string;
    parseStatus: string;
    warningCount: number;
    errorCount: number;
    errorMessage: string | null;
    importedById?: string | null;
  };
}

describe('AttendanceImportsController (e2e)', () => {
  const fixturePath = resolve(
    __dirname,
    '..',
    '..',
    '..',
    'samples',
    'wage',
    'workAttendanceRecordForm_June.xls',
  );

  let app: INestApplication<App>;
  let storageRoot: string;
  let attendanceImports: AttendanceImportRecord[];
  let attendanceRows: AttendanceRowRecord[];
  let wageGeneratedFiles: WageGeneratedFileRecord[];
  let prisma: any;
  let originalStorageRoot: string | undefined;

  beforeEach(async () => {
    configureAuthTestEnv();
    originalStorageRoot = process.env.STORAGE_ROOT;
    storageRoot = await mkdtemp(join(tmpdir(), 'attendance-imports-e2e-'));
    process.env.STORAGE_ROOT = storageRoot;
    attendanceImports = [];
    attendanceRows = [];
    wageGeneratedFiles = [];
    prisma = createPrismaMock(
      attendanceImports,
      attendanceRows,
      wageGeneratedFiles,
    );
    installAuthMock(prisma);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (originalStorageRoot === undefined) {
      delete process.env.STORAGE_ROOT;
    } else {
      process.env.STORAGE_ROOT = originalStorageRoot;
    }
  });

  it('parses a real attendance fixture, persists rows, records parse files, and rebuilds rows on repeat parse', async () => {
    const uploaded = await authorizedRequest(app, officeAuthHeader())
      .post('/api/attendance-imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as AttendanceImportBody;

    expect(uploadedBody).toMatchObject({
      originalFilename: 'workAttendanceRecordForm_June.xls',
      importStatus: 'UPLOADED',
      parseStatus: 'NOT_PARSED',
      errorMessage: null,
    });
    await expect(stat(uploadedBody.storedPath)).resolves.toBeDefined();

    const parsed = await authorizedRequest(app, officeAuthHeader())
      .post(`/api/attendance-imports/${uploadedBody.id}/parse`)
      .expect(201);
    const parsedBody = parsed.body as AttendanceParseBody;

    expect(parsedBody.attendanceImport).toMatchObject({
      id: uploadedBody.id,
      storedPath: uploadedBody.storedPath,
      parseStatus: 'WARNING',
      parserVersion: 'wage-attendance-v1',
      settlementMonth: '2026-06',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      employeeCount: 13,
      dayCount: 390,
      errorCount: 0,
      errorMessage: null,
    });
    expect(parsedBody.attendanceImport.warningCount).toBeGreaterThan(0);
    expect(parsedBody.rows).toHaveLength(390);
    expect(parsedBody.warnings.length).toBeGreaterThan(0);
    expect(parsedBody.errors).toEqual([]);
    const rayFirstDay = parsedBody.rows.find(
      (row) => row.employeeId === '1' && row.workDate === '2026-06-01',
    );
    expect(rayFirstDay).toMatchObject({
      employeeId: '1',
      employeeName: 'ray',
      workDate: '2026-06-01',
    });
    expect(rayFirstDay?.rawJson).toMatchObject({
      workDate: '2026-06-01',
    });
    expect(attendanceRows).toHaveLength(390);
    expect(new Set(attendanceRows.map((row) => row.rowKey)).size).toBe(390);
    expect(attendanceImports[0].storedPath).toBe(uploadedBody.storedPath);

    const files = await authorizedRequest(app, officeAuthHeader())
      .get(`/api/attendance-imports/${uploadedBody.id}/files`)
      .expect(200);
    const filesBody = files.body as WageGeneratedFilesBody;
    expect(filesBody.items.map((file) => file.fileType).sort()).toEqual([
      'ATTENDANCE_PARSED_JSON',
      'TASK_REPORT_HTML',
    ]);
    for (const file of filesBody.items) {
      expect(file).toMatchObject({
        attendanceImportId: uploadedBody.id,
        status: 'GENERATED',
        errorMessage: null,
      });
      expect(file.fileSha256).toEqual(expect.any(String));
      expect(Number(file.fileSizeBytes)).toBeGreaterThan(0);
      await expect(stat(file.storagePath)).resolves.toBeDefined();
    }

    const parsedJson = filesBody.items.find(
      (file) => file.fileType === 'ATTENDANCE_PARSED_JSON',
    );
    const taskReport = filesBody.items.find(
      (file) => file.fileType === 'TASK_REPORT_HTML',
    );
    expect(parsedJson).toBeDefined();
    expect(taskReport).toBeDefined();

    await authorizedRequest(app, officeAuthHeader())
      .get(
        `/api/attendance-imports/${uploadedBody.id}/files/${parsedJson!.id}/download`,
      )
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          parsed_result: {
            parserVersion: 'wage-attendance-v1',
          },
          task_status: 'WARNING',
        });
      });

    await authorizedRequest(app, officeAuthHeader())
      .get(
        `/api/attendance-imports/${uploadedBody.id}/files/${taskReport!.id}/download`,
      )
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain('Parse status: WARNING');
      });

    const reparsed = await authorizedRequest(app, officeAuthHeader())
      .post(`/api/attendance-imports/${uploadedBody.id}/parse`)
      .expect(201);
    const reparsedBody = reparsed.body as AttendanceParseBody;

    expect(reparsedBody.rows).toHaveLength(390);
    expect(attendanceRows).toHaveLength(390);
    expect(new Set(attendanceRows.map((row) => row.rowKey)).size).toBe(390);
    expect(wageGeneratedFiles).toHaveLength(4);
  });

  function createPrismaMock(
    importRecords: AttendanceImportRecord[],
    rowRecords: AttendanceRowRecord[],
    generatedFileRecords: WageGeneratedFileRecord[],
  ) {
    const prismaMock: any = {
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      attendanceImport: {
        findUnique: jest.fn(({ where }: FindUniqueArgs) => {
          const found = where.id
            ? importRecords.find((record) => record.id === where.id)
            : importRecords.find(
                (record) => record.fileSha256 === where.fileSha256,
              );
          return Promise.resolve(found ?? null);
        }),
        create: jest.fn(({ data }: CreateAttendanceImportArgs) => {
          const now = new Date('2026-07-04T10:00:00.000Z');
          const record: AttendanceImportRecord = {
            id: `attendance-import-${importRecords.length + 1}`,
            originalFilename: data.originalFilename,
            storedPath: data.storedPath,
            fileSha256: data.fileSha256,
            mimeType: data.mimeType,
            fileSizeBytes: data.fileSizeBytes,
            importStatus: data.importStatus,
            parseStatus: data.parseStatus,
            parserVersion: null,
            settlementMonth: null,
            periodStart: null,
            periodEnd: null,
            employeeCount: 0,
            dayCount: 0,
            warningCount: data.warningCount,
            errorCount: data.errorCount,
            errorMessage: data.errorMessage,
            rawMetadata: null,
            importedById: data.importedById ?? null,
            createdAt: now,
            updatedAt: now,
          };
          importRecords.push(record);
          return Promise.resolve(record);
        }),
        findMany: jest.fn(({ take, skip }) =>
          Promise.resolve(importRecords.slice(skip, skip + take).reverse()),
        ),
        update: jest.fn(({ where, data }) => {
          const record = importRecords.find((item) => item.id === where.id);
          if (!record) {
            throw new Error(`Attendance import not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-07-04T10:01:00.000Z'),
          });
          return Promise.resolve(record);
        }),
      },
      attendanceRow: {
        deleteMany: jest.fn(({ where }) => {
          const originalLength = rowRecords.length;
          for (let index = rowRecords.length - 1; index >= 0; index -= 1) {
            if (
              rowRecords[index].attendanceImportId === where.attendanceImportId
            ) {
              rowRecords.splice(index, 1);
            }
          }
          return Promise.resolve({ count: originalLength - rowRecords.length });
        }),
        createMany: jest.fn(({ data }) => {
          const now = new Date('2026-07-04T10:02:00.000Z');
          const rows: AttendanceRowRecord[] = data.map((row, index) => ({
            id: `attendance-row-${rowRecords.length + index + 1}`,
            attendanceImportId: row.attendanceImportId,
            rowKey: row.rowKey,
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            department: row.department,
            workDate: row.workDate,
            dayNumber: row.dayNumber,
            punchTimes: row.punchTimes,
            pairedGrossHours: row.pairedGrossHours,
            lunchHours: row.lunchHours,
            calculatedHours: row.calculatedHours,
            firstPunch: row.firstPunch,
            lastPunch: row.lastPunch,
            rawJson: row.rawJson,
            warnings: row.warnings,
            errors: row.errors,
            createdAt: now,
            updatedAt: now,
          }));
          rowRecords.push(...rows);
          return Promise.resolve({ count: rows.length });
        }),
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            rowRecords
              .filter(
                (row) => row.attendanceImportId === where.attendanceImportId,
              )
              .sort((left, right) =>
                left.workDate.toString() === right.workDate.toString()
                  ? left.rowKey.localeCompare(right.rowKey)
                  : left.workDate
                      .toString()
                      .localeCompare(right.workDate.toString()),
              ),
          ),
        ),
      },
      wageGeneratedFile: {
        create: jest.fn(({ data }) => {
          const now = new Date(
            `2026-07-04T10:${String(generatedFileRecords.length + 3).padStart(
              2,
              '0',
            )}:00.000Z`,
          );
          const record: WageGeneratedFileRecord = {
            id: `wage-generated-file-${generatedFileRecords.length + 1}`,
            attendanceImportId: data.attendanceImportId,
            unloadingWageSettlementId: null,
            fileType: data.fileType,
            storagePath: data.storagePath,
            fileSha256: data.fileSha256,
            mimeType: data.mimeType,
            fileSizeBytes: data.fileSizeBytes,
            status: data.status,
            errorMessage: data.errorMessage,
            generatedById: data.generatedById ?? null,
            createdAt: now,
            updatedAt: now,
          };
          generatedFileRecords.push(record);
          return Promise.resolve(record);
        }),
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            generatedFileRecords
              .filter(
                (record) =>
                  record.attendanceImportId === where.attendanceImportId,
              )
              .sort(
                (left, right) =>
                  right.updatedAt.getTime() - left.updatedAt.getTime(),
              ),
          ),
        ),
        findFirst: jest.fn(({ where }) => {
          const found =
            generatedFileRecords.find(
              (record) =>
                record.id === where.id &&
                record.attendanceImportId === where.attendanceImportId,
            ) ?? null;
          return Promise.resolve(found);
        }),
      },
    };

    prismaMock.$transaction = jest.fn((callback) => callback(prismaMock));

    return prismaMock;
  }
});
