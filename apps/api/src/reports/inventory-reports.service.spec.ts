import { InventoryReportsService } from './inventory-reports.service';
import { PrismaService } from '../prisma/prisma.service';

interface AggregateRow {
  activeTotalPallets: number;
  adjustedOutPallets: number;
  cancelledPallets: number;
  containerId: string;
  containerNo: string;
  createdAt: Date;
  effectiveLoadedPallets: number;
  hasLoadingSignal: boolean;
  lifecycleActivePallets: number;
  loadedPallets: number;
  payClassification: string | null;
  payTrailerNumber: string | null;
  remainingPallets: number;
  storedStatus: string;
  totalPallets: number;
}

interface PrismaMock {
  $queryRaw: jest.Mock<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>;
  container: { findUnique: jest.Mock };
}

describe('InventoryReportsService', () => {
  let rows: AggregateRow[];
  let prisma: PrismaMock;
  let service: InventoryReportsService;

  beforeEach(() => {
    rows = Array.from({ length: 55 }, (_, index) =>
      row(
        `container-${String(index + 1).padStart(2, '0')}`,
        `WEBOPS08-${index + 1}`,
        index % 3 === 0 ? 'PARSED' : 'LABELS_GENERATED',
        new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
        { loadedPallets: index % 2, remainingPallets: 2 - (index % 2) },
      ),
    );
    prisma = {
      $queryRaw: jest.fn(async (strings) => {
        const statement = strings.join('?');
        if (statement.includes('GROUP BY d."destination_code"')) {
          return [
            {
              activeTotalPallets: 110,
              adjustedOutPallets: 0,
              cancelledPallets: 0,
              destinationCode: 'YEG1',
              loadedPallets: 27,
              remainingPallets: 83,
              totalPallets: 110,
            },
          ];
        }
        return rows;
      }),
      container: { findUnique: jest.fn() },
    };
    service = new InventoryReportsService(prisma as unknown as PrismaService);
  });

  it.each([5, 10, 20, 50] as const)(
    'returns page metadata, global totals, and exactly %i current-page items',
    async (pageSize) => {
      const response = await service.containerSummary({ pageSize });

      expect(response).toMatchObject({
        page: 1,
        pageSize,
        totalItems: 55,
        totalPages: Math.ceil(55 / pageSize),
        totals: {
          activeTotalPallets: 110,
          remainingPallets: 83,
          totalPallets: 110,
        },
      });
      expect(response.items).toHaveLength(pageSize);
      expect(response.items[0]).not.toHaveProperty('createdAt');
    },
  );

  it('normalizes an out-of-range page to the final valid page without changing totals', async () => {
    const response = await service.containerSummary({
      page: 999,
      pageSize: 20,
    });

    expect(response.page).toBe(3);
    expect(response.totalPages).toBe(3);
    expect(response.items).toHaveLength(15);
    expect(response.totalItems).toBe(55);
    expect(response.totals.totalPallets).toBe(110);
  });

  it.each([
    ['createdAt', 'asc', 'container-01'],
    ['createdAt', 'desc', 'container-55'],
    ['containerNo', 'asc', 'container-01'],
    ['containerNo', 'desc', 'container-55'],
    ['status', 'asc', 'container-01'],
    ['status', 'desc', 'container-54'],
  ] as const)(
    'reuses the stable container ordering contract for %s %s',
    async (sortBy, sortDirection, expectedFirst) => {
      const response = await service.containerSummary({
        pageSize: 5,
        sortBy,
        sortDirection,
      });
      expect(response.items[0]?.containerId).toBe(expectedFirst);
    },
  );

  it('uses one aggregate query for 50+ containers and never hydrates pallet records or issues N+1 reads', async () => {
    await service.containerSummary({
      containerNo: String.raw` WEB%_\\08 `,
      destinationCode: ' YEG_1 ',
      page: 2,
      pageSize: 10,
      status: 'LOADED',
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.container.findUnique).not.toHaveBeenCalled();
    const statement = (prisma.$queryRaw.mock.calls[0]?.[0].join('?') ?? '')
      .replace(/\s+/g, ' ');
    expect(statement).toContain('FROM "containers" AS c');
    expect(statement).toContain('LEFT JOIN "container_destinations" AS d');
    expect(statement).toContain('LEFT JOIN "pallets" AS p');
    expect(statement).toContain('GROUP BY c."id"');
    expect(statement).not.toContain('SELECT p.*');
    expect(prisma.$queryRaw.mock.calls[0]?.slice(1)).toContain(
      String.raw`%web\%\_\\\\08%`,
    );
    expect(prisma.$queryRaw.mock.calls[0]?.slice(1)).toContain(
      String.raw`%yeg\_1%`,
    );
  });

  it('returns destination totals for the complete filtered set from one bounded aggregate query', async () => {
    const response = await service.inventory({
      containerNo: 'WEBOPS08',
      destinationCode: 'YEG',
      page: 4,
      pageSize: 5,
      sortBy: 'status',
      sortDirection: 'asc',
    });

    expect(response.items).toEqual([
      {
        activeTotalPallets: 110,
        adjustedOutPallets: 0,
        cancelledPallets: 0,
        destinationCode: 'YEG1',
        loadedPallets: 27,
        remainingPallets: 83,
        totalPallets: 110,
      },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('loads selected detail independently from the current summary page', async () => {
    prisma.container.findUnique.mockResolvedValue({
      containerNo: 'SELECTED-OUTSIDE-PAGE',
      destinations: [
        {
          destinationCode: 'YYZ',
          destinationType: 'AMAZON_FBA',
          id: 'destination-selected',
          pallets: [
            { id: 'pallet-1', status: 'LABEL_PRINTED' },
            { id: 'pallet-2', status: 'ADJUSTED_OUT' },
          ],
        },
      ],
      id: 'selected-outside-page',
      status: 'LABELS_GENERATED',
    });

    await expect(
      service.containerDetailSummary('selected-outside-page', {}),
    ).resolves.toMatchObject({
      containerId: 'selected-outside-page',
      containerNo: 'SELECTED-OUTSIDE-PAGE',
      adjustedOutPallets: 1,
      remainingPallets: 1,
      destinations: [
        {
          containerDestinationId: 'destination-selected',
          remainingPallets: 1,
        },
      ],
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

function row(
  containerId: string,
  containerNo: string,
  storedStatus: string,
  createdAt: string,
  overrides: Partial<AggregateRow> = {},
): AggregateRow {
  const loadedPallets = overrides.loadedPallets ?? 0;
  const remainingPallets = overrides.remainingPallets ?? 2;
  return {
    activeTotalPallets: 2,
    adjustedOutPallets: 0,
    cancelledPallets: 0,
    containerId,
    containerNo,
    createdAt: new Date(createdAt),
    effectiveLoadedPallets: loadedPallets,
    hasLoadingSignal: loadedPallets > 0 && remainingPallets > 0,
    lifecycleActivePallets: 2,
    loadedPallets,
    payClassification: null,
    payTrailerNumber: null,
    remainingPallets,
    storedStatus,
    totalPallets: 2,
    ...overrides,
  };
}
