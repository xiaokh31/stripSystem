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
  importFileId: string | null;
  containerNo: string;
  dockNo?: string | null;
  company?: string | null;
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

interface GeneratedFileRecord {
  id: string;
  importFileId: string | null;
  containerId: string | null;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType: string | null;
  fileSizeBytes: bigint | number | string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PalletRecord {
  id: string;
  containerDestinationId: string;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: Date | string | null;
  loadedAt?: Date | string | null;
  loadJobId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PalletEventRecord {
  id: string;
  palletId: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  scanPayload: string | null;
  metadata: unknown;
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

interface GenerateReportBody {
  generatedFile: {
    id: string;
    importFileId: string | null;
    containerId: string;
    fileType: string;
    storagePath: string;
    fileSha256: string;
    fileSizeBytes: string;
    status: string;
    errorMessage: string | null;
  };
  warnings: unknown[];
  errors: unknown[];
}

interface GeneratedFilesBody {
  items: GenerateReportBody['generatedFile'][];
}

interface ManualContainerBody {
  container: {
    id: string;
    destinations: Array<{
      id: string;
    }>;
  };
}

interface ContainerDestinationCorrectionBody {
  containerDestination: {
    id: string;
    manualPallets: number | null;
    finalPallets: number;
  };
}

interface PalletBody {
  id: string;
  containerId: string;
  containerDestinationId: string;
  destinationCode: string;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: string | null;
}

interface GenerateLabelsBody {
  generatedFile: GenerateReportBody['generatedFile'];
  pallets: PalletBody[];
  warnings: unknown[];
  errors: unknown[];
}

interface PalletListBody {
  items: PalletBody[];
}

interface ContainerSummaryBody {
  items: Array<{
    containerId: string;
    containerNo: string;
    totalPallets: number;
    loadedPallets: number;
    remainingPallets: number;
  }>;
}

interface ContainerDetailSummaryBody {
  containerId: string;
  containerNo: string;
  totalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
  destinations: Array<{
    destinationCode: string;
    totalPallets: number;
    loadedPallets: number;
    remainingPallets: number;
  }>;
}

interface InventoryBody {
  items: Array<{
    destinationCode: string;
    totalPallets: number;
    loadedPallets: number;
    remainingPallets: number;
  }>;
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
  let generatedFiles: GeneratedFileRecord[];
  let pallets: PalletRecord[];
  let palletEvents: PalletEventRecord[];
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
    generatedFiles = [];
    pallets = [];
    palletEvents = [];
    prisma = createPrismaMock(
      records,
      containers,
      lines,
      destinations,
      generatedFiles,
      pallets,
      palletEvents,
    );

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

  it('generates an Excel unloading report from a parsed real fixture and records generated_files', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    const parsed = await request(app.getHttpServer())
      .post(`/api/imports/${uploadedBody.id}/parse`)
      .expect(201);
    const parsedBody = parsed.body as ParseResultBody;
    const containerId = parsedBody.containers[0].id;

    const report = await request(app.getHttpServer())
      .post(`/api/containers/${containerId}/generate-report`)
      .expect(201);
    const reportBody = report.body as GenerateReportBody;

    expect(reportBody.generatedFile).toMatchObject({
      containerId,
      fileType: 'EXCEL_REPORT',
      status: 'GENERATED',
      errorMessage: null,
    });
    expect(reportBody.generatedFile.storagePath).toContain('reports');
    expect(reportBody.generatedFile.storagePath).toMatch(/\.xlsx$/);
    expect(reportBody.generatedFile.fileSha256).toEqual(expect.any(String));
    await expect(
      stat(reportBody.generatedFile.storagePath),
    ).resolves.toBeDefined();
    expect(generatedFiles).toHaveLength(1);
    expect(generatedFiles[0].storagePath).toBe(
      reportBody.generatedFile.storagePath,
    );

    const files = await request(app.getHttpServer())
      .get(`/api/containers/${containerId}/files`)
      .expect(200);
    const filesBody = files.body as GeneratedFilesBody;

    expect(filesBody.items).toMatchObject([
      {
        id: reportBody.generatedFile.id,
        fileType: 'EXCEL_REPORT',
        status: 'GENERATED',
      },
    ]);
  });

  it('generates an Excel unloading report for a manual container without an import file', async () => {
    const manual = await request(app.getHttpServer())
      .post('/api/containers/manual')
      .send({
        containerNo: 'MANU1234567',
        company: 'Manual Customer',
        dockNo: 'D7',
        reason: 'Original manifest could not be parsed',
        destinations: [
          {
            destinationCode: 'YEG1',
            destinationType: 'WAREHOUSE',
            cartons: 36,
            pallets: 4,
            volume: 0,
            note: 'Manual report line',
          },
          {
            destinationCode: 'YVR2',
            cartons: 12,
            pallets: 2,
            volume: 1.5,
          },
        ],
      })
      .expect(201);
    const containerId = manual.body.container.id as string;

    expect(manual.body.container).toMatchObject({
      id: containerId,
      importFileId: null,
      containerNo: 'MANU1234567',
      sourceFormat: 'UNKNOWN',
      parserVersion: 'manual-entry-v1',
      destinations: [
        expect.objectContaining({
          destinationCode: 'YEG1',
          calculatedPallets: 0,
          manualPallets: 4,
          finalPallets: 4,
        }),
        expect.objectContaining({
          destinationCode: 'YVR2',
          calculatedPallets: 0,
          manualPallets: 2,
          finalPallets: 2,
        }),
      ],
    });

    const report = await request(app.getHttpServer())
      .post(`/api/containers/${containerId}/generate-report`)
      .expect(201);
    const reportBody = report.body as GenerateReportBody;

    expect(reportBody.generatedFile).toMatchObject({
      importFileId: null,
      containerId,
      fileType: 'EXCEL_REPORT',
      status: 'GENERATED',
      errorMessage: null,
    });
    expect(reportBody.generatedFile.storagePath).toContain('reports');
    expect(reportBody.generatedFile.storagePath).toContain('MANU1234567');
    await expect(
      stat(reportBody.generatedFile.storagePath),
    ).resolves.toBeDefined();

    const files = await request(app.getHttpServer())
      .get(`/api/containers/${containerId}/files`)
      .expect(200);
    const filesBody = files.body as GeneratedFilesBody;

    expect(filesBody.items).toMatchObject([
      {
        id: reportBody.generatedFile.id,
        importFileId: null,
        containerId,
        fileType: 'EXCEL_REPORT',
        status: 'GENERATED',
      },
    ]);
  });

  it('generates pallet labels for a manual container and rebuilds unused pallets from corrected finalPallets', async () => {
    const manual = await request(app.getHttpServer())
      .post('/api/containers/manual')
      .send({
        containerNo: 'MANU1234567',
        company: 'Manual Customer',
        dockNo: 'D7',
        reason: 'Original manifest could not be parsed',
        destinations: [
          {
            destinationCode: 'YEG1',
            destinationType: 'WAREHOUSE',
            cartons: 36,
            pallets: 4,
            volume: 0,
            note: 'Manual report line',
          },
          {
            destinationCode: 'YVR2',
            cartons: 12,
            pallets: 2,
            volume: 1.5,
          },
        ],
      })
      .expect(201);
    const manualBody = manual.body as ManualContainerBody;
    const containerId = manualBody.container.id;
    const destinationId = manualBody.container.destinations[0].id;

    const labels = await request(app.getHttpServer())
      .post(`/api/containers/${containerId}/generate-labels`)
      .expect(201);
    const labelsBody = labels.body as GenerateLabelsBody;

    expect(labelsBody.generatedFile).toMatchObject({
      importFileId: null,
      containerId,
      fileType: 'PALLET_LABEL_PDF',
      status: 'GENERATED',
      errorMessage: null,
    });
    expect(labelsBody.generatedFile.storagePath).toContain('labels');
    expect(labelsBody.generatedFile.storagePath).toContain('MANU1234567');
    await expect(
      stat(labelsBody.generatedFile.storagePath),
    ).resolves.toBeDefined();
    expect(labelsBody.pallets).toHaveLength(6);
    expect(pallets).toHaveLength(6);
    expect(generatedFiles).toHaveLength(1);
    expect(
      labelsBody.pallets.every(
        (pallet) =>
          pallet.status === 'LABEL_PRINTED' &&
          pallet.qrPayload.startsWith('SSP1|PALLET|') &&
          pallet.qrPayload.includes(pallet.palletId),
      ),
    ).toBe(true);
    expect(
      new Set(labelsBody.pallets.map((pallet) => pallet.qrPayload)).size,
    ).toBe(6);

    const firstGeneratedFileId = labelsBody.generatedFile.id;
    const firstStoragePath = labelsBody.generatedFile.storagePath;
    const firstPalletRecordIds = new Set(
      labelsBody.pallets.map((pallet) => pallet.id),
    );

    await request(app.getHttpServer())
      .patch(`/api/container-destinations/${destinationId}`)
      .send({
        manualPallets: 3,
        reason: 'Office corrected final pallet count before loading',
        correctionNote: 'Rebuild labels from corrected manual count',
      })
      .expect(200)
      .expect((response) => {
        const body = response.body as ContainerDestinationCorrectionBody;
        expect(body.containerDestination).toMatchObject({
          id: destinationId,
          manualPallets: 3,
          finalPallets: 3,
        });
      });

    const regenerated = await request(app.getHttpServer())
      .post(`/api/containers/${containerId}/generate-labels`)
      .expect(201);
    const regeneratedBody = regenerated.body as GenerateLabelsBody;

    expect(regeneratedBody.generatedFile).toMatchObject({
      id: firstGeneratedFileId,
      importFileId: null,
      containerId,
      fileType: 'PALLET_LABEL_PDF',
      status: 'GENERATED',
      storagePath: firstStoragePath,
    });
    expect(regeneratedBody.pallets).toHaveLength(5);
    expect(pallets).toHaveLength(5);
    expect(generatedFiles).toHaveLength(1);
    expect(
      regeneratedBody.pallets.some((pallet) =>
        firstPalletRecordIds.has(pallet.id),
      ),
    ).toBe(false);
    expect(
      new Set(regeneratedBody.pallets.map((pallet) => pallet.qrPayload)).size,
    ).toBe(5);
    expect(
      regeneratedBody.pallets.every((pallet) =>
        pallet.qrPayload.includes(pallet.palletId),
      ),
    ).toBe(true);
    expect(palletEvents).toHaveLength(22);
  }, 30_000);

  it('generates pallet labels, reports inventory summaries, and blocks duplicate generation', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    const parsed = await request(app.getHttpServer())
      .post(`/api/imports/${uploadedBody.id}/parse`)
      .expect(201);
    const parsedBody = parsed.body as ParseResultBody;
    const containerId = parsedBody.containers[0].id;
    const expectedPalletCount = parsedBody.containers[0].destinations.reduce(
      (total, destination) => total + destination.finalPallets,
      0,
    );

    const labels = await request(app.getHttpServer())
      .post(`/api/containers/${containerId}/generate-labels`)
      .expect(201);
    const labelsBody = labels.body as GenerateLabelsBody;

    expect(labelsBody.generatedFile).toMatchObject({
      containerId,
      fileType: 'PALLET_LABEL_PDF',
      status: 'GENERATED',
      errorMessage: null,
    });
    expect(labelsBody.generatedFile.storagePath).toContain('labels');
    expect(labelsBody.generatedFile.storagePath).toMatch(/\.pdf$/);
    await expect(
      stat(labelsBody.generatedFile.storagePath),
    ).resolves.toBeDefined();
    expect(labelsBody.pallets).toHaveLength(expectedPalletCount);
    expect(pallets).toHaveLength(expectedPalletCount);
    expect(palletEvents.length).toBe(expectedPalletCount * 2);
    expect(
      new Set(labelsBody.pallets.map((pallet) => pallet.palletId)).size,
    ).toBe(expectedPalletCount);
    expect(
      labelsBody.pallets.every(
        (pallet) =>
          pallet.status === 'LABEL_PRINTED' &&
          pallet.qrPayload.startsWith('SSP1|PALLET|') &&
          pallet.qrPayload.includes(pallet.palletId),
      ),
    ).toBe(true);

    const list = await request(app.getHttpServer())
      .get(`/api/pallets?containerId=${containerId}`)
      .expect(200);
    const listBody = list.body as PalletListBody;

    expect(listBody.items).toHaveLength(expectedPalletCount);
    expect(listBody.items[0]).toMatchObject({
      containerId,
      status: 'LABEL_PRINTED',
    });

    const containerSummary = await request(app.getHttpServer())
      .get('/api/reports/container-summary')
      .expect(200);
    const containerSummaryBody = containerSummary.body as ContainerSummaryBody;

    expect(containerSummaryBody.items).toMatchObject([
      {
        containerId,
        containerNo: parsedBody.containers[0].containerNo,
        totalPallets: expectedPalletCount,
        loadedPallets: 0,
        remainingPallets: expectedPalletCount,
      },
    ]);

    pallets[0].status = 'LOADED';

    const containerDetail = await request(app.getHttpServer())
      .get(`/api/containers/${containerId}/summary`)
      .expect(200);
    const containerDetailBody =
      containerDetail.body as ContainerDetailSummaryBody;

    expect(containerDetailBody).toMatchObject({
      containerId,
      status: 'LOADING_IN_PROGRESS',
      totalPallets: expectedPalletCount,
      loadedPallets: 1,
      remainingPallets: expectedPalletCount - 1,
    });
    expect(containerDetailBody.destinations[0]).toMatchObject({
      loadedPallets: 1,
    });

    const inventory = await request(app.getHttpServer())
      .get('/api/reports/inventory?status=LOADED')
      .expect(200);
    const inventoryBody = inventory.body as InventoryBody;

    expect(inventoryBody.items).toEqual([
      {
        destinationCode: containerDetailBody.destinations[0].destinationCode,
        totalPallets: 1,
        loadedPallets: 1,
        remainingPallets: 0,
      },
    ]);

    await request(app.getHttpServer())
      .post(`/api/containers/${containerId}/generate-labels`)
      .expect(409)
      .expect((response) => {
        const body = response.body as ErrorBody;
        expect(body.code).toBe('CONTAINER_GENERATION_LOCKED');
      });
  }, 30_000);

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
    generatedFileRecords: GeneratedFileRecord[],
    palletRecords: PalletRecord[],
    palletEventRecords: PalletEventRecord[],
  ) {
    let palletSequence = 0;
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
        findUnique: jest.fn(({ where, include }) => {
          const container =
            containerRecords.find((record) => record.id === where.id) ?? null;
          if (!container || !include) {
            return Promise.resolve(container);
          }

          return Promise.resolve({
            ...container,
            destinations: destinationRecords
              .filter((destination) => destination.containerId === container.id)
              .map((destination) => ({
                ...destination,
                pallets: palletRecords.filter(
                  (pallet) => pallet.containerDestinationId === destination.id,
                ),
              }))
              .sort((left, right) =>
                left.destinationCode.localeCompare(right.destinationCode),
              ),
          });
        }),
        findMany: jest.fn(({ where, select, include }) => {
          const found = containerRecords.filter(
            (container) =>
              where?.importFileId === undefined ||
              container.importFileId === where.importFileId,
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
                    (destination) => destination.containerId === container.id,
                  )
                  .map((destination) => ({
                    ...destination,
                    pallets: palletRecords.filter(
                      (pallet) =>
                        pallet.containerDestinationId === destination.id,
                    ),
                  }))
                  .sort((left, right) =>
                    left.destinationCode.localeCompare(right.destinationCode),
                  ),
              })),
            );
          }

          return Promise.resolve(found);
        }),
        update: jest.fn(({ where, data }) => {
          const record = containerRecords.find(
            (container) => container.id === where.id,
          );
          if (!record) {
            throw new Error(`Container record not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-26T00:02:00.000Z'),
          });
          return Promise.resolve(record);
        }),
        create: jest.fn(({ data }) => {
          const now = new Date('2026-06-26T00:01:00.000Z');
          const record: ContainerRecord = {
            id: `container-${containerRecords.length + 1}`,
            importFileId: data.importFileId ?? null,
            containerNo: data.containerNo,
            dockNo: data.dockNo ?? null,
            company: data.company ?? null,
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
          return Promise.resolve({
            count: originalLength - lineRecords.length,
          });
        }),
      },
      containerDestination: {
        findUnique: jest.fn(({ where }) => {
          const found =
            destinationRecords.find(
              (destination) => destination.id === where.id,
            ) ?? null;
          return Promise.resolve(found);
        }),
        create: jest.fn(({ data }) => {
          const now = new Date('2026-06-26T00:01:00.000Z');
          const record: DestinationRecord = {
            id: `destination-${destinationRecords.length + 1}`,
            containerId: data.containerId,
            destinationCode: data.destinationCode,
            destinationType: data.destinationType,
            cartons: data.cartons,
            volume: data.volume,
            calculatedPallets: data.calculatedPallets,
            manualPallets: data.manualPallets,
            finalPallets: data.finalPallets,
            note: data.note,
            warnings: data.warnings,
            errors: data.errors,
            createdAt: now,
            updatedAt: now,
          };
          destinationRecords.push(record);
          return Promise.resolve(record);
        }),
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
          for (let index = destinationRecords.length - 1; index >= 0; index--) {
            if (ids.has(destinationRecords[index].containerId)) {
              destinationRecords.splice(index, 1);
            }
          }
          return Promise.resolve({
            count: originalLength - destinationRecords.length,
          });
        }),
        update: jest.fn(({ where, data }) => {
          const record = destinationRecords.find(
            (destination) => destination.id === where.id,
          );
          if (!record) {
            throw new Error(`Destination record not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-26T00:02:00.000Z'),
          });
          return Promise.resolve(record);
        }),
      },
      correctionFeedback: {
        create: jest.fn(({ data }) =>
          Promise.resolve({
            id: `correction-${Date.now()}`,
            importFileId: null,
            containerId: null,
            containerLineId: null,
            containerDestinationId: null,
            palletId: null,
            generatedFileId: null,
            correctedById: null,
            note: null,
            ...data,
            createdAt: new Date('2026-06-26T00:01:00.000Z'),
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          }),
        ),
      },
      generatedFile: {
        create: jest.fn(({ data }) => {
          const now = new Date('2026-06-26T00:02:00.000Z');
          const record: GeneratedFileRecord = {
            id: `generated-file-${generatedFileRecords.length + 1}`,
            importFileId: data.importFileId,
            containerId: data.containerId,
            fileType: data.fileType,
            storagePath: data.storagePath,
            fileSha256: data.fileSha256,
            mimeType: data.mimeType,
            fileSizeBytes: data.fileSizeBytes,
            status: data.status,
            errorMessage: data.errorMessage,
            createdAt: now,
            updatedAt: now,
          };
          generatedFileRecords.push(record);
          return Promise.resolve(record);
        }),
        findFirst: jest.fn(({ where }) => {
          const found = generatedFileRecords.find(
            (record) =>
              record.containerId === where.containerId &&
              (where.id === undefined || record.id === where.id) &&
              (where.fileType === undefined ||
                record.fileType === where.fileType),
          );
          return Promise.resolve(found ?? null);
        }),
        findMany: jest.fn(({ where, take, skip }) => {
          const found = generatedFileRecords
            .filter((record) => record.containerId === where.containerId)
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime(),
            );
          const start = skip ?? 0;
          const end = take === undefined ? undefined : start + take;
          return Promise.resolve(found.slice(start, end));
        }),
        update: jest.fn(({ where, data }) => {
          const record = generatedFileRecords.find(
            (item) => item.id === where.id,
          );
          if (!record) {
            throw new Error(`Generated file record not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-26T00:03:00.000Z'),
          });
          return Promise.resolve(record);
        }),
      },
      pallet: {
        create: jest.fn(({ data }) => {
          palletSequence += 1;
          const now = new Date('2026-06-26T00:03:00.000Z');
          const record: PalletRecord = {
            id: `pallet-${palletSequence}`,
            containerDestinationId: data.containerDestinationId,
            palletNo: data.palletNo,
            palletId: data.palletId,
            qrPayload: data.qrPayload,
            status: data.status,
            labelPrintedAt: data.labelPrintedAt,
            loadedAt: data.loadedAt ?? null,
            loadJobId: data.loadJobId ?? null,
            createdAt: now,
            updatedAt: now,
          };
          palletRecords.push(record);
          return Promise.resolve(record);
        }),
        deleteMany: jest.fn(({ where }) => {
          const destinationIds = new Set(where.containerDestinationId.in);
          const originalLength = palletRecords.length;
          for (let index = palletRecords.length - 1; index >= 0; index -= 1) {
            if (
              destinationIds.has(palletRecords[index].containerDestinationId)
            ) {
              palletRecords.splice(index, 1);
            }
          }
          return Promise.resolve({
            count: originalLength - palletRecords.length,
          });
        }),
        updateMany: jest.fn(({ where, data }) => {
          const ids = new Set<string>(where.id.in);
          let count = 0;
          palletRecords.forEach((record) => {
            if (ids.has(record.id)) {
              Object.assign(record, data, {
                updatedAt: new Date('2026-06-26T00:04:00.000Z'),
              });
              count += 1;
            }
          });
          return Promise.resolve({ count });
        }),
        findMany: jest.fn(({ where }) => {
          const found = palletRecords
            .filter((pallet) => {
              const destination = destinationRecords.find(
                (record) => record.id === pallet.containerDestinationId,
              );
              return (
                destination?.containerId ===
                where.containerDestination.containerId
              );
            })
            .map((pallet) => {
              const destination = destinationRecords.find(
                (record) => record.id === pallet.containerDestinationId,
              );
              return {
                ...pallet,
                containerDestination: {
                  containerId: destination?.containerId ?? '',
                  destinationCode: destination?.destinationCode ?? '',
                  destinationType: destination?.destinationType ?? null,
                },
              };
            })
            .sort((left, right) =>
              left.containerDestinationId === right.containerDestinationId
                ? left.palletNo - right.palletNo
                : left.containerDestinationId.localeCompare(
                    right.containerDestinationId,
                  ),
            );
          return Promise.resolve(found);
        }),
      },
      palletEvent: {
        createMany: jest.fn(({ data }) => {
          const now = new Date('2026-06-26T00:04:00.000Z');
          const rows: PalletEventRecord[] = data.map((row, index) => ({
            id: `pallet-event-${palletEventRecords.length + index + 1}`,
            palletId: row.palletId,
            eventType: row.eventType,
            fromStatus: row.fromStatus,
            toStatus: row.toStatus,
            scanPayload: row.scanPayload,
            metadata: row.metadata,
            createdAt: now,
            updatedAt: now,
          }));
          palletEventRecords.push(...rows);
          return Promise.resolve({ count: rows.length });
        }),
      },
    };

    prisma.$transaction = jest.fn((callback) => callback(prisma));

    return prisma;
  }
});
