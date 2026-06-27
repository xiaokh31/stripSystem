import { InventoryReportsService } from './inventory-reports.service';
import { PrismaService } from '../prisma/prisma.service';

interface PalletRecord {
  id: string;
  status: string;
}

interface DestinationRecord {
  id: string;
  destinationCode: string;
  destinationType: string | null;
  pallets: PalletRecord[];
}

interface ContainerRecord {
  id: string;
  containerNo: string;
  status: string;
  destinations: DestinationRecord[];
}

interface InventoryPrismaMock {
  container: {
    findMany: jest.Mock<Promise<ContainerRecord[]>, []>;
    findUnique: jest.Mock<Promise<ContainerRecord | null>, []>;
  };
}

describe('InventoryReportsService', () => {
  let containers: ContainerRecord[];
  let prisma: InventoryPrismaMock;
  let service: InventoryReportsService;

  beforeEach(() => {
    containers = [
      {
        id: 'container-1',
        containerNo: 'CSNU8877228',
        status: 'LABELS_GENERATED',
        destinations: [
          {
            id: 'destination-1',
            destinationCode: 'YYZ',
            destinationType: 'AMAZON_FBA',
            pallets: [
              { id: 'pallet-1', status: 'LABEL_PRINTED' },
              { id: 'pallet-2', status: 'LOADED' },
            ],
          },
          {
            id: 'destination-2',
            destinationCode: 'YVR',
            destinationType: 'AMAZON_FBA',
            pallets: [{ id: 'pallet-3', status: 'LABEL_PRINTED' }],
          },
        ],
      },
    ];
    prisma = {
      container: {
        findMany: jest
          .fn<Promise<ContainerRecord[]>, []>()
          .mockResolvedValue(containers),
        findUnique: jest
          .fn<Promise<ContainerRecord | null>, []>()
          .mockResolvedValue(containers[0]),
      },
    };
    service = new InventoryReportsService(prisma as unknown as PrismaService);
  });

  it('calculates container and destination inventory from pallet status', async () => {
    const containerSummary = await service.containerSummary({});
    const inventory = await service.inventory({});

    expect(containerSummary.items).toEqual([
      {
        containerId: 'container-1',
        containerNo: 'CSNU8877228',
        status: 'LABELS_GENERATED',
        totalPallets: 3,
        loadedPallets: 1,
        remainingPallets: 2,
      },
    ]);
    expect(inventory.items).toEqual([
      {
        destinationCode: 'YVR',
        totalPallets: 1,
        loadedPallets: 0,
        remainingPallets: 1,
      },
      {
        destinationCode: 'YYZ',
        totalPallets: 2,
        loadedPallets: 1,
        remainingPallets: 1,
      },
    ]);
  });

  it('reflects loaded status changes from database state', async () => {
    containers[0].destinations[1].pallets[0].status = 'LOADED';

    const summary = await service.containerDetailSummary('container-1', {});

    expect(summary.totalPallets).toBe(3);
    expect(summary.loadedPallets).toBe(2);
    expect(summary.remainingPallets).toBe(1);
    expect(summary.destinations).toEqual([
      {
        containerDestinationId: 'destination-1',
        destinationCode: 'YYZ',
        destinationType: 'AMAZON_FBA',
        totalPallets: 2,
        loadedPallets: 1,
        remainingPallets: 1,
      },
      {
        containerDestinationId: 'destination-2',
        destinationCode: 'YVR',
        destinationType: 'AMAZON_FBA',
        totalPallets: 1,
        loadedPallets: 1,
        remainingPallets: 0,
      },
    ]);
  });

  it('supports destination and pallet status filters', async () => {
    const summary = await service.containerSummary({
      destinationCode: 'YYZ',
      status: 'LOADED',
    });

    expect(summary.items).toEqual([
      {
        containerId: 'container-1',
        containerNo: 'CSNU8877228',
        status: 'LABELS_GENERATED',
        totalPallets: 1,
        loadedPallets: 1,
        remainingPallets: 0,
      },
    ]);
  });
});
