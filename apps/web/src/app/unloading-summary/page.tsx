import Link from "next/link";
import type { ReactNode } from "react";
import { UnloadingSummaryExportPanel } from "@/components/reports/unloading-summary-actions";
import {
  COMPLETED_UNLOADING_STATUS_VALUES,
  displayText,
  formatUnloadingSummaryDate,
  normalizeUnloadingSummaryMonth,
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
  type UnloadingSummaryResponse,
  type UnloadingSummaryRowResponse,
} from "@/lib/api-client";
import {
  canExportUnloadingSummary,
  canReviewUnloadingSummary,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

interface UnloadingSummaryState {
  error: ApiClientError | null;
  summary: UnloadingSummaryResponse | null;
}

export default async function UnloadingSummaryPage({
  searchParams,
}: {
  searchParams: Promise<UnloadingSummarySearchParams>;
}) {
  const month = normalizeUnloadingSummaryMonth(await searchParams);
  const currentUser = await getServerCurrentUser();
  const canRead = canReviewUnloadingSummary(currentUser);
  const canExport = canExportUnloadingSummary(currentUser);

  if (!canRead) {
    return (
      <UnloadingSummaryPageShell month={month}>
        <PermissionRequiredPanel />
      </UnloadingSummaryPageShell>
    );
  }

  const state = await loadUnloadingSummaryState(month);

  return (
    <UnloadingSummaryPageShell month={month}>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {canExport ? (
          <UnloadingSummaryExportPanel month={month} />
        ) : (
          <ExportPermissionPanel />
        )}
        <MonthFilter month={month} />
      </section>

      <CompletionStatusRule />

      {state.error ? (
        <ApiErrorPanel
          error={state.error}
          title="Monthly unloading data summary could not be loaded"
        />
      ) : null}

      {state.summary ? (
        <>
          <SummaryMetrics summary={state.summary} />
          <ReviewWarnings summary={state.summary} />
          <SummaryRowsTable rows={state.summary.rows} />
          <GeneratedSummaryFiles summary={state.summary} />
        </>
      ) : null}
    </UnloadingSummaryPageShell>
  );
}

async function loadUnloadingSummaryState(
  month: string,
): Promise<UnloadingSummaryState> {
  const apiOptions = await getServerApiOptions();

  try {
    return {
      error: null,
      summary: await getUnloadingSummary(month, apiOptions),
    };
  } catch (error) {
    return {
      error: toApiClientError(error, "Monthly unloading data summary failed."),
      summary: null,
    };
  }
}

function UnloadingSummaryPageShell({
  children,
  month,
}: {
  children: ReactNode;
  month: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Reports
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Monthly Unloading Data Summary
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-600">
              Review completed unloading container data for office operations
              without generating unloading wage settlement.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/reports"
            >
              Reports
            </Link>
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href={unloadingSummaryHref(month)}
            >
              Refresh
            </Link>
          </div>
        </div>
      </section>
      {children}
    </main>
  );
}

function PermissionRequiredPanel() {
  return (
    <section className="border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
      <h2 className="text-base font-semibold">
        Unloading summary read permission required
      </h2>
      <p className="mt-2 text-sm leading-6">
        Ask an administrator for unloading_summary.read before opening Monthly
        Unloading Data Summary.
      </p>
    </section>
  );
}

function ExportPermissionPanel() {
  return (
    <section className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm">
      <h2 className="text-base font-semibold">
        Unloading summary export permission required
      </h2>
      <p className="mt-2 leading-6">
        This account can review monthly unloading data but needs
        unloading_summary.export before generating Excel exports.
      </p>
    </section>
  );
}

function MonthFilter({ month }: { month: string }) {
  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        Summary month filter
      </h2>
      <form
        action="/unloading-summary"
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Selected month</span>
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
          Apply
        </button>
      </form>
    </section>
  );
}

function CompletionStatusRule() {
  return (
    <section className="border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950 shadow-sm">
      <h2 className="text-base font-semibold">Completed status filter</h2>
      <p className="mt-2 leading-6">
        Summary includes API rows from{" "}
        {COMPLETED_UNLOADING_STATUS_VALUES.join(" / ")}. LABELS_GENERATED stays
        out until unloading is marked complete.
      </p>
    </section>
  );
}

function SummaryMetrics({ summary }: { summary: UnloadingSummaryResponse }) {
  const counts = unloadingSummaryBusinessTypeCounts(summary.rows);

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Metric label="Selected month" value={summary.month} />
        <Metric
          label="Completed containers"
          value={String(summary.sourceContainerCount)}
        />
        <Metric label="Detail rows" value={String(summary.rowCount)} />
        <Metric label="Ocean containers" value={String(counts.ocean)} />
        <Metric label="US-to-Canada" value={String(counts.usToCanada)} />
        <Metric
          label="Review warnings"
          value={String(summary.reviewItems.length)}
        />
      </div>
    </section>
  );
}

function ReviewWarnings({ summary }: { summary: UnloadingSummaryResponse }) {
  if (summary.reviewItems.length === 0) {
    return (
      <section className="border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Review warnings
        </h2>
        <p className="mt-2">No review warnings for the selected month.</p>
      </section>
    );
  }

  return (
    <section
      className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">Review warnings</h2>
      <ul className="mt-3 grid gap-2">
        {summary.reviewItems.map((item, index) => (
          <li className="border border-amber-200 bg-white px-3 py-2" key={index}>
            <p className="font-semibold">{item.code}</p>
            <p className="mt-1">{unloadingSummaryReviewText(item)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SummaryRowsTable({ rows }: { rows: UnloadingSummaryRowResponse[] }) {
  if (rows.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          No completed unloading rows for the selected month
        </h2>
        <p className="mt-2 max-w-3xl leading-6">
          Mark container unloading as complete and confirm the completion date
          falls inside this month before exporting the office summary.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Monthly unloading detail
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Destination and note lines are returned by the summary API.
          </p>
        </div>
        <p className="text-sm font-semibold text-zinc-700">
          {rows.length} detail row(s)
        </p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <th className="px-3 py-3 font-semibold">Container number</th>
              <th className="px-3 py-3 font-semibold">Current status</th>
              <th className="px-3 py-3 font-semibold">Completed date</th>
              <th className="px-3 py-3 font-semibold">Wage tag</th>
              <th className="px-3 py-3 font-semibold">Trailer number</th>
              <th className="px-3 py-3 font-semibold">
                Destination and service line
              </th>
              <th className="px-3 py-3 font-semibold">Cartons and pallets</th>
              <th className="px-3 py-3 font-semibold">
                Reference and appointment
              </th>
              <th className="px-3 py-3 font-semibold">
                Split variance and note
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
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-4">
                  <p>{formatUnloadingSummaryDate(row.completedAt)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {displayText(row.dateBusinessTag)}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <p className="font-semibold">
                    {unloadingSummaryWageTag(row)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {displayText(row.classification)}
                  </p>
                </td>
                <td className="px-3 py-4">{displayText(row.trailerNumber)}</td>
                <td className="px-3 py-4">
                  <p className="font-semibold text-zinc-950">
                    {displayText(row.destinationText)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {displayText(row.destinationCode)} ·{" "}
                    {displayText(row.destinationType)}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <p>{displayText(row.quantityText)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.cartons} carton(s), {row.finalPallets} pallet(s)
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
  summary,
}: {
  summary: UnloadingSummaryResponse;
}) {
  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        Generated summary files
      </h2>
      {summary.generatedFiles.length === 0 ? (
        <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
          No monthly unloading summary export has been generated for this
          month.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summary.generatedFiles.map((file) => (
            <div className="border border-zinc-200 bg-zinc-50 p-3" key={file.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">
                    {displayText(file.fileType)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Created {formatUnloadingSummaryDate(file.createdAt)}
                  </p>
                </div>
                <StatusBadge status={file.status} />
              </div>
              <p className="mt-3 break-all text-xs text-zinc-600">
                {unloadingSummaryGeneratedFileAuditText(file)}
              </p>
              {file.status === "GENERATED" ? (
                <Link
                  className="mt-3 inline-flex min-h-9 items-center border border-teal-700 bg-white px-3 text-xs font-semibold uppercase text-teal-800 hover:bg-teal-50"
                  href={getUnloadingSummaryExportDownloadUrl(file.id)}
                >
                  Download
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

function StatusBadge({ status }: { status: string }) {
  const styles = statusBadgeStyles(status);
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded border px-2.5 text-xs font-semibold uppercase ${styles}`}
    >
      {status || "-"}
    </span>
  );
}

function ApiErrorPanel({
  error,
  title,
}: {
  error: ApiClientError;
  title: string;
}) {
  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm">
        {error.code}
        {error.status ? ` (${error.status})` : ""}: {error.message}
      </p>
    </section>
  );
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
