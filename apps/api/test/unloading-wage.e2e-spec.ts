import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
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

describe('Container detail unloading wage API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: any;

  beforeEach(async () => {
    configureAuthTestEnv();
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
  });

  it('saves ocean wage, marks unloading completed, and stores multiple unloaders from container detail routes', async () => {
    const saved = await authorizedRequest(app, officeAuthHeader())
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

    const completed = await authorizedRequest(app, officeAuthHeader())
      .post('/api/containers/container-zcsu/complete-unloading')
      .send({
        completedAt: '2026-06-04T17:10:00.000Z',
        reason: 'Finished unloading',
      })
      .expect(201);

    expect(completed.body).toMatchObject({
      status: 'COMPLETED',
      completedAt: '2026-06-04T17:10:00.000Z',
      completedById: 'auth-office',
    });

    const unloaders = await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', officeAuthHeader())
      .send({
        unloaders: [
          { workerName: 'Prototype Worker A' },
          { workerName: 'Prototype Worker B' },
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

  it('rejects US-to-Canada wage without trailer number through DTO-backed route', async () => {
    const response = await authorizedRequest(app, officeAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage')
      .send({ classification: 'US_TO_CANADA_TRANSFER' })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'MISSING_TRAILER_NUMBER',
    });
  });

  it('associates US-to-Canada containers and returns the same wage unit from each container detail', async () => {
    await authorizedRequest(app, officeAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage-associations')
      .send({
        associatedContainerNos: ['TXGU5580229'],
        trailerNumber: 'TR-P0-0604',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', officeAuthHeader())
      .send({
        unloaders: [
          { workerName: 'Prototype Worker A' },
          { workerName: 'Prototype Worker C' },
        ],
      })
      .expect(200);

    const associatedDetail = await authorizedRequest(app, officeAuthHeader())
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

  it('rejects duplicate unloader names from the container detail route', async () => {
    await authorizedRequest(app, officeAuthHeader())
      .patch('/api/containers/container-zcsu/unloading-wage')
      .send({ classification: 'OCEAN_CONTAINER' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .put('/api/containers/container-zcsu/unloaders')
      .set('Authorization', officeAuthHeader())
      .send({
        unloaders: [
          { workerName: 'Prototype Worker A' },
          { workerName: ' prototype   worker a ' },
        ],
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'DUPLICATE_UNLOADER_ASSIGNMENT',
    });
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
        findMany: jest.fn(() =>
          Promise.resolve(payContainer ? [payContainerSnapshot()] : []),
        ),
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
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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

    return mock;
  }
});
