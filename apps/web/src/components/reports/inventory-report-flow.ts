import type {
  ContainerIndexSortDirection,
  ContainerIndexSortField,
  InventoryPageSize,
  InventoryReportFilters,
  PalletStatsResponse,
} from "@/lib/api-client";
import { INVENTORY_PAGE_SIZES } from "../../lib/api-client";
import { formatOperationalDateTime } from "../../lib/date-time";
import { DEFAULT_LOCALE, type Locale } from "../../lib/i18n/catalog";
import { palletStatusLabel } from "../../lib/i18n/status-labels";
import { createTranslator } from "../../lib/i18n/translator";

export const DEFAULT_INVENTORY_POLLING_INTERVAL_MS = 15_000;
export const MAX_INVENTORY_POLLING_INTERVAL_MS = 30_000;
export const MIN_INVENTORY_POLLING_INTERVAL_MS = 10_000;

export const PALLET_STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Planned", value: "PLANNED" },
  { label: "Label printed", value: "LABEL_PRINTED" },
  { label: "Loading", value: "LOADING" },
  { label: "Loaded", value: "LOADED" },
  { label: "Adjusted out", value: "ADJUSTED_OUT" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Exception", value: "EXCEPTION" },
] as const;

export function palletStatusOptions(locale?: Locale) {
  const { t } = createTranslator(locale ?? DEFAULT_LOCALE);

  return [
    {
      label: t("All statuses"),
      value: "",
    },
    { label: palletStatusLabel("PLANNED", locale), value: "PLANNED" },
    {
      label: palletStatusLabel("LABEL_PRINTED", locale),
      value: "LABEL_PRINTED",
    },
    { label: palletStatusLabel("LOADING", locale), value: "LOADING" },
    { label: palletStatusLabel("LOADED", locale), value: "LOADED" },
    {
      label: palletStatusLabel("ADJUSTED_OUT", locale),
      value: "ADJUSTED_OUT",
    },
    { label: palletStatusLabel("CANCELLED", locale), value: "CANCELLED" },
    { label: palletStatusLabel("EXCEPTION", locale), value: "EXCEPTION" },
  ] as const;
}

export type InventorySearchParams = Record<
  string,
  string | string[] | undefined
>;

export interface InventoryPaginationState {
  page: number;
  pageSize: InventoryPageSize;
  sortBy: ContainerIndexSortField;
  sortDirection: ContainerIndexSortDirection;
}

export const DEFAULT_INVENTORY_PAGINATION: InventoryPaginationState = {
  page: 1,
  pageSize: 10,
  sortBy: "createdAt",
  sortDirection: "desc",
};

const INVENTORY_SORT_FIELDS: ContainerIndexSortField[] = [
  "createdAt",
  "containerNo",
  "status",
];
const INVENTORY_SORT_DIRECTIONS: ContainerIndexSortDirection[] = [
  "asc",
  "desc",
];

export function normalizeInventoryFilters(
  searchParams: InventorySearchParams,
): InventoryReportFilters {
  return {
    ...optionalFilter("containerNo", firstSearchValue(searchParams.containerNo)),
    ...optionalFilter(
      "destinationCode",
      firstSearchValue(searchParams.destinationCode),
    ),
    ...optionalFilter("status", firstSearchValue(searchParams.status)),
  };
}

export function normalizeInventorySelection(
  searchParams: InventorySearchParams,
): string | undefined {
  return firstSearchValue(searchParams.containerId)?.trim() || undefined;
}

export function normalizeInventoryPagination(
  searchParams: InventorySearchParams,
): InventoryPaginationState {
  const pageValue = Number(firstSearchValue(searchParams.page));
  const pageSizeValue = Number(firstSearchValue(searchParams.pageSize));
  const sortByValue = firstSearchValue(searchParams.sortBy);
  const sortDirectionValue = firstSearchValue(searchParams.sortDirection);
  return {
    page:
      Number.isSafeInteger(pageValue) && pageValue >= 1
        ? pageValue
        : DEFAULT_INVENTORY_PAGINATION.page,
    pageSize: INVENTORY_PAGE_SIZES.includes(pageSizeValue as InventoryPageSize)
      ? (pageSizeValue as InventoryPageSize)
      : DEFAULT_INVENTORY_PAGINATION.pageSize,
    sortBy: INVENTORY_SORT_FIELDS.includes(
      sortByValue as ContainerIndexSortField,
    )
      ? (sortByValue as ContainerIndexSortField)
      : DEFAULT_INVENTORY_PAGINATION.sortBy,
    sortDirection: INVENTORY_SORT_DIRECTIONS.includes(
      sortDirectionValue as ContainerIndexSortDirection,
    )
      ? (sortDirectionValue as ContainerIndexSortDirection)
      : DEFAULT_INVENTORY_PAGINATION.sortDirection,
  };
}

export function inventoryWorkspaceHref(
  filters: InventoryReportFilters,
  containerId?: string,
  pagination: InventoryPaginationState = DEFAULT_INVENTORY_PAGINATION,
): string {
  const params = new URLSearchParams();

  appendFilter(params, "containerNo", filters.containerNo);
  appendFilter(params, "destinationCode", filters.destinationCode);
  appendFilter(params, "status", filters.status);
  appendFilter(params, "containerId", containerId);
  params.set("page", String(pagination.page));
  params.set("pageSize", String(pagination.pageSize));
  params.set("sortBy", pagination.sortBy);
  params.set("sortDirection", pagination.sortDirection);

  const query = params.toString();
  return query ? `/inventory?${query}` : "/inventory";
}

export function activeInventoryFilterCount(
  filters: InventoryReportFilters,
): number {
  return [
    filters.containerNo?.trim(),
    filters.destinationCode?.trim(),
    filters.status?.trim(),
  ].filter(Boolean).length;
}

export function sumPalletStats<TItem extends PalletStatsResponse>(
  items: TItem[],
): PalletStatsResponse {
  return items.reduce(
    (total, item) => ({
      adjustedOutPallets:
        total.adjustedOutPallets + item.adjustedOutPallets,
      activeTotalPallets:
        total.activeTotalPallets + item.activeTotalPallets,
      cancelledPallets: total.cancelledPallets + item.cancelledPallets,
      loadedPallets: total.loadedPallets + item.loadedPallets,
      remainingPallets: total.remainingPallets + item.remainingPallets,
      totalPallets: total.totalPallets + item.totalPallets,
    }),
    {
      adjustedOutPallets: 0,
      activeTotalPallets: 0,
      cancelledPallets: 0,
      loadedPallets: 0,
      remainingPallets: 0,
      totalPallets: 0,
    },
  );
}

export function formatPalletCount(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale === "zh-CN" ? "zh-CN" : "en-CA").format(
    value,
  );
}

export function normalizeInventoryPollingIntervalMs(
  value: number | null | undefined,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_INVENTORY_POLLING_INTERVAL_MS;
  }

  return Math.min(
    MAX_INVENTORY_POLLING_INTERVAL_MS,
    Math.max(MIN_INVENTORY_POLLING_INTERVAL_MS, Math.round(value)),
  );
}

export function formatInventoryRefreshTime(value: string): string {
  return formatOperationalDateTime(value);
}

function optionalFilter(
  key: keyof InventoryReportFilters,
  value: string | undefined,
): InventoryReportFilters {
  const trimmed = value?.trim();
  return trimmed ? { [key]: trimmed } : {};
}

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function appendFilter(
  params: URLSearchParams,
  key: keyof InventoryReportFilters | "containerId",
  value: string | undefined,
) {
  const trimmed = value?.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}
