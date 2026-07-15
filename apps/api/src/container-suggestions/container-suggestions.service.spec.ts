import { ContainerSuggestionsService } from './container-suggestions.service';
import { PrismaService } from '../prisma/prisma.service';

interface QueryRawMock {
  $queryRaw: jest.Mock<
    Promise<Array<{ containerId: string; containerNo: string }>>,
    [TemplateStringsArray, ...unknown[]]
  >;
}

describe('ContainerSuggestionsService', () => {
  let prisma: QueryRawMock;
  let service: ContainerSuggestionsService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { containerId: 'id-exact', containerNo: 'AB12' },
        { containerId: 'id-prefix-a', containerNo: 'AB120' },
        { containerId: 'id-prefix-b', containerNo: 'ab129' },
        { containerId: 'id-contains', containerNo: 'XAB12Y' },
      ]),
    };
    service = new ContainerSuggestionsService(
      prisma as unknown as PrismaService,
    );
  });

  it('trims the query and delegates exact, prefix, then substring ranking to one bounded database query', async () => {
    await expect(service.list({ query: '  Ab12  ', limit: 7 })).resolves.toEqual({
      items: [
        { containerId: 'id-exact', containerNo: 'AB12' },
        { containerId: 'id-prefix-a', containerNo: 'AB120' },
        { containerId: 'id-prefix-b', containerNo: 'ab129' },
        { containerId: 'id-contains', containerNo: 'XAB12Y' },
      ],
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const call = prisma.$queryRaw.mock.calls[0];
    const statement = (call?.[0].join('?') ?? '').replace(/\s+/g, ' ');
    expect(statement).toContain('SELECT "id" AS "containerId", "container_no" AS "containerNo"');
    expect(statement).toContain('LOWER("container_no") =');
    expect(statement).toContain('LOWER("container_no") LIKE');
    expect(statement).toContain('ORDER BY CASE');
    expect(statement).toContain('"container_no" ASC, "id" ASC');
    expect(statement).toContain('LIMIT');
    expect(statement).not.toContain('pallet');
    expect(statement).not.toContain('destination');
    expect(call?.slice(1)).toEqual(['%ab12%', 'ab12', 'ab12%', 7]);
  });

  it('escapes SQL LIKE wildcards so fuzzy search remains literal and explainable', async () => {
    await service.list({ query: String.raw`A%_\\B`, limit: 10 });

    expect(prisma.$queryRaw.mock.calls[0]?.slice(1)).toEqual([
      String.raw`%a\%\_\\\\b%`,
      String.raw`a%_\\b`,
      String.raw`a\%\_\\\\b%`,
      10,
    ]);
  });

  it('returns no suggestions without querying when the trimmed query is empty', async () => {
    await expect(service.list({ query: '   ', limit: 10 })).resolves.toEqual({
      items: [],
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
