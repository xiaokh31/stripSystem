import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

interface ImportRecord {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  mimeType: string | null;
  fileSizeBytes: bigint | number | string | null;
  format: string;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  rawMetadata: unknown;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

interface LineRecord {
  id: string;
  containerId: string;
  lineNo: number;
  destinationCode: string | null;
  destinationType: string | null;
  cartons: number | null;
  volume: string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface DestinationRecord {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string | null;
  cartons: number;
  volume: string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  note: string | null;
  warnings: unknown;
  errors: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface ImportFileBody {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  format: string;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
}

interface ParseResultBody {
  importFile: ImportFileBody;
  containers: Array<{
    id: string;
    containerNo: string;
    sourceFormat: string;
    parserVersion: string | null;
    status: string;
    lines: unknown[];
    destinations: Array<{
      destinationCode: string;
      cartons: number;
      calculatedPallets: number;
      finalPallets: number;
    }>;
  }>;
  warnings: unknown[];
  errors: unknown[];
}

interface ImportListBody {
  items: ImportFileBody[];
  limit: number;
  offset: number;
}

interface ErrorBody {
  code: string;
  details?: {
    existingImport?: {
      id: string;
      originalFilename: string;
    };
  };
}

interface FindUniqueArgs {
  where: {
    id?: string;
    fileSha256?: string;
  };
}

interface CreateImportArgs {
  data: {
    originalFilename: string;
    storedPath: string;
    fileSha256: string;
    mimeType: string | null;
    fileSizeBytes: bigint | number | string | null;
    format: string;
    importStatus: string;
    parseStatus: string;
    warningCount: number;
    errorCount: number;
    errorMessage: string | null;
    parserVersion?: string | null;
    rawMetadata?: unknown;
  };
}

interface FindManyArgs {
  take: number;
  skip: number;
}

describe('ImportsController (e2e)', () => {
  const fixturePath = resolve(
    __dirname,
    '..',
    '..',
    '..',
    'samples',
    'unloading-plans',
    'Unloading Plan CSNU8877228.xlsx',
  );

  let app: INestApplication<App>;
  let storageRoot: string;
  let records: ImportRecord[];
  let containers: ContainerRecord[];
  let lines: LineRecord[];
  let destinations: DestinationRecord[];
  let prisma: any;
  let originalStorageRoot: string | undefined;

  beforeEach(async () => {
    originalStorageRoot = process.env.STORAGE_ROOT;
    storageRoot = await mkdtemp(join(tmpdir(), 'p1-03-imports-e2e-'));
    process.env.STORAGE_ROOT = storageRoot;
    records = [];
    containers = [];
    lines = [];
    destinations = [];
    prisma = createPrismaMock(records, containers, lines, destinations);

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

  it('uploads a real xlsx fixture, saves the original file, and writes import_files metadata', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const body = response.body as ImportFileBody;

    expect(body).toMatchObject({
      id: 'import-1',
      originalFilename: 'Unloading Plan CSNU8877228.xlsx',
      format: 'UNKNOWN',
      importStatus: 'UPLOADED',
      parseStatus: 'NOT_PARSED',
      errorMessage: null,
    });
    expect(body.fileSha256).toEqual(expect.any(String));
    expect(body.storedPath).toContain('original_files');
    await expect(stat(body.storedPath)).resolves.toBeDefined();
    expect(records).toHaveLength(1);
    expect(records[0].storedPath).toBe(body.storedPath);
  });

  it('rejects duplicate uploads by SHA-256', async () => {
    await request(app.getHttpServer())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(409);
    const body = response.body as ErrorBody;

    expect(body).toMatchObject({
      code: 'DUPLICATE_IMPORT',
      details: {
        existingImport: {
          id: 'import-1',
          originalFilename: 'Unloading Plan CSNU8877228.xlsx',
        },
      },
    });
    expect(records).toHaveLength(1);
  });

  it('lists imports and returns import details', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    const list = await request(app.getHttpServer())
      .get('/api/imports?limit=10&offset=0')
      .expect(200);
    const listBody = list.body as ImportListBody;

    expect(listBody).toMatchObject({
      limit: 10,
      offset: 0,
      items: [
        {
          id: uploadedBody.id,
          fileSha256: uploadedBody.fileSha256,
        },
      ],
    });

    await request(app.getHttpServer())
      .get(`/api/imports/${uploadedBody.id}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as ImportFileBody;
        expect(body).toMatchObject({
          id: uploadedBody.id,
          fileSha256: uploadedBody.fileSha256,
        });
      });
  });

  it('parses an uploaded real xlsx fixture through the Python worker and persists parse output', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;
    const originalStoredPath = uploadedBody.storedPath;

    const parsed = await request(app.getHttpServer())
      .post(`/api/imports/${uploadedBody.id}/parse`)
      .expect(201);
    const parsedBody = parsed.body as ParseResultBody;

    expect(parsedBody.importFile).toMatchObject({
      id: uploadedBody.id,
      storedPath: originalStoredPath,
      format: 'UNLOADING_PLAN_CN',
      parserVersion: 'unloading-plan-cn-v1',
      errorCount: 0,
    });
    expect(parsedBody.importFile.parseStatus).toMatch(/^(PARSED|WARNING)$/);
    expect(parsedBody.containers).toHaveLength(1);
    expect(parsedBody.containers[0]).toMatchObject({
      containerNo: 'CSNU8877228',
      sourceFormat: 'UNLOADING_PLAN_CN',
      parserVersion: 'unloading-plan-cn-v1',
      status: 'PARSED',
    });
    expect(parsedBody.containers[0].lines.length).toBeGreaterThan(0);
    expect(parsedBody.containers[0].destinations.length).toBeGreaterThan(0);
    expect(
      parsedBody.containers[0].destinations.some(
        (destination) => destination.finalPallets > 0,
      ),
    ).toBe(true);
    expect(records[0].storedPath).toBe(originalStoredPath);

    await request(app.getHttpServer())
      .get(`/api/imports/${uploadedBody.id}/parse-result`)
      .expect(200)
      .expect((response) => {
        const body = response.body as ParseResultBody;
        expect(body.containers[0].lines.length).toBeGreaterThan(0);
        expect(body.containers[0].destinations.length).toBeGreaterThan(0);
      });
  });

  it('records worker parse errors without creating a successful container', async () => {
    const corruptPath = join(storageRoot, 'corrupt.xlsx');
    await writeFile(corruptPath, 'not a real Excel workbook');

    const uploaded = await request(app.getHttpServer())
      .post('/api/imports')
      .attach('file', corruptPath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    const parsed = await request(app.getHttpServer())
      .post(`/api/imports/${uploadedBody.id}/parse`)
      .expect(201);
    const parsedBody = parsed.body as ParseResultBody;

    expect(parsedBody.importFile).toMatchObject({
      id: uploadedBody.id,
      format: 'UNKNOWN',
      parseStatus: 'ERROR',
      parserVersion: null,
    });
    expect(parsedBody.importFile.errorCount).toBeGreaterThan(0);
    expect(parsedBody.importFile.errorMessage).toEqual(expect.any(String));
    expect(parsedBody.containers).toEqual([]);
    expect(parsedBody.errors.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .get(`/api/imports/${uploadedBody.id}/parse-result`)
      .expect(200)
      .expect((response) => {
        const body = response.body as ParseResultBody;
        expect(body.importFile.parseStatus).toBe('ERROR');
        expect(body.containers).toEqual([]);
      });
  });

  it('rejects non-xlsx uploads and invalid list query DTOs', async () => {
    const textPath = join(storageRoot, 'not-a-plan.txt');
    await writeFile(textPath, 'not a real Excel file');

    await request(app.getHttpServer())
      .post('/api/imports')
      .attach('file', textPath)
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorBody;
        expect(body.code).toBe('INVALID_IMPORT_FILE_TYPE');
      });

    await request(app.getHttpServer())
      .get('/api/imports?limit=not-a-number')
      .expect(400);
  });

  function createPrismaMock(
    importRecords: ImportRecord[],
    containerRecords: ContainerRecord[],
    lineRecords: LineRecord[],
    destinationRecords: DestinationRecord[],
  ) {
    const prisma: any = {
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      importFile: {
        findUnique: jest.fn(({ where }: FindUniqueArgs) => {
          const found = where.id
            ? importRecords.find((record) => record.id === where.id)
            : importRecords.find(
                (record) => record.fileSha256 === where.fileSha256,
              );
          return Promise.resolve(found ?? null);
        }),
        create: jest.fn(({ data }: CreateImportArgs) => {
          const now = new Date('2026-06-26T00:00:00.000Z');
          const record: ImportRecord = {
            id: `import-${importRecords.length + 1}`,
            originalFilename: data.originalFilename,
            storedPath: data.storedPath,
            fileSha256: data.fileSha256,
            mimeType: data.mimeType,
            fileSizeBytes: data.fileSizeBytes,
            format: data.format,
            importStatus: data.importStatus,
            parseStatus: data.parseStatus,
            parserVersion: data.parserVersion ?? null,
            warningCount: data.warningCount,
            errorCount: data.errorCount,
            errorMessage: data.errorMessage,
            rawMetadata: data.rawMetadata ?? null,
            createdAt: now,
            updatedAt: now,
          };
          importRecords.push(record);
          return Promise.resolve(record);
        }),
        update: jest.fn(({ where, data }) => {
          const record = importRecords.find((item) => item.id === where.id);
          if (!record) {
            throw new Error(`Import record not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          });
          return Promise.resolve(record);
        }),
        findMany: jest.fn(({ take, skip }: FindManyArgs) =>
          Promise.resolve(importRecords.slice(skip, skip + take).reverse()),
        ),
      },
      container: {
        findMany: jest.fn(({ where, select, include }) => {
          const found = containerRecords.filter(
            (container) => container.importFileId === where.importFileId,
          );

          if (select?.id) {
            return Promise.resolve(
              found.map((container) => ({ id: container.id })),
            );
          }

          if (include) {
            return Promise.resolve(
              found.map((container) => ({
                ...container,
                lines: lineRecords
                  .filter((line) => line.containerId === container.id)
                  .sort((left, right) => left.lineNo - right.lineNo),
                destinations: destinationRecords
                  .filter(
                    (destination) =>
                      destination.containerId === container.id,
                  )
                  .sort((left, right) =>
                    left.destinationCode.localeCompare(
                      right.destinationCode,
                    ),
                  ),
              })),
            );
          }

          return Promise.resolve(found);
        }),
        create: jest.fn(({ data }) => {
          const now = new Date('2026-06-26T00:01:00.000Z');
          const record: ContainerRecord = {
            id: `container-${containerRecords.length + 1}`,
            importFileId: data.importFileId,
            containerNo: data.containerNo,
            sourceFormat: data.sourceFormat,
            parserVersion: data.parserVersion,
            status: data.status,
            rawJson: data.rawJson,
            warnings: data.warnings,
            errors: data.errors,
            createdAt: now,
            updatedAt: now,
          };
          containerRecords.push(record);
          return Promise.resolve(record);
        }),
        deleteMany: jest.fn(({ where }) => {
          const ids = new Set<string>(where.id.in);
          const originalLength = containerRecords.length;
          for (let index = containerRecords.length - 1; index >= 0; index--) {
            if (ids.has(containerRecords[index].id)) {
              containerRecords.splice(index, 1);
            }
          }
          return Promise.resolve({
            count: originalLength - containerRecords.length,
          });
        }),
      },
      containerLine: {
        createMany: jest.fn(({ data }) => {
          const now = new Date('2026-06-26T00:01:00.000Z');
          const rows: LineRecord[] = data.map((row, index) => ({
            id: `line-${lineRecords.length + index + 1}`,
            containerId: row.containerId,
            lineNo: row.lineNo,
            destinationCode: row.destinationCode,
            destinationType: row.destinationType,
            cartons: row.cartons,
            volume: row.volume,
            rawJson: row.rawJson,
            warnings: row.warnings,
            errors: row.errors,
            createdAt: now,
            updatedAt: now,
          }));
          lineRecords.push(...rows);
          return Promise.resolve({ count: rows.length });
        }),
        deleteMany: jest.fn(({ where }) => {
          const ids = new Set<string>(where.containerId.in);
          const originalLength = lineRecords.length;
          for (let index = lineRecords.length - 1; index >= 0; index--) {
            if (ids.has(lineRecords[index].containerId)) {
              lineRecords.splice(index, 1);
            }
          }
          return Promise.resolve({ count: originalLength - lineRecords.length });
        }),
      },
      containerDestination: {
        createMany: jest.fn(({ data }) => {
          const now = new Date('2026-06-26T00:01:00.000Z');
          const rows: DestinationRecord[] = data.map((row, index) => ({
            id: `destination-${destinationRecords.length + index + 1}`,
            containerId: row.containerId,
            destinationCode: row.destinationCode,
            destinationType: row.destinationType,
            cartons: row.cartons,
            volume: row.volume,
            calculatedPallets: row.calculatedPallets,
            manualPallets: row.manualPallets,
            finalPallets: row.finalPallets,
            note: row.note,
            warnings: row.warnings,
            errors: row.errors,
            createdAt: now,
            updatedAt: now,
          }));
          destinationRecords.push(...rows);
          return Promise.resolve({ count: rows.length });
        }),
        deleteMany: jest.fn(({ where }) => {
          const ids = new Set<string>(where.containerId.in);
          const originalLength = destinationRecords.length;
          for (
            let index = destinationRecords.length - 1;
            index >= 0;
            index--
          ) {
            if (ids.has(destinationRecords[index].containerId)) {
              destinationRecords.splice(index, 1);
            }
          }
          return Promise.resolve({
            count: originalLength - destinationRecords.length,
          });
        }),
      },
    };

    prisma.$transaction = jest.fn((callback) => callback(prisma));

    return prisma;
  }
});
