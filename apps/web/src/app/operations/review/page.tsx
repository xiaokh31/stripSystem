import Link from "next/link";
import { DashboardFilterContext } from "@/components/dashboard/dashboard-filter-context";
import {
  dashboardDrilldownLabel,
  firstValue,
  normalizeDashboardDrilldownContext,
} from "@/components/dashboard/drilldown-flow";
import {
  ApiClientError,
  getOperationsReview,
  type OperationsReviewCode,
  type OperationsReviewResponse,
} from "@/lib/api-client";
import { formatLocalizedOperationalDateTime } from "@/lib/date-time";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { getServerApiOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const REVIEW_CODES: OperationsReviewCode[] = [
  "UNLOADING_COMPLETION_DATE_MISSING",
  "DESTINATION_CARTON_VOLUME_MISSING",
  "ZERO_VOLUME_WITH_CARTONS",
  "FAILED_GENERATED_FILES",
  "SCAN_EXCEPTIONS",
  "FAILED_ASYNC_JOBS",
  "GENERATED_FILE_DETAIL",
  "CORRECTION_DETAIL",
];

type ReviewState =
  | { ok: true; review: OperationsReviewResponse }
  | { error: ApiClientError; ok: false };

export default async function OperationsReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const locale = await getServerLocale();
  const { format, t } = createTranslator(locale);
  const code = normalizeReviewCode(firstValue(params.code));
  const page = normalizePage(firstValue(params.page));
  const recordId = firstValue(params.recordId)?.trim() || undefined;
  const context = normalizeDashboardDrilldownContext(params);
  const state = code
    ? await loadReview(code, page, recordId)
    : {
        error: new ApiClientError({
          code: "INVALID_REVIEW_CODE",
          message: "Invalid operations review code.",
          status: 400,
        }),
        ok: false as const,
      };
  const baseHref = code
    ? reviewHref({ code, page: 1, recordId })
    : "/operations/review";

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      {context ? (
        <DashboardFilterContext
          clearHref={baseHref}
          context={context}
          locale={locale}
        />
      ) : null}
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">
          {t("Operations review")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          {code && context
            ? dashboardDrilldownLabel(context.code, locale)
            : t("Review records")}
        </h1>
      </section>
      {state.ok ? (
        <section
          className="border border-zinc-200 bg-white p-5 shadow-sm"
          data-drilldown-code={state.review.code}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold text-zinc-950">
              {t("Review records")}
            </h2>
            <p className="text-sm text-zinc-600">
              {format("i18n.inventory.pageStatus", {
                page: state.review.page,
                totalPages: state.review.totalPages,
              })}
            </p>
          </div>
          {state.review.items.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-600">
                    <th className="px-3 py-3 font-semibold">{t("Type")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Record")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Status")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Updated")}</th>
                    <th className="px-3 py-3 font-semibold">{t("Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.review.items.map((item) => {
                    const selected = item.id === recordId;
                    return (
                    <tr
                      aria-current={selected ? "true" : undefined}
                      className={
                        selected
                          ? "border-b border-amber-300 bg-amber-50"
                          : "border-b border-zinc-100"
                      }
                      data-record-id={item.id}
                      data-selected-record={selected ? "true" : undefined}
                      key={item.id}
                    >
                      <td className="px-3 py-3">
                        {reviewSourceLabel(item.sourceType, locale)}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {selected ? (
                          <span className="mb-1 block text-xs font-semibold uppercase text-amber-900">
                            {t("Selected record")}
                          </span>
                        ) : null}
                        {item.primaryValue &&
                        !["ASYNC_JOB", "GENERATED_FILE", "WAGE_GENERATED_FILE"].includes(
                          item.sourceType,
                        )
                          ? item.primaryValue
                          : t("Record")}
                      </td>
                      <td className="px-3 py-3">
                        {reviewStatusLabel(item.status, locale)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {formatLocalizedOperationalDateTime(
                          item.occurredAt,
                          locale,
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          className="font-semibold text-teal-800 underline hover:text-teal-950"
                          href={item.href}
                        >
                          {t("Open")}
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
              {t("No matching review records")}
            </p>
          )}
          <ReviewPagination
            code={state.review.code}
            locale={locale}
            page={state.review.page}
            recordId={recordId}
            totalPages={state.review.totalPages}
          />
        </section>
      ) : (
        <section
          className="border border-red-200 bg-red-50 p-5 text-red-950"
          role="alert"
        >
          <h2 className="font-semibold">
            {t("Review records could not be loaded")}
          </h2>
          <p className="mt-2 text-xs font-semibold" data-i18n-ignore>
            {state.error.code}
          </p>
        </section>
      )}
    </main>
  );
}

async function loadReview(
  code: OperationsReviewCode,
  page: number,
  recordId?: string,
): Promise<ReviewState> {
  try {
    return {
      ok: true,
      review: await getOperationsReview(
        { code, page, pageSize: 25, recordId },
        await getServerApiOptions(),
      ),
    };
  } catch (error) {
    return {
      error:
        error instanceof ApiClientError
          ? error
          : new ApiClientError({
              code: "OPERATIONS_REVIEW_LOAD_FAILED",
              message: "Operations review failed.",
              status: 0,
            }),
      ok: false,
    };
  }
}

function ReviewPagination({
  code,
  locale,
  page,
  recordId,
  totalPages,
}: {
  code: OperationsReviewCode;
  locale: Locale;
  page: number;
  recordId?: string;
  totalPages: number;
}) {
  const { t } = createTranslator(locale);
  return (
    <nav
      aria-label={t("Pagination")}
      className="mt-4 flex justify-end gap-2 border-t border-zinc-200 pt-4"
    >
      {page > 1 ? (
        <Link
          className="inline-flex min-h-10 items-center border border-zinc-300 px-3 font-semibold"
          href={reviewHref({ code, page: page - 1, recordId })}
        >
          {t("Previous")}
        </Link>
      ) : null}
      {page < totalPages ? (
        <Link
          className="inline-flex min-h-10 items-center border border-zinc-300 px-3 font-semibold"
          href={reviewHref({ code, page: page + 1, recordId })}
        >
          {t("Next")}
        </Link>
      ) : null}
    </nav>
  );
}

function reviewHref({
  code,
  page,
  recordId,
}: {
  code: OperationsReviewCode;
  page: number;
  recordId?: string;
}): string {
  const params = new URLSearchParams({ code, page: String(page) });
  if (recordId) params.set("recordId", recordId);
  return `/operations/review?${params.toString()}`;
}

function normalizeReviewCode(
  value: string | undefined,
): OperationsReviewCode | null {
  return REVIEW_CODES.includes(value as OperationsReviewCode)
    ? (value as OperationsReviewCode)
    : null;
}

function normalizePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function reviewSourceLabel(sourceType: string, locale: Locale): string {
  const labels: Record<string, MessageKey> = {
    ASYNC_JOB: "Background job",
    CONTAINER: "Container",
    CONTAINER_LINE: "Container line",
    CORRECTION: "Correction",
    GENERATED_FILE: "Generated file",
    PALLET_EVENT: "Pallet event",
    WAGE_GENERATED_FILE: "Wage generated file",
  };
  return createTranslator(locale).t(labels[sourceType] ?? "Record");
}

function reviewStatusLabel(status: string | null, locale: Locale): string {
  if (!status) return "-";
  const labels: Record<string, MessageKey> = {
    DUPLICATE_SCAN: "Duplicate",
    FAILED: "Failed",
    INVALID_SCAN: "Invalid",
  };
  return createTranslator(locale).t(labels[status] ?? "Needs review");
}
