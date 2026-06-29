import Link from "next/link";
import { LoadJobCard } from "@/components/load-jobs/load-job-card";
import { LoadJobPlanningForm } from "@/components/load-jobs/load-job-planning-form";
import {
  ApiClientError,
  listLoadJobs,
  type LoadJobListResponse,
} from "@/lib/api-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type LoadJobsPageState =
  | {
      loadJobs: LoadJobListResponse;
      ok: true;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function LoadJobsPage() {
  const state = await loadLoadJobs();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Office loading
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Load jobs
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Publish truck departure plans before warehouse staff scan pallet
              labels. A load job can mix system pallets and external transfer
              freight.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/load-jobs/history"
            >
              History
            </Link>
            <Link
              className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/load-jobs"
            >
              Refresh
            </Link>
            <Link
              className="inline-flex min-h-11 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
              href="/mobile/load-jobs"
            >
              Mobile scan
            </Link>
          </div>
        </div>
      </section>

      <LoadJobPlanningForm />

      {state.ok ? (
        <LoadJobHistory loadJobs={state.loadJobs} />
      ) : (
        <ApiErrorPanel error={state.error} />
      )}
    </main>
  );
}

async function loadLoadJobs(): Promise<LoadJobsPageState> {
  try {
    const loadJobs = await listLoadJobs({ limit: PAGE_SIZE, offset: 0 });
    return { loadJobs, ok: true };
  } catch (error) {
    return { error: toApiClientError(error), ok: false };
  }
}

function LoadJobHistory({ loadJobs }: { loadJobs: LoadJobListResponse }) {
  if (loadJobs.items.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          No load jobs recorded
        </h2>
        <p className="mt-2 max-w-2xl leading-6">
          Publish the first truck departure plan above. Open jobs will appear on
          the mobile scan page.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Recent load jobs
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Showing {loadJobs.items.length} latest records from the load job
            API.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-medium text-zinc-500">
            Limit {loadJobs.limit}, offset {loadJobs.offset}
          </p>
          <Link
            className="inline-flex min-h-9 items-center border border-zinc-300 bg-white px-3 text-xs font-semibold uppercase text-zinc-700 hover:border-teal-700 hover:text-teal-900"
            href="/load-jobs/history"
          >
            View history
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {loadJobs.items.map((loadJob) => (
          <LoadJobCard key={loadJob.id} loadJob={loadJob} />
        ))}
      </div>
    </section>
  );
}

function ApiErrorPanel({ error }: { error: ApiClientError }) {
  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">Load jobs could not be loaded</h2>
      <p className="mt-2 text-sm">{error.message}</p>
      <p className="mt-2 text-xs font-semibold uppercase">
        {error.code}
        {error.status ? ` (${error.status})` : ""}
      </p>
    </section>
  );
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "WEB_API_ERROR",
    message: error instanceof Error ? error.message : "Unknown API error",
    status: 0,
  });
}
