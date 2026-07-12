import { ContainerPalletInventorySyncService } from './container-pallet-inventory-sync.service';
import { PalletStatus } from '../generated/prisma/enums';

interface PalletState {
  id: string;
  containerDestinationId: string;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: Date | null;
  loadedAt: Date | null;
  loadJobId: string | null;
}

interface DestinationState {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string | null;
  packageType: string | null;
  finalPallets: number;
  pallets: PalletState[];
}

describe('ContainerPalletInventorySyncService', () => {
  const service = new ContainerPalletInventorySyncService();

  it('creates planned pallets and CREATED audit events when unloading completes without labels', async () => {
    const harness = createHarness({ finalPallets: 5 });

    const result = await service.synchronizeForUnloading(harness.tx, {
      actorId: 'office-user',
      containerId: 'container-1',
    });

    expect(result.destinations).toEqual([
      expect.objectContaining({
        expectedPallets: 5,
        reusedPallets: 0,
        createdPallets: 5,
        cancelledPallets: 0,
        activeTotalPallets: 5,
        warnings: [],
      }),
    ]);
    expect(harness.destination.pallets).toHaveLength(5);
    expect(
      harness.destination.pallets.every(
        (pallet) => pallet.status === 'PLANNED',
      ),
    ).toBe(true);
    expect(harness.events).toHaveLength(5);
    expect(harness.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'CREATED',
          fromStatus: null,
          toStatus: 'PLANNED',
          operatorId: 'office-user',
          metadata: expect.objectContaining({
            source: 'unloading-completion-inventory-sync',
            actorId: 'office-user',
            containerId: 'container-1',
            containerDestinationId: 'destination-1',
          }),
        }),
      ]),
    );
  });

  it('keeps label-printed pallet identity, timestamp, and event history intact', async () => {
    const labelPrintedAt = new Date('2026-07-10T12:00:00.000Z');
    const harness = createHarness({
      finalPallets: 5,
      pallets: [1, 2, 3, 4, 5].map((palletNo) =>
        palletState({
          palletNo,
          status: PalletStatus.LABEL_PRINTED,
          labelPrintedAt,
        }),
      ),
    });
    const before = harness.destination.pallets.map((pallet) => ({
      id: pallet.id,
      palletId: pallet.palletId,
      qrPayload: pallet.qrPayload,
      labelPrintedAt: pallet.labelPrintedAt,
    }));

    const result = await service.synchronizeForUnloading(harness.tx, {
      actorId: 'office-user',
      containerId: 'container-1',
    });

    expect(result.destinations[0]).toMatchObject({
      activeTotalPallets: 5,
      createdPallets: 0,
      reusedPallets: 5,
      cancelledPallets: 0,
    });
    expect(harness.destination.pallets).toEqual(
      expect.arrayContaining(
        before.map((pallet) => expect.objectContaining(pallet)),
      ),
    );
    expect(harness.events).toHaveLength(0);
  });

  it('cancels only safe surplus pallets and reports the active inventory total', async () => {
    const harness = createHarness({
      finalPallets: 3,
      pallets: [1, 2, 3, 4, 5].map((palletNo) =>
        palletState({ palletNo, status: PalletStatus.PLANNED }),
      ),
    });

    const result = await service.synchronizeForUnloading(harness.tx, {
      actorId: 'office-user',
      containerId: 'container-1',
    });

    expect(result.destinations[0]).toMatchObject({
      expectedPallets: 3,
      reusedPallets: 3,
      createdPallets: 0,
      cancelledPallets: 2,
      activeTotalPallets: 3,
    });
    expect(
      harness.destination.pallets
        .filter((pallet) => pallet.status === PalletStatus.CANCELLED)
        .map((pallet) => pallet.palletNo),
    ).toEqual([4, 5]);
    expect(harness.events).toEqual([
      expect.objectContaining({
        eventType: 'CANCELLED',
        fromStatus: 'PLANNED',
        toStatus: 'CANCELLED',
      }),
      expect.objectContaining({
        eventType: 'CANCELLED',
        fromStatus: 'PLANNED',
        toStatus: 'CANCELLED',
      }),
    ]);
  });

  it.each(['EXCEPTION'])(
    'rejects unsafe %s surplus without creating a partial inventory state',
    async (status) => {
      const harness = createHarness({
        finalPallets: 3,
        pallets: [
          palletState({ palletNo: 1, status: PalletStatus.PLANNED }),
          palletState({ palletNo: 2, status: PalletStatus.PLANNED }),
          palletState({
            palletNo: 3,
            status: PalletStatus.PLANNED,
          }),
          palletState({
            palletNo: 4,
            status,
            loadJobId: null,
            loadedAt: null,
          }),
        ],
      });

      await expect(
        service.synchronizeForUnloading(harness.tx, {
          actorId: 'office-user',
          containerId: 'container-1',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CONTAINER_INVENTORY_SYNC_UNSAFE_SURPLUS',
        }),
      });
      expect(
        harness.destination.pallets.map((pallet) => pallet.status),
      ).toEqual(['PLANNED', 'PLANNED', 'PLANNED', status]);
      expect(harness.events).toHaveLength(0);
    },
  );

  it('is idempotent when the same completion is retried', async () => {
    const harness = createHarness({ finalPallets: 5 });

    await service.synchronizeForUnloading(harness.tx, {
      actorId: 'office-user',
      containerId: 'container-1',
    });
    const retried = await service.synchronizeForUnloading(harness.tx, {
      actorId: 'office-user',
      containerId: 'container-1',
    });

    expect(retried.destinations[0]).toMatchObject({
      activeTotalPallets: 5,
      createdPallets: 0,
      cancelledPallets: 0,
      reusedPallets: 5,
    });
    expect(harness.destination.pallets).toHaveLength(5);
    expect(harness.events).toHaveLength(5);
  });

  it('maps a unique identity race to the stable concurrent sync code', async () => {
    const harness = createHarness({ finalPallets: 1 });
    harness.tx.pallet.create.mockRejectedValueOnce(
      Object.assign(new Error('unique pallet identity'), { code: 'P2002' }),
    );

    await expect(
      service.synchronizeForUnloading(harness.tx, {
        actorId: 'office-user',
        containerId: 'container-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTAINER_INVENTORY_SYNC_CONCURRENT',
      }),
    });
    expect(harness.destination.pallets).toHaveLength(0);
    expect(harness.events).toHaveLength(0);
  });

  it('rejects invalid final counts and containers that already entered loading', async () => {
    const invalid = createHarness({ finalPallets: Number.NaN });
    await expect(
      service.synchronizeForUnloading(invalid.tx, {
        actorId: 'office-user',
        containerId: 'container-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTAINER_INVENTORY_SYNC_INVALID_FINAL_COUNT',
      }),
    });

    const loading = createHarness({
      finalPallets: 2,
      status: 'LOADING_IN_PROGRESS',
    });
    await expect(
      service.synchronizeForUnloading(loading.tx, {
        actorId: 'office-user',
        containerId: 'container-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONTAINER_INVENTORY_SYNC_CONTAINER_LOCKED',
      }),
    });
  });
});

function createHarness(input: {
  finalPallets: number;
  pallets?: PalletState[];
  status?: string;
}) {
  const destination: DestinationState = {
    id: 'destination-1',
    containerId: 'container-1',
    destinationCode: 'YYZ',
    destinationType: 'WAREHOUSE',
    packageType: 'CARTON',
    finalPallets: input.finalPallets,
    pallets: input.pallets ?? [],
  };
  const container = {
    id: 'container-1',
    containerNo: 'CSNU8877228',
    status: input.status ?? 'LABELS_GENERATED',
  };
  const events: Array<Record<string, unknown>> = [];
  let createdSequence = destination.pallets.length;

  const snapshot = () => ({
    ...container,
    destinations: [
      {
        ...destination,
        pallets: destination.pallets.map((pallet) => ({ ...pallet })),
      },
    ],
  });
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    container: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === container.id ? snapshot() : null),
      ),
    },
    pallet: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<PalletState, 'id' | 'loadedAt' | 'loadJobId'>;
        }) => {
          createdSequence += 1;
          const created: PalletState = {
            id: `pallet-${createdSequence}`,
            containerDestinationId: data.containerDestinationId,
            palletNo: data.palletNo,
            palletId: data.palletId,
            qrPayload: data.qrPayload,
            status: data.status,
            labelPrintedAt: data.labelPrintedAt,
            loadedAt: null,
            loadJobId: null,
          };
          destination.pallets.push(created);
          return Promise.resolve({ ...created });
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<PalletState>;
        }) => {
          const pallet = destination.pallets.find(
            (item) => item.id === where.id,
          );
          if (!pallet) {
            throw new Error(`Missing pallet ${where.id}`);
          }
          Object.assign(pallet, data);
          return Promise.resolve({ ...pallet });
        },
      ),
    },
    palletEvent: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const event = { id: `event-${events.length + 1}`, ...data };
        events.push(event);
        return Promise.resolve(event);
      }),
    },
  };

  return { destination, events, tx };
}

function palletState(input: {
  palletNo: number;
  status: string;
  labelPrintedAt?: Date | null;
  loadedAt?: Date | null;
  loadJobId?: string | null;
}): PalletState {
  return {
    id: `pallet-${input.palletNo}`,
    containerDestinationId: 'destination-1',
    palletNo: input.palletNo,
    palletId: `CSNU8877228-D001-YYZ-P${String(input.palletNo).padStart(3, '0')}-CONTAINER-1`,
    qrPayload: `SSP1|PALLET|2026-07-10|CSNU8877228|YYZ|${input.palletNo}|PALLET-${input.palletNo}`,
    status: input.status,
    labelPrintedAt: input.labelPrintedAt ?? null,
    loadedAt: input.loadedAt ?? null,
    loadJobId: input.loadJobId ?? null,
  };
}
