import Link from "next/link";
import { LoadJobCard } from "@/components/load-jobs/load-job-card";
import {
  activeLoadJobHistoryFilterCount,
  loadJobHistoryStatusOptions,
  loadJobHistoryHref,
  normalizeLoadJobHistoryFilters,
  type LoadJobHistoryFilters,
  type LoadJobHistorySearchParams,
} from "@/components/load-jobs/load-job-history-flow";
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

type LoadJobHistoryState =
  | {
      loadJobs: LoadJobListResponse;
      ok: true;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function LoadJobHistoryPage({
  searchParams,
}: {
  searchParams: Promise<LoadJobHistorySearchParams>;
}) {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  const currentUser = await getServerCurrentUser();

  if (!canManageOfficeLoadJobs(currentUser)) {
    return <LoadJobHistoryDenied currentUser={currentUser} locale={locale} />;
  }

  const filters = normalizeLoadJobHistoryFilters(await searchParams);
  const state = await loadHistory(filters);
  const activeFilters = activeLoadJobHistoryFilterCount(filters);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Load job history")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Historical load jobs")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              {t(
                "Review planned, in-progress, and completed truck plans from the live API. Deleted planned jobs are removed from history; completed jobs stay locked for audit and do not show a delete action.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/load-jobs"
            >
              {t("Load Jobs")}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href={loadJobHistoryHref(filters)}
            >
              {t("Refresh")}
            </Link>
          </div>
        </div>
      </section>

      <HistoryFilterForm
        activeFilters={activeFilters}
        filters={filters}
        locale={locale}
      />

      {state.ok ? (
        <HistoryList filters={filters} loadJobs={state.loadJobs} locale={locale} />
      ) : (
        <ApiErrorPanel error={state.error} locale={locale} />
      )}
    </main>
  );
}

function LoadJobHistoryDenied({
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
          {t("Load job history is for office staff")}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6">
          {t(
            "Warehouse users can view current in-progress work from the mobile scan page. Office history and maintenance actions require load job management permission.",
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

async function loadHistory(
  filters: LoadJobHistoryFilters,
): Promise<LoadJobHistoryState> {
  try {
    const loadJobs = await listLoadJobs(filters, await getServerApiOptions());
    return { loadJobs, ok: true };
  } catch (error) {
    return { error: toApiClientError(error), ok: false };
  }
}

function HistoryFilterForm({
  activeFilters,
  filters,
  locale,
}: {
  activeFilters: number;
  filters: LoadJobHistoryFilters;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("History filters")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {activeFilters
              ? format("i18n.loadJobs.activeFilters", { count: activeFilters })
              : t("Showing all non-deleted load jobs.")}
          </p>
        </div>
        {activeFilters ? (
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/load-jobs/history"
          >
            {t("Clear filters")}
          </Link>
        ) : null}
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          <span>{t("Load No.")}</span>
          <input
            className="min-h-10 border border-zinc-300 bg-white px-3 text-zinc-950 outline-none focus:border-teal-700"
            defaultValue={filters.loadNo ?? ""}
            name="loadNo"
            type="text"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          <span>{t("Destination region")}</span>
          <input
            className="min-h-10 border border-zinc-300 bg-white px-3 text-zinc-950 outline-none focus:border-teal-700"
            defaultValue={filters.destinationRegion ?? ""}
            name="destinationRegion"
            type="text"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          <span>{t("Status")}</span>
          <select
            className="min-h-10 border border-zinc-300 bg-white px-3 text-zinc-950 outline-none focus:border-teal-700"
            defaultValue={filters.status ?? ""}
            name="status"
          >
            {loadJobHistoryStatusOptions(locale).map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            className="min-h-10 w-full border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            type="submit"
          >
            {t("Apply")}
          </button>
        </div>
      </form>
    </section>
  );
}

function HistoryList({
  filters,
  locale,
  loadJobs,
}: {
  filters: LoadJobHistoryFilters;
  locale: Locale;
  loadJobs: LoadJobListResponse;
}) {
  const { format, t } = createTranslator(locale);
  const hasPrevious = loadJobs.offset > 0;
  const hasNext = loadJobs.items.length === loadJobs.limit;
  const showingText = format("i18n.loadJobs.historySummary", {
    count: loadJobs.items.length,
    offset: loadJobs.offset,
  });

  if (loadJobs.items.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          {t("No load jobs match these filters")}
        </h2>
        <p className="mt-2 max-w-2xl leading-6">
          {t(
            "Completed jobs remain visible unless they were never created or a planned job was deleted before loading started.",
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
            {t("History results")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">{showingText}</p>
        </div>
        <PaginationControls
          filters={filters}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          limit={loadJobs.limit}
          locale={locale}
          offset={loadJobs.offset}
        />
      </div>

      <div className="mt-5 grid gap-3">
        {loadJobs.items.map((loadJob) => (
          <LoadJobCard key={loadJob.id} loadJob={loadJob} locale={locale} />
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <PaginationControls
          filters={filters}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          limit={loadJobs.limit}
          locale={locale}
          offset={loadJobs.offset}
        />
      </div>
    </section>
  );
}

function PaginationControls({
  filters,
  hasNext,
  hasPrevious,
  limit,
  locale,
  offset,
}: {
  filters: LoadJobHistoryFilters;
  hasNext: boolean;
  hasPrevious: boolean;
  limit: number;
  locale: Locale;
  offset: number;
}) {
  const { t } = createTranslator(locale);

  return (
    <nav className="flex flex-wrap gap-2" aria-label={t("Load job history pages")}>
      {hasPrevious ? (
        <Link
          className="inline-flex min-h-9 items-center border border-zinc-300 bg-white px-3 text-xs font-semibold uppercase text-zinc-700 hover:border-teal-700 hover:text-teal-900"
          href={loadJobHistoryHref({
            ...filters,
            offset: Math.max(0, offset - limit),
          })}
        >
          {t("Previous")}
        </Link>
      ) : null}
      {hasNext ? (
        <Link
          className="inline-flex min-h-9 items-center border border-zinc-300 bg-white px-3 text-xs font-semibold uppercase text-zinc-700 hover:border-teal-700 hover:text-teal-900"
          href={loadJobHistoryHref({ ...filters, offset: offset + limit })}
        >
          {t("Next")}
        </Link>
      ) : null}
    </nav>
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
        {t("Load job history could not be loaded")}
      </h2>
      <p className="mt-2 text-sm">
        {loadJobHistoryErrorMessage(error, locale)}
      </p>
      <p className="mt-2 text-xs font-semibold uppercase" data-i18n-ignore>
        {error.code}
        {error.status ? ` (${error.status})` : ""}
      </p>
    </section>
  );
}

const loadJobHistoryErrorKeys: Record<string, MessageKey> = {
  API_NETWORK_ERROR: "Load job history could not be loaded",
  WEB_API_ERROR: "Load job history could not be loaded",
};

function loadJobHistoryErrorMessage(
  error: ApiClientError,
  locale: Locale,
): string {
  const { t } = createTranslator(locale);
  const knownKey = loadJobHistoryErrorKeys[error.code];
  return t(knownKey ?? "Load job history could not be loaded");
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
