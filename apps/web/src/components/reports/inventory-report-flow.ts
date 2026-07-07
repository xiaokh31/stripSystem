import type {
  InventoryReportFilters,
  PalletStatsResponse,
} from "@/lib/api-client";
import { formatOperationalDateTime } from "../../lib/date-time";
import type { Locale } from "../../lib/i18n/catalog";
import { palletStatusLabel } from "../../lib/i18n/status-labels";

export const DEFAULT_INVENTORY_POLLING_INTERVAL_MS = 15_000;
export const MAX_INVENTORY_POLLING_INTERVAL_MS = 30_000;
export const MIN_INVENTORY_POLLING_INTERVAL_MS = 10_000;

export const PALLET_STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Planned", value: "PLANNED" },
  { label: "Label printed", value: "LABEL_PRINTED" },
  { label: "Loading", value: "LOADING" },
  { label: "Loaded", value: "LOADED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Exception", value: "EXCEPTION" },
] as const;

export function palletStatusOptions(locale?: Locale) {
  return [
    {
      label: locale === "zh-CN" ? "全部状态" : "All statuses",
      value: "",
    },
    { label: palletStatusLabel("PLANNED", locale), value: "PLANNED" },
    {
      label: palletStatusLabel("LABEL_PRINTED", locale),
      value: "LABEL_PRINTED",
    },
    { label: palletStatusLabel("LOADING", locale), value: "LOADING" },
    { label: palletStatusLabel("LOADED", locale), value: "LOADED" },
    { label: palletStatusLabel("CANCELLED", locale), value: "CANCELLED" },
    { label: palletStatusLabel("EXCEPTION", locale), value: "EXCEPTION" },
  ] as const;
}

export type InventorySearchParams = Record<
  string,
  string | string[] | undefined
>;

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

export function inventoryReportHref(filters: InventoryReportFilters): string {
  const params = new URLSearchParams();

  appendFilter(params, "containerNo", filters.containerNo);
  appendFilter(params, "destinationCode", filters.destinationCode);
  appendFilter(params, "status", filters.status);

  const query = params.toString();
  return query ? `/reports/inventory?${query}` : "/reports/inventory";
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
      loadedPallets: total.loadedPallets + item.loadedPallets,
      remainingPallets: total.remainingPallets + item.remainingPallets,
      totalPallets: total.totalPallets + item.totalPallets,
    }),
    { loadedPallets: 0, remainingPallets: 0, totalPallets: 0 },
  );
}

export function formatPalletCount(value: number): string {
  return new Intl.NumberFormat("en-CA").format(value);
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
  key: keyof InventoryReportFilters,
  value: string | undefined,
) {
  const trimmed = value?.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}
