import Link from "next/link";
import type { ReactNode } from "react";
import { UnloadingSummaryExportPanel } from "@/components/reports/unloading-summary-actions";
import {
  COMPLETED_UNLOADING_STATUS_VALUES,
  displayText,
  formatUnloadingSummaryDate,
  resolveUnloadingSummaryMonth,
  unloadingSummaryBusinessTypeCounts,
  unloadingSummaryGeneratedFileAuditText,
  unloadingSummaryHref,
  unloadingSummaryReviewText,
  unloadingSummaryRowKey,
  unloadingSummaryWageTag,
  type UnloadingSummarySearchParams,
} from "@/components/reports/unloading-summary-flow";
import {
  ApiClientError,
  getUnloadingSummary,
  getUnloadingSummaryExportDownloadUrl,
  getUnloadingSummaryMonths,
  type UnloadingSummaryAvailableMonthResponse,
  type UnloadingSummaryResponse,
  type UnloadingSummaryRowResponse,
} from "@/lib/api-client";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import {
  businessStatusLabel,
  destinationTypeLabel,
  generatedFileTypeLabel,
  payClassificationLabel,
} from "@/lib/i18n/status-labels";
import { createTranslator } from "@/lib/i18n/translator";
import {
  canExportUnloadingSummary,
  canReviewUnloadingSummary,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";
import { DashboardFilterContext } from "@/components/dashboard/dashboard-filter-context";
import {
  appendDashboardDrilldownContext,
  normalizeDashboardDrilldownContext,
} from "@/components/dashboard/drilldown-flow";

export const dynamic = "force-dynamic";

interface UnloadingSummaryState {
  availableMonths: UnloadingSummaryAvailableMonthResponse[];
  error: ApiClientError | null;
  missingCompletionReviewCount: number;
  month: string;
  summary: UnloadingSummaryResponse | null;
}

export default async function UnloadingSummaryPage({
  searchParams,
}: {
  searchParams: Promise<UnloadingSummarySearchParams>;
}) {
  const locale = await getServerLocale();
  const requestedSearchParams = await searchParams;
  const dashboardContext = normalizeDashboardDrilldownContext(
    requestedSearchParams,
  );
  const currentUser = await getServerCurrentUser();
  const canRead = canReviewUnloadingSummary(currentUser);
  const canExport = canExportUnloadingSummary(currentUser);

  if (!canRead) {
    const month = resolveUnloadingSummaryMonth(requestedSearchParams, []);
    return (
      <UnloadingSummaryPageShell href={unloadingSummaryHref(month)} locale={locale}>
        <PermissionRequiredPanel locale={locale} />
      </UnloadingSummaryPageShell>
    );
  }

  const state = await loadUnloadingSummaryState(requestedSearchParams);
  const month = state.month;
  const availableMonths =
    state.summary?.availableMonths ?? state.availableMonths;

  return (
    <UnloadingSummaryPageShell
      href={summaryDashboardHref(month, dashboardContext)}
      locale={locale}
    >
      {dashboardContext ? (
        <DashboardFilterContext
          clearHref={`/unloading-summary?month=${encodeURIComponent(month)}`}
          context={dashboardContext}
          locale={locale}
        />
      ) : null}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {canExport ? (
          <UnloadingSummaryExportPanel
            availableMonths={availableMonths}
            month={month}
            rowCount={state.summary?.rowCount ?? 0}
          />
        ) : (
          <ExportPermissionPanel locale={locale} />
        )}
        <MonthFilter
          availableMonths={availableMonths}
          context={dashboardContext}
          locale={locale}
          month={month}
        />
      </section>

      <CompletionStatusRule locale={locale} />

      {state.error ? (
        <ApiErrorPanel
          error={state.error}
          locale={locale}
          title="Monthly unloading data summary could not be loaded"
        />
      ) : null}

      {state.summary ? (
        <>
          <div id="completed-containers">
            <SummaryMetrics locale={locale} summary={state.summary} />
          </div>
          <ReviewWarnings locale={locale} summary={state.summary} />
          <div id="summary-rows">
            <SummaryRowsTable
              availableMonths={state.summary.availableMonths}
              locale={locale}
              rows={state.summary.rows}
            />
          </div>
          <GeneratedSummaryFiles locale={locale} summary={state.summary} />
        </>
      ) : null}
    </UnloadingSummaryPageShell>
  );
}

async function loadUnloadingSummaryState(
  searchParams: UnloadingSummarySearchParams,
): Promise<UnloadingSummaryState> {
  const apiOptions = await getServerApiOptions();
  let availableMonths: UnloadingSummaryAvailableMonthResponse[] = [];
  let missingCompletionReviewCount = 0;

  try {
    const metadata = await getUnloadingSummaryMonths(apiOptions);
    availableMonths = metadata.availableMonths;
    missingCompletionReviewCount = metadata.missingCompletionReviewCount;
  } catch {
    availableMonths = [];
    missingCompletionReviewCount = 0;
  }

  const month = resolveUnloadingSummaryMonth(searchParams, availableMonths);

  try {
    const summary = await getUnloadingSummary(month, apiOptions);
    return {
      availableMonths: summary.availableMonths,
      error: null,
      missingCompletionReviewCount: summary.missingCompletionReviewCount,
      month,
      summary,
    };
  } catch (error) {
    return {
      availableMonths,
      error: toApiClientError(error, "Monthly unloading data summary failed."),
      missingCompletionReviewCount,
      month,
      summary: null,
    };
  }
}

function UnloadingSummaryPageShell({
  children,
  href,
  locale,
}: {
  children: ReactNode;
  href: string;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Reports")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Monthly Unloading Data Summary")}
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-600">
              {t(
                "Review completed unloading container data for office operations without generating unloading wage settlement.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/reports"
            >
              {t("Reports")}
            </Link>
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href={href}
            >
              {t("Refresh")}
            </Link>
          </div>
        </div>
      </section>
      {children}
    </main>
  );
}

function PermissionRequiredPanel({ locale }: { locale: Locale }) {
  const { t } = createTranslator(locale);

  return (
    <section className="border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
      <h2 className="text-base font-semibold">
        {t("Unloading summary read permission required")}
      </h2>
      <p className="mt-2 text-sm leading-6">
        {t(
          "Ask an administrator for unloading_summary.read before opening Monthly Unloading Data Summary.",
        )}
      </p>
    </section>
  );
}

function ExportPermissionPanel({ locale }: { locale: Locale }) {
  const { t } = createTranslator(locale);

  return (
    <section className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm">
      <h2 className="text-base font-semibold">
        {t("Unloading summary export permission required")}
      </h2>
      <p className="mt-2 leading-6">
        {t(
          "This account can review monthly unloading data but needs unloading_summary.export before generating Excel exports.",
        )}
      </p>
    </section>
  );
}

function MonthFilter({
  availableMonths,
  context,
  locale,
  month,
}: {
  availableMonths: UnloadingSummaryAvailableMonthResponse[];
  context: ReturnType<typeof normalizeDashboardDrilldownContext>;
  locale: Locale;
  month: string;
}) {
  const { t } = createTranslator(locale);

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        {t("Summary month filter")}
      </h2>
      <form
        action="/unloading-summary"
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        {context ? (
          <>
            <input name="from" type="hidden" value={context.from} />
            <input name="code" type="hidden" value={context.code} />
          </>
        ) : null}
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">
            {t("Selected month")}
          </span>
          <input
            className="min-h-10 border border-zinc-300 px-3 text-sm"
            defaultValue={month}
            name="month"
            type="month"
          />
        </label>
        <button
          className="min-h-10 border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
          type="submit"
        >
          {t("Apply")}
        </button>
      </form>
      <AvailableMonthShortcuts
        availableMonths={availableMonths}
        context={context}
        locale={locale}
      />
    </section>
  );
}

function AvailableMonthShortcuts({
  availableMonths,
  context = null,
  locale,
}: {
  availableMonths: UnloadingSummaryAvailableMonthResponse[];
  context?: ReturnType<typeof normalizeDashboardDrilldownContext>;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);

  if (availableMonths.length === 0) {
    return (
      <p className="mt-4 text-sm text-zinc-600">
        {t("No available completed unloading months yet.")}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-zinc-700">
        {t("Available completed months")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {availableMonths.slice(0, 8).map((availableMonth) => (
          <Link
            className="inline-flex min-h-9 items-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            href={summaryDashboardHref(availableMonth.month, context)}
            key={availableMonth.month}
          >
            {format("i18n.unloadingSummary.availableMonth", {
              containers: availableMonth.completedContainerCount,
              month: availableMonth.month,
              rows: availableMonth.rowCount,
            })}
          </Link>
        ))}
      </div>
    </div>
  );
}

function summaryDashboardHref(
  month: string,
  context: ReturnType<typeof normalizeDashboardDrilldownContext>,
): string {
  const params = new URLSearchParams({ month });
  appendDashboardDrilldownContext(params, context);
  const hash =
    context?.code === "MONTHLY_COMPLETED_CONTAINERS"
      ? "#completed-containers"
      : context?.code === "MONTHLY_SUMMARY_ROWS"
        ? "#summary-rows"
        : "";
  return `/unloading-summary?${params.toString()}${hash}`;
}

function CompletionStatusRule({ locale }: { locale: Locale }) {
  const { format, t } = createTranslator(locale);
  const completedLabels = COMPLETED_UNLOADING_STATUS_VALUES.map((status) =>
    businessStatusLabel(status, locale),
  );

  return (
    <section className="border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950 shadow-sm">
      <h2 className="text-base font-semibold">{t("Completed status filter")}</h2>
      <p className="mt-2 leading-6">
        {format("i18n.unloadingSummary.completedStatusRule", {
          statuses: new Intl.ListFormat(locale, {
            style: "long",
            type: "conjunction",
          }).format(completedLabels),
        })}
      </p>
    </section>
  );
}

function SummaryMetrics({
  locale,
  summary,
}: {
  locale: Locale;
  summary: UnloadingSummaryResponse;
}) {
  const { t } = createTranslator(locale);
  const counts = unloadingSummaryBusinessTypeCounts(summary.rows);

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
        <Metric label={t("Selected month")} value={summary.month} />
        <Metric
          label={t("Completed containers")}
          value={String(summary.sourceContainerCount)}
        />
        <Metric label={t("Detail rows")} value={String(summary.rowCount)} />
        <Metric label={t("Ocean containers")} value={String(counts.ocean)} />
        <Metric label={t("US-to-Canada")} value={String(counts.usToCanada)} />
        <Metric
          label={t("Review warnings")}
          value={String(summary.reviewItems.length)}
        />
        <Metric
          label={t("Missing completed dates")}
          value={String(summary.missingCompletionReviewCount)}
        />
      </div>
    </section>
  );
}

function ReviewWarnings({
  locale,
  summary,
}: {
  locale: Locale;
  summary: UnloadingSummaryResponse;
}) {
  const { t } = createTranslator(locale);

  if (summary.reviewItems.length === 0) {
    return (
      <section className="border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {t("Review warnings")}
        </h2>
        <p className="mt-2">{t("No review warnings for the selected month.")}</p>
      </section>
    );
  }

  return (
    <section
      className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">{t("Review warnings")}</h2>
      <ul className="mt-3 grid gap-2">
        {summary.reviewItems.map((item, index) => (
          <li className="border border-amber-200 bg-white px-3 py-2" key={index}>
            <p className="font-semibold" data-i18n-ignore>
              {item.code}
            </p>
            <p className="mt-1">{unloadingSummaryReviewText(item, locale)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SummaryRowsTable({
  availableMonths,
  locale,
  rows,
}: {
  availableMonths: UnloadingSummaryAvailableMonthResponse[];
  locale: Locale;
  rows: UnloadingSummaryRowResponse[];
}) {
  const { format, t } = createTranslator(locale);

  if (rows.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          {t("No completed unloading rows for the selected month")}
        </h2>
        <p className="mt-2 max-w-3xl leading-6">
          {t(
            "Mark container unloading as complete and confirm the completion date falls inside this month before exporting the office summary.",
          )}
        </p>
        <AvailableMonthShortcuts availableMonths={availableMonths} locale={locale} />
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Monthly unloading detail")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {t("Destination and note lines are returned by the summary API.")}
          </p>
        </div>
        <p className="text-sm font-semibold text-zinc-700">
          {format("i18n.unloadingSummary.detailRows", { count: rows.length })}
        </p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <th className="px-3 py-3 font-semibold">{t("Container number")}</th>
              <th className="px-3 py-3 font-semibold">{t("Current status")}</th>
              <th className="px-3 py-3 font-semibold">{t("Completed date")}</th>
              <th className="px-3 py-3 font-semibold">{t("Wage tag")}</th>
              <th className="px-3 py-3 font-semibold">{t("Trailer number")}</th>
              <th className="px-3 py-3 font-semibold">
                {t("Destination and service line")}
              </th>
              <th className="px-3 py-3 font-semibold">{t("Cartons and pallets")}</th>
              <th className="px-3 py-3 font-semibold">
                {t("Reference and appointment")}
              </th>
              <th className="px-3 py-3 font-semibold">
                {t("Split variance and note")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="border-b border-zinc-100 align-top"
                key={unloadingSummaryRowKey(row)}
              >
                <td className="px-3 py-4">
                  <Link
                    className="break-all font-semibold text-teal-700 underline hover:text-teal-900"
                    href={`/containers/${row.containerId}`}
                  >
                    {row.sequence}、{row.containerNo}
                  </Link>
                  <p className="mt-1 break-all text-xs text-zinc-500">
                    {displayText(row.payContainerNo)}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <StatusBadge locale={locale} status={row.status} />
                </td>
                <td className="px-3 py-4">
                  <p>{formatUnloadingSummaryDate(row.completedAt)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {displayText(row.dateBusinessTag)}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <p className="font-semibold">
                    {unloadingSummaryWageTag(row, locale)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {payClassificationLabel(row.classification, locale)}
                  </p>
                </td>
                <td className="px-3 py-4">{displayText(row.trailerNumber)}</td>
                <td className="px-3 py-4">
                  <p className="font-semibold text-zinc-950">
                    {displayText(row.destinationText)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {displayText(row.destinationCode)} ·{" "}
                    {destinationTypeLabel(row.destinationType, locale)}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <p>{displayText(row.quantityText)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {format("i18n.unloadingSummary.cartonsPallets", {
                      cartons: row.cartons,
                      pallets: row.finalPallets,
                    })}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <p>{displayText(row.referenceText)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {displayText(row.appointmentText)}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <p>{displayText(row.splitOrVarianceText)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {displayText(row.operationNote)}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GeneratedSummaryFiles({
  locale,
  summary,
}: {
  locale: Locale;
  summary: UnloadingSummaryResponse;
}) {
  const { format, t } = createTranslator(locale);

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        {t("Generated summary files")}
      </h2>
      {summary.generatedFiles.length === 0 ? (
        <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
          {t("No monthly unloading summary export has been generated for this month.")}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summary.generatedFiles.map((file) => (
            <div className="border border-zinc-200 bg-zinc-50 p-3" key={file.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">
                    {generatedFileTypeLabel(file.fileType, locale)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {format("i18n.unloadingSummary.createdAt", {
                      date: formatUnloadingSummaryDate(file.createdAt),
                    })}
                  </p>
                </div>
                <StatusBadge locale={locale} status={file.status} />
              </div>
              <p className="mt-3 break-all text-xs text-zinc-600">
                {unloadingSummaryGeneratedFileAuditText(file, locale)}
              </p>
              {file.status === "GENERATED" ? (
                <Link
                  className="mt-3 inline-flex min-h-9 items-center border border-teal-700 bg-white px-3 text-xs font-semibold uppercase text-teal-800 hover:bg-teal-50"
                  href={getUnloadingSummaryExportDownloadUrl(file.id)}
                >
                  {t("Download")}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-zinc-100 pt-3">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
    </div>
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
      className={`inline-flex min-h-7 items-center rounded border px-2.5 text-xs font-semibold uppercase ${styles}`}
      title={businessStatusLabel(status, locale)}
    >
      {businessStatusLabel(status, locale)}
    </span>
  );
}

function ApiErrorPanel({
  error,
  locale,
  title,
}: {
  error: ApiClientError;
  locale: Locale;
  title: MessageKey;
}) {
  const { t } = createTranslator(locale);

  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">{t(title)}</h2>
      <p className="mt-2 text-sm">{unloadingSummaryApiErrorMessage(error, locale)}</p>
      <p className="mt-2 text-xs font-semibold uppercase" data-i18n-ignore>
        {error.code}
      </p>
    </section>
  );
}

function unloadingSummaryApiErrorMessage(
  error: ApiClientError,
  locale: Locale,
): string {
  const { t } = createTranslator(locale);
  const messages: Record<string, MessageKey> = {
    UNLOADING_SUMMARY_EXPORT_FAILED:
      "Monthly unloading summary export could not be generated.",
    UNLOADING_SUMMARY_EXPORT_NOT_DOWNLOADABLE:
      "Monthly unloading summary export is not available for download.",
    UNLOADING_SUMMARY_EXPORT_NOT_FOUND:
      "Monthly unloading summary export could not be found.",
    UNLOADING_SUMMARY_EXPORT_STORAGE_MISSING:
      "Monthly unloading summary export file is unavailable.",
    UNLOADING_SUMMARY_NO_ROWS_FOR_MONTH:
      "Selected month has no summary rows. Choose an available completed month before exporting.",
  };

  return t(messages[error.code] ?? "The request failed.");
}

function statusBadgeStyles(status: string): string {
  const normalized = status.toUpperCase();
  if (
    (COMPLETED_UNLOADING_STATUS_VALUES as readonly string[]).includes(
      normalized,
    )
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (normalized === "GENERATED" || normalized === "COMPLETED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (normalized === "WARNING" || normalized === "NEEDS_REVIEW") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (normalized === "ERROR" || normalized === "FAILED") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function toApiClientError(error: unknown, fallbackMessage: string): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "UNLOADING_SUMMARY_LOAD_FAILED",
    message: error instanceof Error ? error.message : fallbackMessage,
    status: 0,
  });
}
