import type { DashboardActivityKind } from "../../src/lib/api-client";

export type DashboardClickSurfaceType =
  | "aggregate"
  | "record"
  | "open-all"
  | "shortcut"
  | "empty"
  | "unavailable"
  | "error-shortcut";

export interface DashboardClickSurface {
  cardinality: "one" | "many";
  code?: string;
  id: string;
  kind?: DashboardActivityKind;
  type: DashboardClickSurfaceType;
}

const aggregate = (
  id: string,
  code: string,
  cardinality: DashboardClickSurface["cardinality"] = "one",
): DashboardClickSurface => ({ cardinality, code, id, type: "aggregate" });

const record = (
  id: string,
  options: {
    cardinality?: DashboardClickSurface["cardinality"];
    code?: string;
    kind?: DashboardActivityKind;
  } = {},
): DashboardClickSurface => ({
  cardinality: options.cardinality ?? "many",
  code: options.code,
  id,
  kind: options.kind,
  type: "record",
});

const action = (
  id: string,
  type: Exclude<DashboardClickSurfaceType, "aggregate" | "record">,
): DashboardClickSurface => ({ cardinality: "one", id, type });

export const DASHBOARD_AGGREGATE_CLICK_SURFACES = [
  aggregate("aggregate.work-queue.IMPORTS_AWAITING_PARSE", "IMPORTS_AWAITING_PARSE"),
  aggregate("aggregate.work-queue.IMPORTS_PARSE_FAILED", "IMPORTS_PARSE_FAILED"),
  aggregate("aggregate.work-queue.CONTAINERS_MISSING_REPORT", "CONTAINERS_MISSING_REPORT"),
  aggregate("aggregate.work-queue.CONTAINERS_MISSING_LABELS", "CONTAINERS_MISSING_LABELS"),
  aggregate("aggregate.work-queue.OPEN_LOAD_JOBS", "OPEN_LOAD_JOBS"),
  aggregate(
    "aggregate.work-queue.UNLOADING_COMPLETION_DATE_MISSING",
    "UNLOADING_COMPLETION_DATE_MISSING",
  ),
  aggregate(
    "aggregate.work-queue.ATTENDANCE_IMPORTS_NEED_PARSE",
    "ATTENDANCE_IMPORTS_NEED_PARSE",
  ),
  aggregate("aggregate.lifecycle.UPLOADED", "UPLOADED"),
  aggregate("aggregate.lifecycle.PARSED", "PARSED"),
  aggregate("aggregate.lifecycle.REPORT_GENERATED", "REPORT_GENERATED"),
  aggregate("aggregate.lifecycle.LABELS_GENERATED", "LABELS_GENERATED"),
  aggregate("aggregate.lifecycle.UNLOADED", "UNLOADED"),
  aggregate("aggregate.lifecycle.LOADING_IN_PROGRESS", "LOADING_IN_PROGRESS"),
  aggregate("aggregate.lifecycle.LOADED", "LOADED"),
  aggregate("aggregate.inventory.active", "INVENTORY_ACTIVE"),
  aggregate("aggregate.inventory.loaded", "INVENTORY_LOADED"),
  aggregate("aggregate.inventory.remaining", "INVENTORY_REMAINING"),
  aggregate(
    "aggregate.inventory.destination-remaining",
    "INVENTORY_DESTINATION_REMAINING",
    "many",
  ),
  aggregate("aggregate.load-jobs.open", "OPEN_LOAD_JOBS"),
  aggregate("aggregate.load-jobs.in-progress", "LOAD_JOBS_IN_PROGRESS"),
  aggregate("aggregate.load-jobs.due-today", "LOAD_JOBS_DUE_TODAY"),
  aggregate("aggregate.exception.PARSER_ERRORS", "PARSER_ERRORS"),
  aggregate(
    "aggregate.exception.DESTINATION_CARTON_VOLUME_MISSING",
    "DESTINATION_CARTON_VOLUME_MISSING",
  ),
  aggregate(
    "aggregate.exception.ZERO_VOLUME_WITH_CARTONS",
    "ZERO_VOLUME_WITH_CARTONS",
  ),
  aggregate(
    "aggregate.exception.FAILED_GENERATED_FILES",
    "FAILED_GENERATED_FILES",
  ),
  aggregate("aggregate.exception.SCAN_EXCEPTIONS", "SCAN_EXCEPTIONS"),
  aggregate("aggregate.exception.FAILED_ASYNC_JOBS", "FAILED_ASYNC_JOBS"),
  aggregate(
    "aggregate.monthly.completed-containers",
    "MONTHLY_COMPLETED_CONTAINERS",
  ),
  aggregate("aggregate.monthly.summary-rows", "MONTHLY_SUMMARY_ROWS"),
  aggregate(
    "aggregate.monthly.review-warnings",
    "UNLOADING_COMPLETION_DATE_MISSING",
  ),
  aggregate(
    "aggregate.attendance.need-parse",
    "ATTENDANCE_IMPORTS_NEED_PARSE",
  ),
  aggregate(
    "aggregate.attendance.errors",
    "ATTENDANCE_IMPORTS_WITH_ERRORS",
  ),
  aggregate("aggregate.wage.review", "WAGE_SETTLEMENTS_NEED_REVIEW"),
] as const satisfies readonly DashboardClickSurface[];

export const DASHBOARD_RECORD_CLICK_SURFACES = [
  record("record.load-job.active", { code: "ACTIVE_LOAD_JOB" }),
  record("record.recent.IMPORT", { kind: "IMPORT" }),
  record("record.recent.CONTAINER", { kind: "CONTAINER" }),
  record("record.recent.LOAD_JOB", {
    code: "RECENT_LOAD_JOB",
    kind: "LOAD_JOB",
  }),
  record("record.recent.GENERATED_FILE", { kind: "GENERATED_FILE" }),
  record("record.recent.CORRECTION", { kind: "CORRECTION" }),
] as const satisfies readonly DashboardClickSurface[];

export const DASHBOARD_ACTION_CLICK_SURFACES = [
  action("open-all.lifecycle", "open-all"),
  action("open-all.inventory", "open-all"),
  action("open-all.load-jobs", "open-all"),
  action("open-all.exceptions", "open-all"),
  action("open-all.monthly", "open-all"),
  action("open-all.recent", "open-all"),
  action("shortcut.inventory", "shortcut"),
  action("shortcut.load-jobs", "shortcut"),
  action("shortcut.mobile-scan", "shortcut"),
  action("shortcut.work-hours", "shortcut"),
  action("shortcut.unloading-wage", "shortcut"),
  action("shortcut.unloading-summary", "shortcut"),
  action("shortcut.admin-users", "shortcut"),
  action("shortcut.settings", "shortcut"),
  action("empty.work-queue", "empty"),
  action("empty.inventory-destinations", "empty"),
  action("empty.load-jobs", "empty"),
  action("empty.shortcuts", "empty"),
  action("empty.recent", "empty"),
  action("unavailable.inventory", "unavailable"),
  action("unavailable.load-jobs", "unavailable"),
  action("unavailable.monthly", "unavailable"),
  action("error-shortcut.imports", "error-shortcut"),
  action("error-shortcut.containers", "error-shortcut"),
  action("error-shortcut.load-jobs", "error-shortcut"),
  action("error-shortcut.reports", "error-shortcut"),
] as const satisfies readonly DashboardClickSurface[];

export const DASHBOARD_CLICK_SURFACE_INVENTORY = [
  ...DASHBOARD_AGGREGATE_CLICK_SURFACES,
  ...DASHBOARD_RECORD_CLICK_SURFACES,
  ...DASHBOARD_ACTION_CLICK_SURFACES,
] as const satisfies readonly DashboardClickSurface[];

export const DASHBOARD_RECENT_ACTIVITY_SURFACE_BY_KIND = {
  CONTAINER: "record.recent.CONTAINER",
  CORRECTION: "record.recent.CORRECTION",
  GENERATED_FILE: "record.recent.GENERATED_FILE",
  IMPORT: "record.recent.IMPORT",
  LOAD_JOB: "record.recent.LOAD_JOB",
} as const satisfies Record<DashboardActivityKind, string>;
