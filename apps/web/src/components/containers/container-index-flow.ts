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
  code?: string;
  direction: ContainerIndexSortDirection;
  from?: "dashboard";
  lifecycleStatus?: string;
  review?: string;
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
  const lifecycleStatus = firstSearchValue(searchParams.lifecycleStatus);
  const review = firstSearchValue(searchParams.review);
  const from =
    firstSearchValue(searchParams.from) === "dashboard"
      ? ("dashboard" as const)
      : undefined;
  const code = firstSearchValue(searchParams.code);

  return {
    ...(containerNo ? { containerNo } : {}),
    ...(from && code ? { code, from } : {}),
    ...(CONTAINER_LIFECYCLE_FILTERS.includes(
      (lifecycleStatus ?? "") as (typeof CONTAINER_LIFECYCLE_FILTERS)[number],
    )
      ? { lifecycleStatus }
      : {}),
    ...(CONTAINER_REVIEW_FILTERS.includes(
      (review ?? "") as (typeof CONTAINER_REVIEW_FILTERS)[number],
    )
      ? { review }
      : {}),
    direction,
    sort,
  };
}

export function containerIndexHref(filters: ContainerIndexFilters): string {
  const params = new URLSearchParams();
  if (filters.containerNo) params.set("containerNo", filters.containerNo);
  if (filters.lifecycleStatus) {
    params.set("lifecycleStatus", filters.lifecycleStatus);
  }
  if (filters.review) params.set("review", filters.review);
  if (filters.from && filters.code) {
    params.set("from", filters.from);
    params.set("code", filters.code);
  }
  params.set("sort", filters.sort);
  params.set("direction", filters.direction);
  return `/containers?${params.toString()}`;
}

const CONTAINER_LIFECYCLE_FILTERS = [
  "PARSED",
  "REPORT_GENERATED",
  "LABELS_GENERATED",
  "UNLOADED",
  "LOADING_IN_PROGRESS",
  "LOADED",
] as const;
const CONTAINER_REVIEW_FILTERS = [
  "MISSING_REPORT",
  "MISSING_LABELS",
] as const;

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
