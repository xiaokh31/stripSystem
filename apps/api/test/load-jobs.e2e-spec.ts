import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  authorizedRequest,
  configureAuthTestEnv,
  installAuthMock,
} from './auth-test-helpers';

interface LoadJobBody {
  id: string;
  containerId: string | null;
  container: {
    id: string;
    containerNo: string;
  } | null;
  loadNo: string;
  truckNo: string | null;
  dockNo: string | null;
  carrier: string | null;
  destinationRegion: string | null;
  status: string;
  canScan: boolean;
  scheduledDepartureAt: string | null;
  closedAt: string | null;
  plannedPalletCount: number;
  externalPalletCount: number;
  eventCount: number;
  lines: Array<{
    id: string;
    sequence: number;
    containerId: string | null;
    plannedPallets: number;
    externalTransfer: boolean;
  }>;
}

interface LoadJobListBody {
  items: LoadJobBody[];
  limit: number;
  offset: number;
}

interface ScanBody {
  result: string;
  pallet: {
    id: string;
    palletId: string;
    status: string;
    loadJobId: string | null;
  };
  progress: {
    totalPallets: number;
    loadedPallets: number;
    remainingPallets: number;
  };
}

describe('LoadJobsController (e2e)', () => {
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

  it('creates, queries, and closes a mixed load job', async () => {
    const created = await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-001',
        truckNo: 'TRK-18',
        dockNo: 'D3',
        carrier: 'Bestar CCA',
        destinationRegion: 'YEG2',
        createdById: 'user-1',
        startedAt: '2026-06-27T10:00:00.000Z',
        scheduledDepartureAt: '2026-06-28T03:00:00.000Z',
        lines: [
          { sourceText: 'ZCSU9024512B转运-12P' },
          { sourceText: 'CSNU8877228-1P' },
          { sourceText: 'EITU9315039-1P' },
        ],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      id: 'load-job-1',
      containerId: 'container-1',
      loadNo: 'LOAD-2026-001',
      dockNo: 'D3',
      status: 'PLANNED',
      canScan: false,
      scheduledDepartureAt: '2026-06-28T03:00:00.000Z',
      closedAt: null,
      plannedPalletCount: 2,
      externalPalletCount: 12,
      eventCount: 0,
      lines: [
        expect.objectContaining({
          externalTransfer: true,
          plannedPallets: 12,
        }),
        expect.objectContaining({
          containerId: 'container-1',
          plannedPallets: 1,
          externalTransfer: false,
        }),
        expect.objectContaining({
          containerId: 'container-2',
          plannedPallets: 1,
          externalTransfer: false,
        }),
      ],
    });
    await openLoadJobForScanning('load-job-1');

    const list = await authorizedRequest(app)
      .get('/api/load-jobs?status=IN_PROGRESS&containerId=container-2')
      .expect(200);
    const listBody = list.body as LoadJobListBody;

    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0]).toMatchObject({
      id: 'load-job-1',
      loadNo: 'LOAD-2026-001',
      plannedPalletCount: 2,
      externalPalletCount: 12,
      canScan: true,
    });

    const detail = await authorizedRequest(app)
      .get('/api/load-jobs/load-job-1')
      .expect(200);

    expect(detail.body).toMatchObject({
      id: 'load-job-1',
      truckNo: 'TRK-18',
      carrier: 'Bestar CCA',
      destinationRegion: 'YEG2',
      lines: expect.any(Array),
    });

    const closed = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/close')
      .send({
        dockNo: 'D3',
        operatorId: 'user-1',
        reason: 'Loaded at dock 3',
      })
      .expect(201);

    expect(closed.body).toMatchObject({
      id: 'load-job-1',
      status: 'COMPLETED',
      canScan: false,
      eventCount: 1,
    });
    expect(closed.body.closedAt).toEqual(expect.any(String));

    await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/close')
      .send({})
      .expect(409);
  });

  it('validates create body, required plan lines, and missing internal containers', async () => {
    await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        lines: [{ sourceText: 'CSNU8877228-1P' }],
      })
      .expect(400);

    const emptyPlan = await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-EMPTY',
      })
      .expect(400);
    expect(emptyPlan.body).toMatchObject({
      code: 'LOAD_JOB_LINES_REQUIRED',
    });

    const missingContainer = await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-404',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'MISSING0000-1P' }],
      })
      .expect(404);

    expect(missingContainer.body).toMatchObject({
      code: 'LOAD_JOB_LINE_CONTAINER_NOT_FOUND',
    });
  });

  it('scans mixed-plan pallets, returns duplicates, and rejects pallets beyond a line count', async () => {
    await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [
          { sourceText: 'ZCSU9024512B转运-12P' },
          { sourceText: 'CSNU8877228-1P' },
          { sourceText: 'EITU9315039-1P' },
        ],
      })
      .expect(201);
    await openLoadJobForScanning('load-job-1');

    const first = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
        deviceId: 'scanner-1',
      })
      .expect(201);
    const firstBody = first.body as ScanBody;

    expect(firstBody).toMatchObject({
      result: 'LOADED',
      pallet: {
        id: 'pallet-1',
        containerId: 'container-1',
        containerNo: 'CSNU8877228',
        palletId: 'PALLET-001',
        status: 'LOADED',
        loadJobId: 'load-job-1',
      },
      progress: {
        totalPallets: 2,
        loadedPallets: 1,
        remainingPallets: 1,
      },
    });

    const duplicate = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      })
      .expect(201);

    expect(duplicate.body).toMatchObject({
      result: 'DUPLICATE',
      progress: {
        totalPallets: 2,
        loadedPallets: 1,
        remainingPallets: 1,
      },
    });

    await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|EITU9315039|YEG2|1/1|PALLET-003',
      })
      .expect(201);

    const overPlan = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
      })
      .expect(409);

    expect(overPlan.body).toMatchObject({
      code: 'LOAD_JOB_LINE_PALLET_LIMIT_REACHED',
    });
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.eventType,
      ),
    ).toEqual(['LOADED', 'DUPLICATE_SCAN', 'LOADED', 'INVALID_SCAN']);
  });

  it('reverses a loaded scan with explicit confirmation', async () => {
    await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-UNDO',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-2P' }],
      })
      .expect(201);
    await openLoadJobForScanning('load-job-1');

    const loaded = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      })
      .expect(201);
    const loadedBody = loaded.body as ScanBody;

    const loadedPallets = await authorizedRequest(app)
      .get('/api/load-jobs/load-job-1/loaded-pallets')
      .expect(200);

    expect(loadedPallets.body).toMatchObject({
      items: [
        {
          id: loadedBody.pallet.id,
          status: 'LOADED',
          loadJobId: 'load-job-1',
        },
      ],
    });

    await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan/reverse')
      .send({
        confirm: false,
        palletRecordId: loadedBody.pallet.id,
        reason: 'Need to combine pallets',
      })
      .expect(400);

    const reversed = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan/reverse')
      .send({
        confirm: true,
        deviceId: 'mobile-camera',
        palletRecordId: loadedBody.pallet.id,
        reason: 'Need to combine pallets',
      })
      .expect(201);

    expect(reversed.body).toMatchObject({
      result: 'REMOVED',
      pallet: {
        id: 'pallet-1',
        status: 'LABEL_PRINTED',
        loadJobId: null,
      },
      progress: {
        totalPallets: 2,
        loadedPallets: 0,
        remainingPallets: 2,
      },
    });
    const loadedAfterReverse = await authorizedRequest(app)
      .get('/api/load-jobs/load-job-1/loaded-pallets')
      .expect(200);

    expect(loadedAfterReverse.body).toEqual({ items: [] });
    expect(
      prisma.palletEvent.create.mock.calls.map(
        (call) => call[0].data.eventType,
      ),
    ).toEqual(['LOADED', 'STATUS_CHANGED']);
  });

  it('splits one container destination across multiple load jobs with part suffixes', async () => {
    const firstJob = await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-PART-1',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P-part1' }],
      })
      .expect(201);
    const secondJob = await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-PART-2',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-1P-part2' }],
      })
      .expect(201);

    expect(firstJob.body).toMatchObject({
      id: 'load-job-1',
      plannedPalletCount: 1,
      lines: [
        expect.objectContaining({
          containerId: 'container-1',
          plannedPallets: 1,
          externalTransfer: false,
        }),
      ],
    });
    expect(secondJob.body).toMatchObject({
      id: 'load-job-2',
      plannedPalletCount: 1,
      lines: [
        expect.objectContaining({
          containerId: 'container-1',
          plannedPallets: 1,
          externalTransfer: false,
        }),
      ],
    });
    await openLoadJobForScanning('load-job-1');
    await openLoadJobForScanning('load-job-2');

    const firstScan = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      })
      .expect(201);
    const secondScan = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-2/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
      })
      .expect(201);

    expect(firstScan.body).toMatchObject({
      result: 'LOADED',
      pallet: {
        id: 'pallet-1',
        loadJobId: 'load-job-1',
      },
      progress: {
        totalPallets: 1,
        loadedPallets: 1,
        remainingPallets: 0,
      },
    });
    expect(secondScan.body).toMatchObject({
      result: 'LOADED',
      pallet: {
        id: 'pallet-2',
        loadJobId: 'load-job-2',
      },
      progress: {
        totalPallets: 1,
        loadedPallets: 1,
        remainingPallets: 0,
      },
    });
  });

  it('allows a pure external transfer job but rejects system pallets as not in plan', async () => {
    const created = await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-XFER',
        destinationRegion: 'YEG2',
        lines: [
          { sourceText: 'ZCSU9024512B转运-12P' },
          { sourceText: 'ZCSU9025231B转运 -2P' },
        ],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      containerId: null,
      plannedPalletCount: 0,
      externalPalletCount: 14,
    });
    await openLoadJobForScanning('load-job-1');

    const rejected = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      })
      .expect(409);

    expect(rejected.body).toMatchObject({
      code: 'PALLET_NOT_IN_LOAD_PLAN',
    });
  });

  it('records invalid QR scans, blocks pallets loaded by another job, and rejects closed jobs', async () => {
    await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-001',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-2P' }],
      })
      .expect(201);
    await authorizedRequest(app)
      .post('/api/load-jobs')
      .send({
        loadNo: 'LOAD-2026-002',
        destinationRegion: 'YEG2',
        lines: [{ sourceText: 'CSNU8877228-2P' }],
      })
      .expect(201);
    await openLoadJobForScanning('load-job-1');
    await openLoadJobForScanning('load-job-2');

    const invalid = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP0|PALLET|old-version|PALLET-001',
        deviceId: 'scanner-1',
      })
      .expect(400);

    expect(invalid.body).toMatchObject({
      code: 'INVALID_QR_PAYLOAD',
    });

    await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      })
      .expect(201);

    const conflict = await authorizedRequest(app)
      .post('/api/load-jobs/load-job-2/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
      })
      .expect(409);

    expect(conflict.body).toMatchObject({
      code: 'PALLET_ALREADY_LOADED',
    });

    await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/close')
      .send({ dockNo: 'D3' })
      .expect(201);

    await authorizedRequest(app)
      .post('/api/load-jobs/load-job-1/scan')
      .send({
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
      })
      .expect(409);
  });

  async function openLoadJobForScanning(id: string): Promise<void> {
    await authorizedRequest(app)
      .patch(`/api/load-jobs/${id}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    prisma.palletEvent.create.mockClear();
    prisma.__events.length = 0;
  }

  function createPrismaMock() {
    const containers = [
      {
        id: 'container-1',
        containerNo: 'CSNU8877228',
        status: 'LABELS_GENERATED',
        updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      },
      {
        id: 'container-2',
        containerNo: 'EITU9315039',
        status: 'LABELS_GENERATED',
        updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      },
    ];
    const users = [
      {
        id: 'user-1',
        email: 'office@example.test',
        name: 'Office User',
        role: 'OFFICE',
      },
    ];
    const destinations = [
      {
        id: 'destination-1',
        containerId: 'container-1',
        destinationCode: 'YEG2',
        destinationType: 'AMAZON_FBA',
      },
      {
        id: 'destination-2',
        containerId: 'container-2',
        destinationCode: 'YEG2',
        destinationType: 'AMAZON_FBA',
      },
    ];
    const pallets = [
      {
        id: 'pallet-1',
        containerDestinationId: 'destination-1',
        palletNo: 1,
        palletId: 'PALLET-001',
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|1/2|PALLET-001',
        status: 'LABEL_PRINTED',
        labelPrintedAt: new Date('2026-06-27T09:00:00.000Z'),
        loadedAt: null,
        loadJobId: null,
        createdAt: new Date('2026-06-27T09:00:00.000Z'),
        updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      },
      {
        id: 'pallet-2',
        containerDestinationId: 'destination-1',
        palletNo: 2,
        palletId: 'PALLET-002',
        qrPayload: 'SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|2/2|PALLET-002',
        status: 'LABEL_PRINTED',
        labelPrintedAt: new Date('2026-06-27T09:00:00.000Z'),
        loadedAt: null,
        loadJobId: null,
        createdAt: new Date('2026-06-27T09:00:00.000Z'),
        updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      },
      {
        id: 'pallet-3',
        containerDestinationId: 'destination-2',
        palletNo: 1,
        palletId: 'PALLET-003',
        qrPayload: 'SSP1|PALLET|2026-06-27|EITU9315039|YEG2|1/1|PALLET-003',
        status: 'LABEL_PRINTED',
        labelPrintedAt: new Date('2026-06-27T09:00:00.000Z'),
        loadedAt: null,
        loadJobId: null,
        createdAt: new Date('2026-06-27T09:00:00.000Z'),
        updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      },
    ];
    const loadJobs: any[] = [];
    const loadJobLines: any[] = [];
    const events: any[] = [];

    const hydrateLine = (record: any) => ({
      ...record,
      container:
        containers.find((container) => container.id === record.containerId) ??
        null,
    });
    const hydrate = (record: any) => ({
      ...record,
      container:
        containers.find((container) => container.id === record.containerId) ??
        null,
      createdBy: users.find((user) => user.id === record.createdById) ?? null,
      lines: loadJobLines
        .filter((line) => line.loadJobId === record.id)
        .sort((left, right) => left.sequence - right.sequence)
        .map(hydrateLine),
      _count: {
        pallets: pallets.filter((pallet) => pallet.loadJobId === record.id)
          .length,
        events: events.filter((event) => event.loadJobId === record.id).length,
      },
    });
    const hydratePallet = (record: any) => ({
      ...record,
      containerDestination: (() => {
        const destination =
          destinations.find(
            (item) => item.id === record.containerDestinationId,
          ) ?? null;
        if (!destination) {
          return null;
        }

        return {
          ...destination,
          container:
            containers.find(
              (container) => container.id === destination.containerId,
            ) ?? null,
        };
      })(),
    });
    const matchesLoadJobWhere = (record: any, where: any) => {
      if (!where) {
        return true;
      }
      if (where.OR) {
        const matchesOr = where.OR.some((condition: any) => {
          if (condition.containerId) {
            return record.containerId === condition.containerId;
          }
          const lineContainerId = condition.lines?.some?.containerId;
          return lineContainerId
            ? loadJobLines.some(
                (line) =>
                  line.loadJobId === record.id &&
                  line.containerId === lineContainerId,
              )
            : false;
        });
        if (!matchesOr) {
          return false;
        }
      }
      if (where.jobNo && record.jobNo !== where.jobNo) {
        return false;
      }
      if (
        where.destinationRegion &&
        record.destinationRegion !== where.destinationRegion
      ) {
        return false;
      }
      if (where.status && record.status !== where.status) {
        return false;
      }
      return true;
    };
    const matchesPalletWhere = (pallet: any, where: any) => {
      const destination = destinations.find(
        (item) => item.id === pallet.containerDestinationId,
      );

      if (where.status?.not && pallet.status === where.status.not) {
        return false;
      }
      if (where.status && !where.status.not && pallet.status !== where.status) {
        return false;
      }
      if (where.loadJobId && pallet.loadJobId !== where.loadJobId) {
        return false;
      }
      if (
        where.containerDestinationId &&
        pallet.containerDestinationId !== where.containerDestinationId
      ) {
        return false;
      }

      const destinationFilter =
        where.containerDestination?.is ?? where.containerDestination;
      if (destinationFilter?.containerId) {
        if (destination?.containerId !== destinationFilter.containerId) {
          return false;
        }
      }
      if (destinationFilter?.destinationCode) {
        if (
          destination?.destinationCode !== destinationFilter.destinationCode
        ) {
          return false;
        }
      }

      return true;
    };
    const timeMs = (value: unknown): number =>
      value instanceof Date ? value.getTime() : 0;

    const mock: any = {
      $transaction: jest.fn((callback) => callback(mock)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'pallet-1' }]),
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      container: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            containers.find((container) =>
              where.id
                ? container.id === where.id
                : container.containerNo === where.containerNo,
            ) ?? null,
          ),
        ),
        update: jest.fn(({ where, data }) => {
          const record = containers.find(
            (container) => container.id === where.id,
          );
          if (!record) {
            throw new Error(`Container not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-27T11:00:00.000Z'),
          });
          return Promise.resolve(record);
        }),
      },
      containerDestination: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            destinations.find((destination) => destination.id === where.id) ??
              null,
          ),
        ),
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            destinations.find(
              (destination) =>
                destination.containerId === where.containerId &&
                destination.destinationCode === where.destinationCode,
            ) ?? null,
          ),
        ),
      },
      user: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(users.find((user) => user.id === where.id) ?? null),
        ),
      },
      loadJob: {
        create: jest.fn(({ data }) => {
          const createdAt = new Date(
            `2026-06-27T10:0${loadJobs.length}:00.000Z`,
          );
          const record = {
            id: `load-job-${loadJobs.length + 1}`,
            containerId: data.containerId ?? null,
            jobNo: data.jobNo ?? null,
            truckNo: data.truckNo ?? null,
            dockNo: data.dockNo ?? null,
            carrier: data.carrier ?? null,
            destinationRegion: data.destinationRegion ?? null,
            status: data.status,
            startedAt: data.startedAt ?? null,
            scheduledDepartureAt: data.scheduledDepartureAt ?? null,
            closedAt: data.closedAt ?? null,
            createdById: data.createdById ?? null,
            createdAt,
            updatedAt: createdAt,
          };
          loadJobs.push(record);
          for (const line of data.lines?.create ?? []) {
            loadJobLines.push({
              id: `line-${loadJobLines.length + 1}`,
              loadJobId: record.id,
              sequence: line.sequence,
              sourceText: line.sourceText ?? null,
              containerNo: line.containerNo ?? null,
              containerId: line.containerId ?? null,
              containerDestinationId: line.containerDestinationId ?? null,
              destinationCode: line.destinationCode ?? null,
              plannedPallets: line.plannedPallets ?? 0,
              externalTransfer: line.externalTransfer ?? false,
              note: line.note ?? null,
              createdAt,
              updatedAt: createdAt,
            });
          }
          return Promise.resolve(hydrate(record));
        }),
        findMany: jest.fn(({ where, take, skip }) => {
          const filtered = loadJobs
            .filter((record) => matchesLoadJobWhere(record, where))
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime(),
            );

          return Promise.resolve(
            filtered.slice(skip, skip + take).map(hydrate),
          );
        }),
        findUnique: jest.fn(({ where }) => {
          const record = loadJobs.find((item) => item.id === where.id);
          return Promise.resolve(record ? hydrate(record) : null);
        }),
        update: jest.fn(({ where, data }) => {
          const record = loadJobs.find((item) => item.id === where.id);
          if (!record) {
            throw new Error(`Load job not found: ${where.id}`);
          }
          const { lines, ...recordData } = data;
          Object.assign(record, recordData, {
            updatedAt: new Date('2026-06-27T11:00:00.000Z'),
          });
          if (lines?.deleteMany) {
            for (let index = loadJobLines.length - 1; index >= 0; index -= 1) {
              if (loadJobLines[index].loadJobId === record.id) {
                loadJobLines.splice(index, 1);
              }
            }
          }
          for (const line of lines?.create ?? []) {
            loadJobLines.push({
              id: `line-${loadJobLines.length + 1}`,
              loadJobId: record.id,
              sequence: line.sequence,
              sourceText: line.sourceText ?? null,
              containerNo: line.containerNo ?? null,
              containerId: line.containerId ?? null,
              containerDestinationId: line.containerDestinationId ?? null,
              destinationCode: line.destinationCode ?? null,
              plannedPallets: line.plannedPallets ?? 0,
              externalTransfer: line.externalTransfer ?? false,
              note: line.note ?? null,
              createdAt: new Date('2026-06-27T11:00:00.000Z'),
              updatedAt: new Date('2026-06-27T11:00:00.000Z'),
            });
          }
          return Promise.resolve(hydrate(record));
        }),
        delete: jest.fn(({ where }) => {
          const index = loadJobs.findIndex((item) => item.id === where.id);
          if (index < 0) {
            throw new Error(`Load job not found: ${where.id}`);
          }
          const [record] = loadJobs.splice(index, 1);
          for (
            let lineIndex = loadJobLines.length - 1;
            lineIndex >= 0;
            lineIndex -= 1
          ) {
            if (loadJobLines[lineIndex].loadJobId === record.id) {
              loadJobLines.splice(lineIndex, 1);
            }
          }
          return Promise.resolve(hydrate(record));
        }),
      },
      pallet: {
        findMany: jest.fn(({ where }) => {
          const filtered = pallets
            .filter((pallet) => matchesPalletWhere(pallet, where))
            .sort((left, right) => {
              const loadedDelta =
                timeMs(right.loadedAt) - timeMs(left.loadedAt);

              return loadedDelta || left.palletNo - right.palletNo;
            });

          return Promise.resolve(filtered.map(hydratePallet));
        }),
        findFirst: jest.fn(({ where }) => {
          const record = pallets.find((pallet) =>
            where.OR.some(
              (condition: any) =>
                condition.qrPayload === pallet.qrPayload ||
                condition.palletId === pallet.palletId,
            ),
          );
          return Promise.resolve(record ? hydratePallet(record) : null);
        }),
        findUnique: jest.fn(({ where }) => {
          const record = pallets.find((pallet) => pallet.id === where.id);
          return Promise.resolve(record ? hydratePallet(record) : null);
        }),
        update: jest.fn(({ where, data }) => {
          const record = pallets.find((pallet) => pallet.id === where.id);
          if (!record) {
            throw new Error(`Pallet not found: ${where.id}`);
          }
          Object.assign(record, data, {
            updatedAt: new Date('2026-06-27T11:00:00.000Z'),
          });
          return Promise.resolve(hydratePallet(record));
        }),
        count: jest.fn(({ where }) =>
          Promise.resolve(
            pallets.filter((pallet) => matchesPalletWhere(pallet, where))
              .length,
          ),
        ),
      },
      palletEvent: {
        create: jest.fn(({ data }) => {
          const occurredAt =
            data.occurredAt ?? new Date('2026-06-27T11:00:00.000Z');
          const record = {
            id: `event-${events.length + 1}`,
            palletId: null,
            ...data,
            occurredAt,
            createdAt: occurredAt,
            updatedAt: occurredAt,
          };
          events.push(record);
          return Promise.resolve(record);
        }),
      },
    };

    mock.__events = events;

    return mock;
  }
});
