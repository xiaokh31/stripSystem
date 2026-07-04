import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnloadingWageService } from './unloading-wage.service';

describe('UnloadingWageService', () => {
  const officeActor = {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: ['unloading_wage.classify', 'unloading_wage.settle'],
  };
  let storageRoot: string;
  let prisma: any;
  let service: UnloadingWageService;
  let containers: any[];
  let payContainer: any;
  let unloaders: any[];
  let settlement: any;
  let workerSummaries: any[];
  let settlementLines: any[];
  let generatedFiles: any[];

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'unloading-wage-service-'));
    containers = [
      {
        id: 'container-zcsu',
        containerNo: 'ZCSU9025988B',
        payClassification: null,
        payTrailerNumber: null,
      },
      {
        id: 'container-txgu',
        containerNo: 'TXGU5580229',
        payClassification: null,
        payTrailerNumber: null,
      },
    ];
    payContainer = undefined;
    unloaders = [];
    settlement = undefined;
    workerSummaries = [];
    settlementLines = [];
    generatedFiles = [];
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      container: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            containers.find((item) => item.id === where.id) ?? null,
          ),
        ),
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            containers.filter((item) => where.id.in.includes(item.id)),
          ),
        ),
        update: jest.fn(({ where, data }) => {
          const container = containers.find((item) => item.id === where.id);
          Object.assign(container, data);
          return Promise.resolve(container);
        }),
      },
      operationalSetting: {
        findUnique: jest.fn(() => Promise.resolve(null)),
      },
      payContainer: {
        create: jest.fn(({ data }) => {
          payContainer = {
            id: 'pay-container-1',
            ...data,
            sourceContainers: [],
            unloaders,
            createdAt: new Date('2026-06-04T17:00:00.000Z'),
            updatedAt: new Date('2026-06-04T17:00:00.000Z'),
          };
          return Promise.resolve(payContainer);
        }),
        findUnique: jest.fn(() =>
          Promise.resolve(
            payContainer
              ? {
                  ...payContainer,
                  sourceContainers: payContainer.sourceContainers,
                  unloaders,
                }
              : null,
          ),
        ),
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              ...payContainer,
              sourceContainers: payContainer.sourceContainers,
              unloaders,
            },
          ]),
        ),
        update: jest.fn(({ data }) => {
          Object.assign(payContainer, data, {
            updatedAt: new Date('2026-06-04T17:30:00.000Z'),
          });
          return Promise.resolve(payContainer);
        }),
      },
      payContainerContainer: {
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
      correctionFeedback: {
        create: jest.fn(({ data }) =>
          Promise.resolve({ id: 'audit', ...data }),
        ),
      },
      unloadingWageSettlement: {
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
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
      },
    };
    service = new UnloadingWageService(prisma, {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'app.storageRoot') {
          return storageRoot;
        }
        throw new Error(`Unexpected config key ${key}`);
      }),
    } as unknown as ConfigService);
  });

  it('creates a US-to-Canada pay container and audits container classification', async () => {
    const response = await service.createPayContainer(
      {
        classification: 'US_TO_CANADA_TRANSFER',
        containerIds: ['container-zcsu', 'container-txgu'],
        trailerNumber: 'TR-P0-0604',
      },
      officeActor,
    );

    expect(response).toMatchObject({
      id: 'pay-container-1',
      payContainerNo: 'PC-TRAILER-TR-P0-0604',
      classification: 'US_TO_CANADA_TRANSFER',
      trailerNumber: 'TR-P0-0604',
      rateAmount: '360.00',
    });
    expect(response.containers.map((item) => item.containerNo)).toEqual([
      'ZCSU9025988B',
      'TXGU5580229',
    ]);
    expect(prisma.correctionFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: 'PAY_CONTAINER',
        payContainerId: 'pay-container-1',
        fieldName: 'created',
      }),
    });
  });

  it('completes unloading with equal split unloaders', async () => {
    await service.createPayContainer(
      {
        classification: 'US_TO_CANADA_TRANSFER',
        containerIds: ['container-zcsu', 'container-txgu'],
        trailerNumber: 'TR-P0-0604',
      },
      officeActor,
    );

    const response = await service.completePayContainer(
      'pay-container-1',
      {
        completedAt: '2026-06-04T17:10:00.000Z',
        allocationMethod: 'EQUAL_SPLIT',
        unloaders: [
          { workerCode: 'P0-WORKER-A', workerName: 'Prototype Worker A' },
          { workerCode: 'P0-WORKER-C', workerName: 'Prototype Worker C' },
        ],
      },
      officeActor,
    );

    expect(response).toMatchObject({
      status: 'COMPLETED',
      completedById: 'auth-office',
      allocationMethod: 'EQUAL_SPLIT',
    });
    expect(response.unloaders.map((item) => item.workerCode)).toEqual([
      'P0-WORKER-A',
      'P0-WORKER-C',
    ]);
  });

  it('generates a monthly settlement snapshot and records JSON/HTML artifacts', async () => {
    await service.createPayContainer(
      {
        classification: 'US_TO_CANADA_TRANSFER',
        containerIds: ['container-zcsu', 'container-txgu'],
        trailerNumber: 'TR-P0-0604',
      },
      officeActor,
    );
    await service.completePayContainer(
      'pay-container-1',
      {
        completedAt: '2026-06-04T17:10:00.000Z',
        allocationMethod: 'EQUAL_SPLIT',
        unloaders: [
          { workerCode: 'P0-WORKER-A', workerName: 'Prototype Worker A' },
          { workerCode: 'P0-WORKER-C', workerName: 'Prototype Worker C' },
        ],
      },
      officeActor,
    );

    const response = await service.generateSettlement(
      { settlementMonth: '2026-06' },
      officeActor,
    );

    expect(response).toMatchObject({
      id: 'settlement-1',
      settlementMonth: '2026-06',
      status: 'GENERATED',
      totalAmount: '360.00',
      warningCount: 0,
      errorCount: 0,
    });
    expect(
      response.workers.map((worker) => [worker.workerCode, worker.totalAmount]),
    ).toEqual([
      ['P0-WORKER-A', '180.00'],
      ['P0-WORKER-C', '180.00'],
    ]);
    expect(response.lines).toHaveLength(2);
    expect(response.generatedFiles.map((file) => file.fileType)).toEqual([
      'UNLOADING_WAGE_SETTLEMENT_JSON',
      'UNLOADING_WAGE_TASK_REPORT_HTML',
    ]);
    for (const file of response.generatedFiles) {
      await expect(stat(file.storagePath)).resolves.toBeDefined();
      await expect(readFile(file.storagePath, 'utf8')).resolves.toContain(
        '2026-06',
      );
    }
  });
});
