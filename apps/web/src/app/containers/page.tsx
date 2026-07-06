import Link from "next/link";
import {
  ApiClientError,
  getContainerInventorySummary,
  type ContainerSummaryItemResponse,
} from "@/lib/api-client";
import { containerStatusLabel } from "@/components/containers/container-files-flow";
import { getServerApiOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type ContainersPageState =
  | {
      containers: ContainerSummaryItemResponse[];
      ok: true;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function ContainersPage() {
  const state = await loadContainers();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Office
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Containers
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Review imported and manual containers, inspect inventory progress,
              update lifecycle status, and open report or label actions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/containers"
            >
              Refresh
            </Link>
            <Link
              className="inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
              href="/containers/new"
            >
              Create manual unloading report
            </Link>
          </div>
        </div>
      </section>

      {state.ok ? (
        <ContainerTable containers={state.containers} />
      ) : (
        <ApiErrorPanel error={state.error} />
      )}
    </main>
  );
}

async function loadContainers(): Promise<ContainersPageState> {
  try {
    const result = await getContainerInventorySummary(
      {},
      await getServerApiOptions(),
    );
    return { containers: result.items, ok: true };
  } catch (error) {
    return { error: toApiClientError(error), ok: false };
  }
}

function ContainerTable({
  containers,
}: {
  containers: ContainerSummaryItemResponse[];
}) {
  if (containers.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          No containers recorded
        </h2>
        <p className="mt-2 max-w-2xl leading-6">
          Upload and parse a real unloading list, or create a manual unloading
          report when the customer workbook is unsupported.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Container index
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Status and remaining pallets are calculated by the API from
            persisted container and pallet records.
          </p>
        </div>
        <p className="text-xs font-medium text-zinc-500">
          {containers.length} container(s)
        </p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <th className="px-3 py-3 font-semibold">Container</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 text-right font-semibold">Pallets</th>
              <th className="px-3 py-3 text-right font-semibold">Loaded</th>
              <th className="px-3 py-3 text-right font-semibold">Remaining</th>
              <th className="px-3 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((container) => (
              <tr className="border-b border-zinc-100" key={container.containerId}>
                <td className="px-3 py-4 font-semibold text-zinc-950">
                  {container.containerNo}
                </td>
                <td className="px-3 py-4">
                  <StatusBadge status={container.status} />
                </td>
                <td className="px-3 py-4 text-right font-medium">
                  {container.totalPallets}
                </td>
                <td className="px-3 py-4 text-right font-medium">
                  {container.loadedPallets}
                </td>
                <td className="px-3 py-4 text-right font-medium">
                  {container.remainingPallets}
                </td>
                <td className="px-3 py-4">
                  <Link
                    className="font-semibold text-teal-700 underline hover:text-teal-900"
                    href={`/containers/${container.containerId}`}
                  >
                    Open
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

function StatusBadge({ status }: { status: string }) {
  const styles = statusBadgeStyles(status);

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase ${styles}`}
    >
      {containerStatusLabel(status)}
    </span>
  );
}

function statusBadgeStyles(status: string): string {
  if (status === "PARSED" || status === "LABELS_GENERATED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "UNLOADED") {
    return "border-teal-200 bg-teal-50 text-teal-800";
  }
  if (status === "LOADING_IN_PROGRESS") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (status === "LOADED") {
    return "border-zinc-300 bg-zinc-100 text-zinc-800";
  }
  if (status === "CORRECTED" || status === "REPORT_GENERATED") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "ERROR") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function ApiErrorPanel({ error }: { error: ApiClientError }) {
  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">Containers could not be loaded</h2>
      <p className="mt-2 text-sm">{error.message}</p>
      <p className="mt-2 text-xs font-medium">
        {error.code} {error.status ? `(${error.status})` : ""}
      </p>
    </section>
  );
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "CONTAINER_LIST_LOAD_FAILED",
    message:
      error instanceof Error
        ? error.message
        : "The container list could not be loaded.",
    status: 0,
  });
}
