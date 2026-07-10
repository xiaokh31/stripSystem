import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { WorkerUnloadingSummaryService } from './../src/unloading-summary/worker-unloading-summary.service';
import {
  authorizedRequest,
  configureAuthTestEnv,
  installAuthMock,
  officeAuthHeader,
  warehouseAuthHeader,
  warehouseManagerAuthHeader,
} from './auth-test-helpers';

describe('Monthly unloading summary API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: any;
  let storageRoot: string;
  let originalStorageRoot: string | undefined;

  beforeEach(async () => {
    configureAuthTestEnv();
    originalStorageRoot = process.env.STORAGE_ROOT;
    storageRoot = await mkdtemp(join(tmpdir(), 'unloading-summary-e2e-'));
    process.env.STORAGE_ROOT = storageRoot;
    prisma = createPrismaMock();
    installAuthMock(prisma);

    const workerSummary = {
      writeSummary: jest.fn(async (payload, outputDir) => {
        await mkdir(outputDir, { recursive: true });
        const outputPath = join(outputDir, 'monthly-summary.xlsx');
        await writeFile(outputPath, `xlsx bytes ${payload.month}`);
        return {
          task_status: 'GENERATED',
          summary_result: {
            outputPath,
            mimeType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            warnings: [],
            errors: [],
          },
        };
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(WorkerUnloadingSummaryService)
      .useValue(workerSummary)
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

  it('allows office and warehouse manager to review and export monthly unloading summary', async () => {
    const months = await authorizedRequest(app, officeAuthHeader())
      .get('/api/unloading-summary/months')
      .expect(200);

    expect(months.body).toMatchObject({
      availableMonths: [
        {
          month: '2026-06',
          completedContainerCount: 3,
          rowCount: 3,
        },
      ],
      missingCompletionReviewCount: 1,
    });

    const summary = await authorizedRequest(app, officeAuthHeader())
      .get('/api/unloading-summary?month=2026-06')
      .expect(200);

    expect(summary.body).toMatchObject({
      month: '2026-06',
      sourceContainerCount: 3,
      rowCount: 3,
      selectedMonthHasRows: true,
    });
    expect(summary.body.availableMonths.map((month) => month.month)).toEqual([
      '2026-06',
    ]);
    expect(summary.body.rows.map((row) => row.status)).toEqual([
      'UNLOADED',
      'LOADING_IN_PROGRESS',
      'LOADED',
    ]);
    expect(summary.body.rows[0]).toMatchObject({
      containerNo: 'BEAU5946301',
      status: 'UNLOADED',
      dateBusinessTag: '6.4海柜',
      destinationText: 'YYC4 / AMAZON_FBA',
    });
    expect(summary.body.reviewItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_UNLOADING_COMPLETED_AT',
          containerNo: 'NODATE00001',
        }),
      ]),
    );

    const exported = await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/unloading-summary/exports')
      .send({ month: '2026-06' })
      .expect(201);

    expect(exported.body.generatedFile).toMatchObject({
      fileType: 'MONTHLY_UNLOADING_SUMMARY_XLSX',
      status: 'GENERATED',
      downloadUrl: expect.stringContaining('/api/unloading-summary/exports/'),
    });
    expect(exported.body.generatedFiles).toHaveLength(1);
    expect(prisma.__generatedFiles[0]).toMatchObject({
      generatedById: 'auth-warehouse-manager',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const download = await authorizedRequest(app, officeAuthHeader())
      .get(
        `/api/unloading-summary/exports/${exported.body.generatedFile.id}/download`,
      )
      .expect(200);
    expect(download.text).toBe('xlsx bytes 2026-06');
  });

  it('keeps explicit empty months empty and rejects blank exports', async () => {
    const summary = await authorizedRequest(app, officeAuthHeader())
      .get('/api/unloading-summary?month=2026-07')
      .expect(200);

    expect(summary.body).toMatchObject({
      month: '2026-07',
      sourceContainerCount: 0,
      rowCount: 0,
      selectedMonthHasRows: false,
    });
    expect(summary.body.availableMonths.map((month) => month.month)).toEqual([
      '2026-06',
    ]);

    const exported = await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/unloading-summary/exports')
      .send({ month: '2026-07' })
      .expect(400);

    expect(exported.body).toMatchObject({
      code: 'UNLOADING_SUMMARY_NO_ROWS_FOR_MONTH',
      details: {
        month: '2026-07',
        availableMonths: [
          expect.objectContaining({
            month: '2026-06',
            rowCount: 3,
          }),
        ],
      },
    });
    expect(prisma.__generatedFiles).toHaveLength(0);
  });

  it('blocks ordinary warehouse users from monthly unloading summary APIs', async () => {
    await request(app.getHttpServer())
      .get('/api/unloading-summary/months')
      .set('Authorization', warehouseAuthHeader())
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/unloading-summary?month=2026-06')
      .set('Authorization', warehouseAuthHeader())
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/unloading-summary/exports')
      .set('Authorization', warehouseAuthHeader())
      .send({ month: '2026-06' })
      .expect(403);
  });

  function createPrismaMock() {
    const containers = containerFixtures();
    const payContainers = payContainerFixtures(containers);
    const generatedFiles: any[] = [];

    const mock: any = {
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      payContainer: {
        findMany: jest.fn(({ where }) => {
          if (where?.completedAt?.not === null) {
            return Promise.resolve(
              payContainers.filter((payContainer) => payContainer.completedAt),
            );
          }

          return Promise.resolve(
            payContainers.filter((payContainer) => {
              const completedAt = payContainer.completedAt
                ? new Date(payContainer.completedAt).getTime()
                : Number.NaN;
              return (
                !Number.isNaN(completedAt) &&
                completedAt >= where.completedAt.gte.getTime() &&
                completedAt < where.completedAt.lt.getTime()
              );
            }),
          );
        }),
      },
      container: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            containers.filter((container) =>
              where.status.in.includes(container.status),
            ),
          ),
        ),
      },
      generatedFile: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            generatedFiles.filter((file) => file.fileType === where.fileType),
          ),
        ),
        create: jest.fn(({ data }) => {
          const record = {
            id: `generated-file-${generatedFiles.length + 1}`,
            importFileId: null,
            containerId: null,
            createdAt: new Date('2026-07-06T10:00:00.000Z'),
            updatedAt: new Date('2026-07-06T10:00:00.000Z'),
            ...data,
          };
          generatedFiles.push(record);
          return Promise.resolve(record);
        }),
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            generatedFiles.find(
              (file) =>
                file.id === where.id && file.fileType === where.fileType,
            ) ?? null,
          ),
        ),
      },
    };
    mock.__generatedFiles = generatedFiles;
    return mock;
  }

  function containerFixtures() {
    return [
      {
        id: 'container-1',
        containerNo: 'BEAU5946301',
        status: 'UNLOADED',
        rawJson: {},
        destinations: [
          {
            id: 'destination-1',
            destinationCode: 'YYC4',
            destinationType: 'AMAZON_FBA',
            cartons: 40,
            calculatedPallets: 8,
            manualPallets: null,
            finalPallets: 8,
            note: null,
            warnings: null,
            errors: null,
          },
        ],
        lines: [
          {
            id: 'line-1',
            lineNo: 1,
            destinationCode: 'YYC4',
            destinationType: 'AMAZON_FBA',
            cartons: 40,
            rawJson: {
              referenceNo: '124115028975',
              appointmentTime: '06/03/2026 19:00 MDT',
            },
          },
        ],
        payContainerLinks: [
          {
            id: 'link-1',
            payContainerId: 'pay-container-1',
            containerId: 'container-1',
            containerNo: 'BEAU5946301',
            payContainer: {
              id: 'pay-container-1',
              payContainerNo: 'PC-OCEAN-BEAU5946301',
              completedAt: new Date('2026-06-04T17:10:00.000Z'),
              status: 'COMPLETED',
            },
          },
        ],
      },
      {
        id: 'container-2',
        containerNo: 'NODATE00001',
        status: 'LOADED',
        rawJson: {},
        destinations: [],
        lines: [],
        payContainerLinks: [],
      },
      {
        id: 'container-4',
        containerNo: 'INPROGRESS01',
        status: 'LOADING_IN_PROGRESS',
        rawJson: {},
        destinations: [
          {
            id: 'destination-4',
            destinationCode: 'YVR1',
            destinationType: 'TRANSFER',
            cartons: 24,
            calculatedPallets: 4,
            manualPallets: null,
            finalPallets: 4,
            note: null,
            warnings: null,
            errors: null,
          },
        ],
        lines: [
          {
            id: 'line-4',
            lineNo: 1,
            destinationCode: 'YVR1',
            destinationType: 'TRANSFER',
            cartons: 24,
            rawJson: {
              referenceNo: 'INPROGRESS-REF',
              appointmentTime: '06/05/2026 11:00 MDT',
            },
          },
        ],
        payContainerLinks: [
          {
            id: 'link-in-progress',
            payContainerId: 'pay-container-in-progress',
            containerId: 'container-4',
            containerNo: 'INPROGRESS01',
            payContainer: {
              id: 'pay-container-in-progress',
              payContainerNo: 'PC-OCEAN-INPROGRESS01',
              completedAt: new Date('2026-06-06T09:30:00.000Z'),
              status: 'COMPLETED',
            },
          },
        ],
      },
      {
        id: 'container-5',
        containerNo: 'LOADEDROW001',
        status: 'LOADED',
        rawJson: {},
        destinations: [
          {
            id: 'destination-5',
            destinationCode: 'YEG2',
            destinationType: null,
            cartons: 12,
            calculatedPallets: 2,
            manualPallets: null,
            finalPallets: 2,
            note: null,
            warnings: null,
            errors: null,
          },
        ],
        lines: [
          {
            id: 'line-5',
            lineNo: 1,
            destinationCode: 'YEG2',
            destinationType: null,
            cartons: 12,
            rawJson: {
              shipment: 'SHIP-LOADED',
              appointment: '06/07/2026 09:00 MDT',
            },
          },
        ],
        payContainerLinks: [
          {
            id: 'link-loaded-row',
            payContainerId: 'pay-container-loaded-row',
            containerId: 'container-5',
            containerNo: 'LOADEDROW001',
            payContainer: {
              id: 'pay-container-loaded-row',
              payContainerNo: 'PC-OCEAN-LOADEDROW001',
              completedAt: new Date('2026-06-07T15:00:00.000Z'),
              status: 'SETTLED',
            },
          },
        ],
      },
      {
        id: 'container-3',
        containerNo: 'LABELS000001',
        status: 'LABELS_GENERATED',
        rawJson: {},
        destinations: [],
        lines: [],
        payContainerLinks: [],
      },
    ];
  }

  function payContainerFixtures(containers: any[]) {
    return [
      {
        id: 'pay-container-1',
        payContainerNo: 'PC-OCEAN-BEAU5946301',
        classification: 'OCEAN_CONTAINER',
        trailerNumber: null,
        status: 'COMPLETED',
        completedAt: new Date('2026-06-04T17:10:00.000Z'),
        sourceContainers: [
          {
            id: 'link-1',
            containerId: 'container-1',
            containerNo: 'BEAU5946301',
            container: containers[0],
          },
          {
            id: 'link-3',
            containerId: 'container-3',
            containerNo: 'LABELS000001',
            container: containers[4],
          },
        ],
      },
      {
        id: 'pay-container-in-progress',
        payContainerNo: 'PC-OCEAN-INPROGRESS01',
        classification: 'OCEAN_CONTAINER',
        trailerNumber: null,
        status: 'COMPLETED',
        completedAt: new Date('2026-06-06T09:30:00.000Z'),
        sourceContainers: [
          {
            id: 'link-in-progress',
            containerId: 'container-4',
            containerNo: 'INPROGRESS01',
            container: containers[2],
          },
        ],
      },
      {
        id: 'pay-container-loaded-row',
        payContainerNo: 'PC-OCEAN-LOADEDROW001',
        classification: 'OCEAN_CONTAINER',
        trailerNumber: null,
        status: 'SETTLED',
        completedAt: new Date('2026-06-07T15:00:00.000Z'),
        sourceContainers: [
          {
            id: 'link-loaded-row',
            containerId: 'container-5',
            containerNo: 'LOADEDROW001',
            container: containers[3],
          },
        ],
      },
    ];
  }
});
