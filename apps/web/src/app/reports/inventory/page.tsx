import Link from "next/link";
import { containerStatusLabel } from "@/components/containers/container-files-flow";
import { InventoryRefreshControls } from "@/components/reports/inventory-refresh-controls";
import {
  DEFAULT_INVENTORY_POLLING_INTERVAL_MS,
  activeInventoryFilterCount,
  formatPalletCount,
  inventoryReportHref,
  normalizeInventoryFilters,
  palletStatusOptions,
  sumPalletStats,
  type InventorySearchParams,
} from "@/components/reports/inventory-report-flow";
import {
  ApiClientError,
  getContainerInventorySummary,
  getDestinationInventory,
  type ContainerSummaryItemResponse,
  type DestinationInventoryItemResponse,
  type InventoryReportFilters,
} from "@/lib/api-client";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { getServerApiOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

interface InventoryReportState {
  containerError: ApiClientError | null;
  containers: ContainerSummaryItemResponse[];
  destinationError: ApiClientError | null;
  destinations: DestinationInventoryItemResponse[];
}

export default async function InventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<InventorySearchParams>;
}) {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  const filters = normalizeInventoryFilters(await searchParams);
  const state = await loadInventoryReport(filters);
  const totals = sumPalletStats(state.containers);
  const activeFilters = activeInventoryFilterCount(filters);
  const lastUpdatedAt = new Date().toISOString();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Inventory report")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Pallet inventory by container and destination")}
            </h1>
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/reports"
          >
            {t("Reports")}
          </Link>
        </div>
      </section>

      <InventoryFilterForm
        activeFilters={activeFilters}
        filters={filters}
        locale={locale}
      />

      <InventoryRefreshControls
        lastUpdatedAt={lastUpdatedAt}
        pollingIntervalMs={DEFAULT_INVENTORY_POLLING_INTERVAL_MS}
      />

      {state.containerError ? (
        <ApiErrorPanel
          error={state.containerError}
          fallback="Container summary could not be loaded"
          locale={locale}
          title={t("Container summary could not be loaded")}
        />
      ) : null}
      {state.destinationError ? (
        <ApiErrorPanel
          error={state.destinationError}
          fallback="Destination inventory could not be loaded"
          locale={locale}
          title={t("Destination inventory could not be loaded")}
        />
      ) : null}

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Metric label={t("Containers")} value={state.containers.length} />
          <Metric label={t("Destinations")} value={state.destinations.length} />
          <Metric label={t("Active pallets")} value={totals.activeTotalPallets} />
          <Metric label={t("Loaded pallets")} value={totals.loadedPallets} />
          <Metric label={t("Adjusted out")} value={totals.adjustedOutPallets} />
          <Metric
            label={t("Remaining pallets")}
            value={totals.remainingPallets}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <ContainerSummaryTable containers={state.containers} locale={locale} />
        <DestinationInventoryTable destinations={state.destinations} locale={locale} />
      </section>
    </main>
  );
}

async function loadInventoryReport(
  filters: InventoryReportFilters,
): Promise<InventoryReportState> {
  const apiOptions = await getServerApiOptions();
  const [containerResult, destinationResult] = await Promise.allSettled([
    getContainerInventorySummary(filters, apiOptions),
    getDestinationInventory(filters, apiOptions),
  ]);

  return {
    containerError:
      containerResult.status === "rejected"
        ? toApiClientError(containerResult.reason, "Container summary failed.")
        : null,
    containers:
      containerResult.status === "fulfilled" ? containerResult.value.items : [],
    destinationError:
      destinationResult.status === "rejected"
        ? toApiClientError(destinationResult.reason, "Inventory report failed.")
        : null,
    destinations:
      destinationResult.status === "fulfilled"
        ? destinationResult.value.items
        : [],
  };
}

function InventoryFilterForm({
  activeFilters,
  filters,
  locale,
}: {
  activeFilters: number;
  filters: InventoryReportFilters;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);
  const clearHref = inventoryReportHref({});

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-950">{t("Filters")}</h2>
        {activeFilters ? (
          <span className="text-sm font-semibold text-teal-700">
            {format("i18n.inventory.activeFilters", { count: activeFilters })}
          </span>
        ) : (
          <span className="text-sm text-zinc-500">{t("No filters active")}</span>
        )}
      </div>
      <form
        action="/reports/inventory"
        className="mt-4 grid gap-4 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_220px_auto_auto]"
      >
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          {t("Container No.")}
          <input
            className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700"
            defaultValue={filters.containerNo ?? ""}
            name="containerNo"
            placeholder="CSNU8877228"
            type="search"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          {t("Destination")}
          <input
            className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700"
            defaultValue={filters.destinationCode ?? ""}
            name="destinationCode"
            placeholder="YEG1"
            type="search"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          {t("Pallet status")}
          <select
            className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700"
            defaultValue={filters.status ?? ""}
            name="status"
          >
            {palletStatusOptions(locale).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="inline-flex min-h-11 items-center justify-center border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 lg:self-end"
          type="submit"
        >
          {t("Apply filters")}
        </button>
        <Link
          className="inline-flex min-h-11 items-center justify-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 lg:self-end"
          href={clearHref}
        >
          {t("Clear")}
        </Link>
      </form>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-t border-zinc-100 pt-3">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">
        {formatPalletCount(value)}
      </p>
    </div>
  );
}

function ContainerSummaryTable({
  containers,
  locale,
}: {
  containers: ContainerSummaryItemResponse[];
  locale: Locale;
}) {
  const { t } = createTranslator(locale);

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        {t("Container summary")}
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-3 font-semibold">{t("Container No.")}</th>
              <th className="px-3 py-3 font-semibold">{t("Status")}</th>
              <th className="px-3 py-3 text-right font-semibold">
                {t("Active pallets")}
              </th>
              <th className="px-3 py-3 text-right font-semibold">{t("Loaded")}</th>
              <th className="px-3 py-3 text-right font-semibold">
                {t("Adjusted out")}
              </th>
              <th className="px-3 py-3 text-right font-semibold">{t("Remaining")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {containers.length ? (
              containers.map((container) => (
                <tr key={container.containerId}>
                  <td className="px-3 py-3 font-semibold text-zinc-950">
                    <Link
                      className="underline decoration-zinc-300 hover:decoration-teal-700"
                      href={`/containers/${container.containerId}`}
                    >
                      {container.containerNo}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge locale={locale} status={container.status} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatPalletCount(container.activeTotalPallets)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatPalletCount(container.loadedPallets)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatPalletCount(container.adjustedOutPallets)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatPalletCount(container.remainingPallets)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-6 text-zinc-600" colSpan={6}>
                  {t("No container inventory matched the selected filters.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DestinationInventoryTable({
  destinations,
  locale,
}: {
  destinations: DestinationInventoryItemResponse[];
  locale: Locale;
}) {
  const { t } = createTranslator(locale);

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        {t("Destination summary")}
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-3 font-semibold">{t("Destination")}</th>
              <th className="px-3 py-3 text-right font-semibold">
                {t("Active pallets")}
              </th>
              <th className="px-3 py-3 text-right font-semibold">{t("Loaded")}</th>
              <th className="px-3 py-3 text-right font-semibold">
                {t("Adjusted out")}
              </th>
              <th className="px-3 py-3 text-right font-semibold">{t("Remaining")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {destinations.length ? (
              destinations.map((destination) => (
                <tr key={destination.destinationCode}>
                  <td className="px-3 py-3 font-semibold text-zinc-950">
                    {destination.destinationCode}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatPalletCount(destination.activeTotalPallets)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatPalletCount(destination.loadedPallets)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatPalletCount(destination.adjustedOutPallets)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatPalletCount(destination.remainingPallets)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-6 text-zinc-600" colSpan={5}>
                  {t("No destination inventory matched the selected filters.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusBadge({
  locale,
  status,
}: {
  locale: Locale;
  status: string;
}) {
  const styles = statusBadgeStyles(status);

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase ${styles}`}
      title={containerStatusLabel(status, locale)}
    >
      {containerStatusLabel(status, locale)}
    </span>
  );
}

function statusBadgeStyles(status: string): string {
  if (status === "LOADED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (
    status === "UNLOADED" ||
    status === "LABELS_GENERATED" ||
    status === "REPORT_GENERATED"
  ) {
    return "border-teal-200 bg-teal-50 text-teal-800";
  }
  if (status === "CORRECTED" || status === "PARSED") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "ERROR") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function ApiErrorPanel({
  error,
  fallback,
  locale,
  title,
}: {
  error: ApiClientError;
  fallback: MessageKey;
  locale: Locale;
  title: string;
}) {
  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <p className="text-sm font-semibold uppercase" data-i18n-ignore>
        {error.code}
      </p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-3 text-sm">
        {inventoryApiErrorMessage(error, locale, fallback)}
      </p>
    </section>
  );
}

const inventoryApiErrorKeys: Record<string, MessageKey> = {
  API_NETWORK_ERROR: "The API request could not be sent.",
  WEB_INVENTORY_REPORT_ERROR: "The API request could not be sent.",
};

function inventoryApiErrorMessage(
  error: ApiClientError,
  locale: Locale,
  fallback: MessageKey,
): string {
  const { t } = createTranslator(locale);
  const knownKey = inventoryApiErrorKeys[error.code];
  return t(knownKey ?? fallback);
}

function toApiClientError(error: unknown, message: string): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "WEB_INVENTORY_REPORT_ERROR",
    message: error instanceof Error ? error.message : message,
    status: 0,
  });
}
