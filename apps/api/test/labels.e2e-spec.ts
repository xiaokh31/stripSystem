import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

interface DestinationRecord {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string | null;
}

interface PalletRecord {
  id: string;
  containerDestinationId: string;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: Date | null;
  loadedAt: Date | null;
  loadJobId: string | null;
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
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

describe('LabelsController reprint audit (e2e)', () => {
  let app: INestApplication<App>;
  let pallets: PalletRecord[];
  let palletEvents: PalletEventRecord[];
  let prisma: any;

  beforeEach(async () => {
    const seeded = seedRecords();
    pallets = seeded.pallets;
    palletEvents = [];
    prisma = createPrismaMock(seeded.destinations, pallets, palletEvents);

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

  it('records pallet and container reprint audits without changing pallet status', async () => {
    const loadedStatus = pallets[1].status;

    const palletResponse = await request(app.getHttpServer())
      .post('/api/pallets/pallet-2/print')
      .send({
        operatorId: 'user-1',
        reason: 'Loaded pallet label was torn',
      })
      .expect(201);

    expect(palletResponse.body).toMatchObject({
      event: {
        palletRecordId: 'pallet-2',
        businessPalletId: 'CSNU8877228-D001-YYZ-P002',
        userId: 'user-1',
        reason: 'Loaded pallet label was torn',
        palletStatus: 'LOADED',
        supervisorOverride: false,
      },
      pallet: {
        id: 'pallet-2',
        status: 'LOADED',
      },
    });
    expect(pallets[1].status).toBe(loadedStatus);
    expect(palletEvents).toHaveLength(1);
    expect(palletEvents[0]).toMatchObject({
      palletId: 'pallet-2',
      eventType: 'REPRINTED',
      fromStatus: 'LOADED',
      toStatus: 'LOADED',
      operatorId: 'user-1',
    });

    const containerResponse = await request(app.getHttpServer())
      .post('/api/containers/container-1/labels/reprint')
      .send({
        operatorId: 'user-1',
        reason: 'Warehouse needs a fresh label packet',
      })
      .expect(201);

    expect(containerResponse.body).toMatchObject({
      containerId: 'container-1',
      eventCount: 2,
      events: [
        {
          palletRecordId: 'pallet-1',
          palletStatus: 'LABEL_PRINTED',
          userId: 'user-1',
        },
        {
          palletRecordId: 'pallet-2',
          palletStatus: 'LOADED',
          userId: 'user-1',
        },
      ],
    });
    expect(palletEvents).toHaveLength(3);
    expect(pallets.map((pallet) => pallet.status)).toEqual([
      'LABEL_PRINTED',
      'LOADED',
      'CANCELLED',
    ]);
  });

  it('blocks cancelled pallet reprint unless supervisor override is sent', async () => {
    await request(app.getHttpServer())
      .post('/api/pallets/pallet-cancelled/print')
      .send({
        operatorId: 'user-1',
        reason: 'Label copy requested after cancellation',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('REPRINT_REQUIRES_SUPERVISOR_OVERRIDE');
      });
    expect(palletEvents).toHaveLength(0);

    await request(app.getHttpServer())
      .post('/api/pallets/pallet-cancelled/print')
      .send({
        operatorId: 'user-1',
        reason: 'Supervisor approved audit copy',
        supervisorOverride: true,
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.event).toMatchObject({
          palletRecordId: 'pallet-cancelled',
          palletStatus: 'CANCELLED',
          supervisorOverride: true,
        });
      });

    expect(palletEvents).toHaveLength(1);
    expect(palletEvents[0]).toMatchObject({
      palletId: 'pallet-cancelled',
      eventType: 'REPRINTED',
      fromStatus: 'CANCELLED',
      toStatus: 'CANCELLED',
    });
  });

  function seedRecords(): {
    destinations: DestinationRecord[];
    pallets: PalletRecord[];
  } {
    const now = new Date('2026-06-27T12:00:00.000Z');
    const destinations: DestinationRecord[] = [
      {
        id: 'destination-1',
        containerId: 'container-1',
        destinationCode: 'YYZ',
        destinationType: 'AMAZON_FBA',
      },
      {
        id: 'destination-cancelled',
        containerId: 'container-cancelled',
        destinationCode: 'YVR',
        destinationType: 'AMAZON_FBA',
      },
    ];
    return {
      destinations,
      pallets: [
        palletRecord({
          id: 'pallet-1',
          palletNo: 1,
          palletId: 'CSNU8877228-D001-YYZ-P001',
          status: 'LABEL_PRINTED',
          now,
        }),
        palletRecord({
          id: 'pallet-2',
          palletNo: 2,
          palletId: 'CSNU8877228-D001-YYZ-P002',
          status: 'LOADED',
          loadedAt: now,
          loadJobId: 'load-job-1',
          now,
        }),
        palletRecord({
          id: 'pallet-cancelled',
          containerDestinationId: 'destination-cancelled',
          palletNo: 1,
          palletId: 'CANCELLED-D001-YVR-P001',
          status: 'CANCELLED',
          now,
        }),
      ],
    };
  }

  function palletRecord(input: {
    id: string;
    palletNo: number;
    palletId: string;
    status: string;
    now: Date;
    containerDestinationId?: string;
    loadedAt?: Date | null;
    loadJobId?: string | null;
  }): PalletRecord {
    return {
      id: input.id,
      containerDestinationId: input.containerDestinationId ?? 'destination-1',
      palletNo: input.palletNo,
      palletId: input.palletId,
      qrPayload: `SSP1|PALLET|2026-06-27|CSNU8877228|YYZ|${input.palletNo}/2|${input.palletId}`,
      status: input.status,
      labelPrintedAt: input.now,
      loadedAt: input.loadedAt ?? null,
      loadJobId: input.loadJobId ?? null,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  function createPrismaMock(
    destinations: DestinationRecord[],
    palletRecords: PalletRecord[],
    palletEventRecords: PalletEventRecord[],
  ) {
    const containerIds = new Set(destinations.map((item) => item.containerId));
    return {
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      $transaction: jest.fn((callback) => callback(prisma)),
      user: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(where.id === 'user-1' ? { id: 'user-1' } : null),
        ),
      },
      container: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(containerIds.has(where.id) ? { id: where.id } : null),
        ),
      },
      pallet: {
        findUnique: jest.fn(({ where }) => {
          const found =
            palletRecords.find((pallet) => pallet.id === where.id) ?? null;
          return Promise.resolve(
            found ? withDestination(found, destinations) : null,
          );
        }),
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            palletRecords
              .filter((pallet) => {
                const destination = destinations.find(
                  (item) => item.id === pallet.containerDestinationId,
                );
                return (
                  destination?.containerId ===
                  where.containerDestination.containerId
                );
              })
              .map((pallet) => withDestination(pallet, destinations))
              .sort((left, right) => left.palletNo - right.palletNo),
          ),
        ),
      },
      palletEvent: {
        create: jest.fn(({ data }) => {
          const now = new Date('2026-06-27T12:05:00.000Z');
          const record: PalletEventRecord = {
            id: `pallet-event-${palletEventRecords.length + 1}`,
            palletId: data.palletId,
            eventType: data.eventType,
            fromStatus: data.fromStatus,
            toStatus: data.toStatus,
            scanPayload: data.scanPayload,
            metadata: data.metadata,
            operatorId: data.operatorId,
            occurredAt: data.occurredAt,
            createdAt: now,
            updatedAt: now,
          };
          palletEventRecords.push(record);
          return Promise.resolve(record);
        }),
      },
    };
  }

  function withDestination(
    pallet: PalletRecord,
    destinations: DestinationRecord[],
  ): PalletRecord & { containerDestination?: DestinationRecord } {
    return {
      ...pallet,
      containerDestination: destinations.find(
        (destination) => destination.id === pallet.containerDestinationId,
      ),
    };
  }
});
