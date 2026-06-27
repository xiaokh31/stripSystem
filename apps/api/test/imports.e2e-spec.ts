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
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
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
  errorMessage: string | null;
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
  let prisma: {
    checkConnection: jest.Mock;
    importFile: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let originalStorageRoot: string | undefined;

  beforeEach(async () => {
    originalStorageRoot = process.env.STORAGE_ROOT;
    storageRoot = await mkdtemp(join(tmpdir(), 'p1-03-imports-e2e-'));
    process.env.STORAGE_ROOT = storageRoot;
    records = [];
    prisma = createPrismaMock(records);

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

  function createPrismaMock(importRecords: ImportRecord[]) {
    return {
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
            warningCount: data.warningCount,
            errorCount: data.errorCount,
            errorMessage: data.errorMessage,
            createdAt: now,
            updatedAt: now,
          };
          importRecords.push(record);
          return Promise.resolve(record);
        }),
        findMany: jest.fn(({ take, skip }: FindManyArgs) =>
          Promise.resolve(importRecords.slice(skip, skip + take).reverse()),
        ),
      },
    };
  }
});
