import Link from "next/link";
import {
  AttendanceImportActions,
  AttendanceUploadPanel,
} from "@/components/wage/work-hours-actions";
import { formatHours } from "@/components/wage/attendance-flow";
import {
  formatDateOnly,
  formatDateTime,
  issueList,
  statusStyle,
} from "@/components/wage/wage-display";
import {
  ApiClientError,
  getAttendanceGeneratedFileDownloadUrl,
  getAttendanceParseResult,
  listAttendanceImportFiles,
  listAttendanceImports,
  type AttendanceImportListResponse,
  type AttendanceImportResponse,
  type AttendanceParseResultResponse,
  type WageGeneratedFileResponse,
} from "@/lib/api-client";
import { getServerApiOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface WorkHoursSearchParams {
  attendanceImportId?: string | string[];
}

type WorkHoursState =
  | {
      detailError: ApiClientError | null;
      files: WageGeneratedFileResponse[];
      filesError: ApiClientError | null;
      imports: AttendanceImportListResponse;
      listError: null;
      parseResult: AttendanceParseResultResponse | null;
      selectedImportId: string | null;
    }
  | {
      detailError: null;
      files: [];
      filesError: null;
      imports: null;
      listError: ApiClientError;
      parseResult: null;
      selectedImportId: null;
    };

export default async function WorkHoursPage({
  searchParams,
}: {
  searchParams: Promise<WorkHoursSearchParams>;
}) {
  const params = await searchParams;
  const state = await loadWorkHoursState(firstSearchValue(params.attendanceImportId));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">HR</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Work Hours Settlement
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Upload monthly attendance, review parsed employee-day rows, and
              generate the wage record workbook through the attendance API.
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/work-hours"
          >
            Refresh
          </Link>
        </div>
      </section>

      <AttendanceUploadPanel />

      {state.listError ? (
        <ApiErrorPanel error={state.listError} title="Attendance imports could not be loaded" />
      ) : (
        <>
          <AttendanceImportTable
            imports={state.imports}
            selectedImportId={state.selectedImportId}
          />
          {state.detailError ? (
            <ApiErrorPanel
              error={state.detailError}
              title="Attendance parse result could not be loaded"
            />
          ) : state.parseResult ? (
            <AttendanceDetail
              files={state.files}
              filesError={state.filesError}
              parseResult={state.parseResult}
            />
          ) : (
            <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
              Select or upload an attendance import to review parsed rows.
            </section>
          )}
        </>
      )}
    </main>
  );
}

async function loadWorkHoursState(
  requestedImportId: string | null,
): Promise<WorkHoursState> {
  const apiOptions = await getServerApiOptions();
  try {
    const imports = await listAttendanceImports(
      { limit: PAGE_SIZE, offset: 0 },
      apiOptions,
    );
    const selectedImportId = requestedImportId ?? imports.items[0]?.id ?? null;
    if (!selectedImportId) {
      return {
        detailError: null,
        files: [],
        filesError: null,
        imports,
        listError: null,
        parseResult: null,
        selectedImportId: null,
      };
    }

    const [parseResult, filesResult] = await Promise.allSettled([
      getAttendanceParseResult(selectedImportId, apiOptions),
      listAttendanceImportFiles(selectedImportId, apiOptions),
    ]);

    return {
      detailError:
        parseResult.status === "rejected"
          ? toApiClientError(parseResult.reason, "Attendance parse result failed.")
          : null,
      files: filesResult.status === "fulfilled" ? filesResult.value.items : [],
      filesError:
        filesResult.status === "rejected"
          ? toApiClientError(filesResult.reason, "Attendance generated files failed.")
          : null,
      imports,
      listError: null,
      parseResult: parseResult.status === "fulfilled" ? parseResult.value : null,
      selectedImportId,
    };
  } catch (error) {
    return {
      detailError: null,
      files: [],
      filesError: null,
      imports: null,
      listError: toApiClientError(error, "Attendance imports failed."),
      parseResult: null,
      selectedImportId: null,
    };
  }
}

function AttendanceImportTable({
  imports,
  selectedImportId,
}: {
  imports: AttendanceImportListResponse;
  selectedImportId: string | null;
}) {
  if (imports.items.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          No attendance imports
        </h2>
        <p className="mt-2 max-w-2xl leading-6">
          Upload a real monthly .xls attendance workbook to start HR work hours
          settlement.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Attendance imports
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Showing {imports.items.length} latest attendance workbook(s).
          </p>
        </div>
        <p className="text-xs font-medium text-zinc-500">
          Limit {imports.limit}, offset {imports.offset}
        </p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <th className="px-3 py-3 font-semibold">File</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Period</th>
              <th className="px-3 py-3 text-right font-semibold">Rows</th>
              <th className="px-3 py-3 text-right font-semibold">Issues</th>
              <th className="px-3 py-3 font-semibold">Uploaded</th>
              <th className="px-3 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {imports.items.map((item) => (
              <AttendanceImportRow
                importFile={item}
                isSelected={item.id === selectedImportId}
                key={item.id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AttendanceImportRow({
  importFile,
  isSelected,
}: {
  importFile: AttendanceImportResponse;
  isSelected: boolean;
}) {
  return (
    <tr className="border-b border-zinc-100 align-top last:border-0">
      <td className="px-3 py-4">
        <p className="break-all font-semibold text-zinc-950">
          {importFile.originalFilename}
        </p>
        <p className="mt-1 break-all text-xs text-zinc-500">
          SHA-256: {importFile.fileSha256}
        </p>
      </td>
      <td className="space-y-2 px-3 py-4">
        <StatusBadge status={importFile.importStatus} />
        <StatusBadge status={importFile.parseStatus} />
      </td>
      <td className="px-3 py-4 text-zinc-700">
        <p>{importFile.settlementMonth ?? "-"}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatDateOnly(importFile.periodStart)} to{" "}
          {formatDateOnly(importFile.periodEnd)}
        </p>
      </td>
      <td className="px-3 py-4 text-right font-medium">
        {importFile.dayCount}
        <span className="block text-xs text-zinc-500">
          {importFile.employeeCount} employee(s)
        </span>
      </td>
      <td className="px-3 py-4 text-right font-medium">
        {importFile.warningCount} / {importFile.errorCount}
      </td>
      <td className="px-3 py-4 text-zinc-700">
        {formatDateTime(importFile.createdAt)}
      </td>
      <td className="px-3 py-4">
        <Link
          className={`inline-flex min-h-9 items-center border px-3 text-xs font-semibold uppercase ${
            isSelected
              ? "border-teal-700 bg-teal-700 text-white"
              : "border-teal-700 bg-white text-teal-800 hover:bg-teal-50"
          }`}
          href={`/work-hours?attendanceImportId=${encodeURIComponent(importFile.id)}`}
        >
          {isSelected ? "Selected" : "Review"}
        </Link>
      </td>
    </tr>
  );
}

function AttendanceDetail({
  files,
  filesError,
  parseResult,
}: {
  files: WageGeneratedFileResponse[];
  filesError: ApiClientError | null;
  parseResult: AttendanceParseResultResponse;
}) {
  const importFile = parseResult.attendanceImport;
  const issues = [
    ...issueList(parseResult.warnings),
    ...issueList(parseResult.errors),
  ];

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4">
        <section className="border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">
                Parsed employee-day rows
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                {parseResult.rows.length} row(s) from {importFile.originalFilename}
              </p>
            </div>
            <AttendanceImportActions attendanceImportId={importFile.id} />
          </div>
          {issues.length > 0 ? (
            <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">Review issues</p>
              <ul className="mt-2 space-y-1">
                {issues.slice(0, 8).map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <AttendanceRowsTable rows={parseResult.rows} />
        </section>
      </div>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Generated files
        </h2>
        {filesError ? (
          <div className="mt-4">
            <ApiErrorPanel error={filesError} title="Files could not be loaded" />
          </div>
        ) : files.length === 0 ? (
          <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
            No wage files generated yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {files.map((file) => (
              <GeneratedFileLink
                attendanceImportId={importFile.id}
                file={file}
                key={file.id}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function AttendanceRowsTable({
  rows,
}: {
  rows: AttendanceParseResultResponse["rows"];
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-5 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
        No parsed rows are stored yet. Run Parse to populate employee-day rows.
      </p>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <th className="px-3 py-3 font-semibold">Date</th>
            <th className="px-3 py-3 font-semibold">Employee</th>
            <th className="px-3 py-3 font-semibold">Department</th>
            <th className="px-3 py-3 font-semibold">Punches</th>
            <th className="px-3 py-3 text-right font-semibold">Gross</th>
            <th className="px-3 py-3 text-right font-semibold">Lunch</th>
            <th className="px-3 py-3 text-right font-semibold">Hours</th>
            <th className="px-3 py-3 font-semibold">Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row) => (
            <tr className="border-b border-zinc-100 align-top" key={row.id}>
              <td className="px-3 py-3 font-medium">{row.workDate}</td>
              <td className="px-3 py-3">
                <p className="font-semibold text-zinc-950">
                  {row.employeeName ?? "-"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {row.employeeId ?? "-"}
                </p>
              </td>
              <td className="px-3 py-3">{row.department ?? "-"}</td>
              <td className="px-3 py-3 text-xs text-zinc-700">
                {Array.isArray(row.punchTimes)
                  ? row.punchTimes.join(", ")
                  : JSON.stringify(row.punchTimes)}
              </td>
              <td className="px-3 py-3 text-right font-medium">
                {formatHours(row.pairedGrossHours)}
              </td>
              <td className="px-3 py-3 text-right font-medium">
                {formatHours(row.lunchHours)}
              </td>
              <td className="px-3 py-3 text-right font-semibold">
                {formatHours(row.calculatedHours)}
              </td>
              <td className="px-3 py-3 text-xs text-amber-800">
                {[...issueList(row.warnings), ...issueList(row.errors)].join(
                  " / ",
                ) || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 ? (
        <p className="mt-3 text-xs text-zinc-500">
          Showing first 100 of {rows.length} parsed rows.
        </p>
      ) : null}
    </div>
  );
}

function GeneratedFileLink({
  attendanceImportId,
  file,
}: {
  attendanceImportId: string;
  file: WageGeneratedFileResponse;
}) {
  const downloadable = file.status === "GENERATED";
  return (
    <div className="border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950">{file.fileType}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatDateTime(file.updatedAt)}
          </p>
        </div>
        <StatusBadge status={file.status} />
      </div>
      {downloadable ? (
        <Link
          className="mt-3 inline-flex min-h-9 items-center border border-teal-700 bg-white px-3 text-xs font-semibold uppercase text-teal-800 hover:bg-teal-50"
          href={getAttendanceGeneratedFileDownloadUrl(attendanceImportId, file.id)}
        >
          Download
        </Link>
      ) : file.errorMessage ? (
        <p className="mt-3 text-sm text-red-800">{file.errorMessage}</p>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = statusStyle(status);
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded border px-2.5 text-xs font-semibold uppercase ${style.styles}`}
    >
      {style.label}
    </span>
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
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm">
        {error.code}
        {error.status ? ` (${error.status})` : ""}: {error.message}
      </p>
    </section>
  );
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function toApiClientError(error: unknown, fallbackMessage: string): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "WORK_HOURS_LOAD_FAILED",
    message: error instanceof Error ? error.message : fallbackMessage,
    status: 0,
  });
}
