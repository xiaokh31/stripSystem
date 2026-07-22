import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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
  hrManagerAuthHeader,
  officeAuthHeader,
} from './auth-test-helpers';

jest.setTimeout(30_000);

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
  calculationMethod: string;
  workIntervals: unknown;
  pairedGrossHours: string | null;
  lunchHours: string;
  calculatedHours: string | null;
  firstPunch: string | null;
  lastPunch: string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
  deletedAt: Date | null;
  deletedById: string | null;
  deletionReason: string | null;
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
    id: string;
    rowKey: string;
    employeeId: string | null;
    employeeName: string | null;
    workDate: string;
    punchTimes: unknown;
    pairedGrossHours: string | null;
    calculationMethod: string;
    workIntervals: unknown;
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

interface GenerateWageRecordBody {
  generatedFile: {
    id: string;
    attendanceImportId: string | null;
    fileType: string;
    storagePath: string;
    fileSha256: string | null;
    fileSizeBytes: string | null;
    status: string;
    errorMessage: string | null;
  };
  taskReport: {
    id: string;
    attendanceImportId: string | null;
    fileType: string;
    storagePath: string;
    fileSha256: string | null;
    fileSizeBytes: string | null;
    status: string;
    errorMessage: string | null;
  } | null;
  warnings: unknown[];
  errors: unknown[];
}

interface ErrorBody {
  code: string;
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
  const wageTemplatePath = resolve(
    __dirname,
    '..',
    '..',
    '..',
    'samples',
    'wage',
    '20260601-0630_wageRecords.xls',
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
    await rm(storageRoot, { recursive: true, force: true });
    if (originalStorageRoot === undefined) {
      delete process.env.STORAGE_ROOT;
    } else {
      process.env.STORAGE_ROOT = originalStorageRoot;
    }
  });

  it('parses a real attendance fixture, persists rows, records parse files, and rebuilds rows on repeat parse', async () => {
    const uploaded = await authorizedRequest(app, hrManagerAuthHeader())
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

    const parsed = await authorizedRequest(app, hrManagerAuthHeader())
      .post(`/api/attendance-imports/${uploadedBody.id}/parse`)
      .expect(201);
    const parsedBody = parsed.body as AttendanceParseBody;

    expect(parsedBody.attendanceImport).toMatchObject({
      id: uploadedBody.id,
      storedPath: uploadedBody.storedPath,
      parseStatus: 'WARNING',
      parserVersion: 'wage-attendance-v2',
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
      calculationMethod: 'FIRST_LAST_FALLBACK',
      calculatedHours: '0.00',
    });
    expect(rayFirstDay?.workIntervals).toEqual([
      expect.objectContaining({ minutes: 0, hours: 0 }),
    ]);
    expect(rayFirstDay?.rawJson).toMatchObject({
      workDate: '2026-06-01',
    });
    const threePunchDay = parsedBody.rows.find(
      (row) => Array.isArray(row.punchTimes) && row.punchTimes.length === 3,
    );
    expect(threePunchDay).toMatchObject({
      punchTimes: ['09:00', '17:09', '17:10'],
      calculationMethod: 'FIRST_LAST_FALLBACK',
      pairedGrossHours: '8.17',
      lunchHours: '0.50',
      calculatedHours: '7.67',
      workIntervals: [
        {
          start: '09:00',
          end: '17:10',
          minutes: 490,
          hours: 8.17,
        },
      ],
    });
    expect(threePunchDay?.warnings).toEqual([
      expect.objectContaining({ code: 'ODD_PUNCH_COUNT' }),
    ]);
    expect(attendanceRows).toHaveLength(390);
    expect(new Set(attendanceRows.map((row) => row.rowKey)).size).toBe(390);
    expect(attendanceImports[0].storedPath).toBe(uploadedBody.storedPath);

    const files = await authorizedRequest(app, hrManagerAuthHeader())
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

    await authorizedRequest(app, hrManagerAuthHeader())
      .get(
        `/api/attendance-imports/${uploadedBody.id}/files/${parsedJson!.id}/download`,
      )
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          parsed_result: {
            parserVersion: 'wage-attendance-v2',
          },
          task_status: 'WARNING',
        });
      });

    await authorizedRequest(app, hrManagerAuthHeader())
      .get(
        `/api/attendance-imports/${uploadedBody.id}/files/${taskReport!.id}/download`,
      )
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain('Parse status: WARNING');
      });

    const reparsed = await authorizedRequest(app, hrManagerAuthHeader())
      .post(`/api/attendance-imports/${uploadedBody.id}/parse`)
      .expect(201);
    const reparsedBody = reparsed.body as AttendanceParseBody;

    expect(reparsedBody.rows).toHaveLength(390);
    expect(attendanceRows).toHaveLength(390);
    expect(new Set(attendanceRows.map((row) => row.rowKey)).size).toBe(390);
    expect(wageGeneratedFiles).toHaveLength(4);
    expect(
      new Set(
        wageGeneratedFiles
          .filter((file) => file.fileType === 'TASK_REPORT_HTML')
          .map((file) => file.storagePath),
      ).size,
    ).toBe(2);
  });

  it('blocks wage record generation until attendance parse has completed', async () => {
    const uploaded = await authorizedRequest(app, hrManagerAuthHeader())
      .post('/api/attendance-imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as AttendanceImportBody;

    await authorizedRequest(app, hrManagerAuthHeader())
      .post(`/api/attendance-imports/${uploadedBody.id}/generate-wage-record`)
      .expect(400)
      .expect((response) => {
        expect((response.body as ErrorBody).code).toBe(
          'ATTENDANCE_IMPORT_NOT_PARSED',
        );
      });

    expect(wageGeneratedFiles).toHaveLength(0);
  });

  it('generates and downloads a real wage record from a parsed attendance import without modifying the template', async () => {
    const templateSha256Before = await fileSha256(wageTemplatePath);
    const uploaded = await authorizedRequest(app, hrManagerAuthHeader())
      .post('/api/attendance-imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as AttendanceImportBody;
    await authorizedRequest(app, hrManagerAuthHeader())
      .post(`/api/attendance-imports/${uploadedBody.id}/parse`)
      .expect(201);

    const generated = await authorizedRequest(app, hrManagerAuthHeader())
      .post(`/api/attendance-imports/${uploadedBody.id}/generate-wage-record`)
      .expect(201);
    const generatedBody = generated.body as GenerateWageRecordBody;

    expect(generatedBody.generatedFile).toMatchObject({
      attendanceImportId: uploadedBody.id,
      fileType: 'WAGE_RECORD_XLS',
      status: 'GENERATED',
      errorMessage: null,
    });
    expect(generatedBody.generatedFile.storagePath).toMatch(/\.xls$/);
    expect(generatedBody.generatedFile.fileSha256).toEqual(expect.any(String));
    expect(Number(generatedBody.generatedFile.fileSizeBytes)).toBeGreaterThan(
      0,
    );
    await expect(
      stat(generatedBody.generatedFile.storagePath),
    ).resolves.toBeDefined();
    expect(generatedBody.taskReport).toMatchObject({
      attendanceImportId: uploadedBody.id,
      fileType: 'TASK_REPORT_HTML',
      status: 'GENERATED',
      errorMessage: null,
    });
    expect(generatedBody.warnings.length).toBeGreaterThan(0);
    expect(generatedBody.errors).toEqual([]);
    expect(await fileSha256(wageTemplatePath)).toBe(templateSha256Before);

    const wageRecord = wageGeneratedFiles.find(
      (file) => file.id === generatedBody.generatedFile.id,
    );
    expect(wageRecord).toMatchObject({
      fileType: 'WAGE_RECORD_XLS',
      status: 'GENERATED',
      generatedById: 'auth-hr-manager',
    });

    const files = await authorizedRequest(app, hrManagerAuthHeader())
      .get(`/api/attendance-imports/${uploadedBody.id}/files`)
      .expect(200);
    const filesBody = files.body as WageGeneratedFilesBody;
    expect(filesBody.items.map((file) => file.fileType).sort()).toEqual([
      'ATTENDANCE_PARSED_JSON',
      'TASK_REPORT_HTML',
      'TASK_REPORT_HTML',
      'WAGE_RECORD_XLS',
    ]);
    expect(
      new Set(
        filesBody.items
          .filter((file) => file.fileType === 'TASK_REPORT_HTML')
          .map((file) => file.storagePath),
      ).size,
    ).toBe(2);

    await authorizedRequest(app, hrManagerAuthHeader())
      .get(
        `/api/attendance-imports/${uploadedBody.id}/files/${generatedBody.generatedFile.id}/download`,
      )
      .expect(200)
      .expect((response) => {
        expect(response.headers['content-type']).toContain(
          'application/vnd.ms-excel',
        );
        expect(Number(response.headers['content-length'])).toBeGreaterThan(0);
      });

    await authorizedRequest(app, hrManagerAuthHeader())
      .get(
        `/api/attendance-imports/${uploadedBody.id}/files/${generatedBody.taskReport!.id}/download`,
      )
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain('Generated wage record:');
      });
  });

  it('soft deletes with JWT attribution, preserves immutable history on repeat parse, and supersedes prior wage files', async () => {
    const uploaded = await authorizedRequest(app, hrManagerAuthHeader())
      .post('/api/attendance-imports')
      .attach('file', fixturePath)
      .expect(201);
    const importId = (uploaded.body as AttendanceImportBody).id;
    const parsed = await authorizedRequest(app, hrManagerAuthHeader())
      .post(`/api/attendance-imports/${importId}/parse`)
      .expect(201);
    const parsedBody = parsed.body as AttendanceParseBody;
    const target = parsedBody.rows.find(
      (row) => row.employeeId === '1' && row.workDate === '2026-06-02',
    );
    expect(target).toBeDefined();

    const generatedBefore = await authorizedRequest(app, hrManagerAuthHeader())
      .post(`/api/attendance-imports/${importId}/generate-wage-record`)
      .expect(201);
    const beforeBody = generatedBefore.body as GenerateWageRecordBody;
    const beforeSha = beforeBody.generatedFile.fileSha256;

    await authorizedRequest(app, hrManagerAuthHeader())
      .delete(`/api/attendance-imports/${importId}/rows/${target!.rowKey}`)
      .send({ reason: '' })
      .expect(400);
    await authorizedRequest(app, officeAuthHeader())
      .delete(`/api/attendance-imports/${importId}/rows/${target!.id ?? target!.rowKey}`)
      .send({ reason: 'Office users cannot delete attendance rows.' })
      .expect(403);
    await authorizedRequest(app, hrManagerAuthHeader())
      .delete(`/api/attendance-imports/${importId}/rows/missing-row`)
      .send({ reason: 'Unknown row must not change the import.' })
      .expect(404);
    await authorizedRequest(app, hrManagerAuthHeader())
      .delete(`/api/attendance-imports/missing-import/rows/${target!.id}`)
      .send({ reason: 'Cross-import lookup must not change the row.' })
      .expect(404);

    const deleted = await authorizedRequest(app, hrManagerAuthHeader())
      .delete(`/api/attendance-imports/${importId}/rows/${target!.id}`)
      .send({ reason: 'Time-clock row belongs to another settlement.' })
      .expect(200);
    expect(deleted.body).toMatchObject({
      code: 'ATTENDANCE_ROW_DELETED',
      deleted: true,
      activeRowCount: 389,
      deletedRowCount: 1,
      event: {
        eventCode: 'DELETED',
        actor: {
          id: 'auth-hr-manager',
          displayLabel: 'HR_MANAGER User',
        },
        reason: 'Time-clock row belongs to another settlement.',
      },
      affectedGeneratedFiles: expect.arrayContaining([
        { id: beforeBody.generatedFile.id, status: 'SUPERSEDED' },
      ]),
    });

    const repeated = await authorizedRequest(app, hrManagerAuthHeader())
      .delete(`/api/attendance-imports/${importId}/rows/${target!.id}`)
      .send({ reason: 'Must not replace the first reason.' })
      .expect(200);
    expect(repeated.body).toMatchObject({
      code: 'ATTENDANCE_ROW_ALREADY_DELETED',
      alreadyDeleted: true,
      event: { reason: 'Time-clock row belongs to another settlement.' },
    });

    const history = await authorizedRequest(app, hrManagerAuthHeader())
      .get(`/api/attendance-imports/${importId}/row-history?limit=10&offset=0`)
      .expect(200);
    expect(history.body).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          eventCode: 'DELETED',
          rowKey: target!.rowKey,
          rowSnapshot: expect.objectContaining({
            employeeId: '1',
            workDate: '2026-06-02',
          }),
        }),
      ],
    });

    const reparsed = await authorizedRequest(app, hrManagerAuthHeader())
      .post(`/api/attendance-imports/${importId}/parse`)
      .expect(201);
    expect(reparsed.body).toMatchObject({
      activeRowCount: 389,
      deletedRowCount: 1,
    });
    expect((reparsed.body as AttendanceParseBody).rows).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ rowKey: target!.rowKey })]),
    );

    const generatedAfter = await authorizedRequest(app, hrManagerAuthHeader())
      .post(`/api/attendance-imports/${importId}/generate-wage-record`)
      .expect(201);
    const afterBody = generatedAfter.body as GenerateWageRecordBody;
    expect(afterBody.generatedFile.fileSha256).toEqual(expect.any(String));
    expect(beforeSha).toEqual(expect.any(String));
    const oldRecord = wageGeneratedFiles.find(
      (file) => file.id === beforeBody.generatedFile.id,
    );
    expect(oldRecord).toMatchObject({
      fileSha256: beforeSha,
      status: 'SUPERSEDED',
      generatedById: 'auth-hr-manager',
    });
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
            dataRevision: 0,
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
          const nextRevision =
            data.dataRevision?.increment !== undefined
              ? record.dataRevision + data.dataRevision.increment
              : (data.dataRevision ?? record.dataRevision);
          Object.assign(record, data, {
            dataRevision: nextRevision,
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
              rowRecords[index].attendanceImportId === where.attendanceImportId &&
              (!('deletedAt' in where) || !rowRecords[index].deletedAt)
            ) {
              rowRecords.splice(index, 1);
            }
          }
          return Promise.resolve({ count: originalLength - rowRecords.length });
        }),
        createMany: jest.fn(({ data }) => {
          const now = new Date('2026-07-04T10:02:00.000Z');
          const rows: AttendanceRowRecord[] = data
            .filter(
              (row) =>
                !rowRecords.some(
                  (existing) =>
                    existing.attendanceImportId === row.attendanceImportId &&
                    existing.rowKey === row.rowKey,
                ),
            )
            .map((row, index) => ({
            id: `attendance-row-${rowRecords.length + index + 1}`,
            attendanceImportId: row.attendanceImportId,
            rowKey: row.rowKey,
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            department: row.department,
            workDate: row.workDate,
            dayNumber: row.dayNumber,
            punchTimes: row.punchTimes,
            calculationMethod: row.calculationMethod,
            workIntervals: row.workIntervals,
            pairedGrossHours: row.pairedGrossHours,
            lunchHours: row.lunchHours,
            calculatedHours: row.calculatedHours,
            firstPunch: row.firstPunch,
            lastPunch: row.lastPunch,
            rawJson: row.rawJson,
            warnings: row.warnings,
            errors: row.errors,
            deletedAt: null,
            deletedById: null,
            deletionReason: null,
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
                (row) =>
                  row.attendanceImportId === where.attendanceImportId &&
                  (where.deletedAt === null ? !row.deletedAt : true),
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
          const row = rowRecords.find((item) => item.id === where.id)!;
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
        updateMany: jest.fn(({ where, data }) => {
          const ids = where.id?.in as string[] | undefined;
          let count = 0;
          for (const file of generatedFileRecords) {
            if (!ids || ids.includes(file.id)) {
              Object.assign(file, data);
              count += 1;
            }
          }
          return Promise.resolve({ count });
        }),
        update: jest.fn(({ where, data }) => {
          const file = generatedFileRecords.find((item) => item.id === where.id)!;
          Object.assign(file, data);
          return Promise.resolve(file);
        }),
      },
    };

    const auditEvents: any[] = [];
    prismaMock.attendanceRowAuditEvent = {
      create: jest.fn(({ data }) => {
        const event = { id: `attendance-audit-${auditEvents.length + 1}`, ...data };
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
      findMany: jest.fn(({ where, take, skip }) =>
        Promise.resolve(
          auditEvents
            .filter((event) => event.attendanceImportId === where.attendanceImportId)
            .reverse()
            .slice(skip, skip + take),
        ),
      ),
      count: jest.fn(({ where }) =>
        Promise.resolve(
          auditEvents.filter(
            (event) => event.attendanceImportId === where.attendanceImportId,
          ).length,
        ),
      ),
    };
    prismaMock.asyncJob = { findFirst: jest.fn(() => Promise.resolve(null)) };

    prismaMock.$transaction = jest.fn((callback) => callback(prismaMock));

    return prismaMock;
  }

  async function fileSha256(path: string): Promise<string> {
    return createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  }
});
