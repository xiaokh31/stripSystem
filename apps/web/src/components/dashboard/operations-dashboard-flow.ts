import {
  type DashboardActivityKind,
  type DashboardRange,
  type DashboardRecentActivityItemResponse,
  type DashboardSeverity,
  type OperationsDashboardFilters,
} from "@/lib/api-client";
import { LOCALE_MESSAGES, type Locale } from "../../lib/i18n/catalog";
import {
  businessStatusLabel,
  containerLifecycleStatusLabel,
  generatedOrImportStatusLabel,
  loadJobStatusLabel,
} from "../../lib/i18n/status-labels";
import { translateMessage } from "../../lib/i18n/translator";
import type { DashboardTone } from "./dashboard-components";

export interface DashboardSearchParams {
  month?: string | string[];
  range?: string | string[];
}

const DASHBOARD_RANGES: DashboardRange[] = ["today", "7d", "30d"];
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export function normalizeDashboardFilters(
  searchParams: DashboardSearchParams,
): OperationsDashboardFilters {
  return {
    month: normalizeMonth(firstParam(searchParams.month)),
    range: normalizeRange(firstParam(searchParams.range)),
  };
}

export function dashboardHref(filters: OperationsDashboardFilters): string {
  const params = new URLSearchParams();

  if (filters.range && filters.range !== "today") {
    params.set("range", filters.range);
  }
  if (filters.month) {
    params.set("month", filters.month);
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function dashboardRangeOptions(locale: Locale): Array<{
  label: string;
  value: DashboardRange;
}> {
  return DASHBOARD_RANGES.map((range) => ({
    label: dashboardRangeLabel(range, locale),
    value: range,
  }));
}

export function dashboardRangeLabel(
  range: DashboardRange,
  locale: Locale,
): string {
  const labels: Record<DashboardRange, string> = {
    "30d": "30 days",
    "7d": "7 days",
    today: "Today",
  };

  return translate(labels[range], locale);
}

export function dashboardLabel(labelKey: string, locale: Locale): string {
  if (labelKey in LOCALE_MESSAGES.en) {
    const key = labelKey as keyof typeof LOCALE_MESSAGES.en;
    return LOCALE_MESSAGES[locale][key];
  }

  return translate("Unknown dashboard item", locale);
}

export function dashboardLifecycleLabel(
  stage: { code: string; labelKey: string },
  locale: Locale,
): string {
  if (
    stage.code === "LOADED" ||
    stage.code === "LOADING_IN_PROGRESS" ||
    stage.code === "UNLOADED"
  ) {
    return containerLifecycleStatusLabel(stage.code, locale);
  }

  return dashboardLabel(stage.labelKey, locale);
}

export function dashboardSeverityTone(
  severity: DashboardSeverity,
): DashboardTone {
  const tones: Record<DashboardSeverity, DashboardTone> = {
    attention: "warning",
    blocked: "danger",
    normal: "success",
  };

  return tones[severity];
}

export function dashboardSeverityLabel(
  severity: DashboardSeverity,
  locale: Locale,
): string {
  return translate(
    {
      attention: "Needs attention",
      blocked: "Blocked",
      normal: "Normal",
    }[severity],
    locale,
  );
}

export function dashboardEmptyLabel(code: string, locale: Locale): string {
  const labels: Record<string, string> = {
    ATTENDANCE_IMPORTS_NEED_PARSE: "No attendance imports need parsing",
    CONTAINERS_MISSING_LABELS: "No containers need labels",
    CONTAINERS_MISSING_REPORT: "No containers need reports",
    IMPORTS_AWAITING_PARSE: "No imports need parsing",
    IMPORTS_PARSE_FAILED: "No failed imports",
    OPEN_LOAD_JOBS: "No open load jobs",
    UNLOADING_COMPLETION_DATE_MISSING: "No completion dates need review",
  };

  return translate(labels[code] ?? "No action needed", locale);
}

export function dashboardOpenActionLabel(code: string, locale: Locale): string {
  const labels: Record<string, string> = {
    ATTENDANCE_IMPORTS_NEED_PARSE: "Open work hours",
    CONTAINERS_MISSING_LABELS: "Open containers",
    CONTAINERS_MISSING_REPORT: "Open containers",
    IMPORTS_AWAITING_PARSE: "Open imports",
    IMPORTS_PARSE_FAILED: "Open imports",
    OPEN_LOAD_JOBS: "Open load jobs",
    UNLOADING_COMPLETION_DATE_MISSING: "Open unloading summary",
  };

  return translate(labels[code] ?? "Open dashboard target", locale);
}

export function dashboardUnavailableMessage(
  section: "inventory" | "loadJobs" | "monthlySummary" | "wageAndAttendance",
  locale: Locale,
): string {
  const labels: Record<typeof section, string> = {
    inventory: "Inventory pressure is unavailable for this account.",
    loadJobs: "Load job progress is unavailable for this account.",
    monthlySummary: "Monthly unloading summary is unavailable for this account.",
    wageAndAttendance: "Work hours and unloading wage queues are unavailable for this account.",
  };

  return translate(labels[section], locale);
}

export function dashboardActivityKindLabel(
  kind: DashboardActivityKind,
  locale: Locale,
): string {
  const labels: Record<DashboardActivityKind, string> = {
    CONTAINER: "Container",
    CORRECTION: "Correction",
    GENERATED_FILE: "Generated file",
    IMPORT: "Import",
    LOAD_JOB: "Load job",
  };

  return translate(labels[kind], locale);
}

export function dashboardActivityPrimaryLabel(
  activity: DashboardRecentActivityItemResponse,
  locale: Locale,
): string {
  if (activity.kind === "CORRECTION") {
    return translate("Correction recorded", locale);
  }

  if (activity.kind === "GENERATED_FILE") {
    return generatedFileTypeLabel(activity.label, locale);
  }

  return activity.label;
}

export function dashboardActivityStatusLabel(
  activity: DashboardRecentActivityItemResponse,
  locale: Locale,
): string {
  if (activity.kind === "CONTAINER") {
    return containerLifecycleStatusLabel(activity.status, locale);
  }
  if (activity.kind === "GENERATED_FILE" || activity.kind === "IMPORT") {
    return generatedOrImportStatusLabel(activity.status, locale);
  }
  if (activity.kind === "LOAD_JOB") {
    return loadJobStatusLabel(activity.status, locale);
  }
  if (activity.kind === "CORRECTION") {
    return translate("Correction recorded", locale);
  }

  return businessStatusLabel(activity.status, locale);
}

export function generatedFileTypeLabel(
  fileType: string,
  locale: Locale,
): string {
  const labels: Record<string, string> = {
    EXCEL_REPORT: "Excel report",
    MONTHLY_UNLOADING_SUMMARY_XLSX: "Monthly unloading summary",
    PALLET_LABEL_PDF: "Label PDF",
    TASK_REPORT_HTML: "Task report",
    UNLOADING_WAGE_SETTLEMENT_XLSX: "Unloading wage settlement",
    WAGE_RECORD_XLSX: "Wage record",
  };

  return translate(labels[fileType] ?? "Generated file", locale);
}

function normalizeRange(value: string | undefined): DashboardRange {
  return DASHBOARD_RANGES.includes(value as DashboardRange)
    ? (value as DashboardRange)
    : "today";
}

function normalizeMonth(value: string | undefined): string | undefined {
  return value && MONTH_PATTERN.test(value) ? value : undefined;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function translate(source: string, locale: Locale): string {
  return translateMessage(source, locale) ?? source;
}
