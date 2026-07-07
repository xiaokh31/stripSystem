import type { LoadJobListFilters } from "@/lib/api-client";
import { DEFAULT_LOCALE, type Locale } from "../../lib/i18n/catalog";
import { loadJobStatusLabel } from "../../lib/i18n/status-labels";
import { translateMessage } from "../../lib/i18n/translator";

export const LOAD_JOB_HISTORY_PAGE_SIZE = 25;
export const LOAD_JOB_HISTORY_STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Planned", value: "PLANNED" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
] as const;

export function loadJobHistoryStatusOptions(locale?: Locale) {
  return [
    {
      label:
        translateMessage("All statuses", locale ?? DEFAULT_LOCALE) ??
        "All statuses",
      value: "",
    },
    { label: loadJobStatusLabel("PLANNED", locale), value: "PLANNED" },
    {
      label: loadJobStatusLabel("IN_PROGRESS", locale),
      value: "IN_PROGRESS",
    },
    { label: loadJobStatusLabel("COMPLETED", locale), value: "COMPLETED" },
  ] as const;
}

export type LoadJobHistorySearchParams = Record<
  string,
  string | string[] | undefined
>;

export interface LoadJobHistoryFilters extends LoadJobListFilters {
  offset: number;
}

type TextFilterKey = "destinationRegion" | "loadNo" | "status";

export function normalizeLoadJobHistoryFilters(
  searchParams: LoadJobHistorySearchParams,
): LoadJobHistoryFilters {
  const offset = Number.parseInt(firstSearchValue(searchParams.offset) ?? "", 10);

  return {
    ...optionalFilter("destinationRegion", searchParams.destinationRegion),
    ...optionalFilter("loadNo", searchParams.loadNo),
    ...optionalFilter("status", searchParams.status),
    limit: LOAD_JOB_HISTORY_PAGE_SIZE,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
  };
}

export function loadJobHistoryHref(
  filters: Partial<LoadJobHistoryFilters>,
): string {
  const params = new URLSearchParams();

  appendFilter(params, "loadNo", filters.loadNo);
  appendFilter(params, "destinationRegion", filters.destinationRegion);
  appendFilter(params, "status", filters.status);
  if (filters.offset && filters.offset > 0) {
    params.set("offset", String(filters.offset));
  }

  const query = params.toString();
  return query ? `/load-jobs/history?${query}` : "/load-jobs/history";
}

export function activeLoadJobHistoryFilterCount(
  filters: LoadJobHistoryFilters,
): number {
  return [
    filters.loadNo?.trim(),
    filters.destinationRegion?.trim(),
    filters.status?.trim(),
  ].filter(Boolean).length;
}

function optionalFilter(
  key: TextFilterKey,
  rawValue: string | string[] | undefined,
): Pick<LoadJobListFilters, TextFilterKey> {
  const value = firstSearchValue(rawValue)?.trim();
  return value ? { [key]: value } : {};
}

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function appendFilter(
  params: URLSearchParams,
  key: TextFilterKey,
  value: string | undefined,
) {
  const trimmed = value?.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}
