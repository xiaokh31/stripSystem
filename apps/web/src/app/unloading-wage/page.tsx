import Link from "next/link";
import {
  CompletePayContainerPanel,
  CreatePayContainerPanel,
  SettlementGeneratePanel,
} from "@/components/wage/unloading-wage-actions";
import {
  formatDateTime,
  formatMoney,
  formatUnknownList,
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
import { getServerApiOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

interface UnloadingWageSearchParams {
  settlementId?: string | string[];
  settlementMonth?: string | string[];
}

interface UnloadingWageState {
  payContainers: PayContainerResponse[];
  payContainersError: ApiClientError | null;
  selectedSettlement: UnloadingWageSettlementResponse | null;
  settlements: UnloadingWageSettlementResponse[];
  settlementsError: ApiClientError | null;
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
  const state = await loadUnloadingWageState(
    settlementMonth,
    requestedSettlementId,
  );

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
              Review pay containers, complete unloading assignments, and
              generate monthly worker settlement from the wage API.
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

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SettlementGeneratePanel defaultSettlementMonth={settlementMonth} />
        <SettlementMonthFilter settlementMonth={settlementMonth} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <CreatePayContainerPanel
          defaultClassification="OCEAN_CONTAINER"
          title="Create pay container by container ids"
        />
        <CompletePayContainerPanel title="Complete unloading by pay container id" />
      </section>

      {state.payContainersError ? (
        <ApiErrorPanel
          error={state.payContainersError}
          title="Pay containers could not be loaded"
        />
      ) : (
        <PayContainerTable payContainers={state.payContainers} />
      )}

      {state.settlementsError ? (
        <ApiErrorPanel
          error={state.settlementsError}
          title="Settlements could not be loaded"
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <SettlementHistory
            selectedSettlementId={state.selectedSettlement?.id ?? null}
            settlementMonth={settlementMonth}
            settlements={state.settlements}
          />
          {state.selectedSettlement ? (
            <SettlementDetail settlement={state.selectedSettlement} />
          ) : (
            <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
              No settlement is selected for review.
            </section>
          )}
        </section>
      )}
    </main>
  );
}

async function loadUnloadingWageState(
  settlementMonth: string,
  requestedSettlementId: string | null,
): Promise<UnloadingWageState> {
  const apiOptions = await getServerApiOptions();
  const [payContainersResult, settlementsResult] = await Promise.allSettled([
    listPayContainers({ limit: 50, offset: 0 }, apiOptions),
    listUnloadingWageSettlements(apiOptions),
  ]);
  const settlements =
    settlementsResult.status === "fulfilled"
      ? settlementsResult.value.items
      : [];
  const selectedSettlement =
    settlements.find((item) => item.id === requestedSettlementId) ??
    settlements.find((item) => item.settlementMonth === settlementMonth) ??
    settlements[0] ??
    null;

  return {
    payContainers:
      payContainersResult.status === "fulfilled"
        ? payContainersResult.value.items
        : [],
    payContainersError:
      payContainersResult.status === "rejected"
        ? toApiClientError(payContainersResult.reason, "Pay container list failed.")
        : null,
    selectedSettlement,
    settlements,
    settlementsError:
      settlementsResult.status === "rejected"
        ? toApiClientError(settlementsResult.reason, "Settlement list failed.")
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

function PayContainerTable({
  payContainers,
}: {
  payContainers: PayContainerResponse[];
}) {
  if (payContainers.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          No pay containers
        </h2>
        <p className="mt-2 max-w-2xl leading-6">
          Create pay containers from reviewed container records before monthly
          settlement.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Pay containers
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Recent pay units from the unloading wage API.
          </p>
        </div>
        <p className="text-xs font-medium text-zinc-500">
          {payContainers.length} pay container(s)
        </p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <th className="px-3 py-3 font-semibold">Pay container</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Classification</th>
              <th className="px-3 py-3 font-semibold">Containers</th>
              <th className="px-3 py-3 font-semibold">Completed</th>
              <th className="px-3 py-3 text-right font-semibold">Rate</th>
              <th className="px-3 py-3 font-semibold">Unloaders</th>
            </tr>
          </thead>
          <tbody>
            {payContainers.map((payContainer) => (
              <tr
                className="border-b border-zinc-100 align-top"
                key={payContainer.id}
              >
                <td className="px-3 py-4">
                  <p className="break-all font-semibold text-zinc-950">
                    {payContainer.payContainerNo}
                  </p>
                  <p className="mt-1 break-all text-xs text-zinc-500">
                    {payContainer.id}
                  </p>
                </td>
                <td className="px-3 py-4">
                  <StatusBadge status={payContainer.status} />
                </td>
                <td className="px-3 py-4">
                  <p>{payContainer.classification}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {payContainer.trailerNumber ?? "-"}
                  </p>
                </td>
                <td className="px-3 py-4">
                  {payContainer.containers.map((container) => (
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
                  {formatDateTime(payContainer.completedAt)}
                </td>
                <td className="px-3 py-4 text-right font-semibold">
                  {formatMoney(payContainer.rateAmount, payContainer.currency)}
                </td>
                <td className="px-3 py-4">
                  {payContainer.unloaders.length === 0
                    ? "-"
                    : payContainer.unloaders
                        .map(
                          (unloader) =>
                            `${unloader.workerName} (${unloader.workerCode})`,
                        )
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

function SettlementHistory({
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
        Settlement history
      </h2>
      {settlements.length === 0 ? (
        <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
          No unloading wage settlements generated yet.
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
              allocation line(s)
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
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[620px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <th className="px-3 py-3 font-semibold">Worker</th>
                <th className="px-3 py-3 text-right font-semibold">
                  Pay containers
                </th>
                <th className="px-3 py-3 text-right font-semibold">Amount</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-zinc-950">
          Settlement detail rows
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <th className="px-3 py-3 font-semibold">Worker</th>
                <th className="px-3 py-3 font-semibold">Pay container</th>
                <th className="px-3 py-3 font-semibold">Classification</th>
                <th className="px-3 py-3 font-semibold">Containers</th>
                <th className="px-3 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {settlement.lines.map((line) => (
                <tr className="border-b border-zinc-100" key={line.id}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-zinc-950">
                      {line.workerName}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {line.workerCode}
                    </p>
                  </td>
                  <td className="px-3 py-3 font-medium">
                    {line.payContainerNo}
                  </td>
                  <td className="px-3 py-3">
                    <p>{line.classification}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {line.trailerNumber ?? "-"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {formatUnknownList(line.containerNumbers)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">
                    {formatMoney(line.amount, settlement.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                  <p className="text-sm font-semibold text-zinc-950">
                    {file.fileType}
                  </p>
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
