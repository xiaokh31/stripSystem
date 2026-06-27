import Link from "next/link";
import { ContainerDestinationCorrections } from "@/components/containers/container-destination-corrections";
import { formatNullable, issueList } from "@/components/containers/container-detail-flow";
import {
  ApiClientError,
  getContainerDetail,
  type ContainerDetailResponse,
} from "@/lib/api-client";

export const dynamic = "force-dynamic";

type ContainerDetailState =
  | {
      container: ContainerDetailResponse;
      ok: true;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function ContainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const state = await loadContainerDetail(id);

  if (!state.ok) {
    return <ContainerDetailError error={state.error} id={id} />;
  }

  const containerIssues = [
    ...issueList(state.container.warnings),
    ...issueList(state.container.errors),
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Container detail
            </p>
            <h1 className="mt-2 break-all text-2xl font-semibold text-zinc-950">
              {state.container.containerNo}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href={`/imports/${state.container.importFileId}`}
            >
              Import detail
            </Link>
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/containers"
            >
              Containers
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-950">
            Container status
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <DetailRow label="Container No." value={state.container.containerNo} />
            <DetailRow
              label="Company"
              value={formatNullable(state.container.company)}
            />
            <DetailRow
              label="Status"
              value={<StatusBadge status={state.container.status} />}
            />
            <DetailRow
              label="Total cartons"
              value={state.container.totalCartons}
            />
            <DetailRow
              label="Total volume"
              value={`${state.container.totalVolumeCbm} CBM`}
            />
            <DetailRow label="Format" value={state.container.sourceFormat} />
            <DetailRow
              label="Parser"
              value={formatNullable(state.container.parserVersion)}
            />
          </dl>
        </div>

        <section className="border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-950">
            Destination summary
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <DetailRow
              label="Destinations"
              value={state.container.destinations.length}
            />
            <DetailRow
              label="Final pallets"
              value={state.container.destinations.reduce(
                (total, destination) => total + destination.finalPallets,
                0,
              )}
            />
            <DetailRow
              label="Manual overrides"
              value={
                state.container.destinations.filter(
                  (destination) => destination.manualPallets !== null,
                ).length
              }
            />
            <DetailRow
              label="Warnings"
              value={state.container.destinations.reduce(
                (total, destination) =>
                  total +
                  issueList(destination.warnings).length +
                  issueList(destination.errors).length,
                0,
              )}
            />
          </dl>
        </section>
      </section>

      {containerIssues.length > 0 ? (
        <section className="border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <h2 className="text-base font-semibold">Container warnings</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {containerIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ContainerDestinationCorrections
        destinations={state.container.destinations}
      />
    </main>
  );
}

async function loadContainerDetail(id: string): Promise<ContainerDetailState> {
  try {
    return { container: await getContainerDetail(id), ok: true };
  } catch (error) {
    return { error: toApiClientError(error), ok: false };
  }
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-t border-zinc-100 pt-3 sm:grid-cols-[140px_minmax(0,1fr)]">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = statusBadgeStyles(status);

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase ${styles}`}
    >
      {status}
    </span>
  );
}

function statusBadgeStyles(status: string): string {
  if (status === "PARSED" || status === "LABELS_GENERATED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "CORRECTED" || status === "REPORT_GENERATED") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "ERROR") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function ContainerDetailError({
  error,
  id,
}: {
  error: ApiClientError;
  id: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section
        className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold uppercase">Container load failed</p>
        <h1 className="mt-2 text-xl font-semibold">
          Container {id} could not be loaded
        </h1>
        <p className="mt-3 text-sm">
          {error.code}
          {error.status ? ` (${error.status})` : ""}: {error.message}
        </p>
      </section>
      <Link
        className="inline-flex min-h-10 w-fit items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
        href="/containers"
      >
        Containers
      </Link>
    </main>
  );
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "CONTAINER_DETAIL_LOAD_FAILED",
    message:
      error instanceof Error
        ? error.message
        : "The container detail could not be loaded.",
    status: 0,
  });
}
