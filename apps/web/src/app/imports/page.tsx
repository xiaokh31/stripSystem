import Link from "next/link";
import {
  ApiClientError,
  listImportFiles,
  type ImportFileListResponse,
  type ImportFileResponse,
} from "@/lib/api-client";
import {
  formatDateTime,
  statusTone,
  type StatusTone,
} from "@/components/imports/import-detail-flow";
import { containerStatusLabel } from "@/components/containers/container-files-flow";
import { ImportDeleteButton } from "@/components/imports/import-delete-button";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { generatedOrImportStatusLabel } from "@/lib/i18n/status-labels";
import { createTranslator } from "@/lib/i18n/translator";
import { canDeleteImports } from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";
import { DashboardFilterContext } from "@/components/dashboard/dashboard-filter-context";
import {
  appendDashboardDrilldownContext,
  firstValue,
  normalizeDashboardDrilldownContext,
} from "@/components/dashboard/drilldown-flow";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type ImportsPageState =
  | {
      ok: true;
      imports: ImportFileListResponse;
    }
  | {
      ok: false;
      error: ApiClientError;
    };

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  const currentUser = await getServerCurrentUser();
  const filters = normalizeImportFilters(params);
  const context = normalizeDashboardDrilldownContext(params);
  const state = await loadImports(filters);
  const canDelete = canDeleteImports(currentUser);

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      {context ? (
        <DashboardFilterContext
          clearHref="/imports"
          context={context}
          locale={locale}
        />
      ) : null}
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Office")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Imports")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              {t(
                "Uploaded unloading lists are loaded from the API so the history remains visible after navigation or refresh.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href={importsHref(filters, context)}
            >
              {t("Refresh")}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
              href="/imports/new"
            >
              {t("New import")}
            </Link>
          </div>
        </div>
      </section>

      {state.ok ? (
        <ImportHistory
          canDelete={canDelete}
          imports={state.imports}
          locale={locale}
        />
      ) : (
        <ApiErrorPanel error={state.error} locale={locale} />
      )}
    </main>
  );
}

async function loadImports(
  filters: { importStatus?: string; parseStatus?: string },
): Promise<ImportsPageState> {
  try {
    const apiOptions = await getServerApiOptions();
    const imports = await listImportFiles(
      { ...filters, limit: PAGE_SIZE, offset: 0 },
      apiOptions,
    );
    return { ok: true, imports };
  } catch (error) {
    return { ok: false, error: toApiClientError(error) };
  }
}

function ImportHistory({
  canDelete,
  imports,
  locale,
}: {
  canDelete: boolean;
  imports: ImportFileListResponse;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);
  const showingText = format("i18n.imports.history.summary", {
    count: imports.items.length,
  });
  const limitText = format("i18n.imports.history.pagination", {
    limit: imports.limit,
    offset: imports.offset,
  });

  if (imports.items.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          {t("No imports recorded")}
        </h2>
        <p className="mt-2 max-w-2xl leading-6">
          {t(
            "Upload a real .xlsx unloading list to create the first import record. Once the API stores it, it will appear here after refresh.",
          )}
        </p>
        <Link
          className="mt-4 inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          href="/imports/new"
        >
          {t("New import")}
        </Link>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Recent imports")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">{showingText}</p>
        </div>
        <p className="text-xs font-medium text-zinc-500">{limitText}</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
              <th className="w-[24%] py-2 pr-4 font-semibold">{t("File")}</th>
              <th className="w-[15%] py-2 pr-4 font-semibold">{t("Status")}</th>
              <th className="w-[14%] py-2 pr-4 font-semibold">{t("Containers")}</th>
              <th className="w-[11%] py-2 pr-4 font-semibold">{t("Format")}</th>
              <th className="w-[12%] py-2 pr-4 font-semibold">
                {t("Warnings / errors")}
              </th>
              <th className="w-[16%] py-2 pr-4 font-semibold">{t("Uploaded")}</th>
              <th className="w-[10%] py-2 font-semibold">{t("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {imports.items.map((item) => (
              <ImportRow
                canDelete={canDelete}
                importFile={item}
                key={item.id}
                locale={locale}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ImportRow({
  canDelete,
  importFile,
  locale,
}: {
  canDelete: boolean;
  importFile: ImportFileResponse;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);

  return (
    <tr
      className="border-b border-zinc-100 align-top last:border-0"
      data-record-id={importFile.id}
    >
      <td className="py-3 pr-4">
        <p className="break-all font-medium text-zinc-950">
          {importFile.originalFilename}
        </p>
        {/* <p className="mt-1 break-all text-xs text-zinc-500">
          {importFile.id}
        </p> */}
        {/* <p className="mt-1 break-all text-xs text-zinc-500">
          SHA-256: {importFile.fileSha256}
        </p> */}
      </td>
      <td className="space-y-2 py-3 pr-4">
        <StatusBadge
          locale={locale}
          status={importFile.importStatus}
          tone={statusTone(importFile.importStatus)}
        />
        <StatusBadge
          locale={locale}
          status={importFile.parseStatus}
          tone={statusTone(importFile.parseStatus)}
        />
      </td>
      <td className="space-y-2 py-3 pr-4">
        {importFile.containers.length > 0 ? (
          importFile.containers.map((container) => (
            <Link
              className="block text-xs font-semibold text-teal-700 underline hover:text-teal-900"
              href={`/containers/${container.id}`}
              key={container.id}
            >
              <span className="block">{container.containerNo}</span>
              <span className="font-medium text-zinc-600">
                {containerStatusLabel(container.status, locale)}
              </span>
            </Link>
          ))
        ) : (
          <span className="text-sm text-zinc-500">-</span>
        )}
      </td>
      <td className="py-3 pr-4 font-medium text-zinc-800">
        {importFile.format}
      </td>
      <td className="py-3 pr-4 text-zinc-700">
        {importFile.warningCount} / {importFile.errorCount}
      </td>
      <td className="py-3 pr-4 text-zinc-700">
        {formatDateTime(importFile.createdAt)}
      </td>
      <td className="py-3 text-right">
        <div className="grid w-[88px] justify-items-stretch gap-2">
          <Link
            className="inline-flex min-h-9 w-full items-center justify-center border border-teal-700 bg-white px-3 text-xs font-semibold uppercase text-teal-800 hover:bg-teal-50"
            href={`/imports/${importFile.id}`}
          >
            {t("Open")}
          </Link>
          {canDelete ? <ImportDeleteButton importFile={importFile} /> : null}
        </div>
      </td>
    </tr>
  );
}

const IMPORT_STATUSES = ["UPLOADED", "DUPLICATE", "FAILED"] as const;
const PARSE_STATUSES = [
  "NOT_PARSED",
  "PARSING",
  "PARSED",
  "REVIEW_REQUIRED",
  "WARNING",
  "ERROR",
] as const;

function normalizeImportFilters(
  params: Record<string, string | string[] | undefined>,
): { importStatus?: string; parseStatus?: string } {
  const importStatus = firstValue(params.importStatus);
  const parseStatus = firstValue(params.parseStatus);
  return {
    ...(IMPORT_STATUSES.includes(
      importStatus as (typeof IMPORT_STATUSES)[number],
    )
      ? { importStatus }
      : {}),
    ...(PARSE_STATUSES.includes(parseStatus as (typeof PARSE_STATUSES)[number])
      ? { parseStatus }
      : {}),
  };
}

function importsHref(
  filters: { importStatus?: string; parseStatus?: string },
  context: ReturnType<typeof normalizeDashboardDrilldownContext>,
): string {
  const params = new URLSearchParams();
  if (filters.importStatus) params.set("importStatus", filters.importStatus);
  if (filters.parseStatus) params.set("parseStatus", filters.parseStatus);
  appendDashboardDrilldownContext(params, context);
  const query = params.toString();
  return query ? `/imports?${query}` : "/imports";
}

function StatusBadge({
  locale,
  status,
  tone,
}: {
  locale: Locale;
  status: string;
  tone: StatusTone;
}) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
    zinc: "border-zinc-200 bg-zinc-50 text-zinc-700",
  }[tone];

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase ${styles}`}
      title={generatedOrImportStatusLabel(status, locale)}
    >
      {generatedOrImportStatusLabel(status, locale)}
    </span>
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
      <h2 className="text-base font-semibold">{t("Imports could not be loaded")}</h2>
      <p className="mt-2 text-sm">
        {importListErrorMessage(error, locale)}
      </p>
      <p className="mt-2 text-xs font-medium" data-i18n-ignore>
        {error.code} {error.status ? `(${error.status})` : ""}
      </p>
    </section>
  );
}

const importListErrorKeys: Record<string, MessageKey> = {
  API_NETWORK_ERROR: "The import list could not be loaded.",
  IMPORT_LIST_LOAD_FAILED: "The import list could not be loaded.",
};

function importListErrorMessage(error: ApiClientError, locale: Locale): string {
  const { t } = createTranslator(locale);
  const knownKey = importListErrorKeys[error.code];

  return t(knownKey ?? "The import list could not be loaded.");
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "IMPORT_LIST_LOAD_FAILED",
    message:
      error instanceof Error
        ? error.message
        : "The import list could not be loaded.",
    status: 0,
  });
}
