import { HttpException } from '@nestjs/common';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InventoryAdjustmentsService', () => {
  const officeActor = {
    id: 'auth-office',
    email: 'office@example.com',
    name: 'Office User',
    roles: ['OFFICE'],
    permissions: ['inventory.adjust'],
  };

  let prisma: any;
  let service: InventoryAdjustmentsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new InventoryAdjustmentsService(prisma as PrismaService);
  });

  it('creates a manual depletion adjustment by stable remaining pallet count', async () => {
    const result = await service.create(
      'destination-1',
      {
        count: 2,
        reasonCode: 'SCAN_MISSED',
        note: 'Warehouse confirmed these were delivered without scan.',
      },
      officeActor,
    );

    expect(result).toMatchObject({
      id: 'adjustment-1',
      containerId: 'container-1',
      containerDestinationId: 'destination-1',
      adjustmentType: 'MANUAL_DEPLETION',
      palletCount: 2,
      reasonCode: 'SCAN_MISSED',
      note: 'Warehouse confirmed these were delivered without scan.',
      createdById: 'auth-office',
      pallets: [
        {
          id: 'pallet-1',
          palletId: 'PALLET-001',
          palletNo: 1,
          fromStatus: 'PLANNED',
          toStatus: 'ADJUSTED_OUT',
          eventId: 'event-1',
        },
        {
          id: 'pallet-2',
          palletId: 'PALLET-002',
          palletNo: 2,
          fromStatus: 'LABEL_PRINTED',
          toStatus: 'ADJUSTED_OUT',
          eventId: 'event-2',
        },
      ],
    });
    expect(prisma.palletEvent.create.mock.calls).toHaveLength(2);
    expect(prisma.palletEvent.create.mock.calls[0][0].data).toMatchObject({
      eventType: 'MANUAL_INVENTORY_DEPLETION',
      inventoryAdjustmentId: 'adjustment-1',
      fromStatus: 'PLANNED',
      toStatus: 'ADJUSTED_OUT',
      exceptionReason: 'SCAN_MISSED',
      operatorId: 'auth-office',
      metadata: expect.objectContaining({
        action: 'MANUAL_INVENTORY_DEPLETION',
        businessPalletId: 'PALLET-001',
      }),
    });
    expect(prisma.pallet.update).toHaveBeenCalledWith({
      where: { id: 'pallet-1' },
      data: {
        status: 'ADJUSTED_OUT',
        loadedAt: null,
        loadJobId: null,
      },
    });
    expect(prisma.__pallets.map((pallet: any) => pallet.status)).toEqual([
      'ADJUSTED_OUT',
      'ADJUSTED_OUT',
      'LOADED',
      'EXCEPTION',
    ]);
  });

  it('uses palletIds over count and rejects ineligible requested pallets', async () => {
    await expectHttpErrorCode(
      service.create(
        'destination-1',
        {
          count: 1,
          palletIds: ['PALLET-003'],
          reasonCode: 'DATA_CLEANUP',
        },
        officeActor,
      ),
      'INVENTORY_ADJUSTMENT_PALLET_NOT_ELIGIBLE',
    );
    expect(prisma.inventoryAdjustment.create).not.toHaveBeenCalled();
    expect(prisma.pallet.update).not.toHaveBeenCalled();
  });

  it('requires note for OTHER reason before opening a transaction', async () => {
    await expectHttpErrorCode(
      service.create(
        'destination-1',
        {
          count: 1,
          reasonCode: 'OTHER',
        },
        officeActor,
      ),
      'INVENTORY_ADJUSTMENT_REASON_REQUIRED',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns stable errors when count exceeds eligible remaining pallets', async () => {
    await expectHttpErrorCode(
      service.create(
        'destination-1',
        {
          count: 4,
          reasonCode: 'DELIVERED_WITHOUT_SCAN',
        },
        officeActor,
      ),
      'INVENTORY_ADJUSTMENT_COUNT_EXCEEDS_REMAINING',
    );
    expect(prisma.inventoryAdjustment.create).not.toHaveBeenCalled();
  });

  it('lists adjustments as raw codes and enums without UI labels', async () => {
    await service.create(
      'destination-1',
      {
        palletIds: ['PALLET-004'],
        reasonCode: 'DELIVERED_WITHOUT_SCAN',
      },
      officeActor,
    );

    const result = await service.list('destination-1');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      adjustmentType: 'MANUAL_DEPLETION',
      reasonCode: 'DELIVERED_WITHOUT_SCAN',
      pallets: [
        {
          palletId: 'PALLET-004',
          fromStatus: 'EXCEPTION',
          toStatus: 'ADJUSTED_OUT',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('Delivered without scan');
    expect(result.items[0]).not.toHaveProperty('reasonLabel');
  });

  async function expectHttpErrorCode(
    promise: Promise<unknown>,
    code: string,
  ): Promise<void> {
    try {
      await promise;
      throw new Error(`Expected ${code}`);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toMatchObject({ code });
    }
  }

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
      pallet('pallet-1', 'PALLET-001', 1, 'PLANNED'),
      pallet('pallet-2', 'PALLET-002', 2, 'LABEL_PRINTED'),
      pallet('pallet-3', 'PALLET-003', 3, 'LOADED', {
        loadedAt: new Date('2026-07-10T10:00:00.000Z'),
        loadJobId: 'load-job-1',
      }),
      pallet('pallet-4', 'PALLET-004', 4, 'EXCEPTION'),
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
    const sortPallets = (records: any[]) =>
      [...records].sort(
        (left, right) =>
          left.palletNo - right.palletNo || left.id.localeCompare(right.id),
      );

    const mock: any = {
      $transaction: jest.fn((callback) => callback(mock)),
      $queryRaw: jest.fn().mockResolvedValue([]),
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
          const filtered = sortPallets(
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
      qrPayload: `SSP1|PALLET|2026-06-27|CSNU8877228|YEG2|${palletNo}/4|${palletId}`,
      status,
      loadedAt: null,
      loadJobId: null,
      createdAt: new Date('2026-06-27T09:00:00.000Z'),
      updatedAt: new Date('2026-06-27T09:00:00.000Z'),
      ...overrides,
    };
  }
});
