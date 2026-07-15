export const CONTAINER_INDEX_SORT_FIELDS = [
  "createdAt",
  "containerNo",
  "status",
] as const;
export const CONTAINER_INDEX_SORT_DIRECTIONS = ["asc", "desc"] as const;

export type ContainerIndexSortField =
  (typeof CONTAINER_INDEX_SORT_FIELDS)[number];
export type ContainerIndexSortDirection =
  (typeof CONTAINER_INDEX_SORT_DIRECTIONS)[number];

export interface ContainerIndexFilters {
  containerNo?: string;
  direction: ContainerIndexSortDirection;
  sort: ContainerIndexSortField;
}

export type ContainerIndexSearchParams = Record<
  string,
  string | string[] | undefined
>;

const DEFAULT_DIRECTION_BY_FIELD: Record<
  ContainerIndexSortField,
  ContainerIndexSortDirection
> = {
  containerNo: "asc",
  createdAt: "desc",
  status: "asc",
};

export function normalizeContainerIndexFilters(
  searchParams: ContainerIndexSearchParams,
): ContainerIndexFilters {
  const containerNo = firstSearchValue(searchParams.containerNo)?.trim();
  const sort = normalizeSortField(firstSearchValue(searchParams.sort));
  const direction = normalizeSortDirection(
    firstSearchValue(searchParams.direction),
    DEFAULT_DIRECTION_BY_FIELD[sort],
  );

  return {
    ...(containerNo ? { containerNo } : {}),
    direction,
    sort,
  };
}

export function containerIndexHref(filters: ContainerIndexFilters): string {
  const params = new URLSearchParams();
  if (filters.containerNo) params.set("containerNo", filters.containerNo);
  params.set("sort", filters.sort);
  params.set("direction", filters.direction);
  return `/containers?${params.toString()}`;
}

export function nextContainerIndexSort(
  current: Pick<ContainerIndexFilters, "direction" | "sort">,
  field: ContainerIndexSortField,
): Pick<ContainerIndexFilters, "direction" | "sort"> {
  if (current.sort !== field) {
    return { direction: DEFAULT_DIRECTION_BY_FIELD[field], sort: field };
  }
  return {
    direction: current.direction === "asc" ? "desc" : "asc",
    sort: field,
  };
}

function normalizeSortField(value: string | undefined): ContainerIndexSortField {
  return CONTAINER_INDEX_SORT_FIELDS.includes(value as ContainerIndexSortField)
    ? (value as ContainerIndexSortField)
    : "createdAt";
}

function normalizeSortDirection(
  value: string | undefined,
  fallback: ContainerIndexSortDirection,
): ContainerIndexSortDirection {
  return CONTAINER_INDEX_SORT_DIRECTIONS.includes(
    value as ContainerIndexSortDirection,
  )
    ? (value as ContainerIndexSortDirection)
    : fallback;
}

function firstSearchValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
