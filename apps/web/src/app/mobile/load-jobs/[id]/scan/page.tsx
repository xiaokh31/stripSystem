import Link from "next/link";
import { MobileScanPanel } from "@/components/mobile/mobile-scan-panel";
import {
  loadJobDisplayName,
  loadJobLineLabel,
  loadJobPlanContext,
} from "@/components/mobile/load-job-flow";
import {
  ApiClientError,
  getLoadJob,
  type AuthUserResponse,
  type LoadJobResponse,
} from "@/lib/api-client";
import { AUTH_REDIRECT_PARAM } from "@/lib/auth-token";
import {
  canCompleteMobileLoadJob,
  canReverseMobileScans,
  canSaveMobileDock,
  canScanMobilePallets,
  canSupervisorOverrideScans,
  canViewMobileLoadJobs,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type MobileScanPageState =
  | {
      loadJob: LoadJobResponse;
      ok: true;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function MobileLoadJobScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await getServerCurrentUser();
  const nextPath = mobileScanPath(id);

  if (!currentUser) {
    return <MobileLoginRequired nextPath={nextPath} />;
  }

  if (!canViewMobileLoadJobs(currentUser)) {
    return <MobilePermissionDenied currentUser={currentUser} />;
  }

  const state = await loadScanPage(id);

  if (!state.ok) {
    return <ScanPageError error={state.error} id={id} />;
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-3 py-4 sm:px-5">
      <section className="border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Mobile loading scan
            </p>
            <h1 className="mt-2 break-all text-2xl font-semibold text-zinc-950">
              {loadJobDisplayName(state.loadJob)}
            </h1>
            <p className="mt-2 text-base font-medium text-zinc-600">
              {loadJobPlanContext(state.loadJob)}
            </p>
          </div>
          <Link
            className="inline-flex min-h-12 items-center border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/mobile/load-jobs"
          >
            Change load job
          </Link>
        </div>
      </section>

      <LoadJobPlanPanel loadJob={state.loadJob} />
      <MobileScanPanel
        currentUser={currentUser}
        initialLoadJob={state.loadJob}
        permissions={{
          canCompleteLoadJob: canCompleteMobileLoadJob(currentUser),
          canReverseScan: canReverseMobileScans(currentUser),
          canSaveDockNo: canSaveMobileDock(currentUser),
          canScan: canScanMobilePallets(currentUser),
          canSupervisorOverride: canSupervisorOverrideScans(currentUser),
        }}
      />
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
          Sign in to scan pallets
        </h1>
        <p className="mt-2 leading-7">
          The scan page needs a valid API session before showing load job data or
          accepting queued scans.
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
          This account cannot open mobile load jobs
        </h1>
        <p className="mt-2 leading-7">
          The signed-in user needs load job read permission before scan actions
          can be shown.
        </p>
        <p className="mt-3 break-all text-sm font-medium">
          Signed in as {currentUser.email ?? currentUser.name ?? currentUser.id}
        </p>
      </section>
    </main>
  );
}

async function loadScanPage(id: string): Promise<MobileScanPageState> {
  try {
    return {
      loadJob: await getLoadJob(id, await getServerApiOptions()),
      ok: true,
    };
  } catch (error) {
    return {
      error: toApiClientError(error, "Load job could not be loaded."),
      ok: false,
    };
  }
}

function LoadJobPlanPanel({ loadJob }: { loadJob: LoadJobResponse }) {
  return (
    <section className="border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Internal" value={loadJob.plannedPalletCount} />
        <Metric label="External" value={loadJob.externalPalletCount} />
        <Metric label="Loaded" value={loadJob.palletCount} />
      </dl>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-3 font-semibold">Plan line</th>
              <th className="px-3 py-3 font-semibold">Type</th>
              <th className="px-3 py-3 text-right font-semibold">Pallets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loadJob.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-3 py-3">
                  <span className="break-all font-semibold text-zinc-950">
                    {loadJobLineLabel(line)}
                  </span>
                  {line.destinationCode ? (
                    <span className="mt-1 block text-xs text-zinc-500">
                      Destination {line.destinationCode}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex min-h-7 items-center border border-zinc-200 bg-zinc-50 px-2 text-xs font-semibold uppercase text-zinc-700">
                    {line.externalTransfer ? "External" : "System"}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">
                  {line.plannedPallets}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-semibold uppercase text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">
        {value}
      </dd>
    </div>
  );
}

function ScanPageError({ error, id }: { error: ApiClientError; id: string }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-3 py-4 sm:px-5">
      <section
        className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
        role="alert"
      >
        <h1 className="text-xl font-semibold">Load job could not be opened</h1>
        <p className="mt-2 break-all text-sm">Requested load job: {id}</p>
        <p className="mt-3">{error.message}</p>
        <p className="mt-2 text-xs font-semibold uppercase">
          {error.code}
          {error.status ? ` (${error.status})` : ""}
        </p>
        <Link
          className="mt-4 inline-flex min-h-12 items-center border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-950 hover:bg-zinc-50"
          href="/mobile/load-jobs"
        >
          Back to load jobs
        </Link>
      </section>
    </main>
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

function mobileScanPath(id: string): string {
  return `/mobile/load-jobs/${encodeURIComponent(id)}/scan`;
}

function loginHref(nextPath: string): string {
  return `/login?${AUTH_REDIRECT_PARAM}=${encodeURIComponent(nextPath)}`;
}
