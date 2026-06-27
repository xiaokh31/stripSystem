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
  ParseResultSummary,
} from "@/components/imports/import-detail-actions";
import {
  formatDateTime,
  issueList,
  statusTone,
  toParseResultSummary,
} from "@/components/imports/import-detail-flow";

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
  const state = await loadImportDetail(id);

  if (!state.ok) {
    return <ImportDetailError error={state.error} id={id} />;
  }

  const warningIssues = issueList(state.parseResult?.warnings ?? []);
  const errorIssues = issueList(state.parseResult?.errors ?? []);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Import detail
            </p>
            <h1 className="mt-2 break-all text-2xl font-semibold text-zinc-950">
              {state.importFile.originalFilename}
            </h1>
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/imports/new"
          >
            Upload another file
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-950">
            File status
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <DetailRow label="Import ID" value={state.importFile.id} />
            <DetailRow
              label="SHA-256"
              value={state.importFile.fileSha256}
              wrap
            />
            <DetailRow label="Format" value={state.importFile.format} />
            <DetailRow
              label="Parse status"
              value={
                <StatusBadge status={state.importFile.parseStatus} />
              }
            />
            <DetailRow
              label="Uploaded at"
              value={formatDateTime(state.importFile.createdAt)}
            />
            <DetailRow
              label="Warnings / errors"
              value={`${state.importFile.warningCount} / ${state.importFile.errorCount}`}
            />
            {state.importFile.errorMessage ? (
              <DetailRow label="Error" value={state.importFile.errorMessage} />
            ) : null}
          </dl>
        </div>

        <ImportDetailActions
          importFile={state.importFile}
          initialParseResult={toParseResultSummary(state.parseResult)}
        />
      </section>

      {state.parseResultError ? (
        <ApiErrorPanel
          error={state.parseResultError}
          title="Parse result could not be loaded"
        />
      ) : null}

      <ParseResultSummary parseResult={toParseResultSummary(state.parseResult)} />

      <IssueSection
        errorCount={state.importFile.errorCount}
        errors={errorIssues}
        warningCount={state.importFile.warningCount}
        warnings={warningIssues}
      />
    </main>
  );
}

async function loadImportDetail(id: string): Promise<ImportDetailState> {
  try {
    const importFile = await getImportFile(id);
    let parseResult: ImportParseResultResponse | null = null;
    let parseResultError: ApiClientError | null = null;

    try {
      parseResult = await getImportParseResult(id);
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

function StatusBadge({ status }: { status: string }) {
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
    >
      {status}
    </span>
  );
}

function IssueSection({
  errorCount,
  errors,
  warningCount,
  warnings,
}: {
  errorCount: number;
  errors: string[];
  warningCount: number;
  warnings: string[];
}) {
  if (warningCount === 0 && errorCount === 0) {
    return (
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Warnings and errors
        </h2>
        <p className="mt-3 text-sm text-zinc-600">
          No parser warnings or errors are currently recorded for this import.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <IssueList
        count={warningCount}
        emptyText="Warning details are not available yet."
        items={warnings}
        title="Warnings"
      />
      <IssueList
        count={errorCount}
        emptyText="Error details are not available yet."
        items={errors}
        title="Errors"
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
          {items.map((item) => (
            <li className="border-l-4 border-amber-400 bg-zinc-50 p-3" key={item}>
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

function ImportDetailError({ error, id }: { error: ApiClientError; id: string }) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <ApiErrorPanel error={error} title={`Import ${id} could not be loaded`} />
      <Link
        className="inline-flex min-h-10 w-fit items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
        href="/imports/new"
      >
        Upload a file
      </Link>
    </main>
  );
}

function ApiErrorPanel({
  error,
  title,
}: {
  error: ApiClientError;
  title: string;
}) {
  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <p className="text-sm font-semibold uppercase">{error.code}</p>
      <h1 className="mt-2 text-xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm">{error.message}</p>
    </section>
  );
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
