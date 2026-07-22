import Link from "next/link";
import type { ReactNode } from "react";
import {
  AttendanceImportActions,
  AttendanceUploadPanel,
} from "@/components/wage/work-hours-actions";
import { AttendanceRowDeleteButton } from "@/components/wage/attendance-row-deletion";
import {
  attendanceApiErrorMessage,
  formatHours,
} from "@/components/wage/attendance-flow";
import { WorkHoursGeneratedFiles } from "@/components/wage/work-hours-generated-files";
import {
  attendanceCalculationMethodLabel,
  attendanceParserVersionLabel,
  buildEmployeeAttendanceGroups,
  employeeAttendanceIdentityKey,
  type EmployeeAttendanceGroup,
} from "@/components/wage/employee-attendance-review";
import {
  formatDateOnly,
  formatDateTime,
  issueList,
  statusStyle,
} from "@/components/wage/wage-display";
import {
  ApiClientError,
  getAttendanceParseResult,
  getAttendanceRowHistory,
  listAttendanceImportFiles,
  listAttendanceImports,
  type AttendanceImportListResponse,
  type AttendanceImportResponse,
  type AttendanceParseResultResponse,
  type AttendanceRowHistoryResponse,
  type WageGeneratedFileResponse,
} from "@/lib/api-client";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import {
  canGenerateWorkHours,
  canDeleteAttendanceRows,
  canParseWorkHours,
  canReviewWorkHours,
  canUploadWorkHours,
} from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface WorkHoursSearchParams {
  attendanceImportId?: string | string[];
  employeeKey?: string | string[];
}

type WorkHoursState =
  | {
      detailError: ApiClientError | null;
      files: WageGeneratedFileResponse[];
      filesError: ApiClientError | null;
      history: AttendanceRowHistoryResponse;
      historyError: ApiClientError | null;
      imports: AttendanceImportListResponse;
      listError: null;
      parseResult: AttendanceParseResultResponse | null;
      selectedImportId: string | null;
    }
  | {
      detailError: null;
      files: [];
      filesError: null;
      history: AttendanceRowHistoryResponse;
      historyError: null;
      imports: null;
      listError: ApiClientError;
      parseResult: null;
      selectedImportId: null;
    };

interface WorkHoursPermissions {
  canGenerate: boolean;
  canDelete: boolean;
  canParse: boolean;
  canRead: boolean;
  canUpload: boolean;
}

function AttendanceDeletionHistory({
  history,
  historyError,
  locale,
}: {
  history: AttendanceRowHistoryResponse;
  historyError: ApiClientError | null;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);
  if (historyError) {
    return (
      <div className="mt-5">
        <ApiErrorPanel
          error={historyError}
          locale={locale}
          title="Attendance deletion history could not be loaded"
        />
      </div>
    );
  }

  return (
    <section className="mt-6 border-t border-zinc-200 pt-5" aria-labelledby="attendance-history-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-950" id="attendance-history-heading">
            {t("Deletion history")}
          </h3>
          <p className="mt-1 text-xs text-zinc-600">
            {format("i18n.workHours.historyCount", { count: history.total })}
          </p>
        </div>
        <span className="border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
          {t("Excluded from active settlement")}
        </span>
      </div>
      {history.items.length === 0 ? (
        <p className="mt-3 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
          {t("No attendance rows have been deleted.")}
        </p>
      ) : (
        <div className="mt-3 max-h-[32rem] max-w-full overflow-auto border border-zinc-200" role="region" tabIndex={0} aria-label={t("Deletion history")}>
          <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-zinc-100">
              <tr className="border-b border-zinc-300 text-xs uppercase text-zinc-600">
                <th className="w-[17%] px-3 py-3 font-semibold">{t("Employee")}</th>
                <th className="w-[10%] px-3 py-3 font-semibold">{t("Date")}</th>
                <th className="w-[18%] px-3 py-3 font-semibold">{t("Punches")}</th>
                <th className="w-[8%] px-3 py-3 text-right font-semibold">{t("Hours")}</th>
                <th className="w-[14%] px-3 py-3 font-semibold">{t("Deleted by")}</th>
                <th className="w-[14%] px-3 py-3 font-semibold">{t("Deleted at")}</th>
                <th className="w-[19%] px-3 py-3 font-semibold">{t("Reason")}</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((event) => {
                const snapshot = event.rowSnapshot ?? {};
                return (
                  <tr className="border-b border-zinc-200 bg-red-50/40 align-top last:border-0" key={event.id}>
                    <td className="break-words px-3 py-3 font-medium">
                      {event.employeeName ?? t("Unknown employee")}
                      <span className="mt-1 block text-xs text-zinc-500">{event.employeeId ?? t("No employee ID")}</span>
                    </td>
                    <td className="px-3 py-3">{event.workDate}</td>
                    <td className="break-words px-3 py-3 text-xs">{punchTimesText(snapshot.punchTimes, locale)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatHours(typeof snapshot.calculatedHours === "string" || typeof snapshot.calculatedHours === "number" ? String(snapshot.calculatedHours) : null)}</td>
                    <td className="break-words px-3 py-3">{event.actor.displayLabel}</td>
                    <td className="break-words px-3 py-3 text-xs">{formatDateTime(event.occurredAt, locale)}</td>
                    <td className="break-words px-3 py-3">{event.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
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
    canDelete: canDeleteAttendanceRows(currentUser),
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
              canDelete={permissions.canDelete}
              canParse={permissions.canParse}
              files={state.files}
              filesError={state.filesError}
              history={state.history}
              historyError={state.historyError}
              locale={locale}
              parseResult={state.parseResult}
              selectedEmployeeKey={firstSearchValue(params.employeeKey)}
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
        history: { items: [], limit: 50, offset: 0, total: 0 },
        historyError: null,
        imports,
        listError: null,
        parseResult: null,
        selectedImportId: null,
      };
    }

    const [parseResult, filesResult, historyResult] = await Promise.allSettled([
      getAttendanceParseResult(selectedImportId, apiOptions),
      listAttendanceImportFiles(selectedImportId, apiOptions),
      getAttendanceRowHistory(selectedImportId, { limit: 50, offset: 0 }, apiOptions),
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
      history:
        historyResult.status === "fulfilled"
          ? historyResult.value
          : { items: [], limit: 50, offset: 0, total: 0 },
      historyError:
        historyResult.status === "rejected"
          ? toApiClientError(historyResult.reason, "Attendance deletion history failed.")
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
      history: { items: [], limit: 50, offset: 0, total: 0 },
      historyError: null,
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
  canDelete,
  canGenerate,
  canParse,
  files,
  filesError,
  history,
  historyError,
  locale,
  parseResult,
  selectedEmployeeKey,
}: {
  canDelete: boolean;
  canGenerate: boolean;
  canParse: boolean;
  files: WageGeneratedFileResponse[];
  filesError: ApiClientError | null;
  history: AttendanceRowHistoryResponse;
  historyError: ApiClientError | null;
  locale: Locale;
  parseResult: AttendanceParseResultResponse;
  selectedEmployeeKey: string | null;
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
              <p className="mt-1 text-xs font-medium text-zinc-500">
                {format("i18n.workHours.activeDeletedCounts", {
                  active: parseResult.activeRowCount,
                  deleted: parseResult.deletedRowCount,
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
          <EmployeeAttendanceReview
            attendanceImportId={importFile.id}
            canDelete={canDelete}
            history={history}
            locale={locale}
            parserVersion={importFile.parserVersion}
            rows={parseResult.rows}
            selectedEmployeeKey={selectedEmployeeKey}
          />
          <AttendanceDeletionHistory
            history={history}
            historyError={historyError}
            locale={locale}
          />
        </section>
      </div>

      <section className="min-w-0 border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          {t("Wage record files")}
        </h2>
        {filesError ? (
          <div className="mt-4">
            <ApiErrorPanel
              error={filesError}
              locale={locale}
              title="Wage record files could not be loaded"
            />
          </div>
        ) : (
          <WorkHoursGeneratedFiles
            attendanceImportId={importFile.id}
            files={files}
            locale={locale}
          />
        )}
      </section>
    </section>
  );
}

function EmployeeAttendanceReview({
  attendanceImportId,
  canDelete,
  history,
  locale,
  parserVersion,
  rows,
  selectedEmployeeKey,
}: {
  attendanceImportId: string;
  canDelete: boolean;
  history: AttendanceRowHistoryResponse;
  locale: Locale;
  parserVersion: string | null;
  rows: AttendanceParseResultResponse["rows"];
  selectedEmployeeKey: string | null;
}) {
  const { format, t } = createTranslator(locale);
  const activeEmployeeGroups = buildEmployeeAttendanceGroups(rows);
  const employeeGroups = [...activeEmployeeGroups];
  for (const event of history.items) {
    const identityKey = employeeAttendanceIdentityKey(event);
    if (employeeGroups.some((group) => group.identityKey === identityKey)) continue;
    employeeGroups.push({
      department: event.department,
      employeeId: event.employeeId,
      employeeName: event.employeeName,
      identityKey,
      rows: [],
      summary: {
        reviewDays: 0,
        rowCount: 0,
        totalCalculatedHours: 0,
        workedDays: 0,
      },
    });
  }
  const selectedEmployee =
    employeeGroups.find((group) => group.identityKey === selectedEmployeeKey) ??
    employeeGroups[0] ??
    null;

  if (!selectedEmployee) {
    return (
      <p className="mt-5 border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
        {t("No parsed rows are stored yet. Run Parse to populate employee-day rows.")}
      </p>
    );
  }

  return (
    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
      <nav
        aria-label={t("Employee month index")}
        className="min-w-0 border border-zinc-200 bg-zinc-50 p-3 lg:self-start"
      >
        <div className="border-b border-zinc-200 px-2 pb-3">
          <h3 className="font-semibold text-zinc-950">{t("Employee month index")}</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            {format("i18n.workHours.employeeIndexSummary", {
              count: employeeGroups.length,
              rows: rows.length,
            })}
          </p>
        </div>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
          {employeeGroups.map((group) => (
            <li key={group.identityKey}>
              <EmployeeIndexLink
                attendanceImportId={attendanceImportId}
                employee={group}
                isSelected={group.identityKey === selectedEmployee.identityKey}
                locale={locale}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        <div
          aria-live="polite"
          className="border-l-4 border-teal-700 bg-teal-50 px-4 py-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
            {t("Current employee")}
          </p>
          <h3 className="mt-1 break-words text-xl font-semibold text-zinc-950">
            {employeeDisplayName(selectedEmployee, locale)}
          </h3>
          <p className="mt-1 break-words text-sm text-zinc-700">
            {employeeAuxiliaryText(selectedEmployee, locale)}
          </p>
          <p className="mt-2 text-xs font-medium text-zinc-600">
            {attendanceParserVersionLabel(parserVersion, locale)}
          </p>
        </div>

        <dl className="mt-3 grid grid-cols-2 border-l border-t border-zinc-200 sm:grid-cols-4">
          <AttendanceSummaryItem
            label={t("Worked days")}
            value={selectedEmployee.summary.workedDays}
          />
          <AttendanceSummaryItem
            label={t("Review days")}
            value={selectedEmployee.summary.reviewDays}
          />
          <AttendanceSummaryItem
            label={t("Total calculated hours")}
            value={formatHours(selectedEmployee.summary.totalCalculatedHours)}
          />
          <AttendanceSummaryItem
            label={t("Displayed rows")}
            value={selectedEmployee.summary.rowCount}
          />
        </dl>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-zinc-950" id="employee-month-detail-heading">
              {t("Monthly attendance detail")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              {format("i18n.workHours.completeMonthRows", {
                count: selectedEmployee.rows.length,
              })}
            </p>
          </div>
        </div>
        <div
          aria-labelledby="employee-month-detail-heading"
          className="mt-3 max-w-full overflow-x-auto border border-zinc-200"
          role="region"
          tabIndex={0}
        >
          {selectedEmployee.rows.length === 0 ? (
            <p className="border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
              {t("This employee has no active attendance rows. Review deletion history below.")}
            </p>
          ) : (
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <th className="w-[10%] px-3 py-3 font-semibold">{t("Date")}</th>
                <th className="w-[18%] px-3 py-3 font-semibold">{t("Punches")}</th>
                <th className="w-[16%] px-3 py-3 font-semibold">
                  {t("Calculation method")}
                </th>
                <th className="w-[10%] px-3 py-3 text-right font-semibold">
                  {t("Gross")}
                </th>
                <th className="w-[10%] px-3 py-3 text-right font-semibold">
                  {t("Lunch")}
                </th>
                <th className="w-[10%] px-3 py-3 text-right font-semibold">
                  {t("Hours")}
                </th>
                <th className="w-[18%] px-3 py-3 font-semibold">{t("Issues")}</th>
                {canDelete ? <th className="w-[10%] px-3 py-3 font-semibold">{t("Action")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {selectedEmployee.rows.map((row) => {
                const rowIssues = [
                  ...issueList(row.warnings, locale),
                  ...issueList(row.errors, locale),
                ];
                return (
                  <tr className="border-b border-zinc-100 align-top last:border-0" key={row.id}>
                    <td className="break-words px-3 py-3 font-medium">{row.workDate}</td>
                    <td className="break-words px-3 py-3 text-xs text-zinc-700">
                      {punchTimesText(row.punchTimes, locale)}
                    </td>
                    <td className="break-words px-3 py-3">
                      <CalculationMethodBadge
                        locale={locale}
                        method={row.calculationMethod}
                      />
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
                    <td className="break-words px-3 py-3 text-xs text-amber-900">
                      {rowIssues.length > 0 ? (
                        <ul className="space-y-1">
                          {rowIssues.map((issue, index) => (
                            <li key={`${row.id}-issue-${index}`}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        "-"
                      )}
                    </td>
                    {canDelete ? (
                      <td className="px-3 py-3">
                        <AttendanceRowDeleteButton
                          attendanceImportId={attendanceImportId}
                          row={row}
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}

function EmployeeIndexLink({
  attendanceImportId,
  employee,
  isSelected,
  locale,
}: {
  attendanceImportId: string;
  employee: EmployeeAttendanceGroup;
  isSelected: boolean;
  locale: Locale;
}) {
  const { format } = createTranslator(locale);
  const name = employeeDisplayName(employee, locale);
  return (
    <Link
      aria-current={isSelected ? "page" : undefined}
      aria-label={format("i18n.workHours.reviewEmployee", { employee: name })}
      className={`block min-h-12 border px-3 py-2 text-left ${
        isSelected
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-transparent text-zinc-800 hover:border-zinc-300 hover:bg-white"
      }`}
      href={`/work-hours?attendanceImportId=${encodeURIComponent(attendanceImportId)}&employeeKey=${encodeURIComponent(employee.identityKey)}`}
    >
      <span className="block break-words text-sm font-semibold">{name}</span>
      <span
        className={`mt-0.5 block break-words text-xs ${isSelected ? "text-teal-50" : "text-zinc-500"}`}
      >
        {employeeAuxiliaryText(employee, locale)}
      </span>
    </Link>
  );
}

function AttendanceSummaryItem({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="border-b border-r border-zinc-200 bg-white px-3 py-3">
      <dt className="break-words text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words text-lg font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function CalculationMethodBadge({
  locale,
  method,
}: {
  locale: Locale;
  method: string;
}) {
  const isFallback = method === "FIRST_LAST_FALLBACK";
  const isPaired = method === "PAIRED_INTERVALS";
  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2.5 text-xs font-semibold ${
        isFallback
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : isPaired
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-zinc-200 bg-zinc-50 text-zinc-700"
      }`}
    >
      {attendanceCalculationMethodLabel(method, locale)}
    </span>
  );
}

function employeeDisplayName(
  employee: Pick<EmployeeAttendanceGroup, "employeeName">,
  locale: Locale,
): string {
  return employee.employeeName ?? createTranslator(locale).t("Unknown employee");
}

function employeeAuxiliaryText(
  employee: Pick<EmployeeAttendanceGroup, "department" | "employeeId">,
  locale: Locale,
): string {
  const { format, t } = createTranslator(locale);
  return format("i18n.workHours.employeeAuxiliary", {
    department: employee.department ?? t("Unknown department"),
    employeeId: employee.employeeId ?? t("No employee ID"),
  });
}

function punchTimesText(input: unknown, locale: Locale): string {
  if (!Array.isArray(input)) {
    return createTranslator(locale).t("Punch details unavailable");
  }
  if (input.length === 0) {
    return createTranslator(locale).t("No punches");
  }
  return input.map((value) => String(value)).join(", ");
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
