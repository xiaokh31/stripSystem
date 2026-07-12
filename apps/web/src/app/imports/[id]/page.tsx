import Link from "next/link";
import {
  ApiClientError,
  getImportFile,
  getImportParseResult,
  type ImportFileResponse,
  type ImportParseResultResponse,
} from "@/lib/api-client";
import {
  ImportDetailActions,
  ManualReportEntryPanel,
  ParseResultSummary,
} from "@/components/imports/import-detail-actions";
import {
  formatDateTime,
  issueList,
  manualReportHref,
  shouldOfferManualReportEntry,
  statusTone,
  toParseResultSummary,
} from "@/components/imports/import-detail-flow";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { generatedOrImportStatusLabel } from "@/lib/i18n/status-labels";
import { createTranslator } from "@/lib/i18n/translator";
import { getServerApiOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type ImportDetailState =
  | {
      ok: true;
      importFile: ImportFileResponse;
      parseResult: ImportParseResultResponse | null;
      parseResultError: ApiClientError | null;
    }
  | {
      ok: false;
      error: ApiClientError;
    };

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  const state = await loadImportDetail(id);

  if (!state.ok) {
    return <ImportDetailError error={state.error} id={id} locale={locale} />;
  }

  const warningIssues = issueList(state.parseResult?.warnings ?? [], locale);
  const errorIssues = issueList(state.parseResult?.errors ?? [], locale);
  const parseSummary = toParseResultSummary(state.parseResult);
  const manualHref = manualReportHref(state.importFile.id);
  const showManualEntry = shouldOfferManualReportEntry({
    parseResult: parseSummary,
    parseStatus: state.importFile.parseStatus,
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Import detail")}
            </p>
            <h1 className="mt-2 break-all text-2xl font-semibold text-zinc-950">
              {state.importFile.originalFilename}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href={manualHref}
            >
              {t("Create manual report")}
            </Link>
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/imports/new"
            >
              {t("Upload another file")}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-950">
            {t("File status")}
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <DetailRow label={t("Import ID")} value={state.importFile.id} />
            <DetailRow
              label={t("SHA-256")}
              value={state.importFile.fileSha256}
              wrap
            />
            <DetailRow label={t("Format")} value={state.importFile.format} />
            <DetailRow
              label={t("Parse status")}
              value={
                <StatusBadge
                  locale={locale}
                  status={state.importFile.parseStatus}
                />
              }
            />
            <DetailRow
              label={t("Uploaded at")}
              value={formatDateTime(state.importFile.createdAt)}
            />
            <DetailRow
              label={t("Warnings / errors")}
              value={`${state.importFile.warningCount} / ${state.importFile.errorCount}`}
            />
            {state.importFile.errorMessage ? (
              <DetailRow
                label={t("Error")}
                value={localizedImportMessage(
                  state.importFile.errorMessage,
                  locale,
                )}
              />
            ) : null}
          </dl>
        </div>

        <ImportDetailActions
          importFile={state.importFile}
          initialParseResult={parseSummary}
          manualReportHref={manualHref}
        />
      </section>

      {state.parseResultError ? (
        <ApiErrorPanel
          error={state.parseResultError}
          locale={locale}
          title={t("Parse result could not be loaded")}
        />
      ) : null}

      {showManualEntry ? <ManualReportEntryPanel href={manualHref} /> : null}

      <ParseResultSummary parseResult={parseSummary} />

      <IssueSection
        errorCount={state.importFile.errorCount}
        errors={errorIssues}
        warningCount={state.importFile.warningCount}
        warnings={warningIssues}
        locale={locale}
      />
    </main>
  );
}

async function loadImportDetail(id: string): Promise<ImportDetailState> {
  try {
    const apiOptions = await getServerApiOptions();
    const importFile = await getImportFile(id, apiOptions);
    let parseResult: ImportParseResultResponse | null = null;
    let parseResultError: ApiClientError | null = null;

    try {
      parseResult = await getImportParseResult(id, apiOptions);
    } catch (error) {
      parseResultError = toApiClientError(error);
    }

    return { ok: true, importFile, parseResult, parseResultError };
  } catch (error) {
    return { ok: false, error: toApiClientError(error) };
  }
}

function DetailRow({
  label,
  value,
  wrap = false,
}: {
  label: string;
  value: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <div className="grid gap-1 border-t border-zinc-100 pt-3 sm:grid-cols-[150px_minmax(0,1fr)]">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={wrap ? "break-all font-medium" : "font-medium"}>
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({
  locale,
  status,
}: {
  locale: Locale;
  status: string;
}) {
  const tone = statusTone(status);
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

function IssueSection({
  errorCount,
  errors,
  warningCount,
  warnings,
  locale,
}: {
  errorCount: number;
  errors: string[];
  locale: Locale;
  warningCount: number;
  warnings: string[];
}) {
  const { t } = createTranslator(locale);

  if (warningCount === 0 && errorCount === 0) {
    return (
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {t("Warnings and errors")}
        </h2>
        <p className="mt-3 text-sm text-zinc-600">
          {t("No parser warnings or errors are currently recorded for this import.")}
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <IssueList
        count={warningCount}
        emptyText={t("Warning details are not available yet.")}
        items={warnings}
        title={t("Warnings")}
      />
      <IssueList
        count={errorCount}
        emptyText={t("Error details are not available yet.")}
        items={errors}
        title={t("Errors")}
      />
    </section>
  );
}

function IssueList({
  count,
  emptyText,
  items,
  title,
}: {
  count: number;
  emptyText: string;
  items: string[];
  title: string;
}) {
  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
        <span className="text-sm font-semibold text-zinc-600">{count}</span>
      </div>
      {items.length ? (
        <ul className="mt-4 space-y-2 text-sm text-zinc-700">
          {items.map((item, index) => (
            <li
              className="border-l-4 border-amber-400 bg-zinc-50 p-3"
              key={`${item}-${index}`}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-600">{emptyText}</p>
      )}
    </section>
  );
}

function ImportDetailError({
  error,
  id,
  locale,
}: {
  error: ApiClientError;
  id: string;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <ApiErrorPanel
        error={error}
        locale={locale}
        title={format("i18n.imports.detail.loadError", { id })}
      />
      <Link
        className="inline-flex min-h-10 w-fit items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
        href="/imports/new"
      >
        {t("Upload a file")}
      </Link>
    </main>
  );
}

function ApiErrorPanel({
  error,
  locale,
  title,
}: {
  error: ApiClientError;
  locale: Locale;
  title: string;
}) {
  const { t } = createTranslator(locale);

  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <p className="text-sm font-semibold uppercase" data-i18n-ignore>
        {error.code}
      </p>
      <h1 className="mt-2 text-xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm">
        {importDetailErrorMessage(error, locale, t)}
      </p>
    </section>
  );
}

const importDetailErrorKeys: Record<string, MessageKey> = {
  API_NETWORK_ERROR: "Import detail failed.",
  WEB_IMPORT_DETAIL_ERROR: "Import detail failed.",
};

function importDetailErrorMessage(
  error: ApiClientError,
  locale: Locale,
  t: (key: MessageKey) => string,
): string {
  const knownKey = importDetailErrorKeys[error.code];
  if (knownKey) {
    return t(knownKey);
  }

  return t("Import detail failed.");
}

function localizedImportMessage(_value: string, locale: Locale): string {
  return createTranslator(locale).t("Parser issue details are unavailable.");
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "WEB_IMPORT_DETAIL_ERROR",
    message: error instanceof Error ? error.message : "Import detail failed.",
    status: 0,
  });
}
