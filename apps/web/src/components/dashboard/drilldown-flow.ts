import type { Locale, MessageKey } from "../../lib/i18n/catalog";
import { createTranslator } from "../../lib/i18n/translator";

export const DASHBOARD_DRILLDOWN_CODES = [
  "IMPORTS_AWAITING_PARSE",
  "IMPORTS_PARSE_FAILED",
  "CONTAINERS_MISSING_REPORT",
  "CONTAINERS_MISSING_LABELS",
  "OPEN_LOAD_JOBS",
  "UNLOADING_COMPLETION_DATE_MISSING",
  "ATTENDANCE_IMPORTS_NEED_PARSE",
  "UPLOADED",
  "PARSED",
  "REPORT_GENERATED",
  "LABELS_GENERATED",
  "UNLOADED",
  "LOADING_IN_PROGRESS",
  "LOADED",
  "INVENTORY_ACTIVE",
  "INVENTORY_LOADED",
  "INVENTORY_REMAINING",
  "INVENTORY_DESTINATION_REMAINING",
  "LOAD_JOBS_IN_PROGRESS",
  "LOAD_JOBS_DUE_TODAY",
  "PARSER_ERRORS",
  "DESTINATION_CARTON_VOLUME_MISSING",
  "ZERO_VOLUME_WITH_CARTONS",
  "FAILED_GENERATED_FILES",
  "SCAN_EXCEPTIONS",
  "FAILED_ASYNC_JOBS",
  "MONTHLY_COMPLETED_CONTAINERS",
  "MONTHLY_SUMMARY_ROWS",
  "ATTENDANCE_IMPORTS_WITH_ERRORS",
  "WAGE_SETTLEMENTS_NEED_REVIEW",
  "ACTIVE_LOAD_JOB",
  "RECENT_LOAD_JOB",
] as const;

export type DashboardDrilldownCode =
  (typeof DASHBOARD_DRILLDOWN_CODES)[number];

export interface DashboardDrilldownContext {
  code: DashboardDrilldownCode;
  from: "dashboard";
}

export function normalizeDashboardDrilldownContext(
  searchParams: {
    code?: string | string[];
    from?: string | string[];
  },
): DashboardDrilldownContext | null {
  const from = firstValue(searchParams.from);
  const code = firstValue(searchParams.code);
  if (
    from !== "dashboard" ||
    !DASHBOARD_DRILLDOWN_CODES.includes(code as DashboardDrilldownCode)
  ) {
    return null;
  }
  return { code: code as DashboardDrilldownCode, from };
}

export function appendDashboardDrilldownContext(
  params: URLSearchParams,
  context: DashboardDrilldownContext | null,
): void {
  if (!context) return;
  params.set("from", context.from);
  params.set("code", context.code);
}

export function dashboardDrilldownLabel(
  code: DashboardDrilldownCode,
  locale: Locale,
): string {
  const labels: Partial<Record<DashboardDrilldownCode, MessageKey>> = {
    ACTIVE_LOAD_JOB: "Active load jobs",
    ATTENDANCE_IMPORTS_NEED_PARSE:
      "dashboard.workQueue.attendanceImportsNeedParse",
    ATTENDANCE_IMPORTS_WITH_ERRORS:
      "Attendance imports with errors",
    CONTAINERS_MISSING_LABELS: "dashboard.workQueue.containersMissingLabels",
    CONTAINERS_MISSING_REPORT: "dashboard.workQueue.containersMissingReport",
    DESTINATION_CARTON_VOLUME_MISSING:
      "dashboard.exceptions.destinationCartonVolumeMissing",
    FAILED_ASYNC_JOBS: "dashboard.exceptions.failedAsyncJobs",
    FAILED_GENERATED_FILES: "dashboard.exceptions.failedGeneratedFiles",
    IMPORTS_AWAITING_PARSE: "dashboard.workQueue.importsAwaitingParse",
    IMPORTS_PARSE_FAILED: "dashboard.workQueue.importsParseFailed",
    INVENTORY_ACTIVE: "Active pallets",
    INVENTORY_DESTINATION_REMAINING: "Remaining pallets",
    INVENTORY_LOADED: "Loaded pallets",
    INVENTORY_REMAINING: "Remaining pallets",
    LABELS_GENERATED: "dashboard.lifecycle.labelsGenerated",
    LOADED: "dashboard.lifecycle.deliveredToDestination",
    LOADING_IN_PROGRESS: "dashboard.lifecycle.loadingInProgress",
    LOAD_JOBS_DUE_TODAY: "Due today",
    LOAD_JOBS_IN_PROGRESS: "In progress",
    MONTHLY_COMPLETED_CONTAINERS: "Completed containers",
    MONTHLY_SUMMARY_ROWS: "Summary rows",
    OPEN_LOAD_JOBS: "Open load jobs",
    PARSED: "dashboard.lifecycle.parsed",
    PARSER_ERRORS: "dashboard.exceptions.parserErrors",
    RECENT_LOAD_JOB: "Load job",
    REPORT_GENERATED: "dashboard.lifecycle.reportGenerated",
    SCAN_EXCEPTIONS: "dashboard.exceptions.scanExceptions",
    UNLOADED: "dashboard.lifecycle.unloaded",
    UNLOADING_COMPLETION_DATE_MISSING:
      "dashboard.workQueue.unloadingCompletionDateMissing",
    UPLOADED: "dashboard.lifecycle.uploaded",
    WAGE_SETTLEMENTS_NEED_REVIEW:
      "Wage settlements needing review",
    ZERO_VOLUME_WITH_CARTONS: "dashboard.exceptions.zeroVolumeWithCartons",
  };
  return createTranslator(locale).t(
    labels[code] ?? "Unknown dashboard filter",
  );
}

export function firstValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
