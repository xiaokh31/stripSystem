import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnloadingWageService } from './unloading-wage.service';

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
  let users: any[];

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
    users = [
      workerUser('worker-a', 'Prototype Worker A', 'WAREHOUSE'),
      workerUser('worker-b', 'Prototype Worker B', 'WAREHOUSE'),
      workerUser('worker-c', 'Prototype Worker C', 'WAREHOUSE_MANAGER'),
      workerUser('worker-office', 'Office Worker', 'OFFICE'),
      workerUser('worker-inactive', 'Inactive Worker', 'WAREHOUSE', false),
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
              id: link.id,
              payContainerId: link.payContainerId,
              containerId: link.containerId,
              containerNo: link.containerNo,
              payContainer: payContainerSnapshot(),
            }))
        : [];
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
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
          const container = containers.find((item) => item.id === where.id);
          Object.assign(container, data);
          return Promise.resolve(container);
        }),
      },
      operationalSetting: {
        findUnique: jest.fn(() => Promise.resolve(null)),
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
        findUnique: jest.fn(() => Promise.resolve(payContainerSnapshot())),
        findMany: jest.fn(({ where }) => {
          const snapshot = payContainerSnapshot();
          if (!snapshot) {
            return Promise.resolve([]);
          }
          if (where?.status?.in && !where.status.in.includes(snapshot.status)) {
            return Promise.resolve([]);
          }
          if (
            where?.status &&
            !where.status.in &&
            snapshot.status !== where.status
          ) {
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
        update: jest.fn(({ data }) => {
          Object.assign(payContainer, data, {
            updatedAt: new Date('2026-06-04T17:30:00.000Z'),
          });
          return Promise.resolve(payContainer);
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

  it('lists active warehouse users as unloading wage worker options', async () => {
    const response = await service.listWorkers();

    expect(response.items.map((worker) => worker.id)).toEqual([
      'worker-a',
      'worker-b',
      'worker-c',
    ]);
    expect(response.items[0]).toMatchObject({
      displayName: 'Prototype Worker A',
      email: 'worker-a@example.com',
      roles: ['WAREHOUSE'],
      workerCode: 'USER:worker-a',
    });
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

  it('saves ocean unloading wage from container detail, completes unloading, and stores multiple unloaders', async () => {
    const saved = await service.saveContainerUnloadingWage(
      'container-zcsu',
      {
        classification: 'OCEAN_CONTAINER',
        reason: 'Container detail review',
      },
      officeActor,
    );

    expect(saved).toMatchObject({
      containerId: 'container-zcsu',
      classification: 'OCEAN_CONTAINER',
      trailerNumber: null,
      payContainerNo: 'PC-OCEAN-ZCSU9025988B',
      status: 'DRAFT',
      rateAmount: '300.00',
    });
    expect(saved.associatedContainers.map((item) => item.containerNo)).toEqual([
      'ZCSU9025988B',
    ]);

    const completed = await service.completeContainerUnloading(
      'container-zcsu',
      {
        completedAt: '2026-06-04T17:10:00.000Z',
        reason: 'Unloading finished',
      },
      officeActor,
    );
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      completedAt: '2026-06-04T17:10:00.000Z',
      completedById: 'auth-office',
    });

    const unloadersResponse = await service.updateContainerUnloaders(
      'container-zcsu',
      {
        unloaders: [{ workerUserId: 'worker-a' }, { workerUserId: 'worker-b' }],
        reason: 'Workers confirmed',
      },
      officeActor,
    );

    expect(unloadersResponse.unloaders.map((item) => item.workerName)).toEqual([
      'Prototype Worker A',
      'Prototype Worker B',
    ]);
    expect(prisma.correctionFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: 'PAY_CONTAINER',
        fieldName: 'unloaders',
      }),
    });
  });

  it('rejects US-to-Canada container detail wage without trailer number', async () => {
    await expect(
      service.saveContainerUnloadingWage(
        'container-zcsu',
        { classification: 'US_TO_CANADA_TRANSFER' },
        officeActor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'MISSING_TRAILER_NUMBER',
      }),
    });
  });

  it('associates US-to-Canada containers from container detail as one paid unit', async () => {
    const response = await service.updateContainerUnloadingWageAssociations(
      'container-zcsu',
      {
        associatedContainerNos: ['TXGU5580229'],
        trailerNumber: 'TR-P0-0604',
      },
      officeActor,
    );

    expect(response).toMatchObject({
      classification: 'US_TO_CANADA_TRANSFER',
      trailerNumber: 'TR-P0-0604',
      payContainerNo: 'PC-TRAILER-TR-P0-0604',
      rateAmount: '360.00',
    });
    expect(
      response.associatedContainers.map((item) => item.containerNo),
    ).toEqual(['ZCSU9025988B', 'TXGU5580229']);
    expect(containers.map((item) => item.payTrailerNumber)).toEqual([
      'TR-P0-0604',
      'TR-P0-0604',
    ]);
  });

  it('rejects duplicate unloader users for the same container detail wage unit', async () => {
    await service.saveContainerUnloadingWage(
      'container-zcsu',
      { classification: 'OCEAN_CONTAINER' },
      officeActor,
    );

    await expect(
      service.updateContainerUnloaders(
        'container-zcsu',
        {
          unloaders: [
            { workerUserId: 'worker-a' },
            { workerUserId: 'worker-a' },
          ],
        },
        officeActor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DUPLICATE_UNLOADER_ASSIGNMENT',
      }),
    });
  });

  it('marks generated settlements as needing review when a settled wage unit changes', async () => {
    await service.saveContainerUnloadingWage(
      'container-zcsu',
      { classification: 'OCEAN_CONTAINER' },
      officeActor,
    );
    payContainer.status = 'SETTLED';

    await service.updateContainerUnloaders(
      'container-zcsu',
      {
        unloaders: [{ workerUserId: 'worker-a' }],
      },
      officeActor,
    );

    expect(prisma.unloadingWageSettlement.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'GENERATED',
        lines: { some: { payContainerId: { in: ['pay-container-1'] } } },
      },
      data: { status: 'NEEDS_REVIEW' },
    });
    expect(payContainer.status).toBe('NEEDS_REVIEW');
  });

  it('lists pay containers for office review', async () => {
    await service.createPayContainer(
      {
        classification: 'US_TO_CANADA_TRANSFER',
        containerIds: ['container-zcsu', 'container-txgu'],
        trailerNumber: 'TR-P0-0604',
      },
      officeActor,
    );

    const response = await service.listPayContainers({
      limit: 25,
      offset: 0,
      settlementMonth: undefined,
      status: undefined,
    });

    expect(response.limit).toBe(25);
    expect(response.offset).toBe(0);
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      id: 'pay-container-1',
      payContainerNo: 'PC-TRAILER-TR-P0-0604',
      status: 'DRAFT',
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

  it('generates a monthly settlement snapshot from container detail wage data and records JSON/HTML artifacts', async () => {
    await service.updateContainerUnloadingWageAssociations(
      'container-zcsu',
      {
        associatedContainerNos: ['TXGU5580229'],
        trailerNumber: 'TR-P0-0604',
      },
      officeActor,
    );
    await service.updateContainerUnloaders(
      'container-zcsu',
      {
        unloaders: [{ workerUserId: 'worker-a' }, { workerUserId: 'worker-c' }],
      },
      officeActor,
    );
    await service.completeContainerUnloading(
      'container-zcsu',
      {
        completedAt: '2026-06-04T17:10:00.000Z',
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
    expect(prisma.unloadingWageSettlement.updateMany).toHaveBeenCalledWith({
      where: {
        settlementMonth: '2026-06',
        status: 'GENERATED',
      },
      data: { status: 'SUPERSEDED' },
    });
    expect(
      response.workers.map((worker) => [worker.workerCode, worker.totalAmount]),
    ).toEqual([
      ['USER:worker-a', '180.00'],
      ['USER:worker-c', '180.00'],
    ]);
    expect(response.lines).toEqual([
      expect.objectContaining({
        allocationMethod: 'EQUAL_SPLIT',
        amount: '180.00',
        completedAt: '2026-06-04T17:10:00.000Z',
        containerNumbers: ['ZCSU9025988B', 'TXGU5580229'],
        payContainerNo: 'PC-TRAILER-TR-P0-0604',
        rateAmount: '360.00',
        trailerNumber: 'TR-P0-0604',
        workerName: 'Prototype Worker A',
      }),
      expect.objectContaining({
        amount: '180.00',
        workerName: 'Prototype Worker C',
      }),
    ]);
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
    await expect(
      readFile(response.generatedFiles[0].storagePath, 'utf8'),
    ).resolves.toContain('"rateAmount": "360.00"');
    await expect(
      readFile(response.generatedFiles[1].storagePath, 'utf8'),
    ).resolves.toContain('Detail Lines');
  });

  it('generates an ocean container settlement as one CAD 300 paid unit', async () => {
    await service.saveContainerUnloadingWage(
      'container-zcsu',
      { classification: 'OCEAN_CONTAINER' },
      officeActor,
    );
    await service.updateContainerUnloaders(
      'container-zcsu',
      {
        unloaders: [{ workerUserId: 'worker-a' }],
      },
      officeActor,
    );
    await service.completeContainerUnloading(
      'container-zcsu',
      {
        completedAt: '2026-06-04T17:10:00.000Z',
      },
      officeActor,
    );

    const response = await service.generateSettlement(
      { settlementMonth: '2026-06' },
      officeActor,
    );

    expect(response).toMatchObject({
      totalAmount: '300.00',
    });
    expect(response.workers).toEqual([
      expect.objectContaining({
        payContainerCount: 1,
        totalAmount: '300.00',
        workerName: 'Prototype Worker A',
      }),
    ]);
    expect(response.lines).toEqual([
      expect.objectContaining({
        amount: '300.00',
        containerNumbers: ['ZCSU9025988B'],
        rateAmount: '300.00',
        trailerNumber: null,
      }),
    ]);
  });

  it('uses manual unloader amount allocations when they exist', async () => {
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
        allocationMethod: 'MANUAL_AMOUNT',
        completedAt: '2026-06-04T17:10:00.000Z',
        unloaders: [
          {
            allocationAmount: 100,
            workerCode: 'P0-WORKER-A',
            workerName: 'Prototype Worker A',
          },
          {
            allocationAmount: 260,
            workerCode: 'P0-WORKER-C',
            workerName: 'Prototype Worker C',
          },
        ],
      },
      officeActor,
    );

    const response = await service.generateSettlement(
      { settlementMonth: '2026-06' },
      officeActor,
    );

    expect(
      response.workers.map((worker) => [worker.workerCode, worker.totalAmount]),
    ).toEqual([
      ['P0-WORKER-A', '100.00'],
      ['P0-WORKER-C', '260.00'],
    ]);
    expect(
      response.lines.map((line) => [
        line.workerCode,
        line.allocationMethod,
        line.amount,
      ]),
    ).toEqual([
      ['P0-WORKER-A', 'MANUAL_AMOUNT', '100.00'],
      ['P0-WORKER-C', 'MANUAL_AMOUNT', '260.00'],
    ]);
  });

  it('does not include draft unloading wage records in monthly settlement', async () => {
    await service.saveContainerUnloadingWage(
      'container-zcsu',
      { classification: 'OCEAN_CONTAINER' },
      officeActor,
    );

    await expect(
      service.generateSettlement({ settlementMonth: '2026-06' }, officeActor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'NO_COMPLETED_PAY_CONTAINERS',
      }),
    });
  });

  it('downloads a generated settlement artifact by settlement id and file id', async () => {
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
    const generated = await service.generateSettlement(
      { settlementMonth: '2026-06' },
      officeActor,
    );
    const file = generated.generatedFiles[0];
    await writeFile(file.storagePath, 'download bytes');

    const download = await service.downloadSettlementFile(
      generated.id,
      file.id,
    );

    expect(download.filename).toBe(file.storagePath.split('/').pop());
    expect(download.buffer.toString()).toBe('download bytes');
  });
});
