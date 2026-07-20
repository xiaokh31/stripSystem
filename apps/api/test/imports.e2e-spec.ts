import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdtemp, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { WorkerParserService } from './../src/imports/worker-parser.service';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  authorizedRequest,
  configureAuthTestEnv,
  hrManagerAuthHeader,
  installAuthMock,
  officeAuthHeader,
  warehouseAuthHeader,
  warehouseManagerAuthHeader,
} from './auth-test-helpers';

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
  importedById: string | null;
  deletedAt?: Date | null;
  deletedById?: string | null;
  deleteReason?: string | null;
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
  parserSourceKind?: string;
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
  packageType: string | null;
  cartons: number;
  volume: string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  palletRuleCode: string | null;
  calculationBasisCbm: string | null;
  roundingMode: string | null;
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
  generatedById: string | null;
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
  operatorId: string | null;
  loadJobId?: string | null;
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
  deletedAt?: string | null;
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
      destinationType: string | null;
      packageType: string | null;
      cartons: number;
      calculatedPallets: number;
      finalPallets: number;
      palletRuleCode: string | null;
      calculationBasisCbm: string | null;
      roundingMode: string | null;
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
    activeTotalPallets: number;
    loadedPallets: number;
    remainingPallets: number;
  }>;
}

interface InventoryBody {
  items: Array<{
    destinationCode: string;
    totalPallets: number;
    loadedPallets: number;
    adjustedOutPallets: number;
    cancelledPallets: number;
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
    deletedStorageFileCount?: number;
    loadJobCount?: number;
    operationalPalletCount?: number;
    payContainerCount?: number;
  };
}

interface FindUniqueArgs {
  where: {
    id?: string;
    fileSha256?: string;
    deletedAt?: Date | null;
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
    importedById?: string | null;
  };
}

interface FindManyArgs {
  where?: {
    deletedAt?: Date | null;
  };
  include?: unknown;
  take: number;
  skip: number;
}

describe('ImportsController (e2e)', () => {
  // Real parser/report/label worker subprocesses can exceed Jest's 5 second
  // unit-test default on Docker Desktop while still completing successfully.
  jest.setTimeout(15_000);

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
  let learningCases: any[];
  let profileAuditEvents: any[];
  let prisma: any;
  let originalStorageRoot: string | undefined;

  beforeEach(async () => {
    configureAuthTestEnv();
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
    learningCases = [];
    profileAuditEvents = [];
    prisma = createPrismaMock(
      records,
      containers,
      lines,
      destinations,
      generatedFiles,
      pallets,
      palletEvents,
      learningCases,
      profileAuditEvents,
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

  it('uploads a real xlsx fixture, saves the original file, and writes import_files metadata', async () => {
    const response = await authorizedRequest(app, officeAuthHeader())
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
    expect(records[0].importedById).toBe('auth-office');
  });

  it('rejects duplicate uploads by SHA-256', async () => {
    await authorizedRequest(app)
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);

    const response = await authorizedRequest(app)
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
    const uploaded = await authorizedRequest(app)
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    const list = await authorizedRequest(app)
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

    await authorizedRequest(app)
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
    const uploaded = await authorizedRequest(app)
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;
    const originalStoredPath = uploadedBody.storedPath;

    const parsed = await authorizedRequest(app)
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

    await authorizedRequest(app)
      .get(`/api/imports/${uploadedBody.id}/parse-result`)
      .expect(200)
      .expect((response) => {
        const body = response.body as ParseResultBody;
        expect(body.containers[0].lines.length).toBeGreaterThan(0);
        expect(body.containers[0].destinations.length).toBeGreaterThan(0);
      });
  });

  it('persists UPS courier destinations with nonzero pallets when worker summary package type is missing', async () => {
    const uploaded = await authorizedRequest(app)
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;
    const parseSpy = jest
      .spyOn(WorkerParserService.prototype, 'parseFile')
      .mockResolvedValue({
        task_status: 'SUCCESS',
        source_file: uploadedBody.storedPath,
        sha256: uploadedBody.fileSha256,
        detection: { format_type: 'UNLOADING_PLAN_CN' },
        parsed_result: {
          containerNo: 'UPSU1234567',
          formatType: 'UNLOADING_PLAN_CN',
          parserVersion: 'unloading-plan-cn-v1',
          lines: [
            {
              rowNumber: 2,
              destinationCode: 'UPS',
              packageType: null,
              deliveryMethod: '快递派送',
              cartons: 57,
              volumeCbm: 5.4,
              raw_json: { 仓库代码: 'UPS', 件数: 57, 体积: 5.4 },
            },
          ],
          destinationSummaries: [
            {
              destinationCode: 'UPS',
              packageType: null,
              totalCartons: 57,
              totalVolumeCbm: 5.4,
              lineCount: 1,
            },
          ],
          warnings: [],
          errors: [],
          rawMetadata: { matchedSheet: 'Sheet1' },
        },
        pallet_result: {
          plans: [
            {
              destinationCode: 'UPS',
              destinationType: 'PARCEL_PRIVATE',
              packageType: 'CARTON',
              ruleCode: 'ADDRESS_CARTON_VOLUME_1_8',
              calculationBasisCbm: 1.8,
              roundingMode: 'CEIL',
              totalCartons: 57,
              totalVolumeCbm: 5.4,
              calculatedPallets: 3,
              manualPallets: null,
              finalPallets: 3,
              warnings: [],
            },
          ],
          warnings: [],
          errors: [],
        },
        warnings: [],
        errors: [],
        exception: null,
      });

    try {
      const parsed = await authorizedRequest(app)
        .post(`/api/imports/${uploadedBody.id}/parse`)
        .expect(201);
      const parsedBody = parsed.body as ParseResultBody;

      expect(parsedBody.containers[0].destinations).toMatchObject([
        {
          destinationCode: 'UPS',
          destinationType: 'PARCEL_PRIVATE',
          packageType: 'CARTON',
          cartons: 57,
          calculatedPallets: 3,
          finalPallets: 3,
          palletRuleCode: 'ADDRESS_CARTON_VOLUME_1_8',
          calculationBasisCbm: '1.800',
          roundingMode: 'CEIL',
        },
      ]);
      expect(destinations).toHaveLength(1);
      expect(destinations[0]).toMatchObject({
        destinationCode: 'UPS',
        calculatedPallets: 3,
        finalPallets: 3,
      });
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('generates an Excel unloading report from a parsed real fixture and records generated_files', async () => {
    const uploaded = await authorizedRequest(app)
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    const parsed = await authorizedRequest(app)
      .post(`/api/imports/${uploadedBody.id}/parse`)
      .expect(201);
    const parsedBody = parsed.body as ParseResultBody;
    const containerId = parsedBody.containers[0].id;

    const report = await authorizedRequest(app, officeAuthHeader())
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
    expect(generatedFiles[0].generatedById).toBe('auth-office');

    const files = await authorizedRequest(app)
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
    const manual = await authorizedRequest(app)
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
          calculatedPallets: 5,
          manualPallets: 4,
          finalPallets: 4,
          palletRuleCode: 'YEG1_FOOTPRINT_HEIGHT_PLUS_4',
        }),
        expect.objectContaining({
          destinationCode: 'YVR2',
          calculatedPallets: 1,
          manualPallets: 2,
          finalPallets: 2,
          palletRuleCode: 'OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2',
        }),
      ],
    });

    const report = await authorizedRequest(app)
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

    const files = await authorizedRequest(app)
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
    const manual = await authorizedRequest(app)
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

    const labels = await authorizedRequest(app, officeAuthHeader())
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
    expect(generatedFiles[0].generatedById).toBe('auth-office');
    expect(
      palletEvents.every((event) => event.operatorId === 'auth-office'),
    ).toBe(true);
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

    await authorizedRequest(app, officeAuthHeader())
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

    const regenerated = await authorizedRequest(app, officeAuthHeader())
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
    const uploaded = await authorizedRequest(app)
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    const parsed = await authorizedRequest(app)
      .post(`/api/imports/${uploadedBody.id}/parse`)
      .expect(201);
    const parsedBody = parsed.body as ParseResultBody;
    const containerId = parsedBody.containers[0].id;
    const expectedPalletCount = parsedBody.containers[0].destinations.reduce(
      (total, destination) => total + destination.finalPallets,
      0,
    );

    const labels = await authorizedRequest(app)
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

    const list = await authorizedRequest(app)
      .get(`/api/pallets?containerId=${containerId}`)
      .expect(200);
    const listBody = list.body as PalletListBody;

    expect(listBody.items).toHaveLength(expectedPalletCount);
    expect(listBody.items[0]).toMatchObject({
      containerId,
      status: 'LABEL_PRINTED',
    });

    const containerSummary = await authorizedRequest(app)
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

    const containerDetail = await authorizedRequest(app)
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

    const inventory = await authorizedRequest(app)
      .get('/api/reports/inventory?status=LOADED')
      .expect(200);
    const inventoryBody = inventory.body as InventoryBody;

    expect(inventoryBody.items).toEqual([
      {
        destinationCode: containerDetailBody.destinations[0].destinationCode,
        totalPallets: 1,
        activeTotalPallets: 1,
        loadedPallets: 1,
        adjustedOutPallets: 0,
        cancelledPallets: 0,
        remainingPallets: 0,
      },
    ]);

    await authorizedRequest(app)
      .post(`/api/containers/${containerId}/generate-labels`)
      .expect(409)
      .expect((response) => {
        const body = response.body as ErrorBody;
        expect(body.code).toBe('CONTAINER_GENERATION_LOCKED');
      });
  }, 30_000);

  it('deletes an import and removes original plus generated storage files', async () => {
    const uploaded = await authorizedRequest(app, officeAuthHeader())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    const parsed = await authorizedRequest(app)
      .post(`/api/imports/${uploadedBody.id}/parse`)
      .expect(201);
    const parsedBody = parsed.body as ParseResultBody;
    const containerId = parsedBody.containers[0].id;

    const report = await authorizedRequest(app)
      .post(`/api/containers/${containerId}/generate-report`)
      .expect(201);
    const reportBody = report.body as GenerateReportBody;

    const labels = await authorizedRequest(app)
      .post(`/api/containers/${containerId}/generate-labels`)
      .expect(201);
    const labelsBody = labels.body as GenerateLabelsBody;

    const storagePaths = [
      uploadedBody.storedPath,
      reportBody.generatedFile.storagePath,
      labelsBody.generatedFile.storagePath,
    ];
    await Promise.all(storagePaths.map((storagePath) => stat(storagePath)));

    await authorizedRequest(app)
      .delete(`/api/imports/${uploadedBody.id}`)
      .send({ reason: 'Wrong customer file.' })
      .expect(200)
      .expect((response) => {
        const body = response.body as ImportFileBody;
        expect(body.id).toBe(uploadedBody.id);
        expect(body.deletedAt).toEqual(expect.any(String));
      });

    await Promise.all(
      storagePaths.map((storagePath) =>
        expect(stat(storagePath)).rejects.toMatchObject({ code: 'ENOENT' }),
      ),
    );
    expect(generatedFiles).toHaveLength(0);
    expect(pallets).toHaveLength(0);
    expect(palletEvents).toHaveLength(0);
    expect(containers).toHaveLength(0);
    expect(destinations).toHaveLength(0);

    await authorizedRequest(app)
      .get(
        `/api/containers/${containerId}/files/${reportBody.generatedFile.id}/download`,
      )
      .expect(404);

    const list = await authorizedRequest(app).get('/api/imports').expect(200);
    expect((list.body as ImportListBody).items).toEqual([]);

    const reuploaded = await authorizedRequest(app, officeAuthHeader())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const reuploadedBody = reuploaded.body as ImportFileBody;
    expect(reuploadedBody.fileSha256).toBe(uploadedBody.fileSha256);
    expect(reuploadedBody.id).not.toBe(uploadedBody.id);

    const auditCalls = (prisma.correctionFeedback.create as jest.Mock).mock
      .calls;
    const deleteAudit = auditCalls.find(
      ([call]) => call.data.fieldName === 'deletedAt',
    );
    expect(deleteAudit?.[0].data.newValue).toMatchObject({
      deletedStorageFileCount: 3,
      generatedFileCount: 2,
      missingStoragePaths: [],
      palletCount: labelsBody.pallets.length,
    });
  }, 30_000);

  it('audits missing storage files without blocking import deletion', async () => {
    const uploaded = await authorizedRequest(app, officeAuthHeader())
      .post('/api/imports')
      .attach('file', fixturePath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    await unlink(uploadedBody.storedPath);

    await authorizedRequest(app)
      .delete(`/api/imports/${uploadedBody.id}`)
      .send({ reason: 'Cleanup missing original file metadata.' })
      .expect(200);

    const auditCalls = (prisma.correctionFeedback.create as jest.Mock).mock
      .calls;
    const deleteAudit = auditCalls.find(
      ([call]) => call.data.fieldName === 'deletedAt',
    );
    expect(deleteAudit?.[0].data.newValue).toMatchObject({
      deletedStorageFileCount: 0,
      deletedStoragePaths: [],
      missingStoragePaths: [uploadedBody.storedPath],
    });
  });

  it('rejects import deletion when a storage path escapes the storage root', async () => {
    const outsidePath = join(
      tmpdir(),
      `import-delete-outside-${Date.now()}.xlsx`,
    );
    const now = new Date('2026-06-27T00:00:00.000Z');
    await writeFile(outsidePath, 'outside storage root');
    records.push({
      id: 'import-outside-root',
      originalFilename: 'outside.xlsx',
      storedPath: outsidePath,
      fileSha256: 'outside-sha',
      mimeType: null,
      fileSizeBytes: 20,
      format: 'UNKNOWN',
      importStatus: 'UPLOADED',
      parseStatus: 'NOT_PARSED',
      parserVersion: null,
      warningCount: 0,
      errorCount: 0,
      errorMessage: null,
      rawMetadata: null,
      importedById: 'auth-office',
      deletedAt: null,
      deletedById: null,
      deleteReason: null,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await authorizedRequest(app)
        .delete('/api/imports/import-outside-root')
        .send({ reason: 'Path safety check.' })
        .expect(400)
        .expect((response) => {
          const body = response.body as ErrorBody;
          expect(body.code).toBe('IMPORT_DELETE_STORAGE_PATH_OUTSIDE_ROOT');
        });

      expect(records[0].deletedAt).toBeNull();
      await expect(stat(outsidePath)).resolves.toBeTruthy();
    } finally {
      await unlink(outsidePath).catch(() => undefined);
    }
  });

  it('blocks deletion for operational pallets and leaves storage files intact', async () => {
    const originalPath = join(storageRoot, 'blocked-original.xlsx');
    const generatedPath = join(storageRoot, 'blocked-label.pdf');
    await writeFile(originalPath, 'original bytes');
    await writeFile(generatedPath, 'label bytes');
    const now = new Date('2026-06-27T00:00:00.000Z');

    records.push({
      id: 'import-blocked',
      originalFilename: 'blocked.xlsx',
      storedPath: originalPath,
      fileSha256: 'blocked-sha',
      mimeType: null,
      fileSizeBytes: 14,
      format: 'CN_UNLOADING_PLAN',
      importStatus: 'IMPORTED',
      parseStatus: 'PARSED',
      parserVersion: 'test',
      warningCount: 0,
      errorCount: 0,
      errorMessage: null,
      rawMetadata: null,
      importedById: 'auth-office',
      deletedAt: null,
      deletedById: null,
      deleteReason: null,
      createdAt: now,
      updatedAt: now,
    });
    containers.push({
      id: 'container-blocked',
      importFileId: 'import-blocked',
      containerNo: 'BLOCKED123',
      sourceFormat: 'CN_UNLOADING_PLAN',
      parserVersion: 'test',
      status: 'PARSED',
      rawJson: {},
      warnings: [],
      errors: [],
      createdAt: now,
      updatedAt: now,
    });
    destinations.push({
      id: 'destination-blocked',
      containerId: 'container-blocked',
      destinationCode: 'YYZ',
      destinationType: null,
      packageType: 'UNSPECIFIED',
      cartons: 10,
      volume: '1.000',
      calculatedPallets: 1,
      manualPallets: null,
      finalPallets: 1,
      palletRuleCode: null,
      calculationBasisCbm: null,
      roundingMode: null,
      note: null,
      warnings: [],
      errors: [],
      createdAt: now,
      updatedAt: now,
    });
    generatedFiles.push({
      id: 'generated-blocked',
      importFileId: null,
      containerId: 'container-blocked',
      fileType: 'PALLET_LABEL_PDF',
      storagePath: generatedPath,
      fileSha256: 'generated-sha',
      mimeType: 'application/pdf',
      fileSizeBytes: 11,
      status: 'GENERATED',
      errorMessage: null,
      generatedById: 'auth-office',
      createdAt: now,
      updatedAt: now,
    });
    pallets.push({
      id: 'pallet-blocked',
      containerDestinationId: 'destination-blocked',
      palletNo: 1,
      palletId: 'PALLET-BLOCKED',
      qrPayload: 'SSP1|PALLET|PALLET-BLOCKED',
      status: 'LOADED',
      labelPrintedAt: now,
      loadedAt: now,
      loadJobId: null,
      createdAt: now,
      updatedAt: now,
    });

    await authorizedRequest(app)
      .delete('/api/imports/import-blocked')
      .send({ reason: 'Should be blocked.' })
      .expect(409)
      .expect((response) => {
        const body = response.body as ErrorBody;
        expect(body.code).toBe('IMPORT_DELETE_BLOCKED_IN_USE');
        expect(body.details?.operationalPalletCount).toBe(1);
      });

    expect(
      records.find((record) => record.id === 'import-blocked')?.deletedAt,
    ).toBeNull();
    await expect(stat(originalPath)).resolves.toBeTruthy();
    await expect(stat(generatedPath)).resolves.toBeTruthy();
    expect(generatedFiles).toHaveLength(1);
    expect(pallets).toHaveLength(1);
  });

  it('records worker parse errors without creating a successful container', async () => {
    const corruptPath = join(storageRoot, 'corrupt.xlsx');
    await writeFile(corruptPath, 'not a real Excel workbook');

    const uploaded = await authorizedRequest(app)
      .post('/api/imports')
      .attach('file', corruptPath)
      .expect(201);
    const uploadedBody = uploaded.body as ImportFileBody;

    const parsed = await authorizedRequest(app)
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

    await authorizedRequest(app)
      .get(`/api/imports/${uploadedBody.id}/parse-result`)
      .expect(200)
      .expect((response) => {
        const body = response.body as ParseResultBody;
        expect(body.importFile.parseStatus).toBe('ERROR');
        expect(body.containers).toEqual([]);
      });
  });

  it('links a real unsupported upload to one learning case and manual result with RBAC and deletion protection', async () => {
    const unsupportedFixture = resolve(
      process.cwd(),
      '..',
      '..',
      'samples',
      'workform',
      'Bestar_work_form.xlsx',
    );
    const uploaded = await authorizedRequest(app, officeAuthHeader())
      .post('/api/imports')
      .attach('file', unsupportedFixture)
      .expect(201);
    const importFile = uploaded.body as ImportFileBody;

    const parsed = await authorizedRequest(app, officeAuthHeader())
      .post(`/api/imports/${importFile.id}/parse`)
      .expect(201);
    expect(parsed.body.importFile.parseStatus).toBe('ERROR');
    expect(parsed.body.containers).toEqual([]);

    const invalidLearningRequest = await authorizedRequest(
      app,
      officeAuthHeader(),
    )
      .post('/api/parser-learning-cases')
      .send({ importFileId: 123, unexpected: true })
      .expect(400);
    expect(invalidLearningRequest.body).toMatchObject({
      code: 'PARSER_LEARNING_VALIDATION_FAILED',
      message: 'PARSER_LEARNING_VALIDATION_FAILED',
      details: { fields: ['unexpected'] },
    });
    const invalidManualLearningLink = await authorizedRequest(
      app,
      officeAuthHeader(),
    )
      .post('/api/containers/manual')
      .send({
        containerNo: 'INVALIDLINK01',
        learningCaseId: 123,
        destinations: [
          { destinationCode: 'YEG1', cartons: 1, pallets: 1, volume: 0.1 },
        ],
      })
      .expect(400);
    expect(invalidManualLearningLink.body).toMatchObject({
      code: 'PARSER_LEARNING_VALIDATION_FAILED',
      message: 'PARSER_LEARNING_VALIDATION_FAILED',
      details: { fields: ['learningCaseId'] },
    });

    const starts = await Promise.all([
      authorizedRequest(app, officeAuthHeader())
        .post('/api/parser-learning-cases')
        .send({ importFileId: importFile.id }),
      authorizedRequest(app, officeAuthHeader())
        .post('/api/parser-learning-cases')
        .send({ importFileId: importFile.id }),
    ]);
    expect(starts.map((response) => response.status)).toEqual([201, 201]);
    expect(starts[0].body.id).toBe(starts[1].body.id);
    expect(learningCases).toHaveLength(1);

    await authorizedRequest(app, warehouseAuthHeader())
      .post('/api/parser-learning-cases')
      .send({ importFileId: importFile.id })
      .expect(403);

    const learningCaseId = starts[0].body.id as string;
    await authorizedRequest(app)
      .get(`/api/parser-learning-cases/${learningCaseId}`)
      .expect(200);
    await authorizedRequest(app, officeAuthHeader())
      .get(`/api/parser-learning-cases/${learningCaseId}`)
      .expect(200);
    for (const authorization of [
      warehouseAuthHeader(),
      hrManagerAuthHeader(),
      warehouseManagerAuthHeader(),
    ]) {
      await authorizedRequest(app, authorization)
        .get(`/api/parser-learning-cases/${learningCaseId}`)
        .expect(403);
    }

    const manual = await authorizedRequest(app, officeAuthHeader())
      .post('/api/containers/manual')
      .send({
        containerNo: 'LEARN1234567',
        learningCaseId,
        destinations: [
          { destinationCode: 'YEG1', cartons: 12, pallets: 2, volume: 1.2 },
        ],
      })
      .expect(201);
    expect(manual.body).toMatchObject({
      container: {
        importFileId: null,
        parserVersion: 'manual-entry-v1',
      },
      learningCase: {
        id: learningCaseId,
        sourceImportId: importFile.id,
        status: 'OPEN',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        linkedContainer: {
          id: manual.body.container.id,
          parserSourceKind: 'MANUAL',
          rawMetadata: expect.objectContaining({
            source: 'manual-unloading-report',
          }),
        },
      },
    });

    const read = await authorizedRequest(app, officeAuthHeader())
      .get(`/api/parser-learning-cases/${learningCaseId}`)
      .expect(200);
    expect(read.body).toMatchObject({
      sourceImportId: importFile.id,
      sourceImport: {
        id: importFile.id,
        parseStatus: 'ERROR',
      },
      linkedContainer: {
        id: manual.body.container.id,
        rawMetadata: expect.objectContaining({
          source: 'manual-unloading-report',
        }),
      },
    });

    await authorizedRequest(app, officeAuthHeader())
      .delete(`/api/imports/${importFile.id}`)
      .send({ reason: 'UNSUPPORTED_LAYOUT' })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('IMPORT_USED_BY_PARSER_LEARNING');
      });
    await expect(stat(importFile.storedPath)).resolves.toBeDefined();

    await authorizedRequest(app, officeAuthHeader())
      .post(`/api/parser-learning-cases/${learningCaseId}/unlink-container`)
      .send({})
      .expect(201)
      .expect((response) => {
        expect(response.body.status).toBe('OPEN');
      });
    await authorizedRequest(app, officeAuthHeader())
      .post(`/api/parser-learning-cases/${learningCaseId}/close`)
      .send({ reasonCode: 'OBSOLETE_DRAFT' })
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'CLOSED',
          sourceImportId: importFile.id,
          sourceImport: null,
          linkedContainer: null,
        });
      });

    const restarted = await authorizedRequest(app, officeAuthHeader())
      .post('/api/parser-learning-cases')
      .send({ importFileId: importFile.id })
      .expect(201);
    const concurrentLinks = await Promise.all([
      authorizedRequest(app, officeAuthHeader())
        .post('/api/containers/manual')
        .send({
          containerNo: 'RACE1234561',
          learningCaseId: restarted.body.id,
          destinations: [{ destinationCode: 'YEG1', cartons: 1, pallets: 1 }],
        }),
      authorizedRequest(app, officeAuthHeader())
        .post('/api/containers/manual')
        .send({
          containerNo: 'RACE1234562',
          learningCaseId: restarted.body.id,
          destinations: [{ destinationCode: 'YVR2', cartons: 1, pallets: 1 }],
        }),
    ]);
    expect(concurrentLinks.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const racedCase = await authorizedRequest(app, officeAuthHeader())
      .get(`/api/parser-learning-cases/${restarted.body.id}`)
      .expect(200);
    expect(racedCase.body.status).toBe('OPEN');
    expect(['RACE1234561', 'RACE1234562']).toContain(
      racedCase.body.linkedContainer.containerNo,
    );

    expect(profileAuditEvents.map((event) => event.eventCode)).toEqual(
      expect.arrayContaining([
        'CASE_CREATED',
        'CONTAINER_LINKED',
        'IMPORT_DELETE_BLOCKED',
        'CONTAINER_UNLINKED',
        'CASE_CLOSED',
      ]),
    );
  });

  it('rejects non-xlsx uploads and invalid list query DTOs', async () => {
    const textPath = join(storageRoot, 'not-a-plan.txt');
    await writeFile(textPath, 'not a real Excel file');

    await authorizedRequest(app)
      .post('/api/imports')
      .attach('file', textPath)
      .expect(400)
      .expect((response) => {
        const body = response.body as ErrorBody;
        expect(body.code).toBe('INVALID_IMPORT_FILE_TYPE');
      });

    await authorizedRequest(app)
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
    parserLearningCaseRecords: any[],
    parserProfileAuditEventRecords: any[],
  ) {
    let palletSequence = 0;
    const importContainerSummaries = (importFileId: string) =>
      containerRecords
        .filter((container) => container.importFileId === importFileId)
        .map((container) => ({
          id: container.id,
          containerNo: container.containerNo,
          status: container.status,
          destinations: destinationRecords
            .filter((destination) => destination.containerId === container.id)
            .map((destination) => ({
              pallets: palletRecords.filter(
                (pallet) => pallet.containerDestinationId === destination.id,
              ),
            })),
        }));
    const importRecordResponse = (
      record: ImportRecord,
      args?: { include?: unknown; select?: unknown },
    ) => {
      if (args?.include || args?.select) {
        return {
          ...record,
          containers: importContainerSummaries(record.id),
        };
      }

      return record;
    };
    const matchesDeletedAtFilter = (
      record: ImportRecord,
      deletedAt: Date | null | undefined,
    ) =>
      deletedAt === undefined ||
      (deletedAt === null ? !record.deletedAt : true);
    const matchesContainerIdFilter = (
      containerId: string,
      filter: string | { in?: string[] } | undefined,
    ) => {
      if (filter === undefined) {
        return true;
      }
      if (typeof filter === 'string') {
        return containerId === filter;
      }
      if (Array.isArray(filter.in)) {
        return filter.in.includes(containerId);
      }
      return true;
    };
    const prisma: any = {
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      operationalSetting: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      importFile: {
        findUnique: jest.fn(
          (args: FindUniqueArgs & { include?: unknown; select?: unknown }) => {
            const { where } = args;
            const found = where.id
              ? importRecords.find((record) => record.id === where.id)
              : importRecords.find(
                  (record) => record.fileSha256 === where.fileSha256,
                );
            if (!found || !matchesDeletedAtFilter(found, where.deletedAt)) {
              return Promise.resolve(null);
            }

            return Promise.resolve(importRecordResponse(found, args));
          },
        ),
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
            importedById: data.importedById ?? null,
            deletedAt: null,
            deletedById: null,
            deleteReason: null,
            createdAt: now,
            updatedAt: now,
          };
          importRecords.push(record);
          return Promise.resolve(record);
        }),
        update: jest.fn(({ where, data, include }) => {
          const record = importRecords.find((item) => item.id === where.id);
          if (!record) {
            throw new Error(`Import record not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-26T00:01:00.000Z'),
          });
          return Promise.resolve(importRecordResponse(record, { include }));
        }),
        findMany: jest.fn(({ where, include, take, skip }: FindManyArgs) => {
          const found = importRecords
            .filter((record) =>
              matchesDeletedAtFilter(record, where?.deletedAt),
            )
            .slice(skip, skip + take)
            .reverse()
            .map((record) => importRecordResponse(record, { include }));
          return Promise.resolve(found);
        }),
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
            parserSourceKind: data.parserSourceKind ?? 'BUILT_IN',
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
            packageType: data.packageType ?? null,
            cartons: data.cartons,
            volume: data.volume,
            calculatedPallets: data.calculatedPallets,
            manualPallets: data.manualPallets,
            finalPallets: data.finalPallets,
            palletRuleCode: data.palletRuleCode ?? null,
            calculationBasisCbm: data.calculationBasisCbm ?? null,
            roundingMode: data.roundingMode ?? null,
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
            packageType: row.packageType ?? null,
            cartons: row.cartons,
            volume: row.volume,
            calculatedPallets: row.calculatedPallets,
            manualPallets: row.manualPallets,
            finalPallets: row.finalPallets,
            palletRuleCode: row.palletRuleCode ?? null,
            calculationBasisCbm: row.calculationBasisCbm ?? null,
            roundingMode: row.roundingMode ?? null,
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
      parserLearningCase: {
        findUnique: jest.fn(({ where }) => {
          const record = parserLearningCaseRecords.find((item) =>
            where.id !== undefined
              ? item.id === where.id
              : item.sourceImportId === where.sourceImportId,
          );
          return Promise.resolve(record ? learningCaseResponse(record) : null);
        }),
        create: jest.fn(({ data }) => {
          if (
            parserLearningCaseRecords.some(
              (item) => item.sourceImportId === data.sourceImportId,
            )
          ) {
            return Promise.reject(
              Object.assign(new Error('P2002'), { code: 'P2002' }),
            );
          }
          const now = new Date('2026-07-18T00:00:00.000Z');
          const record = {
            id: `learning-case-${parserLearningCaseRecords.length + 1}`,
            sourceImportId: data.sourceImportId,
            sourceImportReferenceId: data.sourceImportReferenceId,
            sourceFileSha256: data.sourceFileSha256,
            linkedContainerId: null,
            status: 'OPEN',
            draftRevision: 0,
            draftDefinition: null,
            completionSnapshot: null,
            replaySummary: null,
            activeReplayToken: null,
            lastErrorCode: null,
            createdById: data.createdById,
            updatedById: data.updatedById,
            closedById: null,
            closedAt: null,
            createdAt: now,
            updatedAt: now,
          };
          parserLearningCaseRecords.push(record);
          return Promise.resolve(learningCaseResponse(record));
        }),
        updateMany: jest.fn(({ where, data }) => {
          const record = parserLearningCaseRecords.find((item) => {
            if (item.id !== where.id) return false;
            if (
              where.status?.not !== undefined &&
              item.status === where.status.not
            ) {
              return false;
            }
            if (
              typeof where.status === 'string' &&
              item.status !== where.status
            ) {
              return false;
            }
            if (
              where.linkedContainerId !== undefined &&
              where.linkedContainerId !== null &&
              where.linkedContainerId.not !== undefined &&
              item.linkedContainerId === where.linkedContainerId.not
            ) {
              return false;
            }
            if (
              where.linkedContainerId === null &&
              item.linkedContainerId !== null
            ) {
              return false;
            }
            if (
              where.sourceImportId?.not === null &&
              item.sourceImportId === null
            ) {
              return false;
            }
            if (
              where.draftRevision !== undefined &&
              item.draftRevision !== where.draftRevision
            ) {
              return false;
            }
            if (
              where.activeReplayToken !== undefined &&
              item.activeReplayToken !== where.activeReplayToken
            ) {
              return false;
            }
            return true;
          });
          if (!record) return Promise.resolve({ count: 0 });
          if (
            parserLearningCaseRecords.some(
              (item) =>
                item.id !== record.id &&
                item.linkedContainerId === data.linkedContainerId,
            )
          ) {
            return Promise.reject(
              Object.assign(new Error('P2002'), { code: 'P2002' }),
            );
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-07-18T00:01:00.000Z'),
          });
          return Promise.resolve({ count: 1 });
        }),
        update: jest.fn(({ where, data }) => {
          const record = parserLearningCaseRecords.find(
            (item) => item.id === where.id,
          );
          if (!record) throw new Error(`Learning case not found: ${where.id}`);
          Object.assign(record, data, {
            updatedAt: new Date('2026-07-18T00:02:00.000Z'),
          });
          return Promise.resolve(learningCaseResponse(record));
        }),
      },
      parserProfileEvidence: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      parserProfileVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      parserProfileAuditEvent: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `profile-audit-${parserProfileAuditEventRecords.length + 1}`,
            ...data,
            occurredAt: new Date('2026-07-18T00:00:00.000Z'),
            createdAt: new Date('2026-07-18T00:00:00.000Z'),
          };
          parserProfileAuditEventRecords.push(record);
          return Promise.resolve(record);
        }),
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
            generatedById: data.generatedById ?? null,
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
            .filter((record) => {
              if (Array.isArray(where?.OR)) {
                return where.OR.some((condition) => {
                  if (
                    condition.importFileId !== undefined &&
                    record.importFileId === condition.importFileId
                  ) {
                    return true;
                  }
                  if (condition.containerId?.in) {
                    return (
                      record.containerId !== null &&
                      condition.containerId.in.includes(record.containerId)
                    );
                  }
                  return false;
                });
              }

              return (
                where?.containerId === undefined ||
                record.containerId === where.containerId
              );
            })
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime(),
            );
          const start = skip ?? 0;
          const end = take === undefined ? undefined : start + take;
          return Promise.resolve(found.slice(start, end));
        }),
        deleteMany: jest.fn(({ where }) => {
          const ids = new Set<string>(where.id.in);
          const originalLength = generatedFileRecords.length;
          for (
            let index = generatedFileRecords.length - 1;
            index >= 0;
            index -= 1
          ) {
            if (ids.has(generatedFileRecords[index].id)) {
              generatedFileRecords.splice(index, 1);
            }
          }
          return Promise.resolve({
            count: originalLength - generatedFileRecords.length,
          });
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
          const destinationIds = new Set(
            where.containerDestinationId?.in ?? [],
          );
          const ids = new Set<string>(where.id?.in ?? []);
          const originalLength = palletRecords.length;
          for (let index = palletRecords.length - 1; index >= 0; index -= 1) {
            if (
              ids.has(palletRecords[index].id) ||
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
              return matchesContainerIdFilter(
                destination?.containerId ?? '',
                where?.containerDestination?.containerId,
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
                events: palletEventRecords.filter(
                  (event) => event.palletId === pallet.id,
                ),
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
            scanPayload: row.scanPayload ?? null,
            loadJobId: row.loadJobId ?? null,
            metadata: row.metadata,
            operatorId: row.operatorId ?? null,
            createdAt: now,
            updatedAt: now,
          }));
          palletEventRecords.push(...rows);
          return Promise.resolve({ count: rows.length });
        }),
        deleteMany: jest.fn(({ where }) => {
          const ids = new Set<string>(where.palletId.in);
          const originalLength = palletEventRecords.length;
          for (
            let index = palletEventRecords.length - 1;
            index >= 0;
            index -= 1
          ) {
            if (ids.has(palletEventRecords[index].palletId ?? '')) {
              palletEventRecords.splice(index, 1);
            }
          }
          return Promise.resolve({
            count: originalLength - palletEventRecords.length,
          });
        }),
      },
      loadJob: {
        count: jest.fn(() => Promise.resolve(0)),
      },
      payContainerContainer: {
        count: jest.fn(() => Promise.resolve(0)),
      },
    };

    prisma.$queryRaw = jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const statement = strings.join('?');
        const statusFilter = values.find(
          (value) =>
            typeof value === 'string' &&
            [
              'PLANNED',
              'LABEL_PRINTED',
              'LOADING',
              'LOADED',
              'ADJUSTED_OUT',
              'CANCELLED',
              'EXCEPTION',
            ].includes(value),
        ) as string | undefined;
        const matchingPallets = (destinationId: string) =>
          palletRecords.filter(
            (pallet) =>
              pallet.containerDestinationId === destinationId &&
              (!statusFilter || pallet.status === statusFilter),
          );
        const stats = (items: PalletRecord[]) => ({
          activeTotalPallets: items.filter(
            (pallet) =>
              pallet.status !== 'ADJUSTED_OUT' && pallet.status !== 'CANCELLED',
          ).length,
          adjustedOutPallets: items.filter(
            (pallet) => pallet.status === 'ADJUSTED_OUT',
          ).length,
          cancelledPallets: items.filter(
            (pallet) => pallet.status === 'CANCELLED',
          ).length,
          loadedPallets: items.filter((pallet) => pallet.status === 'LOADED')
            .length,
          remainingPallets: items.filter(
            (pallet) =>
              pallet.status !== 'LOADED' &&
              pallet.status !== 'ADJUSTED_OUT' &&
              pallet.status !== 'CANCELLED',
          ).length,
          totalPallets: items.length,
        });

        if (statement.includes('GROUP BY d."destination_code"')) {
          const grouped = new Map<string, PalletRecord[]>();
          for (const destination of destinationRecords) {
            grouped.set(
              destination.destinationCode,
              (grouped.get(destination.destinationCode) ?? []).concat(
                matchingPallets(destination.id),
              ),
            );
          }
          return Promise.resolve(
            [...grouped.entries()]
              .filter(([, items]) => items.length > 0)
              .map(([destinationCode, items]) => ({
                destinationCode,
                ...stats(items),
              })),
          );
        }
        if (statement.includes('GROUP BY c."id"')) {
          return Promise.resolve(
            containerRecords.flatMap((container) => {
              const containerDestinations = destinationRecords.filter(
                (destination) => destination.containerId === container.id,
              );
              const filtered = containerDestinations.flatMap((destination) =>
                matchingPallets(destination.id),
              );
              const lifecycle = containerDestinations.flatMap((destination) =>
                palletRecords.filter(
                  (pallet) => pallet.containerDestinationId === destination.id,
                ),
              );
              if (filtered.length === 0) return [];
              const activeLifecycle = lifecycle.filter(
                (pallet) =>
                  pallet.status !== 'ADJUSTED_OUT' &&
                  pallet.status !== 'CANCELLED',
              );
              return [
                {
                  containerId: container.id,
                  containerNo: container.containerNo,
                  createdAt: container.createdAt,
                  effectiveLoadedPallets: activeLifecycle.filter(
                    (pallet) => pallet.status === 'LOADED' || pallet.loadedAt,
                  ).length,
                  hasLoadingSignal: activeLifecycle.some(
                    (pallet) => pallet.status === 'LOADING' || pallet.loadJobId,
                  ),
                  lifecycleActivePallets: activeLifecycle.length,
                  payClassification: null,
                  payTrailerNumber: null,
                  storedStatus: container.status,
                  ...stats(filtered),
                },
              ];
            }),
          );
        }
        return Promise.resolve([]);
      },
    );
    prisma.$transaction = jest.fn((callback) => callback(prisma));

    function learningCaseResponse(record: any) {
      const sourceImport = importRecords.find(
        (item) => item.id === record.sourceImportId,
      );
      const linkedContainer = containerRecords.find(
        (item) => item.id === record.linkedContainerId,
      );
      return {
        ...record,
        sourceImport: sourceImport
          ? {
              id: sourceImport.id,
              originalFilename: sourceImport.originalFilename,
              format: sourceImport.format,
              parseStatus: sourceImport.parseStatus,
              rawMetadata: sourceImport.rawMetadata,
              storedPath: sourceImport.storedPath,
              fileSha256: sourceImport.fileSha256,
            }
          : null,
        linkedContainer: linkedContainer
          ? {
              ...linkedContainer,
              rawJson: linkedContainer.rawJson,
              destinations: destinationRecords.filter(
                (destination) => destination.containerId === linkedContainer.id,
              ),
              lines: lineRecords.filter(
                (line) => line.containerId === linkedContainer.id,
              ),
            }
          : null,
        profileVersions: [],
      };
    }

    return prisma;
  }
});
