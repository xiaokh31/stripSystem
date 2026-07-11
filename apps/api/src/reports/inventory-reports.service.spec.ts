import { InventoryReportsService } from './inventory-reports.service';
import { PrismaService } from '../prisma/prisma.service';

interface PalletRecord {
  id: string;
  loadJobId?: string | null;
  loadedAt?: Date | string | null;
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
  payClassification?: string | null;
  payTrailerNumber?: string | null;
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
              { id: 'pallet-4', status: 'ADJUSTED_OUT' },
            ],
          },
          {
            id: 'destination-2',
            destinationCode: 'YVR',
            destinationType: 'AMAZON_FBA',
            pallets: [
              { id: 'pallet-3', status: 'LABEL_PRINTED' },
              { id: 'pallet-5', status: 'CANCELLED' },
            ],
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
        payClassification: null,
        payTrailerNumber: null,
        status: 'LOADING_IN_PROGRESS',
        totalPallets: 5,
        loadedPallets: 1,
        adjustedOutPallets: 1,
        cancelledPallets: 1,
        remainingPallets: 2,
      },
    ]);
    expect(inventory.items).toEqual([
      {
        destinationCode: 'YVR',
        totalPallets: 2,
        loadedPallets: 0,
        adjustedOutPallets: 0,
        cancelledPallets: 1,
        remainingPallets: 1,
      },
      {
        destinationCode: 'YYZ',
        totalPallets: 3,
        loadedPallets: 1,
        adjustedOutPallets: 1,
        cancelledPallets: 0,
        remainingPallets: 1,
      },
    ]);
  });

  it('reflects loaded status changes from database state', async () => {
    containers[0].destinations[1].pallets[0].status = 'LOADED';

    const summary = await service.containerDetailSummary('container-1', {});

    expect(summary.totalPallets).toBe(5);
    expect(summary.loadedPallets).toBe(2);
    expect(summary.adjustedOutPallets).toBe(1);
    expect(summary.cancelledPallets).toBe(1);
    expect(summary.remainingPallets).toBe(1);
    expect(summary.status).toBe('LOADING_IN_PROGRESS');
    expect(summary.destinations).toEqual([
      {
        containerDestinationId: 'destination-1',
        destinationCode: 'YYZ',
        destinationType: 'AMAZON_FBA',
        totalPallets: 3,
        loadedPallets: 1,
        adjustedOutPallets: 1,
        cancelledPallets: 0,
        remainingPallets: 1,
      },
      {
        containerDestinationId: 'destination-2',
        destinationCode: 'YVR',
        destinationType: 'AMAZON_FBA',
        totalPallets: 2,
        loadedPallets: 1,
        adjustedOutPallets: 0,
        cancelledPallets: 1,
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
        payClassification: null,
        payTrailerNumber: null,
        status: 'LOADING_IN_PROGRESS',
        totalPallets: 1,
        loadedPallets: 1,
        adjustedOutPallets: 0,
        cancelledPallets: 0,
        remainingPallets: 0,
      },
    ]);
  });

  it('keeps fully loaded containers visible as LOADED in filtered reports', async () => {
    containers[0].status = 'UNLOADED';
    containers[0].destinations.forEach((destination) => {
      destination.pallets.forEach((pallet) => {
        pallet.status = 'LOADED';
      });
    });

    const summary = await service.containerSummary({ status: 'LOADED' });
    const inventory = await service.inventory({ status: 'LOADED' });

    expect(summary.items).toEqual([
      {
        containerId: 'container-1',
        containerNo: 'CSNU8877228',
        payClassification: null,
        payTrailerNumber: null,
        status: 'LOADED',
        totalPallets: 5,
        loadedPallets: 5,
        adjustedOutPallets: 0,
        cancelledPallets: 0,
        remainingPallets: 0,
      },
    ]);
    expect(inventory.items).toEqual([
      {
        destinationCode: 'YVR',
        totalPallets: 2,
        loadedPallets: 2,
        adjustedOutPallets: 0,
        cancelledPallets: 0,
        remainingPallets: 0,
      },
      {
        destinationCode: 'YYZ',
        totalPallets: 3,
        loadedPallets: 3,
        adjustedOutPallets: 0,
        cancelledPallets: 0,
        remainingPallets: 0,
      },
    ]);
  });
});
