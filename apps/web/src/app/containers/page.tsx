import Link from "next/link";
import { containerStatusLabel } from "@/components/containers/container-files-flow";
import {
  CONTAINER_INDEX_SORT_FIELDS,
  containerIndexHref,
  normalizeContainerIndexFilters,
  type ContainerIndexFilters,
  type ContainerIndexSortDirection,
  type ContainerIndexSortField,
} from "@/components/containers/container-index-flow";
import { ContainerQuickOpenCombobox } from "@/components/containers/container-search-controls";
import {
  ApiClientError,
  listContainers,
  type ContainerIndexItemResponse,
} from "@/lib/api-client";
import { formatLocalizedOperationalDateTime } from "@/lib/date-time";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { getServerApiOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type ContainersPageState =
  | { containers: ContainerIndexItemResponse[]; ok: true }
  | { error: ApiClientError; ok: false };

const sortFieldLabelKeys: Record<ContainerIndexSortField, MessageKey> = {
  containerNo: "Container number",
  createdAt: "Created time",
  status: "Status",
};

export default async function ContainersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  const filters = normalizeContainerIndexFilters(await searchParams);
  const state = await loadContainers(filters);

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Office")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Containers")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              {t(
                "Review imported and manual containers, inspect inventory progress, update lifecycle status, and open report or label actions.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href={containerIndexHref(filters)}
            >
              {t("Refresh")}
            </Link>
            <Link
              className="inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
              href="/containers/new"
            >
              {t("Create manual unloading report")}
            </Link>
          </div>
        </div>
      </section>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <form
          action="/containers"
          className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(12rem,16rem)_auto] lg:items-end"
        >
          <div className="min-w-0">
            <ContainerQuickOpenCombobox initialValue={filters.containerNo} />
          </div>
          <label className="grid gap-2 text-sm font-semibold text-zinc-800">
            <span>{t("Sort field")}</span>
            <select
              className="min-h-11 min-w-0 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
              defaultValue={filters.sort}
              name="sort"
            >
              {CONTAINER_INDEX_SORT_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {t(sortFieldLabelKeys[field])}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <input name="direction" type="hidden" value={filters.direction} />
            <button
              className="inline-flex min-h-11 items-center justify-center border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
              type="submit"
            >
              {t("Search and sort")}
            </button>
          </div>
        </form>
        <SortDirectionControls filters={filters} locale={locale} />
      </section>

      {state.ok ? (
        <ContainerTable containers={state.containers} filters={filters} locale={locale} />
      ) : (
        <ApiErrorPanel error={state.error} locale={locale} />
      )}
    </main>
  );
}

async function loadContainers(filters: ContainerIndexFilters): Promise<ContainersPageState> {
  try {
    const result = await listContainers(filters, await getServerApiOptions());
    return { containers: result.items, ok: true };
  } catch (error) {
    return { error: toApiClientError(error), ok: false };
  }
}

function SortDirectionControls({
  filters,
  locale,
}: {
  filters: ContainerIndexFilters;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  return (
    <div
      aria-label={t("Sort direction")}
      className="mt-4 inline-flex max-w-full overflow-hidden border border-zinc-300 bg-zinc-50"
      role="group"
    >
      {(["asc", "desc"] as const).map((direction) => {
        const active = filters.direction === direction;
        const label = direction === "asc" ? t("Ascending") : t("Descending");
        const ariaLabel = direction === "asc" ? t("Sort ascending") : t("Sort descending");
        return (
          <Link
            aria-current={active ? "true" : undefined}
            aria-label={ariaLabel}
            className={`inline-flex min-h-10 items-center gap-2 px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500 ${
              active
                ? "bg-teal-800 text-white"
                : "bg-white text-zinc-800 hover:bg-zinc-100"
            }`}
            href={containerIndexHref({ ...filters, direction })}
            key={direction}
            title={ariaLabel}
          >
            <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ContainerTable({
  containers,
  filters,
  locale,
}: {
  containers: ContainerIndexItemResponse[];
  filters: ContainerIndexFilters;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);

  if (containers.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          {filters.containerNo ? t("No matching containers") : t("No containers recorded")}
        </h2>
        <p className="mt-2 max-w-2xl leading-6">
          {t(
            "Upload and parse a real unloading list, or create a manual unloading report when the customer workbook is unsupported.",
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="min-w-0 border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className="text-base font-semibold text-zinc-950"
            id="container-index-heading"
          >
            {t("Container index")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {t(
              "Status and pallet counts are calculated by the API from persisted container and pallet records.",
            )}
          </p>
        </div>
        <p className="text-xs font-medium text-zinc-500" aria-live="polite">
          {format("i18n.containers.count", { count: containers.length })}
        </p>
      </div>

      <div
        aria-labelledby="container-index-heading"
        className="mt-5 max-w-full overflow-x-auto"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[940px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <TableHeading active={filters.sort === "containerNo"} direction={filters.direction} label={t("Container")} />
              <TableHeading active={filters.sort === "createdAt"} direction={filters.direction} label={t("Created time")} />
              <TableHeading active={filters.sort === "status"} direction={filters.direction} label={t("Status")} />
              <th className="px-3 py-3 text-right font-semibold">{t("Active pallets")}</th>
              <th className="px-3 py-3 text-right font-semibold">{t("Loaded")}</th>
              <th className="px-3 py-3 text-right font-semibold">{t("Remaining")}</th>
              <th className="px-3 py-3 font-semibold">{t("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((container) => (
              <tr className="border-b border-zinc-100" key={container.containerId}>
                <td className="px-3 py-4 font-semibold text-zinc-950">{container.containerNo}</td>
                <td className="whitespace-nowrap px-3 py-4 text-zinc-700">
                  <time dateTime={container.createdAt}>
                    {formatLocalizedOperationalDateTime(container.createdAt, locale)}
                  </time>
                </td>
                <td className="px-3 py-4"><StatusBadge locale={locale} status={container.status} /></td>
                <td className="px-3 py-4 text-right font-medium">{container.activeTotalPallets}</td>
                <td className="px-3 py-4 text-right font-medium">{container.loadedPallets}</td>
                <td className="px-3 py-4 text-right font-medium">{container.remainingPallets}</td>
                <td className="px-3 py-4">
                  <Link className="font-semibold text-teal-700 underline hover:text-teal-900" href={`/containers/${container.containerId}`}>
                    {t("Open")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TableHeading({ active, direction, label }: { active: boolean; direction: ContainerIndexSortDirection; label: string }) {
  return (
    <th aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-3 font-semibold">
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {label}
        {active ? <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span> : null}
      </span>
    </th>
  );
}

function StatusBadge({ locale, status }: { locale: Locale; status: string }) {
  const styles = statusBadgeStyles(status);
  return (
    <span className={`inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase ${styles}`} title={containerStatusLabel(status, locale)}>
      {containerStatusLabel(status, locale)}
    </span>
  );
}

function statusBadgeStyles(status: string): string {
  if (status === "PARSED" || status === "LABELS_GENERATED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "UNLOADED") return "border-teal-200 bg-teal-50 text-teal-800";
  if (status === "LOADING_IN_PROGRESS") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "LOADED") return "border-zinc-300 bg-zinc-100 text-zinc-800";
  if (status === "CORRECTED" || status === "REPORT_GENERATED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "ERROR") return "border-red-200 bg-red-50 text-red-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function ApiErrorPanel({ error, locale }: { error: ApiClientError; locale: Locale }) {
  const { t } = createTranslator(locale);
  return (
    <section className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm" role="alert">
      <h2 className="text-base font-semibold">{t("Containers could not be loaded")}</h2>
      <p className="mt-2 text-sm">{containerListErrorMessage(error, locale)}</p>
      <Link className="mt-4 inline-flex min-h-10 items-center border border-red-300 bg-white px-3 text-sm font-semibold text-red-950 hover:bg-red-100" href="/containers">
        {t("Try again")}
      </Link>
    </section>
  );
}

const containerListErrorKeys: Record<string, MessageKey> = {
  API_NETWORK_ERROR: "The container list could not be loaded.",
  CONTAINER_LIST_LOAD_FAILED: "The container list could not be loaded.",
};

function containerListErrorMessage(error: ApiClientError, locale: Locale): string {
  const { t } = createTranslator(locale);
  return t(containerListErrorKeys[error.code] ?? "The container list could not be loaded.");
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;
  return new ApiClientError({
    code: "CONTAINER_LIST_LOAD_FAILED",
    message: error instanceof Error ? error.message : "The container list could not be loaded.",
    status: 0,
  });
}
