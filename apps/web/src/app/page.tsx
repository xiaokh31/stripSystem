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
import type { Locale } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import {
  healthStatusLabel,
  loadJobStatusLabel,
} from "@/lib/i18n/status-labels";
import { translateMessage } from "@/lib/i18n/translator";
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
  const [locale, currentUser, state] = await Promise.all([
    getServerLocale(),
    getServerCurrentUser(),
    loadDashboard(filters),
  ]);
  const dashboard = state.ok ? state.dashboard : null;
  const monthValue = dashboard?.month ?? filters.month ?? "";

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8 2xl:px-10">
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
    error: toApiClientError(dashboardResult.reason),
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
            Manifest Control Room
          </p>
          <h1 className="font-control mt-2 text-2xl font-semibold text-[var(--ink)]">
            Operations dashboard
          </h1>
          <p className="mt-2 max-w-5xl text-sm leading-6 text-zinc-600">
            Live control surface for imports, containers, inventory, loading,
            exceptions, wage queues, and recent audit activity.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill
              label={healthStatusLabel(apiStatus, locale)}
              title="API status"
              tone={apiStatus === "ok" ? "success" : "warning"}
            />
            <StatusPill
              label={healthStatusLabel(databaseStatus, locale)}
              title="Database status"
              tone={databaseStatus === "up" ? "success" : "danger"}
            />
            <span className="inline-flex min-h-7 items-center border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-semibold uppercase text-zinc-700">
              {dashboardRangeLabel(filters.range ?? "today", locale)}
            </span>
            {dashboard ? (
              <span className="inline-flex min-h-7 items-center border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-semibold uppercase text-zinc-700">
                <span className="mr-1">Month</span>
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
            Range
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
            Month
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
            Refresh dashboard
          </button>
        </form>
      </div>
      <div className="grid gap-2 border-t border-[var(--line-soft)] px-4 py-3 text-xs text-zinc-600 sm:grid-cols-3">
        <p>
          <span className="font-semibold uppercase">Generated at</span>{" "}
          <span className="font-data" data-i18n-ignore="true">
            {dashboard
              ? formatOperationalDateTime(dashboard.generatedAt)
              : formatOperationalDateTime(new Date())}
          </span>
        </p>
        <p>
          <span className="font-semibold uppercase">Time zone</span>{" "}
          <span className="font-data" data-i18n-ignore="true">
            {dashboard?.timeZone ?? OPERATIONAL_TIME_ZONE_DESCRIPTION}
          </span>
        </p>
        <p>
          <span className="font-semibold uppercase">API version</span>{" "}
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
          <p className="font-semibold">Some dashboard sections are hidden by permissions.</p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
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
    <DashboardPanel eyebrow="Work queue" title="Action queue">
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
          label="No dashboard actions are visible for this account."
          linkLabel="Open settings"
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
        <LinkButton href="/containers" label="Open containers" tone="neutral" />
      }
      eyebrow="Dock lane strip"
      title="Container lifecycle"
    >
      <LifecycleDockStrip
        ariaLabel={t("Dock lane strip", locale)}
        lanes={lanes}
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
        href="/reports/inventory"
        message={dashboardUnavailableMessage("inventory", locale)}
        title="Inventory pressure"
      />
    );
  }

  return (
    <DashboardPanel
      actions={
        <LinkButton href="/reports/inventory" label="Open inventory" tone="neutral" />
      }
      eyebrow="Inventory pressure"
      title="Pallet pressure"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          href="/reports/inventory"
          label="Total pallets"
          tone="info"
          value={inventory.totalPallets}
        />
        <MetricTile
          href="/reports/inventory?status=LOADED"
          label="Loaded pallets"
          tone="success"
          value={inventory.loadedPallets}
        />
        <MetricTile
          href="/reports/inventory"
          label="Remaining pallets"
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
          Top destinations by remaining pallets
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
                  {destination.remainingPallets}/{destination.totalPallets}
                </p>
              </div>
              <div className="mt-3">
                <ProgressBar
                  label={t("Remaining pallets", locale)}
                  max={destination.totalPallets}
                  tone={destination.remainingPallets > 0 ? "warning" : "success"}
                  value={destination.remainingPallets}
                />
              </div>
            </div>
          ))
        ) : (
          <EmptyAction
            href="/reports/inventory"
            label="No destination inventory pressure"
            linkLabel="Open inventory"
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
        title="Active load jobs"
      />
    );
  }

  return (
    <DashboardPanel
      actions={<LinkButton href="/load-jobs" label="Open load jobs" tone="neutral" />}
      eyebrow="Active load jobs"
      title="Loading progress"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          href="/load-jobs"
          label="Open load jobs"
          tone={loadJobs.openCount > 0 ? "warning" : "success"}
          value={loadJobs.openCount}
        />
        <MetricTile
          href="/load-jobs"
          label="In progress"
          tone={loadJobs.inProgressCount > 0 ? "info" : "neutral"}
          value={loadJobs.inProgressCount}
        />
        <MetricTile
          href="/load-jobs"
          label="Due today"
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
            label="No active load jobs"
            linkLabel="Open load jobs"
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
      actions={<LinkButton href="/imports" label="Open imports" tone="neutral" />}
      eyebrow="Exceptions"
      title="Review queue"
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
  const shortcuts = workflowShortcuts(currentUser);

  return (
    <div className="grid gap-4">
      <DashboardPanel
        actions={
          monthlySummary ? (
            <LinkButton href={monthlySummary.href} label="Open reports" tone="neutral" />
          ) : undefined
        }
        eyebrow="Monthly settlement"
        title="Summary and wage queues"
      >
        {monthlySummary || wageAndAttendance ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {monthlySummary ? (
              <>
                <MetricTile
                  href={monthlySummary.href}
                  label="Completed containers"
                  tone="success"
                  value={monthlySummary.completedContainerCount}
                />
                <MetricTile
                  href={monthlySummary.href}
                  label="Summary rows"
                  tone="info"
                  value={monthlySummary.rowCount}
                />
                <MetricTile
                  href={monthlySummary.href}
                  label="Review warnings"
                  tone={monthlySummary.reviewWarningCount > 0 ? "warning" : "success"}
                  value={monthlySummary.reviewWarningCount}
                />
              </>
            ) : null}
            {wageAndAttendance?.attendanceImportsNeedingParse !== null &&
            wageAndAttendance?.attendanceImportsNeedingParse !== undefined ? (
              <MetricTile
                href={wageAndAttendance.hrefs.attendance ?? "/work-hours"}
                label="Attendance imports needing parse"
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
                label="Attendance imports with errors"
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
                label="Wage settlements needing review"
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
            title="Monthly settlement"
          />
        )}
      </DashboardPanel>

      <DashboardPanel eyebrow="Workflow shortcuts" title="Role-aware actions">
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
            label="No workflow shortcuts are available for this account."
            linkLabel="Sign in"
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
      actions={<LinkButton href={dashboardHref({ range: "30d" })} label="30 days" tone="neutral" />}
      eyebrow="Recent activity"
      title="Latest operational records"
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
          label="No recent activity in this range"
          linkLabel="30 days"
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
        <p className="text-sm font-semibold uppercase">Dashboard error</p>
        <h2 className="mt-2 text-xl font-semibold">
          Dashboard data could not be loaded.
        </h2>
        <p className="mt-3 text-sm leading-6">{error.message}</p>
        <p className="font-data mt-3 text-xs" data-i18n-ignore="true">
          {error.code}
          {error.status ? ` (${error.status})` : ""}
        </p>
      </div>
      <DashboardPanel eyebrow="Shortcuts" title="Available shortcuts">
        <div className="grid gap-2">
          <LinkButton href="/imports" label="Open imports" tone="neutral" />
          <LinkButton href="/containers" label="Open containers" tone="neutral" />
          <LinkButton href="/load-jobs" label="Open load jobs" tone="neutral" />
          <LinkButton href="/reports" label="Open reports" tone="neutral" />
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
  message,
  title,
}: {
  href: string;
  message: string;
  title: string;
}) {
  return (
    <section className="border border-dashed border-[var(--line-soft)] bg-[var(--panel-muted)] p-4">
      <h3 className="text-base font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{message}</p>
      <LinkButton href={href} label="Open dashboard target" tone="neutral" />
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
): Array<{ href: string; label: string; tone: DashboardTone }> {
  const shortcuts: Array<{ href: string; label: string; tone: DashboardTone }> =
    [];

  if (hasPermission(user, INVENTORY_READ_PERMISSION)) {
    shortcuts.push({ href: "/reports/inventory", label: "Open inventory", tone: "neutral" });
  }
  if (hasPermission(user, LOAD_JOBS_READ_PERMISSION)) {
    shortcuts.push({ href: "/load-jobs", label: "Open load jobs", tone: "neutral" });
  }
  if (hasPermission(user, SCAN_CREATE_PERMISSION)) {
    shortcuts.push({ href: "/mobile/load-jobs", label: "Open mobile scan", tone: "neutral" });
  }
  if (hasPermission(user, ATTENDANCE_READ_PERMISSION)) {
    shortcuts.push({ href: "/work-hours", label: "Open work hours", tone: "neutral" });
  }
  if (hasPermission(user, UNLOADING_WAGE_READ_PERMISSION)) {
    shortcuts.push({ href: "/unloading-wage", label: "Open unloading wage", tone: "neutral" });
  }
  if (hasPermission(user, UNLOADING_SUMMARY_READ_PERMISSION)) {
    shortcuts.push({ href: "/unloading-summary", label: "Open unloading summary", tone: "neutral" });
  }
  if (canManageAccounts(user)) {
    shortcuts.push({ href: "/admin/users", label: "Open admin users", tone: "neutral" });
    shortcuts.push({ href: "/settings", label: "Open settings", tone: "neutral" });
  }

  return shortcuts;
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "DASHBOARD_LOAD_FAILED",
    message:
      error instanceof Error
        ? error.message
        : "The dashboard API request could not be sent.",
    status: 0,
  });
}

function t(source: string, locale: Locale): string {
  return translateMessage(source, locale) ?? source;
}
