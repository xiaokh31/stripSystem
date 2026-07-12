import Link from "next/link";
import { LoadJobCard } from "@/components/load-jobs/load-job-card";
import { LoadJobPlanningForm } from "@/components/load-jobs/load-job-planning-form";
import {
  ApiClientError,
  listLoadJobs,
  type AuthUserResponse,
  type LoadJobListResponse,
} from "@/lib/api-client";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import {
  canManageOfficeLoadJobs,
  canViewMobileLoadJobs,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

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
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  const currentUser = await getServerCurrentUser();

  if (!canManageOfficeLoadJobs(currentUser)) {
    return <LoadJobManagementDenied currentUser={currentUser} locale={locale} />;
  }

  const state = await loadLoadJobs();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Office loading")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Load jobs")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              {t(
                "Publish truck departure plans before warehouse staff scan pallet labels. A load job can mix system pallets and external transfer freight.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/load-jobs/history"
            >
              {t("History")}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/load-jobs"
            >
              {t("Refresh")}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
              href="/mobile/load-jobs"
            >
              {t("Mobile scan")}
            </Link>
          </div>
        </div>
      </section>

      <LoadJobPlanningForm />

      {state.ok ? (
        <LoadJobHistory loadJobs={state.loadJobs} locale={locale} />
      ) : (
        <ApiErrorPanel error={state.error} locale={locale} />
      )}
    </main>
  );
}

function LoadJobManagementDenied({
  currentUser,
  locale,
}: {
  currentUser: AuthUserResponse | null;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section
        className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold uppercase">
          {t("Permission denied")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          {t("Office load job management is not available")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6">
          {t(
            "This page is for office staff to create and maintain truck plans. Warehouse users should use the mobile scan page for in-progress load jobs, dock updates, pallet scans, and scan reversals.",
          )}
        </p>
        {currentUser ? (
          <p className="mt-3 break-all text-sm font-medium">
            {format("i18n.loadJobs.signedInAs", {
              user: currentUser.email ?? currentUser.name ?? currentUser.id,
            })}
          </p>
        ) : null}
        {canViewMobileLoadJobs(currentUser) ? (
          <Link
            className="mt-4 inline-flex min-h-11 items-center border border-red-300 bg-white px-4 text-sm font-semibold text-red-950 hover:bg-red-100"
            href="/mobile/load-jobs"
          >
            {t("Open mobile scan")}
          </Link>
        ) : null}
      </section>
    </main>
  );
}

async function loadLoadJobs(): Promise<LoadJobsPageState> {
  try {
    const loadJobs = await listLoadJobs(
      { limit: PAGE_SIZE, offset: 0 },
      await getServerApiOptions(),
    );
    return { loadJobs, ok: true };
  } catch (error) {
    return { error: toApiClientError(error), ok: false };
  }
}

function LoadJobHistory({
  loadJobs,
  locale,
}: {
  loadJobs: LoadJobListResponse;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);
  const showingText = format("i18n.loadJobs.latestSummary", {
    count: loadJobs.items.length,
  });
  const limitText = format("i18n.loadJobs.pagination", {
    limit: loadJobs.limit,
    offset: loadJobs.offset,
  });

  if (loadJobs.items.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          {t("No load jobs recorded")}
        </h2>
        <p className="mt-2 max-w-2xl leading-6">
          {t(
            "Publish the first truck departure plan above. Open jobs will appear on the mobile scan page.",
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Recent load jobs")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">{showingText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-medium text-zinc-500">{limitText}</p>
          <Link
            className="inline-flex min-h-9 items-center border border-zinc-300 bg-white px-3 text-xs font-semibold uppercase text-zinc-700 hover:border-teal-700 hover:text-teal-900"
            href="/load-jobs/history"
          >
            {t("View history")}
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {loadJobs.items.map((loadJob) => (
          <LoadJobCard key={loadJob.id} loadJob={loadJob} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function ApiErrorPanel({
  error,
  locale,
}: {
  error: ApiClientError;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);

  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">
        {t("Load jobs could not be loaded")}
      </h2>
      <p className="mt-2 text-sm">{loadJobListErrorMessage(error, locale)}</p>
      <p className="mt-2 text-xs font-semibold uppercase" data-i18n-ignore>
        {error.code}
        {error.status ? ` (${error.status})` : ""}
      </p>
    </section>
  );
}

const loadJobListErrorKeys: Record<string, MessageKey> = {
  API_NETWORK_ERROR: "Load jobs could not be loaded",
  WEB_API_ERROR: "Load jobs could not be loaded",
};

function loadJobListErrorMessage(error: ApiClientError, locale: Locale): string {
  const { t } = createTranslator(locale);
  const knownKey = loadJobListErrorKeys[error.code];
  return t(knownKey ?? "Load jobs could not be loaded");
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
