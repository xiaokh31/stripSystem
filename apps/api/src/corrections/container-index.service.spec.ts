import { ContainerIndexService } from './container-index.service';
import { PrismaService } from '../prisma/prisma.service';

interface QueryRawMock {
  $queryRaw: jest.Mock<
    Promise<ContainerIndexRow[]>,
    [TemplateStringsArray, ...unknown[]]
  >;
}

interface ContainerIndexRow {
  containerId: string;
  containerNo: string;
  storedStatus: string;
  createdAt: Date;
  totalPallets: number;
  activeTotalPallets: number;
  effectiveLoadedPallets: number;
  loadedPallets: number;
  adjustedOutPallets: number;
  cancelledPallets: number;
  remainingPallets: number;
  hasLoadingSignal: boolean;
}

const rows: ContainerIndexRow[] = [
  row('old-empty', 'Z9', 'IMPORTED', '2026-01-01T08:00:00.000Z'),
  row('new-loaded', 'a10', 'UNLOADED', '2026-03-01T08:00:00.000Z', {
    activeTotalPallets: 2,
    effectiveLoadedPallets: 2,
    loadedPallets: 2,
    totalPallets: 2,
  }),
  row('middle-loading', 'A2', 'LABELS_GENERATED', '2026-02-01T08:00:00.000Z', {
    activeTotalPallets: 2,
    hasLoadingSignal: true,
    remainingPallets: 2,
    totalPallets: 2,
  }),
  row('adjusted-only', 'B1', 'CORRECTED', '2026-02-15T08:00:00.000Z', {
    adjustedOutPallets: 3,
    totalPallets: 3,
  }),
];

describe('ContainerIndexService', () => {
  let prisma: QueryRawMock;
  let service: ContainerIndexService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue(rows) };
    service = new ContainerIndexService(prisma as unknown as PrismaService);
  });

  it('returns every real container from one aggregate query with ISO createdAt, persisted counts, and effective status', async () => {
    await expect(
      service.list({ sort: 'createdAt', direction: 'desc' }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          containerId: 'new-loaded',
          createdAt: '2026-03-01T08:00:00.000Z',
          loadedPallets: 2,
          status: 'LOADED',
        }),
        expect.objectContaining({
          containerId: 'adjusted-only',
          activeTotalPallets: 0,
          adjustedOutPallets: 3,
          status: 'CORRECTED',
        }),
        expect.objectContaining({
          containerId: 'middle-loading',
          status: 'LOADING_IN_PROGRESS',
        }),
        expect.objectContaining({
          containerId: 'old-empty',
          totalPallets: 0,
          status: 'IMPORTED',
        }),
      ],
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const statement = (
      prisma.$queryRaw.mock.calls[0]?.[0].join('?') ?? ''
    ).replace(/\s+/g, ' ');
    expect(statement).toContain('FROM "containers" AS c');
    expect(statement).toContain('LEFT JOIN "container_destinations" AS d');
    expect(statement).toContain('LEFT JOIN "pallets" AS p');
    expect(statement).toContain('GROUP BY c."id"');
    expect(statement).not.toContain('ORDER BY');
  });

  it.each([
    [
      'createdAt',
      'asc',
      ['old-empty', 'middle-loading', 'adjusted-only', 'new-loaded'],
    ],
    [
      'createdAt',
      'desc',
      ['new-loaded', 'adjusted-only', 'middle-loading', 'old-empty'],
    ],
    [
      'containerNo',
      'asc',
      ['middle-loading', 'new-loaded', 'adjusted-only', 'old-empty'],
    ],
    [
      'containerNo',
      'desc',
      ['old-empty', 'adjusted-only', 'new-loaded', 'middle-loading'],
    ],
    [
      'status',
      'asc',
      ['old-empty', 'adjusted-only', 'middle-loading', 'new-loaded'],
    ],
    [
      'status',
      'desc',
      ['new-loaded', 'middle-loading', 'adjusted-only', 'old-empty'],
    ],
  ] as const)(
    'sorts %s %s with the stable public contract',
    async (sort, direction, expectedIds) => {
      const result = await service.list({ sort, direction });
      expect(result.items.map((item) => item.containerId)).toEqual(expectedIds);
    },
  );

  it('uses createdAt and id tie-breaks for case-insensitive alphanumeric container numbers', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row('id-z', 'ab02', 'PARSED', '2026-02-01T08:00:00.000Z'),
      row('id-b', 'AB2', 'PARSED', '2026-03-01T08:00:00.000Z'),
      row('id-a', 'aB002', 'PARSED', '2026-03-01T08:00:00.000Z'),
    ]);

    const result = await service.list({
      sort: 'containerNo',
      direction: 'asc',
    });
    expect(result.items.map((item) => item.containerId)).toEqual([
      'id-a',
      'id-b',
      'id-z',
    ]);
  });

  it('uses loadedAt for effective status without changing the raw loaded inventory count', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row('historical-loaded', 'H1', 'UNLOADED', '2026-03-01T08:00:00.000Z', {
        activeTotalPallets: 1,
        effectiveLoadedPallets: 1,
        loadedPallets: 0,
        remainingPallets: 1,
        totalPallets: 1,
      }),
    ]);

    await expect(
      service.list({ sort: 'status', direction: 'asc' }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          containerId: 'historical-loaded',
          loadedPallets: 0,
          status: 'LOADED',
        }),
      ],
    });
  });

  it('fully reverses container number and id tie-breaks for status descending', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row('id-a', 'A2', 'PARSED', '2026-02-01T08:00:00.000Z'),
      row('id-b', 'A10', 'PARSED', '2026-02-01T08:00:00.000Z'),
      row('id-c', 'A10', 'PARSED', '2026-02-01T08:00:00.000Z'),
    ]);

    const ascending = await service.list({ sort: 'status', direction: 'asc' });
    const descending = await service.list({
      sort: 'status',
      direction: 'desc',
    });
    expect(ascending.items.map((item) => item.containerId)).toEqual([
      'id-a',
      'id-b',
      'id-c',
    ]);
    expect(descending.items.map((item) => item.containerId)).toEqual([
      'id-c',
      'id-b',
      'id-a',
    ]);
  });

  it('normalizes and safely binds the optional fuzzy search instead of interpolating SQL', async () => {
    await service.list({
      containerNo: String.raw` A%_\\B `,
      direction: 'desc',
      sort: 'createdAt',
    });

    expect(prisma.$queryRaw.mock.calls[0]?.slice(1)).toEqual([
      false,
      String.raw`%a\%\_\\\\b%`,
    ]);
  });
});

function row(
  containerId: string,
  containerNo: string,
  storedStatus: string,
  createdAt: string,
  overrides: Partial<ContainerIndexRow> = {},
): ContainerIndexRow {
  return {
    activeTotalPallets: 0,
    adjustedOutPallets: 0,
    cancelledPallets: 0,
    containerId,
    containerNo,
    createdAt: new Date(createdAt),
    effectiveLoadedPallets: 0,
    hasLoadingSignal: false,
    loadedPallets: 0,
    remainingPallets: 0,
    storedStatus,
    totalPallets: 0,
    ...overrides,
  };
}
