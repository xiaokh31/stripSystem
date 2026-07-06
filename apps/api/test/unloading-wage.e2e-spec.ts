import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  authorizedRequest,
  configureAuthTestEnv,
  installAuthMock,
  warehouseManagerAuthHeader,
} from './auth-test-helpers';

function workerUser(
  id: string,
  name: string,
  roleCode: string,
  isActive = true,
) {
  return {
    email: `${id}@example.com`,
    id,
    isActive,
    name,
    role: null,
    roleAssignments: [
      {
        role: {
          code: roleCode,
          isActive: true,
        },
      },
    ],
  };
}

function tempWorker(
  id: string,
  displayName: string,
  workerCode: string,
  isActive = true,
) {
  return {
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    createdById: null,
    displayName,
    id,
    isActive,
    note: null,
    phone: null,
    updatedAt: new Date('2026-06-01T08:00:00.000Z'),
    updatedById: null,
    workerCode,
  };
}

describe('Container detail unloading wage API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: any;
  let originalStorageRoot: string | undefined;
  let storageRoot: string;

  beforeEach(async () => {
    configureAuthTestEnv();
    originalStorageRoot = process.env.STORAGE_ROOT;
    storageRoot = await mkdtemp(join(tmpdir(), 'unloading-wage-e2e-'));
    process.env.STORAGE_ROOT = storageRoot;
    prisma = createPrismaMock();
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

  it('saves ocean wage, marks unloading completed, and stores multiple unloaders from container detail routes', async () => {
    const workers = await authorizedRequest(app, warehouseManagerAuthHeader())
      .get('/api/unloading-wage/workers')
      .expect(200);

    expect(workers.body.items.map((worker: any) => worker.id)).toEqual([
      'temp-worker-a',
      'temp-worker-b',
      'temp-worker-c',
    ]);

    const saved = await authorizedRequest(app, warehouseManagerAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage')
      .send({
        classification: 'OCEAN_CONTAINER',
        reason: 'Container detail wage review',
      })
      .expect(200);

    expect(saved.body).toMatchObject({
      containerId: 'container-zcsu',
      classification: 'OCEAN_CONTAINER',
      trailerNumber: null,
      payContainerNo: 'PC-OCEAN-ZCSU9025988B',
      status: 'DRAFT',
      rateAmount: '300.00',
    });

    const completed = await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/containers/container-zcsu/complete-unloading')
      .send({
        completedAt: '2026-06-04T17:10:00.000Z',
        reason: 'Finished unloading',
      })
      .expect(201);

    expect(completed.body).toMatchObject({
      status: 'COMPLETED',
      completedAt: '2026-06-04T17:10:00.000Z',
      completedById: 'auth-warehouse-manager',
    });

    const unloaders = await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', warehouseManagerAuthHeader())
      .send({
        unloaders: [
          { unloadingWorkerId: 'temp-worker-a' },
          { unloadingWorkerId: 'temp-worker-b' },
        ],
      })
      .expect(200);

    expect(
      unloaders.body.unloaders.map((item: any) => item.workerName),
    ).toEqual(['Prototype Worker A', 'Prototype Worker B']);
    expect(prisma.correctionFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: 'PAY_CONTAINER',
        fieldName: 'unloaders',
      }),
    });
  });

  it('creates, updates, deactivates, and lists temporary unloading workers', async () => {
    const created = await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/unloading-wage/workers')
      .send({
        displayName: 'Prototype Worker D',
        workerCode: 'TEMP-D',
        phone: '604-555-0100',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      createdById: 'auth-warehouse-manager',
      displayName: 'Prototype Worker D',
      email: null,
      isActive: true,
      phone: '604-555-0100',
      roles: [],
      workerCode: 'TEMP-D',
    });
    expect(JSON.stringify(created.body)).not.toContain('password');

    const deactivated = await authorizedRequest(
      app,
      warehouseManagerAuthHeader(),
    )
      .patch(`/api/unloading-wage/workers/${created.body.id}`)
      .send({ isActive: false, note: 'Unavailable' })
      .expect(200);

    expect(deactivated.body).toMatchObject({
      id: created.body.id,
      isActive: false,
      note: 'Unavailable',
      updatedById: 'auth-warehouse-manager',
    });

    const activeOnly = await authorizedRequest(
      app,
      warehouseManagerAuthHeader(),
    )
      .get('/api/unloading-wage/workers')
      .expect(200);
    expect(activeOnly.body.items.map((worker: any) => worker.id)).not.toContain(
      created.body.id,
    );

    const includeInactive = await authorizedRequest(
      app,
      warehouseManagerAuthHeader(),
    )
      .get('/api/unloading-wage/workers?includeInactive=true')
      .expect(200);
    expect(
      includeInactive.body.items.map((worker: any) => worker.id),
    ).toContain(created.body.id);
  });

  it('rejects US-to-Canada wage without trailer number through DTO-backed route', async () => {
    const response = await authorizedRequest(app, warehouseManagerAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage')
      .send({ classification: 'US_TO_CANADA_TRANSFER' })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'MISSING_TRAILER_NUMBER',
    });
  });

  it('associates US-to-Canada containers and returns the same wage unit from each container detail', async () => {
    await authorizedRequest(app, warehouseManagerAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage-associations')
      .send({
        associatedContainerNos: ['TXGU5580229'],
        trailerNumber: 'TR-P0-0604',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', warehouseManagerAuthHeader())
      .send({
        unloaders: [
          { unloadingWorkerId: 'temp-worker-a' },
          { unloadingWorkerId: 'temp-worker-c' },
        ],
      })
      .expect(200);

    const associatedDetail = await authorizedRequest(
      app,
      warehouseManagerAuthHeader(),
    )
      .get('/api/containers/container-txgu')
      .expect(200);

    expect(associatedDetail.body.unloadingWage).toMatchObject({
      classification: 'US_TO_CANADA_TRANSFER',
      trailerNumber: 'TR-P0-0604',
      payContainerNo: 'PC-TRAILER-TR-P0-0604',
      status: 'DRAFT',
    });
    expect(
      associatedDetail.body.unloadingWage.associatedContainers.map(
        (item: any) => item.containerNo,
      ),
    ).toEqual(['ZCSU9025988B', 'TXGU5580229']);
    expect(
      associatedDetail.body.unloadingWage.unloaders.map(
        (item: any) => item.workerName,
      ),
    ).toEqual(['Prototype Worker A', 'Prototype Worker C']);
  });

  it('rejects duplicate temporary unloading workers from the container detail route', async () => {
    await authorizedRequest(app, warehouseManagerAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage')
      .send({ classification: 'OCEAN_CONTAINER' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', warehouseManagerAuthHeader())
      .send({
        unloaders: [
          { unloadingWorkerId: 'temp-worker-a' },
          { unloadingWorkerId: 'temp-worker-a' },
        ],
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'DUPLICATE_UNLOADER_ASSIGNMENT',
    });
  });

  it('rejects legacy user ids and inactive workers from the container detail route', async () => {
    await authorizedRequest(app, warehouseManagerAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage')
      .send({ classification: 'OCEAN_CONTAINER' })
      .expect(200);

    const legacyUserId = await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', warehouseManagerAuthHeader())
      .send({
        unloaders: [{ workerUserId: 'worker-a' }],
      })
      .expect(400);

    expect(legacyUserId.body).toMatchObject({
      code: 'UNLOADING_WORKER_REQUIRED',
    });

    const inactiveWorker = await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', warehouseManagerAuthHeader())
      .send({
        unloaders: [{ unloadingWorkerId: 'temp-worker-inactive' }],
      })
      .expect(400);

    expect(inactiveWorker.body).toMatchObject({
      code: 'UNLOADING_WORKER_INACTIVE',
    });
  });

  it('preserves saved assignment snapshots after a temporary worker is renamed and deactivated', async () => {
    await authorizedRequest(app, warehouseManagerAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage')
      .send({ classification: 'OCEAN_CONTAINER' })
      .expect(200);

    await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', warehouseManagerAuthHeader())
      .send({
        unloaders: [{ unloadingWorkerId: 'temp-worker-a' }],
      })
      .expect(200);

    const renamed = await authorizedRequest(app, warehouseManagerAuthHeader())
      .patch('/api/unloading-wage/workers/temp-worker-a')
      .send({
        displayName: 'Renamed Worker A',
        isActive: false,
      })
      .expect(200);
    expect(renamed.body).toMatchObject({
      displayName: 'Renamed Worker A',
      id: 'temp-worker-a',
      isActive: false,
    });

    const activeOnly = await authorizedRequest(
      app,
      warehouseManagerAuthHeader(),
    )
      .get('/api/unloading-wage/workers')
      .expect(200);
    expect(activeOnly.body.items.map((worker: any) => worker.id)).not.toContain(
      'temp-worker-a',
    );

    const detail = await authorizedRequest(app, warehouseManagerAuthHeader())
      .get('/api/containers/container-zcsu')
      .expect(200);
    expect(detail.body.unloadingWage.unloaders).toEqual([
      expect.objectContaining({
        unloadingWorkerId: 'temp-worker-a',
        workerCode: 'TEMP-A',
        workerName: 'Prototype Worker A',
        workerUserId: null,
      }),
    ]);

    await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/containers/container-zcsu/complete-unloading')
      .send({ completedAt: '2026-06-04T17:10:00.000Z' })
      .expect(201);

    const generated = await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/unloading-wage-settlements')
      .send({ settlementMonth: '2026-06' })
      .expect(201);
    expect(generated.body.workers).toEqual([
      expect.objectContaining({
        totalAmount: '300.00',
        workerCode: 'TEMP-A',
        workerName: 'Prototype Worker A',
      }),
    ]);
    expect(JSON.stringify(generated.body)).not.toContain('Renamed Worker A');
  });

  it('generates, reads, and downloads a monthly settlement from container detail wage data', async () => {
    await authorizedRequest(app, warehouseManagerAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage-associations')
      .send({
        associatedContainerNos: ['TXGU5580229'],
        trailerNumber: 'TR-P0-0604',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', warehouseManagerAuthHeader())
      .send({
        unloaders: [
          { unloadingWorkerId: 'temp-worker-a' },
          { unloadingWorkerId: 'temp-worker-c' },
        ],
      })
      .expect(200);

    await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/containers/container-zcsu/complete-unloading')
      .send({ completedAt: '2026-06-04T17:10:00.000Z' })
      .expect(201);

    const generated = await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/unloading-wage-settlements')
      .send({ settlementMonth: '2026-06' })
      .expect(201);

    expect(generated.body).toMatchObject({
      settlementMonth: '2026-06',
      status: 'GENERATED',
      totalAmount: '360.00',
    });
    expect(
      generated.body.workers.map((worker: any) => [
        worker.workerName,
        worker.totalAmount,
      ]),
    ).toEqual([
      ['Prototype Worker A', '180.00'],
      ['Prototype Worker C', '180.00'],
    ]);
    expect(generated.body.lines[0]).toMatchObject({
      completedAt: '2026-06-04T17:10:00.000Z',
      containerNumbers: ['ZCSU9025988B', 'TXGU5580229'],
      rateAmount: '360.00',
      trailerNumber: 'TR-P0-0604',
    });
    expect(
      generated.body.generatedFiles.map((file: any) => file.fileType),
    ).toEqual([
      'UNLOADING_WAGE_SETTLEMENT_JSON',
      'UNLOADING_WAGE_TASK_REPORT_HTML',
    ]);

    const listed = await authorizedRequest(app, warehouseManagerAuthHeader())
      .get('/api/unloading-wage-settlements')
      .expect(200);
    expect(listed.body.items).toHaveLength(1);

    const detail = await authorizedRequest(app, warehouseManagerAuthHeader())
      .get(`/api/unloading-wage-settlements/${generated.body.id}`)
      .expect(200);
    expect(detail.body.lines).toHaveLength(2);

    const fileId = generated.body.generatedFiles[0].id;
    const download = await authorizedRequest(app, warehouseManagerAuthHeader())
      .get(
        `/api/unloading-wage-settlements/${generated.body.id}/files/${fileId}/download`,
      )
      .expect(200);
    expect(download.text).toContain('"settlementMonth": "2026-06"');
  });

  it('keeps legacy user-backed unloader snapshots readable in settlement generation', async () => {
    await authorizedRequest(app, warehouseManagerAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage')
      .send({ classification: 'OCEAN_CONTAINER' })
      .expect(200);

    prisma.__setUnloaders([
      {
        id: 'legacy-unloader-1',
        allocationAmount: null,
        allocationPercent: null,
        note: null,
        payContainerId: 'pay-container-1',
        unloadingWorkerId: null,
        workerCode: 'USER:legacy-worker-a',
        workerName: 'Legacy Worker A',
        workerUserId: 'legacy-worker-a',
      },
    ]);

    await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/containers/container-zcsu/complete-unloading')
      .send({ completedAt: '2026-06-04T17:10:00.000Z' })
      .expect(201);

    const generated = await authorizedRequest(app, warehouseManagerAuthHeader())
      .post('/api/unloading-wage-settlements')
      .send({ settlementMonth: '2026-06' })
      .expect(201);

    expect(generated.body.workers).toEqual([
      expect.objectContaining({
        totalAmount: '300.00',
        workerCode: 'USER:legacy-worker-a',
        workerName: 'Legacy Worker A',
      }),
    ]);
    expect(generated.body.lines).toEqual([
      expect.objectContaining({
        amount: '300.00',
        workerName: 'Legacy Worker A',
      }),
    ]);
  });

  function createPrismaMock() {
    const containers = [
      {
        id: 'container-zcsu',
        importFileId: 'import-1',
        containerNo: 'ZCSU9025988B',
        dockNo: null,
        company: null,
        sourceFormat: 'UNLOADING_PLAN_CN',
        parserVersion: 'unloading-plan-cn-v1',
        status: 'PARSED',
        payClassification: null,
        payTrailerNumber: null,
        rawJson: {},
        warnings: [],
        errors: [],
        destinations: [],
        createdAt: new Date('2026-06-04T17:00:00.000Z'),
        updatedAt: new Date('2026-06-04T17:00:00.000Z'),
      },
      {
        id: 'container-txgu',
        importFileId: 'import-1',
        containerNo: 'TXGU5580229',
        dockNo: null,
        company: null,
        sourceFormat: 'UNLOADING_PLAN_CN',
        parserVersion: 'unloading-plan-cn-v1',
        status: 'PARSED',
        payClassification: null,
        payTrailerNumber: null,
        rawJson: {},
        warnings: [],
        errors: [],
        destinations: [],
        createdAt: new Date('2026-06-04T17:00:00.000Z'),
        updatedAt: new Date('2026-06-04T17:00:00.000Z'),
      },
    ];
    let payContainer: any;
    let unloaders: any[] = [];
    let settlement: any;
    const workerSummaries: any[] = [];
    const settlementLines: any[] = [];
    const generatedFiles: any[] = [];
    const users = [
      workerUser('worker-a', 'Prototype Worker A', 'WAREHOUSE'),
      workerUser('worker-b', 'Prototype Worker B', 'WAREHOUSE'),
      workerUser('worker-c', 'Prototype Worker C', 'WAREHOUSE_MANAGER'),
      workerUser('worker-office', 'Office Worker', 'OFFICE'),
      workerUser('worker-inactive', 'Inactive Worker', 'WAREHOUSE', false),
    ];
    const unloadingWorkers = [
      tempWorker('temp-worker-a', 'Prototype Worker A', 'TEMP-A'),
      tempWorker('temp-worker-b', 'Prototype Worker B', 'TEMP-B'),
      tempWorker('temp-worker-c', 'Prototype Worker C', 'TEMP-C'),
      tempWorker(
        'temp-worker-inactive',
        'Inactive Worker',
        'TEMP-INACTIVE',
        false,
      ),
    ];

    const payContainerSnapshot = () =>
      payContainer
        ? {
            ...payContainer,
            sourceContainers: payContainer.sourceContainers,
            unloaders,
          }
        : null;
    const payContainerLinksFor = (containerId: string) =>
      payContainer
        ? payContainer.sourceContainers
            .filter((link: any) => link.containerId === containerId)
            .map((link: any) => ({
              ...link,
              payContainer: payContainerSnapshot(),
            }))
        : [];

    const mock: any = {
      $transaction: jest.fn((callback) => callback(mock)),
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      operationalSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        findMany: jest.fn(({ where }) => {
          let records = users;
          if (where?.id?.in) {
            records = records.filter((user) => where.id.in.includes(user.id));
          }
          if (where?.isActive !== undefined) {
            records = records.filter(
              (user) => user.isActive === where.isActive,
            );
          }
          return Promise.resolve(records);
        }),
      },
      unloadingWorker: {
        findMany: jest.fn(({ where } = {}) => {
          let records = unloadingWorkers;
          if (where?.id?.in) {
            records = records.filter((worker) =>
              where.id.in.includes(worker.id),
            );
          }
          if (where?.isActive !== undefined) {
            records = records.filter(
              (worker) => worker.isActive === where.isActive,
            );
          }
          return Promise.resolve(records);
        }),
        findUnique: jest.fn(({ where }) => {
          const record =
            unloadingWorkers.find((worker) =>
              where.id
                ? worker.id === where.id
                : worker.workerCode === where.workerCode,
            ) ?? null;
          return Promise.resolve(record);
        }),
        create: jest.fn(({ data }) => {
          const record = {
            id: `temp-worker-${unloadingWorkers.length + 1}`,
            createdAt: new Date('2026-06-01T09:00:00.000Z'),
            updatedAt: new Date('2026-06-01T09:00:00.000Z'),
            ...data,
          };
          unloadingWorkers.push(record);
          return Promise.resolve(record);
        }),
        update: jest.fn(({ where, data }) => {
          const record = unloadingWorkers.find(
            (worker) => worker.id === where.id,
          );
          if (!record) {
            throw new Error(`Unloading worker not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-01T09:30:00.000Z'),
          });
          return Promise.resolve(record);
        }),
      },
      container: {
        findUnique: jest.fn(({ where, include }) => {
          const record = containers.find((item) => item.id === where.id);
          if (!record) {
            return Promise.resolve(null);
          }
          if (include?.payContainerLinks) {
            return Promise.resolve({
              ...record,
              payContainerLinks: payContainerLinksFor(record.id),
            });
          }
          return Promise.resolve(record);
        }),
        findMany: jest.fn(({ where }) => {
          if (where?.OR) {
            return Promise.resolve(
              containers.filter((item) =>
                where.OR.some(
                  (condition: any) =>
                    condition.id?.in?.includes(item.id) ||
                    condition.containerNo?.in?.includes(item.containerNo),
                ),
              ),
            );
          }
          return Promise.resolve(
            containers.filter((item) => where.id.in.includes(item.id)),
          );
        }),
        update: jest.fn(({ where, data }) => {
          const record = containers.find((item) => item.id === where.id);
          if (!record) {
            throw new Error(`Container not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-04T17:15:00.000Z'),
          });
          return Promise.resolve(record);
        }),
      },
      payContainer: {
        create: jest.fn(({ data }) => {
          payContainer = {
            id: 'pay-container-1',
            completedAt: null,
            completedById: null,
            completionNote: null,
            ...data,
            sourceContainers: [],
            unloaders,
            createdAt: new Date('2026-06-04T17:00:00.000Z'),
            updatedAt: new Date('2026-06-04T17:00:00.000Z'),
          };
          return Promise.resolve(payContainer);
        }),
        update: jest.fn(({ data }) => {
          Object.assign(payContainer, data, {
            updatedAt: new Date('2026-06-04T17:20:00.000Z'),
          });
          return Promise.resolve(payContainer);
        }),
        findUnique: jest.fn(() => Promise.resolve(payContainerSnapshot())),
        findMany: jest.fn(({ where }) => {
          const snapshot = payContainerSnapshot();
          if (!snapshot) {
            return Promise.resolve([]);
          }
          if (where?.status?.in && !where.status.in.includes(snapshot.status)) {
            return Promise.resolve([]);
          }
          if (where?.completedAt) {
            const completedAt = snapshot.completedAt
              ? new Date(snapshot.completedAt).getTime()
              : Number.NaN;
            if (
              Number.isNaN(completedAt) ||
              completedAt < where.completedAt.gte.getTime() ||
              completedAt >= where.completedAt.lt.getTime()
            ) {
              return Promise.resolve([]);
            }
          }
          return Promise.resolve([snapshot]);
        }),
      },
      payContainerContainer: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            payContainer
              ? payContainer.sourceContainers
                  .filter((link: any) =>
                    where.containerId.in.includes(link.containerId),
                  )
                  .map((link: any) => ({
                    ...link,
                    payContainer: payContainerSnapshot(),
                  }))
              : [],
          ),
        ),
        findFirst: jest.fn(({ where }) => {
          const link = payContainer?.sourceContainers.find(
            (item: any) => item.containerId === where.containerId,
          );
          return Promise.resolve(
            link
              ? {
                  ...link,
                  payContainer: payContainerSnapshot(),
                }
              : null,
          );
        }),
        deleteMany: jest.fn(({ where }) => {
          if (!payContainer) {
            return Promise.resolve({ count: 0 });
          }
          const before = payContainer.sourceContainers.length;
          payContainer.sourceContainers = payContainer.sourceContainers.filter(
            (link: any) => {
              const matchesPayContainer = where.OR?.some(
                (condition: any) =>
                  condition.payContainerId === link.payContainerId,
              );
              const matchesContainer = where.OR?.some((condition: any) =>
                condition.containerId?.in?.includes(link.containerId),
              );
              return !(matchesPayContainer || matchesContainer);
            },
          );
          return Promise.resolve({
            count: before - payContainer.sourceContainers.length,
          });
        }),
        create: jest.fn(({ data }) => {
          const record = {
            id: `pay-container-link-${payContainer.sourceContainers.length + 1}`,
            ...data,
          };
          payContainer.sourceContainers.push(record);
          return Promise.resolve(record);
        }),
      },
      unloaderAssignment: {
        deleteMany: jest.fn(() => {
          unloaders = [];
          if (payContainer) {
            payContainer.unloaders = unloaders;
          }
          return Promise.resolve({ count: 0 });
        }),
        create: jest.fn(({ data }) => {
          const record = {
            id: `unloader-${unloaders.length + 1}`,
            ...data,
          };
          unloaders.push(record);
          return Promise.resolve(record);
        }),
      },
      unloadingWageSettlement: {
        updateMany: jest.fn(({ data }) => {
          if (settlement) {
            Object.assign(settlement, data);
          }
          return Promise.resolve({ count: settlement ? 1 : 0 });
        }),
        create: jest.fn(({ data }) => {
          settlement = {
            id: 'settlement-1',
            ...data,
            workerSummaries,
            lines: settlementLines,
            generatedFiles,
            createdAt: new Date('2026-07-04T10:00:00.000Z'),
            updatedAt: new Date('2026-07-04T10:00:00.000Z'),
          };
          return Promise.resolve(settlement);
        }),
        findUnique: jest.fn(() =>
          Promise.resolve(
            settlement
              ? {
                  ...settlement,
                  workerSummaries,
                  lines: settlementLines,
                  generatedFiles,
                }
              : null,
          ),
        ),
        findMany: jest.fn(() =>
          Promise.resolve(
            settlement
              ? [
                  {
                    ...settlement,
                    workerSummaries,
                    lines: settlementLines,
                    generatedFiles,
                  },
                ]
              : [],
          ),
        ),
      },
      unloadingWageWorkerSettlement: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `worker-summary-${workerSummaries.length + 1}`,
            ...data,
          };
          workerSummaries.push(record);
          return Promise.resolve(record);
        }),
      },
      unloadingWageSettlementLine: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `settlement-line-${settlementLines.length + 1}`,
            ...data,
          };
          settlementLines.push(record);
          return Promise.resolve(record);
        }),
      },
      wageGeneratedFile: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `generated-file-${generatedFiles.length + 1}`,
            ...data,
          };
          generatedFiles.push(record);
          return Promise.resolve(record);
        }),
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            generatedFiles.find(
              (file) =>
                file.id === where.id &&
                file.unloadingWageSettlementId ===
                  where.unloadingWageSettlementId,
            ) ?? null,
          ),
        ),
      },
      correctionFeedback: {
        create: jest.fn(({ data }) =>
          Promise.resolve({
            id: 'correction-1',
            ...data,
            createdAt: new Date('2026-06-04T17:00:00.000Z'),
            updatedAt: new Date('2026-06-04T17:00:00.000Z'),
          }),
        ),
      },
    };
    mock.__setUnloaders = (records: any[]) => {
      unloaders = records;
      if (payContainer) {
        payContainer.unloaders = unloaders;
      }
    };

    return mock;
  }
});
