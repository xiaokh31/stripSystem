import Link from "next/link";
import {
  DashboardPanel,
  ExceptionList,
  LifecycleDockStrip,
  MetricTile,
  PressureBar,
  ProgressBar,
  StatusPill,
  type DashboardTone,
} from "@/components/dashboard";
import {
  dashboardActivityKindLabel,
  dashboardActivityPrimaryLabel,
  dashboardActivityStatusLabel,
  dashboardEmptyLabel,
  dashboardHref,
  dashboardLabel,
  dashboardLifecycleLabel,
  dashboardRangeLabel,
  dashboardRangeOptions,
  dashboardSeverityLabel,
  dashboardSeverityTone,
  dashboardUnavailableMessage,
  normalizeDashboardFilters,
  type DashboardSearchParams,
} from "@/components/dashboard/operations-dashboard-flow";
import {
  ApiClientError,
  getApiHealth,
  getOperationsDashboard,
  type ApiHealthResponse,
  type AuthUserResponse,
  type DashboardExceptionItemResponse,
  type DashboardInventoryResponse,
  type DashboardLoadJobsResponse,
  type DashboardMonthlySummaryResponse,
  type DashboardRecentActivityItemResponse,
  type DashboardWageAndAttendanceResponse,
  type DashboardWorkQueueItemResponse,
  type OperationsDashboardFilters,
  type OperationsDashboardResponse,
} from "@/lib/api-client";
import {
  formatOperationalDateTime,
  OPERATIONAL_TIME_ZONE_DESCRIPTION,
} from "@/lib/date-time";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import {
  healthStatusLabel,
  loadJobStatusLabel,
} from "@/lib/i18n/status-labels";
import { createTranslator } from "@/lib/i18n/translator";
import {
  ATTENDANCE_READ_PERMISSION,
  INVENTORY_READ_PERMISSION,
  LOAD_JOBS_READ_PERMISSION,
  SCAN_CREATE_PERMISSION,
  UNLOADING_SUMMARY_READ_PERMISSION,
  UNLOADING_WAGE_READ_PERMISSION,
  canManageAccounts,
  hasPermission,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type DashboardPageState =
  | {
      dashboard: OperationsDashboardResponse;
      ok: true;
    }
  | {
      error: ApiClientError;
      health: ApiHealthResponse | null;
      ok: false;
    };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const requestedParams = await searchParams;
  const filters = normalizeDashboardFilters(requestedParams);
  const locale = await getServerLocale();
  const [currentUser, state] = await Promise.all([
    getServerCurrentUser(),
    loadDashboard(filters, locale),
  ]);
  const dashboard = state.ok ? state.dashboard : null;
  const monthValue = dashboard?.month ?? filters.month ?? "";

  return (
    <main
      className="office-main-content flex flex-1 flex-col gap-4 py-5"
      data-dashboard-page="true"
    >
      <OpsHeader
        dashboard={dashboard}
        filters={filters}
        health={state.ok ? null : state.health}
        locale={locale}
        monthValue={monthValue}
      />

      {state.ok ? (
        <DashboardContent
          currentUser={currentUser}
          dashboard={state.dashboard}
          locale={locale}
        />
      ) : (
        <DashboardErrorState error={state.error} locale={locale} />
      )}
    </main>
  );
}

async function loadDashboard(
  filters: OperationsDashboardFilters,
  locale: Locale,
): Promise<DashboardPageState> {
  const apiOptions = await getServerApiOptions();
  const [dashboardResult, healthResult] = await Promise.allSettled([
    getOperationsDashboard(filters, apiOptions),
    getApiHealth(),
  ]);

  if (dashboardResult.status === "fulfilled") {
    return { dashboard: dashboardResult.value, ok: true };
  }

  return {
    error: toApiClientError(dashboardResult.reason, locale),
    health: healthResult.status === "fulfilled" ? healthResult.value : null,
    ok: false,
  };
}

function OpsHeader({
  dashboard,
  filters,
  health,
  locale,
  monthValue,
}: {
  dashboard: OperationsDashboardResponse | null;
  filters: OperationsDashboardFilters;
  health: ApiHealthResponse | null;
  locale: Locale;
  monthValue: string;
}) {
  const apiStatus = dashboard?.health.apiStatus ?? health?.status ?? "degraded";
  const databaseStatus =
    dashboard?.health.databaseStatus ?? health?.database.status ?? "down";

  return (
    <section className="border border-[var(--line-soft)] bg-[var(--panel-surface)] shadow-sm">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,520px)]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[var(--seal-teal)]">
            {t("Manifest Control Room", locale)}
          </p>
          <h1 className="font-control mt-2 text-2xl font-semibold text-[var(--ink)]">
            {t("Operations dashboard", locale)}
          </h1>
          <p className="mt-2 max-w-5xl text-sm leading-6 text-zinc-600">
            {t(
              "Live control surface for imports, containers, inventory, loading, exceptions, wage queues, and recent audit activity.",
              locale,
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill
              label={healthStatusLabel(apiStatus, locale)}
              title={t("API status", locale)}
              tone={apiStatus === "ok" ? "success" : "warning"}
            />
            <StatusPill
              label={healthStatusLabel(databaseStatus, locale)}
              title={t("Database status", locale)}
              tone={databaseStatus === "up" ? "success" : "danger"}
            />
            <span className="inline-flex min-h-7 items-center border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-semibold uppercase text-zinc-700">
              {dashboardRangeLabel(filters.range ?? "today", locale)}
            </span>
            {dashboard ? (
              <span className="inline-flex min-h-7 items-center border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-semibold uppercase text-zinc-700">
                <span className="mr-1">{t("Month", locale)}</span>
                <span className="font-data" data-i18n-ignore="true">
                  {dashboard.month}
                </span>
              </span>
            ) : null}
          </div>
        </div>

        <form
          action="/"
          className="grid gap-3 border border-[var(--line-soft)] bg-[var(--panel-muted)] p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-600">
            {t("Range", locale)}
            <select
              className="min-h-10 border border-zinc-300 bg-white px-3 text-sm normal-case text-zinc-950"
              defaultValue={filters.range ?? "today"}
              name="range"
            >
              {dashboardRangeOptions(locale).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-600">
            {t("Month", locale)}
            <input
              className="min-h-10 border border-zinc-300 bg-white px-3 text-sm normal-case text-zinc-950"
              defaultValue={monthValue}
              name="month"
              type="month"
            />
          </label>
          <button
            className="inline-flex min-h-10 items-center justify-center border border-[var(--dock-steel)] bg-[var(--dock-steel)] px-4 text-sm font-semibold text-white hover:bg-[var(--dock-steel-muted)] sm:self-end"
            type="submit"
          >
            {t("Refresh dashboard", locale)}
          </button>
        </form>
      </div>
      <div className="grid gap-2 border-t border-[var(--line-soft)] px-4 py-3 text-xs text-zinc-600 sm:grid-cols-3">
        <p>
          <span className="font-semibold uppercase">{t("Generated at", locale)}</span>{" "}
          <span className="font-data" data-i18n-ignore="true">
            {dashboard
              ? formatOperationalDateTime(dashboard.generatedAt)
              : formatOperationalDateTime(new Date())}
          </span>
        </p>
        <p>
          <span className="font-semibold uppercase">{t("Time zone", locale)}</span>{" "}
          <span className="font-data" data-i18n-ignore="true">
            {dashboard?.timeZone ?? OPERATIONAL_TIME_ZONE_DESCRIPTION}
          </span>
        </p>
        <p>
          <span className="font-semibold uppercase">{t("API version", locale)}</span>{" "}
          <span className="font-data" data-i18n-ignore="true">
            {dashboard?.health.version ?? health?.version ?? "0.0.1"}
          </span>
        </p>
      </div>
    </section>
  );
}

function DashboardContent({
  currentUser,
  dashboard,
  locale,
}: {
  currentUser: AuthUserResponse | null;
  dashboard: OperationsDashboardResponse;
  locale: Locale;
}) {
  return (
    <>
      {dashboard.hiddenSections.length > 0 ? (
        <section className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">
            {t("Some dashboard sections are hidden by permissions.", locale)}
          </p>
        </section>
      ) : null}

      <section className="grid min-w-0 gap-4">
        <WorkQueueSection items={dashboard.workQueue.items} locale={locale} />
        <LifecycleSection dashboard={dashboard} locale={locale} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(360px,0.8fr)]">
        <InventorySection inventory={dashboard.inventory} locale={locale} />
        <LoadJobsSection loadJobs={dashboard.loadJobs} locale={locale} />
        <ExceptionSection items={dashboard.exceptionQueue} locale={locale} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <WorkflowSection
          currentUser={currentUser}
          locale={locale}
          monthlySummary={dashboard.monthlySummary}
          wageAndAttendance={dashboard.wageAndAttendance}
        />
        <RecentActivitySection
          items={dashboard.recentActivity}
          locale={locale}
        />
      </section>
    </>
  );
}

function WorkQueueSection({
  items,
  locale,
}: {
  items: DashboardWorkQueueItemResponse[];
  locale: Locale;
}) {
  return (
    <DashboardPanel
      eyebrow={t("Work queue", locale)}
      title={t("Action queue", locale)}
    >
      {items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {items.map((item) => (
            <MetricTile
              detail={
                item.count === 0
                  ? dashboardEmptyLabel(item.code, locale)
                  : dashboardSeverityLabel(item.severity, locale)
              }
              href={item.href}
              key={item.code}
              label={dashboardLabel(item.labelKey, locale)}
              tone={item.count === 0 ? "success" : dashboardSeverityTone(item.severity)}
              value={item.count}
            />
          ))}
        </div>
      ) : (
        <EmptyAction
          href="/settings"
          label={t("No dashboard actions are visible for this account.", locale)}
          linkLabel={t("Open settings", locale)}
        />
      )}
    </DashboardPanel>
  );
}

function LifecycleSection({
  dashboard,
  locale,
}: {
  dashboard: OperationsDashboardResponse;
  locale: Locale;
}) {
  const lanes = dashboard.containerLifecycle.stages.map((stage) => ({
    code: stage.code,
    count: stage.count,
    href: stage.href,
    label: dashboardLifecycleLabel(stage, locale),
    tone: dashboardSeverityTone(stage.severity),
  }));

  return (
    <DashboardPanel
      actions={
        <LinkButton
          href="/containers"
          label={t("Open containers", locale)}
          tone="neutral"
        />
      }
      eyebrow={t("Dock lane strip", locale)}
      title={t("Container lifecycle", locale)}
    >
      <LifecycleDockStrip
        ariaLabel={t("Dock lane strip", locale)}
        lanes={lanes}
        locale={locale}
        total={dashboard.containerLifecycle.totalContainers}
      />
    </DashboardPanel>
  );
}

function InventorySection({
  inventory,
  locale,
}: {
  inventory: DashboardInventoryResponse | null;
  locale: Locale;
}) {
  if (!inventory) {
    return (
      <UnavailablePanel
        href="/inventory"
        message={dashboardUnavailableMessage("inventory", locale)}
        locale={locale}
        title={t("Inventory pressure", locale)}
      />
    );
  }

  return (
    <DashboardPanel
      actions={
        <LinkButton
          href="/inventory"
          label={t("Open inventory", locale)}
          tone="neutral"
        />
      }
      eyebrow={t("Inventory pressure", locale)}
      title={t("Pallet pressure", locale)}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          href="/inventory"
          label={t("Active pallets", locale)}
          tone="info"
          value={inventory.activeTotalPallets}
        />
        <MetricTile
          href="/inventory?status=LOADED"
          label={t("Loaded pallets", locale)}
          tone="success"
          value={inventory.loadedPallets}
        />
        <MetricTile
          href="/inventory"
          label={t("Remaining pallets", locale)}
          tone={inventory.remainingPallets > 0 ? "warning" : "success"}
          value={inventory.remainingPallets}
        />
      </div>
      <div className="mt-4">
        <PressureBar
          segments={[
            {
              label: t("Loaded pallets", locale),
              tone: "success",
              value: inventory.loadedPallets,
            },
            {
              label: t("Remaining pallets", locale),
              tone: inventory.remainingPallets > 0 ? "warning" : "success",
              value: inventory.remainingPallets,
            },
          ]}
        />
      </div>
      <div className="mt-5 grid gap-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          {t("Top destinations by remaining pallets", locale)}
        </h3>
        {inventory.topDestinations.length > 0 ? (
          inventory.topDestinations.map((destination) => (
            <div
              className="border border-[var(--line-soft)] bg-[var(--panel-muted)] p-3"
              key={destination.destinationCode}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className="font-data text-sm font-semibold text-[var(--ink)]"
                  data-i18n-ignore="true"
                >
                  {destination.destinationCode}
                </p>
                <p className="font-data text-xs text-zinc-600" data-i18n-ignore="true">
                  {destination.remainingPallets}/{destination.activeTotalPallets}
                </p>
              </div>
              <div className="mt-3">
                <ProgressBar
                  label={t("Remaining pallets", locale)}
                  max={destination.activeTotalPallets}
                  tone={destination.remainingPallets > 0 ? "warning" : "success"}
                  value={destination.remainingPallets}
                />
              </div>
            </div>
          ))
        ) : (
          <EmptyAction
            href="/inventory"
            label={t("No destination inventory pressure", locale)}
            linkLabel={t("Open inventory", locale)}
          />
        )}
      </div>
    </DashboardPanel>
  );
}

function LoadJobsSection({
  loadJobs,
  locale,
}: {
  loadJobs: DashboardLoadJobsResponse | null;
  locale: Locale;
}) {
  if (!loadJobs) {
    return (
      <UnavailablePanel
        href="/load-jobs"
        message={dashboardUnavailableMessage("loadJobs", locale)}
        locale={locale}
        title={t("Active load jobs", locale)}
      />
    );
  }

  return (
    <DashboardPanel
      actions={
        <LinkButton
          href="/load-jobs"
          label={t("Open load jobs", locale)}
          tone="neutral"
        />
      }
      eyebrow={t("Active load jobs", locale)}
      title={t("Loading progress", locale)}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          href="/load-jobs"
          label={t("Open load jobs", locale)}
          tone={loadJobs.openCount > 0 ? "warning" : "success"}
          value={loadJobs.openCount}
        />
        <MetricTile
          href="/load-jobs"
          label={t("In progress", locale)}
          tone={loadJobs.inProgressCount > 0 ? "info" : "neutral"}
          value={loadJobs.inProgressCount}
        />
        <MetricTile
          href="/load-jobs"
          label={t("Due today", locale)}
          tone={loadJobs.dueTodayCount > 0 ? "warning" : "success"}
          value={loadJobs.dueTodayCount}
        />
      </div>
      <div className="mt-5 grid gap-3">
        {loadJobs.activeJobs.length > 0 ? (
          loadJobs.activeJobs.map((job) => (
            <Link
              className="block border border-[var(--line-soft)] bg-[var(--panel-muted)] p-3 hover:bg-white"
              href={job.href}
              key={job.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-data text-sm font-semibold text-[var(--ink)]">
                    {job.loadNumber}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    <span>{job.truckNo ?? t("No truck", locale)}</span>
                    <span className="mx-2">/</span>
                    <span>{job.dockNo ?? t("No dock", locale)}</span>
                  </p>
                </div>
                <StatusPill
                  label={loadJobStatusLabel(job.status, locale)}
                  tone={job.status === "IN_PROGRESS" ? "info" : "warning"}
                />
              </div>
              <div className="mt-3">
                <ProgressBar
                  label={t("Loaded pallets", locale)}
                  max={job.totalPallets}
                  tone="success"
                  value={job.loadedPallets}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-600">
                <span>{t("Scheduled departure", locale)}</span>{" "}
                <span className="font-data" data-i18n-ignore="true">
                  {job.scheduledDepartureAt
                    ? formatOperationalDateTime(job.scheduledDepartureAt)
                    : t("Not scheduled", locale)}
                </span>
              </p>
            </Link>
          ))
        ) : (
          <EmptyAction
            href="/load-jobs"
            label={t("No active load jobs", locale)}
            linkLabel={t("Open load jobs", locale)}
          />
        )}
      </div>
    </DashboardPanel>
  );
}

function ExceptionSection({
  items,
  locale,
}: {
  items: DashboardExceptionItemResponse[];
  locale: Locale;
}) {
  return (
    <DashboardPanel
      actions={
        <LinkButton
          href="/imports"
          label={t("Open imports", locale)}
          tone="neutral"
        />
      }
      eyebrow={t("Exceptions", locale)}
      title={t("Review queue", locale)}
    >
      <ExceptionList
        emptyLabel={t("No dashboard exceptions", locale)}
        items={items.map((item) => ({
          count: item.count,
          href: item.href,
          label: dashboardLabel(item.labelKey, locale),
          tone: dashboardSeverityTone(item.severity) as Exclude<
            DashboardTone,
            "success"
          >,
        }))}
        locale={locale}
      />
    </DashboardPanel>
  );
}

function WorkflowSection({
  currentUser,
  locale,
  monthlySummary,
  wageAndAttendance,
}: {
  currentUser: AuthUserResponse | null;
  locale: Locale;
  monthlySummary: DashboardMonthlySummaryResponse | null;
  wageAndAttendance: DashboardWageAndAttendanceResponse | null;
}) {
  const shortcuts = workflowShortcuts(currentUser, locale);

  return (
    <div className="grid gap-4">
      <DashboardPanel
        actions={
          monthlySummary ? (
            <LinkButton
              href={monthlySummary.href}
              label={t("Open reports", locale)}
              tone="neutral"
            />
          ) : undefined
        }
        eyebrow={t("Monthly settlement", locale)}
        title={t("Summary and wage queues", locale)}
      >
        {monthlySummary || wageAndAttendance ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {monthlySummary ? (
              <>
                <MetricTile
                  href={monthlySummary.href}
                  label={t("Completed containers", locale)}
                  tone="success"
                  value={monthlySummary.completedContainerCount}
                />
                <MetricTile
                  href={monthlySummary.href}
                  label={t("Summary rows", locale)}
                  tone="info"
                  value={monthlySummary.rowCount}
                />
                <MetricTile
                  href={monthlySummary.href}
                  label={t("Review warnings", locale)}
                  tone={monthlySummary.reviewWarningCount > 0 ? "warning" : "success"}
                  value={monthlySummary.reviewWarningCount}
                />
              </>
            ) : null}
            {wageAndAttendance?.attendanceImportsNeedingParse !== null &&
            wageAndAttendance?.attendanceImportsNeedingParse !== undefined ? (
              <MetricTile
                href={wageAndAttendance.hrefs.attendance ?? "/work-hours"}
                label={t("Attendance imports needing parse", locale)}
                tone={
                  wageAndAttendance.attendanceImportsNeedingParse > 0
                    ? "warning"
                    : "success"
                }
                value={wageAndAttendance.attendanceImportsNeedingParse}
              />
            ) : null}
            {wageAndAttendance?.attendanceImportsWithErrors !== null &&
            wageAndAttendance?.attendanceImportsWithErrors !== undefined ? (
              <MetricTile
                href={wageAndAttendance.hrefs.attendance ?? "/work-hours"}
                label={t("Attendance imports with errors", locale)}
                tone={
                  wageAndAttendance.attendanceImportsWithErrors > 0
                    ? "danger"
                    : "success"
                }
                value={wageAndAttendance.attendanceImportsWithErrors}
              />
            ) : null}
            {wageAndAttendance?.wageSettlementsNeedingReview !== null &&
            wageAndAttendance?.wageSettlementsNeedingReview !== undefined ? (
              <MetricTile
                href={wageAndAttendance.hrefs.unloadingWage ?? "/unloading-wage"}
                label={t("Wage settlements needing review", locale)}
                tone={
                  wageAndAttendance.wageSettlementsNeedingReview > 0
                    ? "warning"
                    : "success"
                }
                value={wageAndAttendance.wageSettlementsNeedingReview}
              />
            ) : null}
          </div>
        ) : (
          <UnavailablePanel
            href="/reports"
            message={dashboardUnavailableMessage("monthlySummary", locale)}
            locale={locale}
            title={t("Monthly settlement", locale)}
          />
        )}
      </DashboardPanel>

      <DashboardPanel
        eyebrow={t("Workflow shortcuts", locale)}
        title={t("Role-aware actions", locale)}
      >
        {shortcuts.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {shortcuts.map((shortcut) => (
              <LinkButton
                href={shortcut.href}
                key={shortcut.href}
                label={shortcut.label}
                tone={shortcut.tone}
              />
            ))}
          </div>
        ) : (
          <EmptyAction
            href="/login"
            label={t("No workflow shortcuts are available for this account.", locale)}
            linkLabel={t("Sign in", locale)}
          />
        )}
      </DashboardPanel>
    </div>
  );
}

function RecentActivitySection({
  items,
  locale,
}: {
  items: DashboardRecentActivityItemResponse[];
  locale: Locale;
}) {
  return (
    <DashboardPanel
      actions={
        <LinkButton
          href={dashboardHref({ range: "30d" })}
          label={t("30 days", locale)}
          tone="neutral"
        />
      }
      eyebrow={t("Recent activity", locale)}
      title={t("Latest operational records", locale)}
    >
      {items.length > 0 ? (
        <ul className="divide-y divide-[var(--line-soft)] border border-[var(--line-soft)]">
          {items.map((activity) => (
            <li key={`${activity.kind}-${activity.id}`}>
              <Link
                className="grid gap-2 px-3 py-3 text-sm hover:bg-[var(--panel-muted)] sm:grid-cols-[140px_minmax(0,1fr)_160px]"
                href={activity.href}
              >
                <span className="font-semibold text-zinc-600">
                  {dashboardActivityKindLabel(activity.kind, locale)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--ink)]">
                    {dashboardActivityPrimaryLabel(activity, locale)}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-600">
                    {dashboardActivityStatusLabel(activity, locale)}
                  </span>
                </span>
                <span className="font-data text-xs text-zinc-500" data-i18n-ignore="true">
                  {formatOperationalDateTime(activity.occurredAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyAction
          href={dashboardHref({ range: "30d" })}
          label={t("No recent activity in this range", locale)}
          linkLabel={t("30 days", locale)}
        />
      )}
    </DashboardPanel>
  );
}

function DashboardErrorState({
  error,
  locale,
}: {
  error: ApiClientError;
  locale: Locale;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div
        className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold uppercase">
          {t("Dashboard error", locale)}
        </p>
        <h2 className="mt-2 text-xl font-semibold">
          {t("Dashboard data could not be loaded.", locale)}
        </h2>
        <p className="mt-3 text-sm leading-6">
          {localizedDashboardErrorMessage(error, locale)}
        </p>
        <p className="font-data mt-3 text-xs" data-i18n-ignore="true">
          {error.code}
          {error.status ? ` (${error.status})` : ""}
        </p>
      </div>
      <DashboardPanel
        eyebrow={t("Shortcuts", locale)}
        title={t("Available shortcuts", locale)}
      >
        <div className="grid gap-2">
          <LinkButton href="/imports" label={t("Open imports", locale)} tone="neutral" />
          <LinkButton
            href="/containers"
            label={t("Open containers", locale)}
            tone="neutral"
          />
          <LinkButton
            href="/load-jobs"
            label={t("Open load jobs", locale)}
            tone="neutral"
          />
          <LinkButton href="/reports" label={t("Open reports", locale)} tone="neutral" />
        </div>
        <p className="mt-3 text-xs text-zinc-600">
          {t("Use these routes while the dashboard API is unavailable.", locale)}
        </p>
      </DashboardPanel>
    </section>
  );
}

function UnavailablePanel({
  href,
  locale,
  message,
  title,
}: {
  href: string;
  locale: Locale;
  message: string;
  title: string;
}) {
  return (
    <section className="border border-dashed border-[var(--line-soft)] bg-[var(--panel-muted)] p-4">
      <h3 className="text-base font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{message}</p>
      <LinkButton
        href={href}
        label={t("Open dashboard target", locale)}
        tone="neutral"
      />
    </section>
  );
}

function EmptyAction({
  href,
  label,
  linkLabel,
}: {
  href: string;
  label: string;
  linkLabel: string;
}) {
  return (
    <div className="border border-dashed border-[var(--line-soft)] bg-[var(--panel-muted)] p-4 text-sm text-zinc-600">
      <p>{label}</p>
      <div className="mt-3">
        <LinkButton href={href} label={linkLabel} tone="neutral" />
      </div>
    </div>
  );
}

function LinkButton({
  href,
  label,
  tone,
}: {
  href: string;
  label: string;
  tone: DashboardTone;
}) {
  const className =
    tone === "neutral"
      ? "inline-flex min-h-9 items-center justify-center border border-zinc-300 bg-white px-3 text-xs font-semibold uppercase text-zinc-700 hover:border-[var(--seal-teal)] hover:text-[var(--seal-teal)]"
      : "inline-flex min-h-9 items-center justify-center border border-[var(--seal-teal)] bg-[var(--seal-teal)] px-3 text-xs font-semibold uppercase text-white hover:bg-teal-800";

  return (
    <Link className={className} href={href}>
      {label}
    </Link>
  );
}

function workflowShortcuts(
  user: AuthUserResponse | null,
  locale: Locale,
): Array<{ href: string; label: string; tone: DashboardTone }> {
  const shortcuts: Array<{ href: string; label: string; tone: DashboardTone }> =
    [];

  if (hasPermission(user, INVENTORY_READ_PERMISSION)) {
    shortcuts.push({
      href: "/inventory",
      label: t("Open inventory", locale),
      tone: "neutral",
    });
  }
  if (hasPermission(user, LOAD_JOBS_READ_PERMISSION)) {
    shortcuts.push({
      href: "/load-jobs",
      label: t("Open load jobs", locale),
      tone: "neutral",
    });
  }
  if (hasPermission(user, SCAN_CREATE_PERMISSION)) {
    shortcuts.push({
      href: "/mobile/load-jobs",
      label: t("Open mobile scan", locale),
      tone: "neutral",
    });
  }
  if (hasPermission(user, ATTENDANCE_READ_PERMISSION)) {
    shortcuts.push({
      href: "/work-hours",
      label: t("Open work hours", locale),
      tone: "neutral",
    });
  }
  if (hasPermission(user, UNLOADING_WAGE_READ_PERMISSION)) {
    shortcuts.push({
      href: "/unloading-wage",
      label: t("Open unloading wage", locale),
      tone: "neutral",
    });
  }
  if (hasPermission(user, UNLOADING_SUMMARY_READ_PERMISSION)) {
    shortcuts.push({
      href: "/unloading-summary",
      label: t("Open unloading summary", locale),
      tone: "neutral",
    });
  }
  if (canManageAccounts(user)) {
    shortcuts.push({
      href: "/admin/users",
      label: t("Open admin users", locale),
      tone: "neutral",
    });
    shortcuts.push({
      href: "/settings",
      label: t("Open settings", locale),
      tone: "neutral",
    });
  }

  return shortcuts;
}

function toApiClientError(error: unknown, locale: Locale): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "DASHBOARD_LOAD_FAILED",
    message: localizedUnknownErrorMessage(error, locale),
    status: 0,
  });
}

function localizedDashboardErrorMessage(
  _error: ApiClientError,
  locale: Locale,
): string {
  return t("The dashboard API request could not be sent.", locale);
}

function localizedUnknownErrorMessage(_error: unknown, locale: Locale): string {
  return t("The dashboard API request could not be sent.", locale);
}

function t(key: MessageKey, locale: Locale): string {
  return createTranslator(locale).t(key);
}
