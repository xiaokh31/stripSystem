import Link from "next/link";
import { formatDateTime } from "@/components/imports/import-detail-flow";
import {
  ApiClientError,
  listMyLoadJobOperatorHistory,
  type AuthUserResponse,
  type LoadJobOperatorHistoryItemResponse,
  type LoadJobOperatorHistoryResponse,
  type ScannedPalletResponse,
} from "@/lib/api-client";
import { AUTH_REDIRECT_PARAM } from "@/lib/auth-token";
import { canViewMobileLoadJobs } from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MOBILE_HISTORY_PATH = "/mobile/load-jobs/history";

type OperatorHistoryState =
  | {
      history: LoadJobOperatorHistoryResponse;
      ok: true;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function MobileLoadJobHistoryPage() {
  const currentUser = await getServerCurrentUser();

  if (!currentUser) {
    return <MobileLoginRequired nextPath={MOBILE_HISTORY_PATH} />;
  }

  if (!canViewMobileLoadJobs(currentUser)) {
    return <MobilePermissionDenied currentUser={currentUser} />;
  }

  const state = await loadOperatorHistory();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-3 py-4 sm:px-5">
      <section className="border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Mobile loading history
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              My completed load jobs
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Signed in as {currentUser.name ?? currentUser.email ?? currentUser.id}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-12 items-center border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/mobile/load-jobs"
            >
              Open jobs
            </Link>
            <Link
              className="inline-flex min-h-12 items-center border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-950 hover:bg-zinc-50"
              href={MOBILE_HISTORY_PATH}
            >
              Refresh
            </Link>
          </div>
        </div>
      </section>

      {state.ok ? (
        <OperatorHistoryList history={state.history} />
      ) : (
        <ApiErrorPanel error={state.error} />
      )}
    </main>
  );
}

async function loadOperatorHistory(): Promise<OperatorHistoryState> {
  try {
    const history = await listMyLoadJobOperatorHistory(
      {
        limit: PAGE_SIZE,
        offset: 0,
      },
      await getServerApiOptions(),
    );

    return { history, ok: true };
  } catch (error) {
    return {
      error: toApiClientError(error, "Loading history could not be loaded."),
      ok: false,
    };
  }
}

function OperatorHistoryList({
  history,
}: {
  history: LoadJobOperatorHistoryResponse;
}) {
  if (history.items.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-5 text-base text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-950">
          No completed loading history
        </h2>
        <p className="mt-2 leading-7">
          Completed load jobs will appear here after you tap Complete loading on
          the mobile scan page.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      {history.items.map((item) => (
        <OperatorHistoryCard item={item} key={item.id} />
      ))}
    </section>
  );
}

function OperatorHistoryCard({
  item,
}: {
  item: LoadJobOperatorHistoryItemResponse;
}) {
  const palletGroups = groupPalletsByContainer(item.pallets);

  return (
    <article className="border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="break-all text-2xl font-bold text-zinc-950">
            {item.destinationRegion ?? "No destination region"}
          </p>
          <h2 className="mt-1 break-all text-base font-semibold text-zinc-700">
            {item.loadNo ?? item.id}
          </h2>
        </div>
        <span className="inline-flex min-h-8 items-center border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-semibold uppercase text-zinc-700">
          Completed
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <DetailItem label="Truck No." value={item.truckNo ?? "No truck"} />
        <DetailItem label="Dock No." value={item.dockNo ?? "No dock"} />
        <DetailItem label="Carrier" value={item.carrier ?? "No carrier"} />
        <DetailItem
          label="Departure"
          value={formatOptionalDate(item.scheduledDepartureAt)}
        />
        <DetailItem
          label="Loaded at"
          value={formatOptionalDate(item.completedAt)}
        />
        <DetailItem label="Total pallets" value={String(item.totalPallets)} />
      </dl>

      <section className="mt-4 border-t border-zinc-100 pt-3">
        <h3 className="text-sm font-semibold uppercase text-zinc-500">
          Loaded pallets
        </h3>
        {palletGroups.length ? (
          <ul className="mt-2 grid gap-2 text-sm text-zinc-700">
            {palletGroups.map((group) => (
              <li className="border-l-4 border-teal-600 bg-zinc-50 px-3 py-2" key={group.containerNo}>
                <span className="font-semibold text-zinc-950">
                  {group.containerNo}
                </span>
                <span className="ml-2">
                  {group.count} pallet{group.count === 1 ? "" : "s"}
                </span>
                <p className="mt-1 break-all text-xs leading-5 text-zinc-600">
                  {group.palletIds.join(", ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">
            No system pallets were recorded for this completed load job.
          </p>
        )}
      </section>
    </article>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function groupPalletsByContainer(pallets: ScannedPalletResponse[]) {
  const groups = new Map<
    string,
    {
      containerNo: string;
      count: number;
      palletIds: string[];
    }
  >();

  for (const pallet of pallets) {
    const containerNo = pallet.containerNo || "Unknown container";
    const existing = groups.get(containerNo) ?? {
      containerNo,
      count: 0,
      palletIds: [],
    };
    existing.count += 1;
    existing.palletIds.push(pallet.palletId);
    groups.set(containerNo, existing);
  }

  return Array.from(groups.values());
}

function MobileLoginRequired({ nextPath }: { nextPath: string }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-3 py-4 sm:px-5">
      <section
        className="border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold uppercase">Authentication</p>
        <h1 className="mt-2 text-2xl font-semibold">
          Sign in to view loading history
        </h1>
        <Link
          className="mt-4 inline-flex min-h-12 items-center border border-amber-700 bg-white px-4 text-base font-semibold text-amber-950 hover:bg-amber-100"
          href={loginHref(nextPath)}
        >
          Sign in
        </Link>
      </section>
    </main>
  );
}

function MobilePermissionDenied({
  currentUser,
}: {
  currentUser: AuthUserResponse;
}) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-3 py-4 sm:px-5">
      <section
        className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold uppercase">Permission denied</p>
        <h1 className="mt-2 text-2xl font-semibold">
          Loading history is not available
        </h1>
        <p className="mt-2 leading-7">
          The signed-in user does not have load job read permission.
        </p>
        <p className="mt-3 break-all text-sm font-medium">
          Signed in as {currentUser.email ?? currentUser.name ?? currentUser.id}
        </p>
      </section>
    </main>
  );
}

function ApiErrorPanel({ error }: { error: ApiClientError }) {
  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-lg font-semibold">Loading history unavailable</h2>
      <p className="mt-2">{error.message}</p>
      <p className="mt-2 text-xs font-semibold uppercase">
        {error.code}
        {error.status ? ` (${error.status})` : ""}
      </p>
    </section>
  );
}

function formatOptionalDate(value: string | null): string {
  return value ? formatDateTime(value) : "Not recorded";
}

function toApiClientError(error: unknown, fallback: string): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "WEB_API_ERROR",
    message: error instanceof Error ? error.message : fallback,
    status: 0,
  });
}

function loginHref(nextPath: string): string {
  return `/login?${AUTH_REDIRECT_PARAM}=${encodeURIComponent(nextPath)}`;
}
