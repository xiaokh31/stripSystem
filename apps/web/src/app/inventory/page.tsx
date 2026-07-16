import Link from "next/link";
import { ContainerInventoryAdjustmentPanel } from "@/components/containers/container-inventory-adjustment-panel";
import { containerStatusLabel } from "@/components/containers/container-files-flow";
import {
  InventoryContainerCombobox,
  InventorySelectedContainerContent,
  InventorySelectionBoundary,
} from "@/components/containers/container-search-controls";
import type { ContainerSuggestion } from "@/components/containers/container-combobox-flow";
import { InventoryRefreshControls } from "@/components/reports/inventory-refresh-controls";
import { InventoryPageNormalization } from "@/components/reports/inventory-page-normalization";
import {
  DEFAULT_INVENTORY_POLLING_INTERVAL_MS,
  activeInventoryFilterCount,
  formatPalletCount,
  inventoryWorkspaceHref,
  normalizeInventoryFilters,
  normalizeInventoryPagination,
  normalizeInventorySelection,
  palletStatusOptions,
  type InventoryPaginationState,
  type InventorySearchParams,
} from "@/components/reports/inventory-report-flow";
import {
  ApiClientError,
  getContainerInventoryDetailSummary,
  getContainerInventorySummary,
  getDestinationInventory,
  listInventoryAdjustments,
  type AuthUserResponse,
  type ContainerDetailInventorySummaryResponse,
  type ContainerIndexSortField,
  type ContainerSummaryListResponse,
  type DestinationInventoryItemResponse,
  type InventoryAdjustmentResponse,
  type InventoryReportFilters,
} from "@/lib/api-client";
import { AUTH_REDIRECT_PARAM } from "@/lib/auth-token";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import {
  canAdjustInventory,
  hasPermission,
  INVENTORY_READ_PERMISSION,
} from "@/lib/permissions";
import {
  getServerApiOptions,
  getServerCurrentUser,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

interface InventoryReportState {
  containerError: ApiClientError | null;
  containerSummary: ContainerSummaryListResponse | null;
  destinationError: ApiClientError | null;
  destinations: DestinationInventoryItemResponse[];
  selected: SelectedContainerState | null;
}

interface SelectedContainerState {
  error: ApiClientError | null;
  historyByDestinationId: Record<string, InventoryAdjustmentResponse[]>;
  historyErrorByDestinationId: Record<string, boolean>;
  summary: ContainerDetailInventorySummaryResponse | null;
}

export default async function InventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<InventorySearchParams>;
}) {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  const query = await searchParams;
  const filters = normalizeInventoryFilters(query);
  const pagination = normalizeInventoryPagination(query);
  const selectedContainerId = normalizeInventorySelection(query);
  const currentUser = await getServerCurrentUser();

  if (!currentUser) {
    return (
      <InventoryLoginRequired
        locale={locale}
        nextPath={inventoryWorkspaceHref(filters, selectedContainerId, pagination)}
      />
    );
  }

  if (!hasPermission(currentUser, INVENTORY_READ_PERMISSION)) {
    return <InventoryPermissionDenied locale={locale} />;
  }

  const state = await loadInventoryReport(
    filters,
    pagination,
    selectedContainerId,
  );
  const containerSummary = state.containerSummary ?? emptyContainerSummary(pagination);
  const totals = containerSummary.totals;
  const activeFilters = activeInventoryFilterCount(filters);
  const lastUpdatedAt = new Date().toISOString();
  const selectedContainerNo =
    state.selected?.summary?.containerNo ?? filters.containerNo;
  const selectedSuggestion =
    selectedContainerId && selectedContainerNo
      ? {
          containerId: selectedContainerId,
          containerNo: selectedContainerNo,
        }
      : null;
  const selectedOutsidePage = Boolean(
    selectedContainerId &&
      !containerSummary.items.some(
        (container) => container.containerId === selectedContainerId,
      ),
  );
  const normalizedPagination = {
    ...pagination,
    page: containerSummary.page,
  };

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Inventory workspace")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Select a container and manage destination inventory")}
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

      <InventorySelectionBoundary selectedContainerId={selectedContainerId}>
        {containerSummary.page !== pagination.page ? (
          <InventoryPageNormalization
            href={inventoryWorkspaceHref(
              filters,
              selectedContainerId,
              normalizedPagination,
            )}
          />
        ) : null}
        <InventoryFilterForm
          activeFilters={activeFilters}
          filters={filters}
          locale={locale}
          pagination={normalizedPagination}
          selectedSuggestion={selectedSuggestion}
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

        <section
          className="border border-zinc-200 bg-white p-5 shadow-sm"
          data-inventory-global-metrics="true"
        >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Metric label={t("Containers")} value={containerSummary.totalItems} locale={locale} />
          <Metric label={t("Destinations")} locale={locale} value={state.destinations.length} />
          <Metric label={t("Active pallets")} value={totals.activeTotalPallets} locale={locale} />
          <Metric label={t("Loaded pallets")} value={totals.loadedPallets} locale={locale} />
          <Metric label={t("Adjusted out")} value={totals.adjustedOutPallets} locale={locale} />
          <Metric
            label={t("Remaining pallets")}
            locale={locale}
            value={totals.remainingPallets}
          />
        </div>
        </section>

        <section className="inventory-operation-grid grid gap-4">
          <ContainerSummaryTable
            containerSummary={containerSummary}
            filters={filters}
            locale={locale}
            pagination={normalizedPagination}
            selectedContainerId={selectedContainerId}
          />
          <InventorySelectedContainerContent>
            <SelectedContainerWorkspace
              currentUser={currentUser}
              locale={locale}
              selected={state.selected}
              selectedContainerId={selectedContainerId}
              selectedOutsidePage={selectedOutsidePage}
            />
          </InventorySelectedContainerContent>
        </section>

        <DestinationInventoryTable
          destinations={state.destinations}
          locale={locale}
        />
      </InventorySelectionBoundary>
    </main>
  );
}

async function loadInventoryReport(
  filters: InventoryReportFilters,
  pagination: InventoryPaginationState,
  selectedContainerId?: string,
): Promise<InventoryReportState> {
  const apiOptions = await getServerApiOptions();
  const [containerResult, destinationResult, selectedSummaryResult] =
    await Promise.allSettled([
    getContainerInventorySummary({ ...filters, ...pagination }, apiOptions),
    getDestinationInventory(filters, apiOptions),
    selectedContainerId
      ? getContainerInventoryDetailSummary(selectedContainerId, {}, apiOptions)
      : Promise.resolve(null),
  ]);
  let selected: SelectedContainerState | null = null;

  if (selectedContainerId) {
    if (selectedSummaryResult.status === "rejected") {
      selected = {
        error: toApiClientError(
          selectedSummaryResult.reason,
          "Selected container inventory failed.",
        ),
        historyByDestinationId: {},
        historyErrorByDestinationId: {},
        summary: null,
      };
    } else if (selectedSummaryResult.value) {
      const summary = selectedSummaryResult.value;
      const historyResults = await Promise.allSettled(
        summary.destinations.map((destination) =>
          listInventoryAdjustments(
            destination.containerDestinationId,
            apiOptions,
          ),
        ),
      );
      const historyByDestinationId: Record<
        string,
        InventoryAdjustmentResponse[]
      > = {};
      const historyErrorByDestinationId: Record<string, boolean> = {};

      summary.destinations.forEach((destination, index) => {
        const result = historyResults[index];
        if (!result || result.status === "rejected") {
          historyErrorByDestinationId[destination.containerDestinationId] = true;
        } else {
          historyByDestinationId[destination.containerDestinationId] =
            result.value.items;
        }
      });
      selected = {
        error: null,
        historyByDestinationId,
        historyErrorByDestinationId,
        summary,
      };
    }
  }

  return {
    containerError:
      containerResult.status === "rejected"
        ? toApiClientError(containerResult.reason, "Container summary failed.")
        : null,
    containerSummary:
      containerResult.status === "fulfilled" ? containerResult.value : null,
    destinationError:
      destinationResult.status === "rejected"
        ? toApiClientError(destinationResult.reason, "Inventory report failed.")
        : null,
    destinations:
      destinationResult.status === "fulfilled"
        ? destinationResult.value.items
        : [],
    selected,
  };
}

function emptyContainerSummary(
  pagination: InventoryPaginationState,
): ContainerSummaryListResponse {
  return {
    items: [],
    page: 1,
    pageSize: pagination.pageSize,
    totalItems: 0,
    totalPages: 1,
    totals: {
      activeTotalPallets: 0,
      adjustedOutPallets: 0,
      cancelledPallets: 0,
      loadedPallets: 0,
      remainingPallets: 0,
      totalPallets: 0,
    },
  };
}

function InventoryFilterForm({
  activeFilters,
  filters,
  locale,
  pagination,
  selectedSuggestion,
}: {
  activeFilters: number;
  filters: InventoryReportFilters;
  locale: Locale;
  pagination: InventoryPaginationState;
  selectedSuggestion: ContainerSuggestion | null;
}) {
  const { format, t } = createTranslator(locale);
  const clearHref = inventoryWorkspaceHref(
    selectedSuggestion ? { containerNo: selectedSuggestion.containerNo } : {},
    selectedSuggestion?.containerId,
    { ...pagination, page: 1 },
  );

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
        action="/inventory"
        className="mt-4 grid gap-4 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_220px_auto_auto]"
      >
        <InventoryContainerCombobox
          filters={filters}
          pagination={pagination}
          selectedSuggestion={selectedSuggestion}
        />
        <input name="page" type="hidden" value="1" />
        <input name="pageSize" type="hidden" value={pagination.pageSize} />
        <input name="sortBy" type="hidden" value={pagination.sortBy} />
        <input
          name="sortDirection"
          type="hidden"
          value={pagination.sortDirection}
        />
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

function Metric({
  label,
  locale,
  value,
}: {
  label: string;
  locale?: Locale;
  value: number;
}) {
  return (
    <div className="border-t border-zinc-100 pt-3">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">
        {formatPalletCount(value, locale)}
      </p>
    </div>
  );
}

function SelectedContainerWorkspace({
  currentUser,
  locale,
  selected,
  selectedContainerId,
  selectedOutsidePage,
}: {
  currentUser: AuthUserResponse;
  locale: Locale;
  selected: SelectedContainerState | null;
  selectedContainerId?: string;
  selectedOutsidePage: boolean;
}) {
  const { t } = createTranslator(locale);

  if (!selectedContainerId) {
    return (
      <section className="border border-dashed border-zinc-300 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-amber-800">
          {t("Container selection")}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-950">
          {t("Select an exact container")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          {t(
            "Choose a container from the table to review its destination inventory and adjustment history.",
          )}
        </p>
      </section>
    );
  }

  if (!selected || selected.error || !selected.summary) {
    return (
      <ApiErrorPanel
        error={
          selected?.error ??
          new ApiClientError({
            code: "WEB_SELECTED_CONTAINER_INVENTORY_ERROR",
            message: "Selected container inventory failed.",
            status: 0,
          })
        }
        fallback="Selected container inventory could not be loaded"
        locale={locale}
        title={t("Selected container inventory could not be loaded")}
      />
    );
  }

  const summary = selected.summary;
  return (
    <div
      className="grid min-w-0 grid-cols-1 gap-4"
      data-selected-container-workspace="true"
    >
      <section className="border-l-4 border-amber-600 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase text-amber-800">
              {t("Selected container")}
            </p>
            <h2 className="mt-2 break-all text-xl font-semibold text-zinc-950">
              {summary.containerNo}
            </h2>
          </div>
          <StatusBadge locale={locale} status={summary.status} />
        </div>
        {selectedOutsidePage ? (
          <p
            className="mt-3 border-l-2 border-amber-500 pl-3 text-sm text-zinc-600"
            role="status"
          >
            {t("This selected container is outside the current page.")}
          </p>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label={t("Active pallets")} locale={locale} value={summary.activeTotalPallets} />
          <Metric label={t("Loaded pallets")} locale={locale} value={summary.loadedPallets} />
          <Metric label={t("Adjusted out")} locale={locale} value={summary.adjustedOutPallets} />
          <Metric label={t("Cancelled")} locale={locale} value={summary.cancelledPallets} />
          <Metric label={t("Remaining pallets")} locale={locale} value={summary.remainingPallets} />
          <Metric label={t("Destinations")} locale={locale} value={summary.destinations.length} />
        </dl>
      </section>

      <ContainerInventoryAdjustmentPanel
        canAdjust={canAdjustInventory(currentUser)}
        currentUser={currentUser}
        historyByDestinationId={selected.historyByDestinationId}
        historyErrorByDestinationId={selected.historyErrorByDestinationId}
        inventoryError={false}
        inventorySummary={summary}
      />
    </div>
  );
}

function ContainerSummaryTable({
  containerSummary,
  filters,
  locale,
  pagination,
  selectedContainerId,
}: {
  containerSummary: ContainerSummaryListResponse;
  filters: InventoryReportFilters;
  locale: Locale;
  pagination: InventoryPaginationState;
  selectedContainerId?: string;
}) {
  const { format, t } = createTranslator(locale);
  const containers = containerSummary.items;

  return (
    <section
      className="inventory-container-summary min-w-0 border border-zinc-200 bg-white p-5 shadow-sm"
      data-inventory-container-summary="true"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className="text-base font-semibold text-zinc-950"
            id="inventory-container-summary-heading"
          >
            {t("Container summary")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600" aria-live="polite">
            {containerSummary.totalItems === 1
              ? t("1 container")
              : format("i18n.inventory.totalItems", {
                  count: containerSummary.totalItems,
                })}
          </p>
        </div>
        <InventorySortControls
          filters={filters}
          locale={locale}
          pagination={pagination}
          selectedContainerId={selectedContainerId}
        />
      </div>
      <div
        aria-labelledby="inventory-container-summary-heading"
        className="mt-4 overflow-x-auto"
        role="region"
        tabIndex={0}
      >
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
              <th className="px-3 py-3 text-right font-semibold">{t("Action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {containers.length ? (
              containers.map((container) => {
                const selected = container.containerId === selectedContainerId;
                return (
                <tr
                  className={
                    selected
                      ? "border-l-4 border-amber-600 bg-amber-50"
                      : "border-l-4 border-transparent"
                  }
                  data-selected-container={selected ? "true" : undefined}
                  key={container.containerId}
                >
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
                  <td className="px-3 py-3 text-right">
                    <Link
                      aria-current={selected ? "true" : undefined}
                      aria-label={format("i18n.inventory.selectContainer", {
                        container: container.containerNo,
                      })}
                      className={[
                        "inline-flex min-h-10 items-center justify-center border px-3 text-sm font-semibold",
                        selected
                          ? "border-amber-700 bg-amber-700 text-white"
                          : "border-zinc-300 bg-white text-zinc-950 hover:border-teal-700",
                      ].join(" ")}
                      href={inventoryWorkspaceHref(
                        filters,
                        container.containerId,
                        pagination,
                      )}
                    >
                      {selected ? t("Selected") : t("Select container")}
                    </Link>
                  </td>
                </tr>
                );
              })
            ) : (
              <tr>
                <td className="px-3 py-6 text-zinc-600" colSpan={7}>
                  {t("No container inventory matched the selected filters.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <InventoryPaginationControls
        containerSummary={containerSummary}
        filters={filters}
        locale={locale}
        pagination={pagination}
        selectedContainerId={selectedContainerId}
      />
    </section>
  );
}

const inventorySortLabelKeys: Record<ContainerIndexSortField, MessageKey> = {
  containerNo: "Container number",
  createdAt: "Created time",
  status: "Status",
};

function InventorySortControls({
  filters,
  locale,
  pagination,
  selectedContainerId,
}: {
  filters: InventoryReportFilters;
  locale: Locale;
  pagination: InventoryPaginationState;
  selectedContainerId?: string;
}) {
  const { t } = createTranslator(locale);
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(10rem,1fr)_auto]">
      <form action="/inventory" className="flex min-w-0 flex-wrap items-end gap-2">
        <InventoryQueryHiddenFields
          filters={filters}
          page={1}
          pageSize={pagination.pageSize}
          selectedContainerId={selectedContainerId}
          sortDirection={pagination.sortDirection}
        />
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-zinc-600">
          <span>{t("Sort field")}</span>
          <select
            className="min-h-10 min-w-0 border border-zinc-300 bg-white px-2 text-sm text-zinc-950"
            defaultValue={pagination.sortBy}
            name="sortBy"
          >
            {(Object.keys(inventorySortLabelKeys) as ContainerIndexSortField[]).map(
              (field) => (
                <option key={field} value={field}>
                  {t(inventorySortLabelKeys[field])}
                </option>
              ),
            )}
          </select>
        </label>
        <button
          className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:border-teal-700"
          type="submit"
        >
          {t("Apply sort")}
        </button>
      </form>
      <div
        aria-label={t("Sort direction")}
        className="inline-flex self-end border border-zinc-300"
        role="group"
      >
        {(["asc", "desc"] as const).map((direction) => {
          const active = pagination.sortDirection === direction;
          const label = direction === "asc" ? t("Ascending") : t("Descending");
          return (
            <Link
              aria-current={active ? "true" : undefined}
              aria-label={
                direction === "asc" ? t("Sort ascending") : t("Sort descending")
              }
              className={`inline-flex min-h-10 items-center gap-1 px-3 text-sm font-semibold ${
                active
                  ? "bg-teal-800 text-white"
                  : "bg-white text-zinc-800 hover:bg-zinc-100"
              }`}
              href={inventoryWorkspaceHref(filters, selectedContainerId, {
                ...pagination,
                page: 1,
                sortDirection: direction,
              })}
              key={direction}
            >
              <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function InventoryPaginationControls({
  containerSummary,
  filters,
  locale,
  pagination,
  selectedContainerId,
}: {
  containerSummary: ContainerSummaryListResponse;
  filters: InventoryReportFilters;
  locale: Locale;
  pagination: InventoryPaginationState;
  selectedContainerId?: string;
}) {
  const { format, t } = createTranslator(locale);
  const previousHref = inventoryWorkspaceHref(filters, selectedContainerId, {
    ...pagination,
    page: Math.max(1, containerSummary.page - 1),
  });
  const nextHref = inventoryWorkspaceHref(filters, selectedContainerId, {
    ...pagination,
    page: Math.min(containerSummary.totalPages, containerSummary.page + 1),
  });
  return (
    <nav
      aria-label={t("Container summary pagination")}
      className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-200 pt-4"
    >
      <form action="/inventory" className="flex flex-wrap items-end gap-2">
        <InventoryQueryHiddenFields
          filters={filters}
          page={1}
          selectedContainerId={selectedContainerId}
          sortBy={pagination.sortBy}
          sortDirection={pagination.sortDirection}
        />
        <label className="grid gap-1 text-xs font-semibold text-zinc-600">
          <span>{t("Items per page")}</span>
          <select
            className="min-h-10 border border-zinc-300 bg-white px-2 text-sm text-zinc-950"
            defaultValue={pagination.pageSize}
            name="pageSize"
          >
            {[5, 10, 20, 50].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize}
              </option>
            ))}
          </select>
        </label>
        <button
          className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:border-teal-700"
          type="submit"
        >
          {t("Apply page size")}
        </button>
      </form>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <p className="text-sm font-medium text-zinc-600" aria-live="polite">
          {format("i18n.inventory.pageStatus", {
            page: containerSummary.page,
            totalPages: containerSummary.totalPages,
          })}
        </p>
        {containerSummary.page <= 1 ? (
          <button
            aria-label={t("Previous page")}
            className="min-h-10 border border-zinc-200 bg-zinc-100 px-3 text-sm font-semibold text-zinc-400"
            disabled
            type="button"
          >
            {t("Previous")}
          </button>
        ) : (
          <Link
            aria-label={t("Previous page")}
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:border-teal-700"
            href={previousHref}
          >
            {t("Previous")}
          </Link>
        )}
        {containerSummary.page >= containerSummary.totalPages ? (
          <button
            aria-label={t("Next page")}
            className="min-h-10 border border-zinc-200 bg-zinc-100 px-3 text-sm font-semibold text-zinc-400"
            disabled
            type="button"
          >
            {t("Next")}
          </button>
        ) : (
          <Link
            aria-label={t("Next page")}
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:border-teal-700"
            href={nextHref}
          >
            {t("Next")}
          </Link>
        )}
      </div>
    </nav>
  );
}

function InventoryQueryHiddenFields({
  filters,
  page,
  pageSize,
  selectedContainerId,
  sortBy,
  sortDirection,
}: {
  filters: InventoryReportFilters;
  page: number;
  pageSize?: number;
  selectedContainerId?: string;
  sortBy?: string;
  sortDirection?: string;
}) {
  return (
    <>
      {filters.containerNo ? <input name="containerNo" type="hidden" value={filters.containerNo} /> : null}
      {filters.destinationCode ? <input name="destinationCode" type="hidden" value={filters.destinationCode} /> : null}
      {filters.status ? <input name="status" type="hidden" value={filters.status} /> : null}
      {selectedContainerId ? <input name="containerId" type="hidden" value={selectedContainerId} /> : null}
      <input name="page" type="hidden" value={page} />
      {pageSize ? <input name="pageSize" type="hidden" value={pageSize} /> : null}
      {sortBy ? <input name="sortBy" type="hidden" value={sortBy} /> : null}
      {sortDirection ? <input name="sortDirection" type="hidden" value={sortDirection} /> : null}
    </>
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
    <section
      className="border border-zinc-200 bg-white p-5 shadow-sm"
      data-inventory-destination-summary="true"
    >
      <h2
        className="text-base font-semibold text-zinc-950"
        id="inventory-destination-summary-heading"
      >
        {t("Destination summary")}
      </h2>
      <div
        aria-labelledby="inventory-destination-summary-heading"
        className="mt-4 overflow-x-auto"
        role="region"
        tabIndex={0}
      >
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
      <h2 className="text-lg font-semibold">{title}</h2>
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

function InventoryLoginRequired({
  locale,
  nextPath,
}: {
  locale: Locale;
  nextPath: string;
}) {
  const { t } = createTranslator(locale);
  const params = new URLSearchParams({ [AUTH_REDIRECT_PARAM]: nextPath });

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section
        className="border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold uppercase">{t("Authentication")}</p>
        <h1 className="mt-2 text-2xl font-semibold">
          {t("Sign in to review inventory")}
        </h1>
        <p className="mt-3 leading-7">
          {t(
            "The inventory workspace loads only after the API confirms your account and inventory access.",
          )}
        </p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center border border-amber-700 bg-white px-4 text-sm font-semibold text-amber-950 hover:bg-amber-100"
          href={`/login?${params.toString()}`}
        >
          {t("Sign in")}
        </Link>
      </section>
    </main>
  );
}

function InventoryPermissionDenied({ locale }: { locale: Locale }) {
  const { t } = createTranslator(locale);

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section
        className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold uppercase">{t("Permission denied")}</p>
        <h1 className="mt-2 text-2xl font-semibold">
          {t("Inventory access is required")}
        </h1>
        <p className="mt-3 leading-7">
          {t(
            "Your account cannot open the inventory workspace. Ask an administrator for inventory access.",
          )}
        </p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center border border-red-300 bg-white px-4 text-sm font-semibold text-red-950 hover:bg-red-100"
          href="/"
        >
          {t("Dashboard")}
        </Link>
      </section>
    </main>
  );
}
