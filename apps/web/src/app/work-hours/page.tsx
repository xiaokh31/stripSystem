import Link from "next/link";
import type { ReactNode } from "react";
import {
  AttendanceImportActions,
  AttendanceUploadPanel,
} from "@/components/wage/work-hours-actions";
import {
  attendanceApiErrorMessage,
  formatHours,
  generatedFileAuditText,
} from "@/components/wage/attendance-flow";
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
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { generatedFileTypeLabel } from "@/lib/i18n/status-labels";
import { createTranslator } from "@/lib/i18n/translator";
import {
  canGenerateWorkHours,
  canParseWorkHours,
  canReviewWorkHours,
  canUploadWorkHours,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

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

interface WorkHoursPermissions {
  canGenerate: boolean;
  canParse: boolean;
  canRead: boolean;
  canUpload: boolean;
}

export default async function WorkHoursPage({
  searchParams,
}: {
  searchParams: Promise<WorkHoursSearchParams>;
}) {
  const params = await searchParams;
  const locale = await getServerLocale();
  const currentUser = await getServerCurrentUser();
  const permissions: WorkHoursPermissions = {
    canGenerate: canGenerateWorkHours(currentUser),
    canParse: canParseWorkHours(currentUser),
    canRead: canReviewWorkHours(currentUser),
    canUpload: canUploadWorkHours(currentUser),
  };
  if (!permissions.canRead) {
    return (
      <WorkHoursPageShell locale={locale}>
        <PermissionRequiredPanel locale={locale} />
      </WorkHoursPageShell>
    );
  }

  const state = await loadWorkHoursState(firstSearchValue(params.attendanceImportId));

  return (
    <WorkHoursPageShell locale={locale}>
      <AttendanceUploadPanel canUpload={permissions.canUpload} />

      {state.listError ? (
        <ApiErrorPanel
          error={state.listError}
          locale={locale}
          title="Attendance imports could not be loaded"
        />
      ) : (
        <>
          <AttendanceImportTable
            imports={state.imports}
            locale={locale}
            selectedImportId={state.selectedImportId}
          />
          {state.detailError ? (
            <ApiErrorPanel
              error={state.detailError}
              locale={locale}
              title="Attendance parse result could not be loaded"
            />
          ) : state.parseResult ? (
            <AttendanceDetail
              canGenerate={permissions.canGenerate}
              canParse={permissions.canParse}
              files={state.files}
              filesError={state.filesError}
              locale={locale}
              parseResult={state.parseResult}
            />
          ) : (
            <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
              {createTranslator(locale).t(
                "Select or upload an attendance import to review parsed rows.",
              )}
            </section>
          )}
        </>
      )}
    </WorkHoursPageShell>
  );
}

function WorkHoursPageShell({
  children,
  locale,
}: {
  children: ReactNode;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("HR")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Work Hours Settlement")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              {t(
                "Upload monthly attendance, review parsed employee-day rows, and generate the wage record workbook through the attendance API.",
              )}
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/work-hours"
          >
            {t("Refresh")}
          </Link>
        </div>
      </section>
      {children}
    </main>
  );
}

function PermissionRequiredPanel({ locale }: { locale: Locale }) {
  const { t } = createTranslator(locale);

  return (
    <section className="border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
      <h2 className="text-base font-semibold">
        {t("Attendance read permission required")}
      </h2>
      <p className="mt-2 text-sm leading-6">
        {t(
          "Ask an administrator for attendance.read before opening Work Hours Settlement.",
        )}
      </p>
    </section>
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
  locale,
  selectedImportId,
}: {
  imports: AttendanceImportListResponse;
  locale: Locale;
  selectedImportId: string | null;
}) {
  const { format, t } = createTranslator(locale);
  const showingText = format("i18n.workHours.importsSummary", {
    count: imports.items.length,
  });
  const limitText = format("i18n.workHours.pagination", {
    limit: imports.limit,
    offset: imports.offset,
  });

  if (imports.items.length === 0) {
    return (
      <section className="border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
        <h2 className="text-base font-semibold text-zinc-950">
          {t("No attendance imports")}
        </h2>
        <p className="mt-2 max-w-2xl leading-6">
          {t(
            "Upload a real monthly .xls attendance workbook to start HR work hours settlement.",
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
            {t("Attendance imports")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">{showingText}</p>
        </div>
        <p className="text-xs font-medium text-zinc-500">{limitText}</p>
      </div>
      <div className="mt-5 max-w-full overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <th className="w-[28%] px-3 py-3 font-semibold">{t("File")}</th>
              <th className="w-[13%] px-3 py-3 font-semibold">{t("Status")}</th>
              <th className="w-[15%] px-3 py-3 font-semibold">{t("Period")}</th>
              <th className="w-[10%] px-3 py-3 text-right font-semibold">
                {t("Rows")}
              </th>
              <th className="w-[9%] px-3 py-3 text-right font-semibold">
                {t("Issues")}
              </th>
              <th className="w-[15%] px-3 py-3 font-semibold">{t("Uploaded")}</th>
              <th className="w-[10%] px-3 py-3 font-semibold">{t("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {imports.items.map((item) => (
              <AttendanceImportRow
                importFile={item}
                isSelected={item.id === selectedImportId}
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

function AttendanceImportRow({
  importFile,
  isSelected,
  locale,
}: {
  importFile: AttendanceImportResponse;
  isSelected: boolean;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);

  return (
    <tr className="border-b border-zinc-100 align-top last:border-0">
      <td className="px-3 py-4">
        <p className="break-all font-semibold text-zinc-950">
          {importFile.originalFilename}
        </p>
        <p className="mt-1 break-all text-xs text-zinc-500">
          {format("i18n.workHours.sha256", { sha256: importFile.fileSha256 })}
        </p>
      </td>
      <td className="space-y-2 break-words px-3 py-4">
        <StatusBadge locale={locale} status={importFile.importStatus} />
        <StatusBadge locale={locale} status={importFile.parseStatus} />
      </td>
      <td className="break-words px-3 py-4 text-zinc-700">
        <p>{importFile.settlementMonth ?? "-"}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatDateOnly(importFile.periodStart)}{" "}
          {t("to")}{" "}
          {formatDateOnly(importFile.periodEnd)}
        </p>
      </td>
      <td className="px-3 py-4 text-right font-medium">
        {importFile.dayCount}
        <span className="block text-xs text-zinc-500">
          {format("i18n.workHours.employeeCount", {
            count: importFile.employeeCount,
          })}
        </span>
      </td>
      <td className="px-3 py-4 text-right font-medium">
        {importFile.warningCount} / {importFile.errorCount}
      </td>
      <td className="break-words px-3 py-4 text-zinc-700">
        {formatDateTime(importFile.createdAt, locale)}
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
          {isSelected ? t("Selected") : t("Review")}
        </Link>
      </td>
    </tr>
  );
}

function AttendanceDetail({
  canGenerate,
  canParse,
  files,
  filesError,
  locale,
  parseResult,
}: {
  canGenerate: boolean;
  canParse: boolean;
  files: WageGeneratedFileResponse[];
  filesError: ApiClientError | null;
  locale: Locale;
  parseResult: AttendanceParseResultResponse;
}) {
  const { format, t } = createTranslator(locale);
  const importFile = parseResult.attendanceImport;
  const issues = [
    ...issueList(parseResult.warnings, locale),
    ...issueList(parseResult.errors, locale),
  ];

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 gap-4">
        <section className="min-w-0 border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">
                {t("Parsed employee-day rows")}
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                {format("i18n.workHours.parsedRowsFromFile", {
                  count: parseResult.rows.length,
                  filename: importFile.originalFilename,
                })}
              </p>
            </div>
            <AttendanceImportActions
              attendanceImport={importFile}
              canGenerate={canGenerate}
              canParse={canParse}
            />
          </div>
          {issues.length > 0 ? (
            <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">{t("Review issues")}</p>
              <ul className="mt-2 space-y-1">
                {issues.slice(0, 8).map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <AttendanceRowsTable locale={locale} rows={parseResult.rows} />
        </section>
      </div>

      <section className="min-w-0 border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {t("Generated files")}
        </h2>
        {filesError ? (
          <div className="mt-4">
            <ApiErrorPanel
              error={filesError}
              locale={locale}
              title="Files could not be loaded"
            />
          </div>
        ) : files.length === 0 ? (
          <p className="mt-4 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
            {t("No wage files generated yet.")}
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {files.map((file) => (
              <GeneratedFileLink
                attendanceImportId={importFile.id}
                file={file}
                key={file.id}
                locale={locale}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function AttendanceRowsTable({
  locale,
  rows,
}: {
  locale: Locale;
  rows: AttendanceParseResultResponse["rows"];
}) {
  const { format, t } = createTranslator(locale);

  if (rows.length === 0) {
    return (
      <p className="mt-5 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
        {t("No parsed rows are stored yet. Run Parse to populate employee-day rows.")}
      </p>
    );
  }

  return (
    <div className="mt-5 max-w-full overflow-x-auto">
      <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <th className="w-[10%] px-3 py-3 font-semibold">{t("Date")}</th>
            <th className="w-[18%] px-3 py-3 font-semibold">{t("Employee")}</th>
            <th className="w-[13%] px-3 py-3 font-semibold">{t("Department")}</th>
            <th className="w-[20%] px-3 py-3 font-semibold">{t("Punches")}</th>
            <th className="w-[9%] px-3 py-3 text-right font-semibold">
              {t("Gross")}
            </th>
            <th className="w-[9%] px-3 py-3 text-right font-semibold">
              {t("Lunch")}
            </th>
            <th className="w-[9%] px-3 py-3 text-right font-semibold">
              {t("Hours")}
            </th>
            <th className="w-[12%] px-3 py-3 font-semibold">{t("Issues")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row) => (
            <tr className="border-b border-zinc-100 align-top" key={row.id}>
              <td className="break-words px-3 py-3 font-medium">
                {row.workDate}
              </td>
              <td className="break-words px-3 py-3">
                <p className="font-semibold text-zinc-950">
                  {row.employeeName ?? "-"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {row.employeeId ?? "-"}
                </p>
              </td>
              <td className="break-words px-3 py-3">{row.department ?? "-"}</td>
              <td className="break-words px-3 py-3 text-xs text-zinc-700">
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
              <td className="break-words px-3 py-3 text-xs text-amber-800">
                {[...issueList(row.warnings, locale), ...issueList(row.errors, locale)].join(
                  " / ",
                ) || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 ? (
        <p className="mt-3 text-xs text-zinc-500">
          {format("i18n.workHours.firstRows", { count: rows.length })}
        </p>
      ) : null}
    </div>
  );
}

function GeneratedFileLink({
  attendanceImportId,
  file,
  locale,
}: {
  attendanceImportId: string;
  file: WageGeneratedFileResponse;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  const downloadable = file.status === "GENERATED";
  return (
    <div className="border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950">
            {generatedFileTypeLabel(file.fileType, locale)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatDateTime(file.updatedAt, locale)}
          </p>
        </div>
        <StatusBadge locale={locale} status={file.status} />
      </div>
      <p className="mt-3 break-all text-xs leading-5 text-zinc-600">
        {generatedFileAuditText(file, locale)}
      </p>
      {downloadable ? (
        <Link
          className="mt-3 inline-flex min-h-9 items-center border border-teal-700 bg-white px-3 text-xs font-semibold uppercase text-teal-800 hover:bg-teal-50"
          href={getAttendanceGeneratedFileDownloadUrl(attendanceImportId, file.id)}
        >
          {t("Download")}
        </Link>
      ) : file.errorMessage ? (
        <p className="mt-3 text-sm text-red-800">
          {t("Generated wage file failed. Review the job result and try again.")}
        </p>
      ) : null}
    </div>
  );
}

function StatusBadge({ locale, status }: { locale: Locale; status: string }) {
  const style = statusStyle(status, locale);
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded border px-2.5 text-xs font-semibold uppercase ${style.styles}`}
      title={style.label}
    >
      {style.label}
    </span>
  );
}

function ApiErrorPanel({
  error,
  locale,
  title,
}: {
  error: ApiClientError;
  locale: Locale;
  title: MessageKey;
}) {
  const { t } = createTranslator(locale);

  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">{t(title)}</h2>
      <p className="mt-2 text-sm">{attendanceApiErrorMessage(error, locale)}</p>
      <p className="mt-2 text-xs font-semibold uppercase" data-i18n-ignore>
        {error.code}
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
