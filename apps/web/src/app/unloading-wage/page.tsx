import Link from "next/link";
import type { ReactNode } from "react";
import { SettlementGeneratePanel } from "@/components/wage/unloading-wage-actions";
import {
  selectSettlementForMonth,
  settlementLineContainerNumbers,
  settlementReviewAlerts,
  settlementsForMonth,
} from "@/components/wage/unloading-wage-flow";
import {
  formatDateTime,
  formatMoney,
  issueList,
  statusStyle,
} from "@/components/wage/wage-display";
import {
  ApiClientError,
  getUnloadingWageSettlementFileDownloadUrl,
  listPayContainers,
  listUnloadingWageSettlements,
  type PayContainerResponse,
  type UnloadingWageSettlementResponse,
} from "@/lib/api-client";
import {
  canReviewUnloadingWage,
  canSettleUnloadingWage,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

interface UnloadingWageSearchParams {
  settlementId?: string | string[];
  settlementMonth?: string | string[];
}

interface UnloadingWageState {
  monthSettlements: UnloadingWageSettlementResponse[];
  reviewAlerts: string[];
  selectedSettlement: UnloadingWageSettlementResponse | null;
  settlementsError: ApiClientError | null;
  sourceRecords: PayContainerResponse[];
  sourceRecordsError: ApiClientError | null;
}

export default async function UnloadingWagePage({
  searchParams,
}: {
  searchParams: Promise<UnloadingWageSearchParams>;
}) {
  const params = await searchParams;
  const settlementMonth =
    firstSearchValue(params.settlementMonth) ?? currentSettlementMonth();
  const requestedSettlementId = firstSearchValue(params.settlementId);
  const currentUser = await getServerCurrentUser();
  const canRead = canReviewUnloadingWage(currentUser);
  const canSettle = canSettleUnloadingWage(currentUser);

  if (!canRead) {
    return (
      <UnloadingWagePageShell settlementMonth={settlementMonth}>
        <PermissionRequiredPanel />
      </UnloadingWagePageShell>
    );
  }

  const state = await loadUnloadingWageState(
    settlementMonth,
    requestedSettlementId,
  );

  return (
    <UnloadingWagePageShell settlementMonth={settlementMonth}>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {canSettle ? (
          <SettlementGeneratePanel defaultSettlementMonth={settlementMonth} />
        ) : (
          <SettlementPermissionPanel />
        )}
        <SettlementMonthFilter settlementMonth={settlementMonth} />
      </section>

      {state.sourceRecordsError ? (
        <ApiErrorPanel
          error={state.sourceRecordsError}
          title="Completed unloading records could not be loaded"
        />
      ) : (
        <MonthSourceRecords
          settlementMonth={settlementMonth}
          sourceRecords={state.sourceRecords}
        />
      )}

      <ReviewAlerts alerts={state.reviewAlerts} />

      {state.settlementsError ? (
        <ApiErrorPanel
          error={state.settlementsError}
          title="Settlements could not be loaded"
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <SettlementVersions
            selectedSettlementId={state.selectedSettlement?.id ?? null}
            settlementMonth={settlementMonth}
            settlements={state.monthSettlements}
          />
          {state.selectedSettlement ? (
            <SettlementDetail settlement={state.selectedSettlement} />
          ) : (
            <NoSettlementSelected settlementMonth={settlementMonth} />
          )}
        </section>
      )}
    </UnloadingWagePageShell>
  );
}

function UnloadingWagePageShell({
  children,
  settlementMonth,
}: {
  children: ReactNode;
  settlementMonth: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Warehouse
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Warehouse Unloading Wage Settlement
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Generate and review monthly worker settlement from completed
              container detail unloading wage data.
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href={`/unloading-wage?settlementMonth=${encodeURIComponent(
              settlementMonth,
            )}`}
          >
            Refresh
          </Link>
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
        Unloading wage read permission required
      </h2>
      <p className="mt-2 text-sm leading-6">
        Ask an administrator for unloading_wage.read before opening Warehouse
        Unloading Wage Settlement.
      </p>
    </section>
  );
}

function SettlementPermissionPanel() {
  return (
    <section className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm">
      <h2 className="text-base font-semibold">
        Settlement generation permission required
      </h2>
      <p className="mt-2 leading-6">
        This account can review unloading wage records but needs
        unloading_wage.settle before generating a monthly settlement.
      </p>
    </section>
  );
}

async function loadUnloadingWageState(
  settlementMonth: string,
  requestedSettlementId: string | null,
): Promise<UnloadingWageState> {
  const apiOptions = await getServerApiOptions();
  const [sourceRecordsResult, settlementsResult] = await Promise.allSettled([
    listPayContainers({ limit: 100, offset: 0, settlementMonth }, apiOptions),
    listUnloadingWageSettlements(apiOptions),
  ]);
  const settlements =
    settlementsResult.status === "fulfilled"
      ? settlementsResult.value.items
      : [];

  return {
    monthSettlements: settlementsForMonth(settlements, settlementMonth),
    reviewAlerts: settlementReviewAlerts(settlements, settlementMonth),
    selectedSettlement:
      settlementsResult.status === "fulfilled"
        ? selectSettlementForMonth(
            settlements,
            settlementMonth,
            requestedSettlementId,
          )
        : null,
    settlementsError:
      settlementsResult.status === "rejected"
        ? toApiClientError(settlementsResult.reason, "Settlement list failed.")
        : null,
    sourceRecords:
      sourceRecordsResult.status === "fulfilled"
        ? sourceRecordsResult.value.items
        : [],
    sourceRecordsError:
      sourceRecordsResult.status === "rejected"
        ? toApiClientError(
            sourceRecordsResult.reason,
            "Completed unloading record list failed.",
          )
        : null,
  };
}

function SettlementMonthFilter({
  settlementMonth,
}: {
  settlementMonth: string;
}) {
  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        Review month filter
      </h2>
      <form className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Settlement month</span>
          <input
            className="min-h-10 border border-zinc-300 px-3 text-sm"
            defaultValue={settlementMonth}
            name="settlementMonth"
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

function MonthSourceRecords({
  settlementMonth,
  sourceRecords,
}: {
  settlementMonth: string;
  sourceRecords: PayContainerResponse[];
}) {
  if (sourceRecords.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          No completed unloading records for {settlementMonth}
        </h2>
        <p className="mt-2 max-w-3xl leading-6">
          Mark container detail unloading as completed, assign unloaders, and
          make sure the completed date falls inside this month before
          generating settlement.
        </p>
      </section>
    );
  }

  const workerNames = new Set(
    sourceRecords.flatMap((record) =>
      record.unloaders.map((unloader) => unloader.workerName),
    ),
  );
  const currency = sourceRecords[0]?.currency ?? "CAD";
  const rateTotal = sourceRecords.reduce(
    (total, record) => total + finiteMoney(record.rateAmount),
    0,
  );

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Completed unloading source records
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Read-only source records for {settlementMonth} from container detail
            wage data.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right text-sm">
          <Metric label="Paid units" value={String(sourceRecords.length)} />
          <Metric label="Workers" value={String(workerNames.size)} />
          <Metric label="Rate total" value={formatMoney(rateTotal, currency)} />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <th className="px-3 py-3 font-semibold">Paid unit</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Work type</th>
              <th className="px-3 py-3 font-semibold">Containers</th>
              <th className="px-3 py-3 font-semibold">Completed</th>
              <th className="px-3 py-3 text-right font-semibold">Rate</th>
              <th className="px-3 py-3 font-semibold">Unloaders</th>
            </tr>
          </thead>
          <tbody>
            {sourceRecords.map((record) => (
              <tr className="border-b border-zinc-100 align-top" key={record.id}>
                <td className="px-3 py-4">
                  <p className="break-all font-semibold text-zinc-950">
                    {record.payContainerNo}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {allocationMethodLabel(record.allocationMethod)}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <StatusBadge status={record.status} />
                </td>
                <td className="px-3 py-4">
                  <p>{classificationLabel(record.classification)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Trailer: {record.trailerNumber ?? "-"}
                  </p>
                </td>
                <td className="px-3 py-4">
                  {record.containers.map((container) => (
                    <Link
                      className="block font-semibold text-teal-700 underline hover:text-teal-900"
                      href={`/containers/${container.containerId}`}
                      key={container.id}
                    >
                      {container.containerNo}
                    </Link>
                  ))}
                </td>
                <td className="px-3 py-4">
                  {formatDateTime(record.completedAt)}
                </td>
                <td className="px-3 py-4 text-right font-semibold">
                  {formatMoney(record.rateAmount, record.currency)}
                </td>
                <td className="px-3 py-4">
                  {record.unloaders.length === 0
                    ? "-"
                    : record.unloaders
                        .map((unloader) => unloader.workerName)
                        .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReviewAlerts({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <section
      className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">Settlement review warning</h2>
      <ul className="mt-2 space-y-1">
        {alerts.map((alert) => (
          <li key={alert}>{alert}</li>
        ))}
      </ul>
    </section>
  );
}

function SettlementVersions({
  selectedSettlementId,
  settlementMonth,
  settlements,
}: {
  selectedSettlementId: string | null;
  settlementMonth: string;
  settlements: UnloadingWageSettlementResponse[];
}) {
  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        Settlement versions
      </h2>
      {settlements.length === 0 ? (
        <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
          No settlement has been generated for {settlementMonth}.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {settlements.map((settlement) => (
            <Link
              className={`border p-3 text-sm ${
                settlement.id === selectedSettlementId
                  ? "border-teal-700 bg-teal-50"
                  : "border-zinc-200 bg-zinc-50 hover:bg-white"
              }`}
              href={`/unloading-wage?settlementMonth=${encodeURIComponent(
                settlementMonth,
              )}&settlementId=${encodeURIComponent(settlement.id)}`}
              key={settlement.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-zinc-950">
                  {settlement.settlementMonth}
                </p>
                <StatusBadge status={settlement.status} />
              </div>
              <p className="mt-2 font-semibold text-zinc-800">
                {formatMoney(settlement.totalAmount, settlement.currency)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {formatDateTime(settlement.createdAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function NoSettlementSelected({
  settlementMonth,
}: {
  settlementMonth: string;
}) {
  return (
    <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
      <h2 className="text-base font-semibold text-zinc-950">
        No settlement selected for {settlementMonth}
      </h2>
      <p className="mt-2 max-w-2xl leading-6">
        Generate the selected month after reviewing completed unloading source
        records. Generated JSON and HTML task report files will appear in the
        settlement detail.
      </p>
    </section>
  );
}

function SettlementDetail({
  settlement,
}: {
  settlement: UnloadingWageSettlementResponse;
}) {
  const issues = [
    ...issueList(settlement.warnings),
    ...issueList(settlement.errors),
  ];

  return (
    <section className="grid gap-4">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">
              Settlement {settlement.settlementMonth}
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              {settlement.workers.length} worker(s), {settlement.lines.length}{" "}
              detail line(s)
            </p>
          </div>
          <div className="text-right">
            <StatusBadge status={settlement.status} />
            <p className="mt-2 text-lg font-semibold text-zinc-950">
              {formatMoney(settlement.totalAmount, settlement.currency)}
            </p>
          </div>
        </div>
        {issues.length > 0 ? (
          <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">Review issues</p>
            <ul className="mt-2 space-y-1">
              {issues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-950">
          Worker summary
        </h3>
        {settlement.workers.length === 0 ? (
          <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
            No worker wage summary is recorded for this settlement.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[720px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <th className="px-3 py-3 font-semibold">Worker</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Paid units
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Wage amount
                  </th>
                  <th className="px-3 py-3 font-semibold">Review status</th>
                </tr>
              </thead>
              <tbody>
                {settlement.workers.map((worker) => (
                  <tr className="border-b border-zinc-100" key={worker.id}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-zinc-950">
                        {worker.workerName}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {worker.workerCode}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right font-medium">
                      {worker.payContainerCount}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatMoney(worker.totalAmount, settlement.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={settlement.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-950">
          Monthly detail
        </h3>
        {settlement.lines.length === 0 ? (
          <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
            No settlement detail lines are recorded for this settlement.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <th className="px-3 py-3 font-semibold">Paid work</th>
                  <th className="px-3 py-3 font-semibold">
                    Associated containers
                  </th>
                  <th className="px-3 py-3 font-semibold">Completed date</th>
                  <th className="px-3 py-3 text-right font-semibold">Rate</th>
                  <th className="px-3 py-3 font-semibold">Unloader</th>
                  <th className="px-3 py-3 font-semibold">Allocation</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Worker amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {settlement.lines.map((line) => (
                  <tr className="border-b border-zinc-100 align-top" key={line.id}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-zinc-950">
                        {settlementLineWorkUnit(line)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {classificationLabel(line.classification)}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {settlementLineContainerNumbers(line.containerNumbers)
                        .length > 0
                        ? settlementLineContainerNumbers(
                            line.containerNumbers,
                          ).join(", ")
                        : "-"}
                    </td>
                    <td className="px-3 py-3">
                      {formatDateTime(line.completedAt)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatMoney(line.rateAmount, settlement.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-zinc-950">
                        {line.workerName}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {line.workerCode}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {allocationMethodLabel(line.allocationMethod)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatMoney(line.amount, settlement.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-950">
          Generated settlement files
        </h3>
        {settlement.generatedFiles.length === 0 ? (
          <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
            No generated settlement files are recorded.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {settlement.generatedFiles.map((file) => (
              <div className="border border-zinc-200 bg-zinc-50 p-3" key={file.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">
                      {wageFileTypeLabel(file.fileType)}
                    </p>
                    <p className="mt-1 break-all text-xs text-zinc-500">
                      {file.fileSha256 ?? "No SHA-256 recorded"}
                    </p>
                  </div>
                  <StatusBadge status={file.status} />
                </div>
                {file.status === "GENERATED" ? (
                  <Link
                    className="mt-3 inline-flex min-h-9 items-center border border-teal-700 bg-white px-3 text-xs font-semibold uppercase text-teal-800 hover:bg-teal-50"
                    href={getUnloadingWageSettlementFileDownloadUrl(
                      settlement.id,
                      file.id,
                    )}
                  >
                    Download
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = statusStyle(status);
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded border px-2.5 text-xs font-semibold uppercase ${style.styles}`}
    >
      {style.label}
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

type SettlementLine = UnloadingWageSettlementResponse["lines"][number];

function settlementLineWorkUnit(line: SettlementLine): string {
  if (line.classification === "US_TO_CANADA_TRANSFER") {
    return line.trailerNumber ?? line.payContainerNo;
  }

  return (
    settlementLineContainerNumbers(line.containerNumbers)[0] ??
    line.payContainerNo
  );
}

function classificationLabel(value: string): string {
  if (value === "OCEAN_CONTAINER") {
    return "Ocean container";
  }
  if (value === "US_TO_CANADA_TRANSFER") {
    return "US-to-Canada transfer";
  }
  return value;
}

function allocationMethodLabel(value: string): string {
  if (value === "EQUAL_SPLIT") {
    return "Equal split";
  }
  if (value === "MANUAL_AMOUNT") {
    return "Manual amount";
  }
  if (value === "MANUAL_PERCENT") {
    return "Manual percent";
  }
  return value;
}

function wageFileTypeLabel(value: string): string {
  if (value.includes("JSON")) {
    return "Settlement JSON";
  }
  if (value.includes("HTML")) {
    return "HTML task report";
  }
  return value;
}

function finiteMoney(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function currentSettlementMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function toApiClientError(error: unknown, fallbackMessage: string): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "UNLOADING_WAGE_LOAD_FAILED",
    message: error instanceof Error ? error.message : fallbackMessage,
    status: 0,
  });
}
