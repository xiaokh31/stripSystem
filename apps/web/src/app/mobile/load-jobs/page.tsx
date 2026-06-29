import Link from "next/link";
import { formatDateTime } from "@/components/imports/import-detail-flow";
import {
  loadJobDisplayName,
  loadJobLineLabel,
  mobileLoadJobScanHref,
} from "@/components/mobile/load-job-flow";
import {
  ApiClientError,
  listLoadJobs,
  type AuthUserResponse,
  type LoadJobListResponse,
  type LoadJobResponse,
} from "@/lib/api-client";
import { AUTH_REDIRECT_PARAM } from "@/lib/auth-token";
import {
  canManageAccounts,
  canManageOfficeLoadJobs,
  canViewMobileLoadJobs,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MOBILE_LOAD_JOBS_PATH = "/mobile/load-jobs";

type MobileLoadJobsState =
  | {
      loadJobs: LoadJobListResponse;
      ok: true;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function MobileLoadJobsPage() {
  const currentUser = await getServerCurrentUser();

  if (!currentUser) {
    return <MobileLoginRequired nextPath={MOBILE_LOAD_JOBS_PATH} />;
  }

  if (!canViewMobileLoadJobs(currentUser)) {
    return <MobilePermissionDenied currentUser={currentUser} />;
  }

  const state = await loadOpenLoadJobs();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-3 py-4 sm:px-5">
      <section className="border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Mobile loading
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Select open load job
            </h1>
          </div>
          <Link
            className="inline-flex min-h-12 items-center border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/mobile/load-jobs"
          >
            Refresh
          </Link>
        </div>
      </section>

      <MobileUserPanel currentUser={currentUser} />

      {state.ok ? (
        <LoadJobList
          canOpenOfficeLoadJobs={canManageOfficeLoadJobs(currentUser)}
          loadJobs={state.loadJobs}
        />
      ) : (
        <ApiErrorPanel error={state.error} />
      )}
    </main>
  );
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
          Sign in to use mobile loading
        </h1>
        <p className="mt-2 leading-7">
          Mobile load jobs are only loaded after the API confirms the current
          user. No placeholder load jobs are shown without a valid session.
        </p>
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
          Mobile load jobs are not available
        </h1>
        <p className="mt-2 leading-7">
          The signed-in user does not have load job read permission. Ask an
          administrator to assign a warehouse, office, or admin role with mobile
          loading access.
        </p>
        <p className="mt-3 break-all text-sm font-medium">
          Signed in as {currentUser.email ?? currentUser.name ?? currentUser.id}
        </p>
      </section>
    </main>
  );
}

function MobileUserPanel({
  currentUser,
}: {
  currentUser: AuthUserResponse;
}) {
  return (
    <section className="border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-zinc-950">
            Signed in as{" "}
            {currentUser.name ?? currentUser.email ?? currentUser.id}
          </p>
          <p className="mt-1 break-all">
            Roles: {currentUser.roles.join(", ") || "None"}
          </p>
        </div>
        {canManageAccounts(currentUser) ? (
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/settings"
          >
            Account settings
          </Link>
        ) : null}
      </div>
    </section>
  );
}

async function loadOpenLoadJobs(): Promise<MobileLoadJobsState> {
  try {
    const loadJobs = await listLoadJobs(
      {
        limit: PAGE_SIZE,
        offset: 0,
        status: "IN_PROGRESS",
      },
      await getServerApiOptions(),
    );

    return { loadJobs, ok: true };
  } catch (error) {
    return {
      error: toApiClientError(error, "Open load jobs could not be loaded."),
      ok: false,
    };
  }
}

function LoadJobList({
  canOpenOfficeLoadJobs,
  loadJobs,
}: {
  canOpenOfficeLoadJobs: boolean;
  loadJobs: LoadJobListResponse;
}) {
  if (loadJobs.items.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-5 text-base text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-950">
          No open load jobs
        </h2>
        <p className="mt-2 leading-7">
          Ask the office to create or start a load job before scanning pallets.
        </p>
        {canOpenOfficeLoadJobs ? (
          <Link
            className="mt-4 inline-flex min-h-10 items-center border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50"
            href="/load-jobs"
          >
            Open load jobs
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      {loadJobs.items.map((loadJob) => (
        <LoadJobCard key={loadJob.id} loadJob={loadJob} />
      ))}
    </section>
  );
}

function LoadJobCard({ loadJob }: { loadJob: LoadJobResponse }) {
  const href = mobileLoadJobScanHref(loadJob.id);
  const visibleLines = loadJob.lines.slice(0, 4);
  const hiddenLineCount = Math.max(
    0,
    loadJob.lines.length - visibleLines.length,
  );

  return (
    <Link
      className="block border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-teal-700 hover:bg-teal-50"
      href={href}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="break-all text-2xl font-bold text-zinc-950">
            {loadJob.destinationRegion?.trim() || "No destination region"}
          </p>
          <h2 className="mt-1 break-all text-base font-semibold text-zinc-700">
            {loadJobDisplayName(loadJob)}
          </h2>
          <p className="mt-1 text-sm font-medium text-zinc-600">
            {loadJob.truckNo?.trim() || "No truck"}
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold uppercase text-emerald-800">
          {loadJob.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric label="Internal" value={loadJob.plannedPalletCount} />
        <Metric label="External" value={loadJob.externalPalletCount} />
        <Metric label="Loaded" value={loadJob.palletCount} />
      </dl>

      <div className="mt-4 grid gap-2 text-sm text-zinc-700">
        <DetailRow
          label="Departure"
          valueClassName="text-lg"
          value={
            loadJob.scheduledDepartureAt
              ? formatDateTime(loadJob.scheduledDepartureAt)
              : "Not scheduled"
          }
        />
        <DetailRow label="Dock" value={loadJob.dockNo ?? "No dock"} />
        <DetailRow label="Carrier" value={loadJob.carrier ?? "No carrier"} />
      </div>

      <ul className="mt-4 grid gap-2 text-sm">
        {visibleLines.map((line) => (
          <li
            className="border-l-4 border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-700"
            key={line.id}
          >
            <span className="font-semibold">
              {line.externalTransfer ? "External transfer" : "System pallet"}
            </span>
            <span className="ml-2 break-all">{loadJobLineLabel(line)}</span>
          </li>
        ))}
        {hiddenLineCount ? (
          <li className="text-xs font-semibold uppercase text-zinc-500">
            {hiddenLineCount} more plan lines
          </li>
        ) : null}
      </ul>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">
        {value}
      </dd>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-t border-zinc-100 pt-2">
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className={`font-semibold text-zinc-950 ${valueClassName}`}>
        {value}
      </dd>
    </div>
  );
}

function ApiErrorPanel({ error }: { error: ApiClientError }) {
  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-lg font-semibold">Load jobs unavailable</h2>
      <p className="mt-2">{error.message}</p>
      <p className="mt-2 text-xs font-semibold uppercase">
        {error.code}
        {error.status ? ` (${error.status})` : ""}
      </p>
    </section>
  );
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
