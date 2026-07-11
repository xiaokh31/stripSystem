import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PalletStatus } from './../src/generated/prisma/enums';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  configureAuthTestEnv,
  installAuthMock,
  officeAuthHeader,
  warehouseAuthHeader,
} from './auth-test-helpers';

describe('InventoryAdjustmentsController (e2e)', () => {
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

  it('creates and lists manual inventory depletion adjustments with raw codes', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/container-destinations/destination-1/inventory-adjustments')
      .set('Authorization', officeAuthHeader())
      .send({
        count: 1,
        reasonCode: 'SCAN_MISSED',
        note: 'Dock paperwork confirms delivery.',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      id: 'adjustment-1',
      adjustmentType: 'MANUAL_DEPLETION',
      reasonCode: 'SCAN_MISSED',
      palletCount: 1,
      pallets: [
        {
          palletId: 'PALLET-001',
          fromStatus: 'PLANNED',
          toStatus: 'ADJUSTED_OUT',
        },
      ],
    });
    expect(JSON.stringify(created.body)).not.toContain('Scan missed');
    expect(prisma.__pallets[0]).toMatchObject({
      status: 'ADJUSTED_OUT',
      loadedAt: null,
      loadJobId: null,
    });

    const listed = await request(app.getHttpServer())
      .get('/api/container-destinations/destination-1/inventory-adjustments')
      .set('Authorization', officeAuthHeader())
      .expect(200);

    expect(listed.body).toMatchObject({
      items: [
        {
          id: 'adjustment-1',
          reasonCode: 'SCAN_MISSED',
          pallets: [
            {
              palletId: 'PALLET-001',
              fromStatus: 'PLANNED',
              toStatus: 'ADJUSTED_OUT',
            },
          ],
        },
      ],
    });
    expect(listed.body.items[0]).not.toHaveProperty('reasonLabel');
  });

  it('blocks warehouse users with the inventory adjustment permission code', async () => {
    await request(app.getHttpServer())
      .post('/api/container-destinations/destination-1/inventory-adjustments')
      .set('Authorization', warehouseAuthHeader())
      .send({ count: 1, reasonCode: 'SCAN_MISSED' })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'INVENTORY_ADJUSTMENT_PERMISSION_DENIED',
        });
      });
  });

  it('returns stable validation and depletion count errors', async () => {
    await request(app.getHttpServer())
      .post('/api/container-destinations/destination-1/inventory-adjustments')
      .set('Authorization', officeAuthHeader())
      .send({ count: 1, reasonCode: 'OTHER' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'INVENTORY_ADJUSTMENT_REASON_REQUIRED',
        });
      });

    await request(app.getHttpServer())
      .post('/api/container-destinations/destination-1/inventory-adjustments')
      .set('Authorization', officeAuthHeader())
      .send({ count: 5, reasonCode: 'DATA_CLEANUP' })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'INVENTORY_ADJUSTMENT_COUNT_EXCEEDS_REMAINING',
        });
      });
  });

  function createPrismaMock() {
    const destination = {
      id: 'destination-1',
      containerId: 'container-1',
      destinationCode: 'YEG2',
      destinationType: 'AMAZON_FBA',
      container: {
        id: 'container-1',
        containerNo: 'CSNU8877228',
      },
    };
    const pallets = [
      pallet('pallet-1', 'PALLET-001', 1, PalletStatus.PLANNED),
      pallet('pallet-2', 'PALLET-002', 2, PalletStatus.LABEL_PRINTED),
      pallet('pallet-3', 'PALLET-003', 3, PalletStatus.LOADED, {
        loadedAt: new Date('2026-07-10T10:00:00.000Z'),
        loadJobId: 'load-job-1',
      }),
    ];
    const adjustments: any[] = [];
    const events: any[] = [];

    const matchesPalletWhere = (record: any, where: any): boolean => {
      if (where.containerDestinationId) {
        if (record.containerDestinationId !== where.containerDestinationId) {
          return false;
        }
      }
      if (where.id?.in) {
        return where.id.in.includes(record.id);
      }
      if (where.OR) {
        return where.OR.some((condition: any) => {
          if (condition.id?.in?.includes(record.id)) {
            return true;
          }
          return condition.palletId?.in?.includes(record.palletId) ?? false;
        });
      }
      if (where.status?.in && !where.status.in.includes(record.status)) {
        return false;
      }
      if ('loadJobId' in where && record.loadJobId !== where.loadJobId) {
        return false;
      }
      return true;
    };
    const sortedPallets = (records: any[]) =>
      [...records].sort(
        (left, right) =>
          left.palletNo - right.palletNo || left.id.localeCompare(right.id),
      );

    const mock: any = {
      $transaction: jest.fn((callback) => callback(mock)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      checkConnection: jest.fn().mockResolvedValue({ status: 'up' }),
      containerDestination: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(where.id === destination.id ? destination : null),
        ),
      },
      inventoryAdjustment: {
        create: jest.fn(({ data }) => {
          const now = new Date('2026-07-10T12:00:00.000Z');
          const record = {
            id: `adjustment-${adjustments.length + 1}`,
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          adjustments.push(record);
          return Promise.resolve(record);
        }),
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            adjustments
              .filter(
                (record) =>
                  record.containerDestinationId ===
                  where.containerDestinationId,
              )
              .map((record) => ({
                ...record,
                events: events
                  .filter((event) => event.inventoryAdjustmentId === record.id)
                  .map((event) => ({
                    ...event,
                    pallet:
                      pallets.find((item) => item.id === event.palletId) ??
                      null,
                  })),
              })),
          ),
        ),
      },
      pallet: {
        count: jest.fn(({ where }) =>
          Promise.resolve(
            pallets.filter((record) => matchesPalletWhere(record, where))
              .length,
          ),
        ),
        findMany: jest.fn(({ where, take }) => {
          const filtered = sortedPallets(
            pallets.filter((record) => matchesPalletWhere(record, where)),
          );
          return Promise.resolve(
            typeof take === 'number' ? filtered.slice(0, take) : filtered,
          );
        }),
        update: jest.fn(({ where, data }) => {
          const found = pallets.find((record) => record.id === where.id);
          if (!found) {
            throw new Error(`Pallet not found: ${where.id}`);
          }
          Object.assign(found, data);
          return Promise.resolve(found);
        }),
      },
      palletEvent: {
        create: jest.fn(({ data }) => {
          const record = {
            id: `event-${events.length + 1}`,
            ...data,
          };
          events.push(record);
          return Promise.resolve(record);
        }),
      },
    };

    mock.__pallets = pallets;
    mock.__events = events;
    return mock;
  }

  function pallet(
    id: string,
    palletId: string,
    palletNo: number,
    status: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    return {
      id,
      containerDestinationId: 'destination-1',
      palletNo,
      palletId,
      qrPayload: `SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|${palletNo}/3|${palletId}`,
      status,
      loadedAt: null,
      loadJobId: null,
      createdAt: new Date('2026-06-27T09:00:00.000Z'),
      updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      ...overrides,
    };
  }
});
