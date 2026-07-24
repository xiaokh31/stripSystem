import { spawnSync } from "node:child_process";
import { expect } from "@playwright/test";

export interface DashboardExitGateFixture {
  asyncFailedId: string;
  asyncSucceededId: string;
  attendanceDeletedFilename: string;
  attendanceErrorFilename: string;
  attendanceErrorId: string;
  attendanceNeedParseFilename: string;
  attendanceNeedParseId: string;
  cancelledDueLoadJobId: string;
  cancelledPalletContainerId: string;
  correctionId: string;
  dueLoadJobId: string;
  effectiveLoadedContainerId: string;
  effectiveLoadingContainerId: string;
  failedGeneratedFileId: string;
  generatedFileId: string;
  importAwaitingId: string;
  importDeletedId: string;
  importErrorId: string;
  importParsedId: string;
  inventoryDestinationCode: string;
  labelsContainerId: string;
  missingLineId: string;
  monthlyContainerId: string;
  monthlyContainerNo: string;
  normalLineId: string;
  normalPalletEventId: string;
  parsedContainerId: string;
  plannedLoadJobId: string;
  reportContainerId: string;
  reviewSettlementId: string;
  scanExceptionId: string;
  settledContainerId: string;
  settledContainerNo: string;
  settledDestinationCode: string;
  unloadedContainerId: string;
  unloadedContainerNo: string;
  wageNormalId: string;
  zeroVolumeLineId: string;
}

export function createDashboardExitGateFixture(
  prefix: string,
): DashboardExitGateFixture {
  const fixture: DashboardExitGateFixture = {
    asyncFailedId: `${prefix}-async-failed`,
    asyncSucceededId: `${prefix}-async-succeeded`,
    attendanceDeletedFilename: `${prefix}-attendance-deleted.xls`,
    attendanceErrorFilename: `${prefix}-attendance-error.xls`,
    attendanceErrorId: `${prefix}-attendance-error`,
    attendanceNeedParseFilename: `${prefix}-attendance-need-parse.xls`,
    attendanceNeedParseId: `${prefix}-attendance-need-parse`,
    cancelledDueLoadJobId: `${prefix}-load-cancelled-due`,
    cancelledPalletContainerId: `${prefix}-container-excluded`,
    correctionId: `${prefix}-correction`,
    dueLoadJobId: `${prefix}-load-due`,
    effectiveLoadedContainerId: `${prefix}-container-effective-loaded`,
    effectiveLoadingContainerId: `${prefix}-container-effective-loading`,
    failedGeneratedFileId: `${prefix}-generated-failed`,
    generatedFileId: `${prefix}-generated-recent`,
    importAwaitingId: `${prefix}-import-awaiting`,
    importDeletedId: `${prefix}-import-deleted`,
    importErrorId: `${prefix}-import-error`,
    importParsedId: `${prefix}-import-parsed`,
    inventoryDestinationCode: `${prefix}-DEST`,
    labelsContainerId: `${prefix}-container-labels`,
    missingLineId: `${prefix}-line-missing`,
    monthlyContainerId: `${prefix}-container-monthly`,
    monthlyContainerNo: `${prefix}-MONTHLY`,
    normalLineId: `${prefix}-line-normal`,
    normalPalletEventId: `${prefix}-event-created`,
    parsedContainerId: `${prefix}-container-parsed`,
    plannedLoadJobId: `${prefix}-load-planned`,
    reportContainerId: `${prefix}-container-report`,
    reviewSettlementId: `${prefix}-wage-review`,
    scanExceptionId: `${prefix}-event-invalid`,
    settledContainerId: `${prefix}-container-settled`,
    settledContainerNo: `${prefix}-SETTLED`,
    settledDestinationCode: `${prefix}-SETTLED-DEST`,
    unloadedContainerId: `${prefix}-container-unloaded`,
    unloadedContainerNo: `${prefix}-UNLOADED`,
    wageNormalId: `${prefix}-wage-normal`,
    zeroVolumeLineId: `${prefix}-line-zero`,
  };

  runDashboardExitGateSql(
    String.raw`
BEGIN;
INSERT INTO import_files
  (id, original_filename, stored_path, file_sha256, format, import_status,
   parse_status, deleted_at, created_at, updated_at)
VALUES
  (:'import_awaiting_id', :'prefix' || '-awaiting.xlsx',
   'e2e/dashboard-08/' || :'prefix' || '/awaiting.xlsx',
   :'prefix' || '-sha-import-awaiting', 'UNKNOWN', 'UPLOADED', 'NOT_PARSED',
   NULL, NOW() + INTERVAL '12 minutes', NOW() + INTERVAL '12 minutes'),
  (:'import_error_id', :'prefix' || '-error.xlsx',
   'e2e/dashboard-08/' || :'prefix' || '/error.xlsx',
   :'prefix' || '-sha-import-error', 'UNKNOWN', 'UPLOADED', 'ERROR',
   NULL, NOW() + INTERVAL '11 minutes', NOW() + INTERVAL '11 minutes'),
  (:'import_parsed_id', :'prefix' || '-parsed.xlsx',
   'e2e/dashboard-08/' || :'prefix' || '/parsed.xlsx',
   :'prefix' || '-sha-import-parsed', 'UNKNOWN', 'UPLOADED', 'PARSED',
   NULL, NOW() + INTERVAL '10 minutes', NOW() + INTERVAL '10 minutes'),
  (:'import_deleted_id', :'prefix' || '-deleted.xlsx',
   'e2e/dashboard-08/' || :'prefix' || '/deleted.xlsx',
   :'prefix' || '-sha-import-deleted', 'UNKNOWN', 'UPLOADED', 'NOT_PARSED',
   NOW(), NOW() + INTERVAL '9 minutes', NOW() + INTERVAL '9 minutes');

INSERT INTO containers
  (id, import_file_id, container_no, source_format, status, created_at, updated_at)
VALUES
  (:'parsed_container_id', :'import_parsed_id', :'prefix' || '-PARSED',
   'UNKNOWN', 'PARSED', NOW() + INTERVAL '11 minutes', NOW() + INTERVAL '11 minutes'),
  (:'report_container_id', NULL, :'prefix' || '-REPORT',
   'UNKNOWN', 'REPORT_GENERATED', NOW() + INTERVAL '10 minutes', NOW() + INTERVAL '10 minutes'),
  (:'labels_container_id', NULL, :'prefix' || '-LABELS',
   'UNKNOWN', 'LABELS_GENERATED', NOW() + INTERVAL '9 minutes', NOW() + INTERVAL '9 minutes'),
  (:'unloaded_container_id', NULL, :'unloaded_container_no',
   'UNKNOWN', 'UNLOADED', NOW() + INTERVAL '8 minutes', NOW() + INTERVAL '8 minutes'),
  (:'effective_loading_container_id', NULL, :'prefix' || '-EFFECTIVE-LOADING',
   'UNKNOWN', 'LABELS_GENERATED', NOW() + INTERVAL '7 minutes', NOW() + INTERVAL '7 minutes'),
  (:'effective_loaded_container_id', NULL, :'prefix' || '-EFFECTIVE-LOADED',
   'UNKNOWN', 'LABELS_GENERATED', NOW() + INTERVAL '6 minutes', NOW() + INTERVAL '6 minutes'),
  (:'monthly_container_id', NULL, :'monthly_container_no',
   'UNKNOWN', 'UNLOADED', NOW() + INTERVAL '5 minutes', NOW() + INTERVAL '5 minutes'),
  (:'settled_container_id', NULL, :'settled_container_no',
   'UNKNOWN', 'LOADED', NOW() + INTERVAL '4 minutes', NOW() + INTERVAL '4 minutes'),
  (:'excluded_container_id', NULL, :'prefix' || '-EXCLUDED',
   'UNKNOWN', 'PARSED', NOW() + INTERVAL '3 minutes', NOW() + INTERVAL '3 minutes');

INSERT INTO container_destinations
  (id, container_id, destination_code, destination_type, package_type, cartons,
   volume, calculated_pallets, final_pallets, created_at, updated_at)
VALUES
  (:'prefix' || '-dest-parsed', :'parsed_container_id', :'inventory_destination_code',
   'WAREHOUSE', 'CARTON', 200, 20, 12, 12, NOW(), NOW()),
  (:'prefix' || '-dest-loading', :'effective_loading_container_id', :'prefix' || '-LOAD-DEST',
   'WAREHOUSE', 'CARTON', 20, 2, 2, 2, NOW(), NOW()),
  (:'prefix' || '-dest-loaded', :'effective_loaded_container_id', :'prefix' || '-LOADED-DEST',
   'WAREHOUSE', 'CARTON', 10, 1, 1, 1, NOW(), NOW()),
  (:'prefix' || '-dest-monthly', :'monthly_container_id', :'prefix' || '-MONTHLY-DEST',
   'WAREHOUSE', 'CARTON', 40, 4, 2, 2, NOW(), NOW()),
  (:'prefix' || '-dest-settled', :'settled_container_id', :'settled_destination_code',
   'WAREHOUSE', 'CARTON', 30, 3, 1, 1, NOW(), NOW()),
  (:'prefix' || '-dest-excluded', :'excluded_container_id', :'prefix' || '-EXCLUDED-DEST',
   'WAREHOUSE', 'CARTON', 20, 2, 2, 2, NOW(), NOW());

INSERT INTO pallets
  (id, container_destination_id, pallet_no, pallet_id, qr_payload, status,
   loaded_at, created_at, updated_at)
SELECT :'prefix' || '-pallet-parsed-' || n,
       :'prefix' || '-dest-parsed', n,
       :'prefix' || '-PALLET-PARSED-' || n,
       'DASH08|PALLET|' || :'prefix' || '|PARSED|' || n,
       'PLANNED', NULL, NOW(), NOW()
FROM generate_series(1, 12) AS n;
INSERT INTO pallets
  (id, container_destination_id, pallet_no, pallet_id, qr_payload, status,
   loaded_at, created_at, updated_at)
VALUES
  (:'prefix' || '-pallet-loading-1', :'prefix' || '-dest-loading', 1,
   :'prefix' || '-PALLET-LOADING-1', 'DASH08|PALLET|' || :'prefix' || '|LOADING|1',
   'LOADING', NULL, NOW(), NOW()),
  (:'prefix' || '-pallet-loading-2', :'prefix' || '-dest-loading', 2,
   :'prefix' || '-PALLET-LOADING-2', 'DASH08|PALLET|' || :'prefix' || '|LOADING|2',
   'PLANNED', NULL, NOW(), NOW()),
  (:'prefix' || '-pallet-loaded-1', :'prefix' || '-dest-loaded', 1,
   :'prefix' || '-PALLET-LOADED-1', 'DASH08|PALLET|' || :'prefix' || '|LOADED|1',
   'LOADED', NOW(), NOW(), NOW()),
  (:'prefix' || '-pallet-monthly-1', :'prefix' || '-dest-monthly', 1,
   :'prefix' || '-PALLET-MONTHLY-1', 'DASH08|PALLET|' || :'prefix' || '|MONTHLY|1',
   'PLANNED', NULL, NOW(), NOW()),
  (:'prefix' || '-pallet-settled-1', :'prefix' || '-dest-settled', 1,
   :'prefix' || '-PALLET-SETTLED-1', 'DASH08|PALLET|' || :'prefix' || '|SETTLED|1',
   'LOADED', NOW(), NOW(), NOW()),
  (:'prefix' || '-pallet-excluded-1', :'prefix' || '-dest-excluded', 1,
   :'prefix' || '-PALLET-EXCLUDED-1', 'DASH08|PALLET|' || :'prefix' || '|EXCLUDED|1',
   'CANCELLED', NULL, NOW(), NOW()),
  (:'prefix' || '-pallet-excluded-2', :'prefix' || '-dest-excluded', 2,
   :'prefix' || '-PALLET-EXCLUDED-2', 'DASH08|PALLET|' || :'prefix' || '|EXCLUDED|2',
   'ADJUSTED_OUT', NULL, NOW(), NOW());

INSERT INTO container_lines
  (id, container_id, line_no, destination_code, cartons, volume, raw_json,
   created_at, updated_at)
VALUES
  (:'missing_line_id', :'parsed_container_id', 1, NULL, 10, 1, '{}'::jsonb, NOW(), NOW()),
  (:'zero_line_id', :'parsed_container_id', 2, :'inventory_destination_code', 10, 0, '{}'::jsonb, NOW(), NOW()),
  (:'normal_line_id', :'labels_container_id', 1, :'prefix' || '-NORMAL', 10, 1, '{}'::jsonb, NOW(), NOW());

INSERT INTO generated_files
  (id, container_id, file_type, storage_path, file_sha256, status, created_at, updated_at)
VALUES
  (:'prefix' || '-report-current', :'report_container_id', 'EXCEL_REPORT',
   'e2e/dashboard-08/' || :'prefix' || '/report.xlsx',
   :'prefix' || '-sha-report', 'GENERATED', NOW(), NOW()),
  (:'prefix' || '-labels-report', :'labels_container_id', 'EXCEL_REPORT',
   'e2e/dashboard-08/' || :'prefix' || '/labels-report.xlsx',
   :'prefix' || '-sha-labels-report', 'GENERATED', NOW(), NOW()),
  (:'prefix' || '-labels-current', :'labels_container_id', 'PALLET_LABEL_PDF',
   'e2e/dashboard-08/' || :'prefix' || '/labels.pdf',
   :'prefix' || '-sha-labels', 'GENERATED', NOW(), NOW()),
  (:'failed_generated_file_id', :'parsed_container_id', 'TASK_REPORT_HTML',
   'e2e/dashboard-08/' || :'prefix' || '/failed.html',
   :'prefix' || '-sha-failed', 'FAILED', NOW(), NOW()),
  (:'generated_file_id', :'labels_container_id', 'TASK_REPORT_HTML',
   'e2e/dashboard-08/' || :'prefix' || '/recent.html',
   :'prefix' || '-sha-recent', 'GENERATED',
   NOW() + INTERVAL '13 minutes', NOW() + INTERVAL '13 minutes');

INSERT INTO load_jobs
  (id, job_no, truck_no, dock_no, destination_region, status,
   scheduled_departure_at, started_at, created_at, updated_at)
VALUES
  (:'due_load_job_id', :'prefix' || '-DUE', :'prefix' || '-TRUCK', 'D08',
   :'inventory_destination_code', 'IN_PROGRESS', NOW(), NOW(),
   NOW() + INTERVAL '14 minutes', NOW() + INTERVAL '14 minutes'),
  (:'planned_load_job_id', :'prefix' || '-PLANNED', NULL, NULL,
   :'inventory_destination_code', 'PLANNED',
   TIMESTAMPTZ '1900-01-01 00:00:00+00', NULL, NOW(), NOW()),
  (:'cancelled_due_load_job_id', :'prefix' || '-CANCELLED', NULL, NULL,
   :'inventory_destination_code', 'CANCELLED', NOW(), NULL, NOW(), NOW());
INSERT INTO load_job_lines
  (id, load_job_id, sequence, source_text, container_no, container_id,
   container_destination_id, destination_code, planned_pallets, external_transfer,
   created_at, updated_at)
VALUES
  (:'prefix' || '-load-line-due', :'due_load_job_id', 1, :'prefix' || '-PARSED-12P',
   :'prefix' || '-PARSED', :'parsed_container_id', :'prefix' || '-dest-parsed',
   :'inventory_destination_code', 12, false, NOW(), NOW()),
  (:'prefix' || '-load-line-planned', :'planned_load_job_id', 1, :'prefix' || '-MONTHLY-1P',
   :'monthly_container_no', :'monthly_container_id', :'prefix' || '-dest-monthly',
   :'prefix' || '-MONTHLY-DEST', 1, false, NOW(), NOW());

UPDATE pallets
SET load_job_id = :'due_load_job_id'
WHERE id = :'prefix' || '-pallet-loading-1';

INSERT INTO pallet_events
  (id, pallet_id, load_job_id, event_type, exception_reason, occurred_at, created_at, updated_at)
VALUES
  (:'scan_exception_id', :'prefix' || '-pallet-loaded-1', :'due_load_job_id',
   'INVALID_SCAN', 'DASHBOARD_E2E', NOW(), NOW(), NOW()),
  (:'normal_pallet_event_id', :'prefix' || '-pallet-parsed-1', NULL,
   'CREATED', NULL, NOW(), NOW(), NOW());

INSERT INTO async_jobs
  (id, job_type, status, queue_name, target_type, target_id, idempotency_key,
   import_file_id, attempts, max_attempts, queued_at, created_at, updated_at)
VALUES
  (:'async_failed_id', 'UNLOADING_PARSE', 'FAILED', 'dashboard-e2e',
   'IMPORT_FILE', :'import_error_id', :'prefix' || '-async-failed-key',
   :'import_error_id', 1, 3, NOW(), NOW(), NOW()),
  (:'async_succeeded_id', 'UNLOADING_PARSE', 'SUCCEEDED', 'dashboard-e2e',
   'IMPORT_FILE', :'import_parsed_id', :'prefix' || '-async-succeeded-key',
   :'import_parsed_id', 1, 3, NOW(), NOW(), NOW());

INSERT INTO attendance_imports
  (id, original_filename, stored_path, file_sha256, import_status, parse_status,
   deleted_at, created_at, updated_at)
VALUES
  (:'attendance_need_parse_id', :'attendance_need_parse_filename',
   'e2e/dashboard-08/' || :'prefix' || '/attendance-need-parse.xls',
   :'prefix' || '-sha-attendance-need-parse', 'UPLOADED', 'NOT_PARSED',
   NULL, NOW(), NOW()),
  (:'attendance_error_id', :'attendance_error_filename',
   'e2e/dashboard-08/' || :'prefix' || '/attendance-error.xls',
   :'prefix' || '-sha-attendance-error', 'UPLOADED', 'ERROR',
   NULL, NOW(), NOW()),
  (:'prefix' || '-attendance-deleted', :'attendance_deleted_filename',
   'e2e/dashboard-08/' || :'prefix' || '/attendance-deleted.xls',
   :'prefix' || '-sha-attendance-deleted', 'UPLOADED', 'NOT_PARSED',
   NOW(), NOW(), NOW());

INSERT INTO unloading_wage_settlements
  (id, settlement_month, currency, status, total_amount, warning_count,
   error_count, created_at, updated_at)
VALUES
  (:'review_settlement_id', '2000-01', 'CAD', 'NEEDS_REVIEW', 0, 1, 0, NOW(), NOW()),
  (:'wage_normal_id', to_char(NOW() AT TIME ZONE 'America/Edmonton', 'YYYY-MM'),
   'CAD', 'GENERATED', 0, 0, 0, NOW(), NOW());

INSERT INTO pay_containers
  (id, pay_container_no, classification, status, currency, rate_amount,
   completed_at, created_at, updated_at)
VALUES
  (:'prefix' || '-pay-monthly', :'prefix' || '-PAY-MONTHLY',
   'OCEAN_CONTAINER', 'COMPLETED', 'CAD', 100,
   NOW(), NOW(), NOW()),
  (:'prefix' || '-pay-settled', :'prefix' || '-PAY-SETTLED',
   'OCEAN_CONTAINER', 'COMPLETED', 'CAD', 100,
   NOW() - INTERVAL '2 months', NOW(), NOW());
INSERT INTO pay_container_containers
  (id, pay_container_id, container_id, container_no, created_at, updated_at)
VALUES
  (:'prefix' || '-pay-link-monthly', :'prefix' || '-pay-monthly',
   :'monthly_container_id', :'monthly_container_no', NOW(), NOW()),
  (:'prefix' || '-pay-link-settled', :'prefix' || '-pay-settled',
   :'settled_container_id', :'settled_container_no', NOW(), NOW());

INSERT INTO correction_feedback
  (id, target_type, container_id, field_name, old_value, new_value, reason,
   created_at, updated_at)
VALUES
  (:'correction_id', 'CONTAINER', :'parsed_container_id', 'status',
   '"IMPORTED"'::jsonb, '"PARSED"'::jsonb, 'DASHBOARD_E2E',
   NOW() + INTERVAL '15 minutes', NOW() + INTERVAL '15 minutes');
COMMIT;
`,
    fixtureVariables(prefix, fixture),
  );

  return fixture;
}

export function cleanupDashboardExitGateFixture(prefix: string): void {
  runDashboardExitGateSql(
    String.raw`
BEGIN;
DELETE FROM correction_feedback WHERE id LIKE :'prefix_pattern';
DELETE FROM pallet_events WHERE id LIKE :'prefix_pattern'
  OR load_job_id IN (SELECT id FROM load_jobs WHERE id LIKE :'prefix_pattern')
  OR pallet_id IN (SELECT id FROM pallets WHERE id LIKE :'prefix_pattern');
DELETE FROM async_jobs WHERE id LIKE :'prefix_pattern'
  OR idempotency_key LIKE :'prefix_pattern';
DELETE FROM wage_generated_files WHERE id LIKE :'prefix_pattern';
DELETE FROM generated_files WHERE id LIKE :'prefix_pattern';
DELETE FROM load_job_lines WHERE id LIKE :'prefix_pattern';
UPDATE pallets SET load_job_id = NULL WHERE id LIKE :'prefix_pattern';
DELETE FROM load_jobs WHERE id LIKE :'prefix_pattern';
DELETE FROM pallets WHERE id LIKE :'prefix_pattern';
DELETE FROM container_lines WHERE id LIKE :'prefix_pattern';
DELETE FROM container_destinations WHERE id LIKE :'prefix_pattern';
DELETE FROM pay_container_containers WHERE id LIKE :'prefix_pattern';
DELETE FROM unloading_wage_settlements WHERE id LIKE :'prefix_pattern';
DELETE FROM pay_containers WHERE id LIKE :'prefix_pattern';
DELETE FROM containers WHERE id LIKE :'prefix_pattern'
  OR container_no LIKE :'prefix_pattern';
DELETE FROM import_files WHERE id LIKE :'prefix_pattern'
  OR original_filename LIKE :'prefix_pattern';
DELETE FROM attendance_imports WHERE id LIKE :'prefix_pattern'
  OR original_filename LIKE :'prefix_pattern';
COMMIT;
`,
    ["-v", `prefix_pattern=${prefix}%`],
  );
}

export function dashboardExitGateFixtureCount(prefix: string): number {
  const output = runDashboardExitGateSql(
    String.raw`
COPY (
  SELECT
    (SELECT COUNT(*) FROM import_files WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM containers WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM container_lines WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM container_destinations WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM pallets WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM generated_files WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM load_jobs WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM load_job_lines WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM pallet_events WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM async_jobs WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM attendance_imports WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM unloading_wage_settlements WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM pay_containers WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM pay_container_containers WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM correction_feedback WHERE id LIKE :'prefix_pattern')
) TO STDOUT;
`,
    ["-v", `prefix_pattern=${prefix}%`],
  );
  return Number(output.trim());
}

function fixtureVariables(
  prefix: string,
  fixture: DashboardExitGateFixture,
): string[] {
  return [
    "-v", `prefix=${prefix}`,
    "-v", `import_awaiting_id=${fixture.importAwaitingId}`,
    "-v", `import_error_id=${fixture.importErrorId}`,
    "-v", `import_parsed_id=${fixture.importParsedId}`,
    "-v", `import_deleted_id=${fixture.importDeletedId}`,
    "-v", `parsed_container_id=${fixture.parsedContainerId}`,
    "-v", `report_container_id=${fixture.reportContainerId}`,
    "-v", `labels_container_id=${fixture.labelsContainerId}`,
    "-v", `unloaded_container_id=${fixture.unloadedContainerId}`,
    "-v", `unloaded_container_no=${fixture.unloadedContainerNo}`,
    "-v", `effective_loading_container_id=${fixture.effectiveLoadingContainerId}`,
    "-v", `effective_loaded_container_id=${fixture.effectiveLoadedContainerId}`,
    "-v", `monthly_container_id=${fixture.monthlyContainerId}`,
    "-v", `monthly_container_no=${fixture.monthlyContainerNo}`,
    "-v", `settled_container_id=${fixture.settledContainerId}`,
    "-v", `settled_container_no=${fixture.settledContainerNo}`,
    "-v", `settled_destination_code=${fixture.settledDestinationCode}`,
    "-v", `excluded_container_id=${fixture.cancelledPalletContainerId}`,
    "-v", `inventory_destination_code=${fixture.inventoryDestinationCode}`,
    "-v", `missing_line_id=${fixture.missingLineId}`,
    "-v", `zero_line_id=${fixture.zeroVolumeLineId}`,
    "-v", `normal_line_id=${fixture.normalLineId}`,
    "-v", `failed_generated_file_id=${fixture.failedGeneratedFileId}`,
    "-v", `generated_file_id=${fixture.generatedFileId}`,
    "-v", `due_load_job_id=${fixture.dueLoadJobId}`,
    "-v", `planned_load_job_id=${fixture.plannedLoadJobId}`,
    "-v", `cancelled_due_load_job_id=${fixture.cancelledDueLoadJobId}`,
    "-v", `scan_exception_id=${fixture.scanExceptionId}`,
    "-v", `normal_pallet_event_id=${fixture.normalPalletEventId}`,
    "-v", `async_failed_id=${fixture.asyncFailedId}`,
    "-v", `async_succeeded_id=${fixture.asyncSucceededId}`,
    "-v", `attendance_need_parse_id=${fixture.attendanceNeedParseId}`,
    "-v", `attendance_need_parse_filename=${fixture.attendanceNeedParseFilename}`,
    "-v", `attendance_error_id=${fixture.attendanceErrorId}`,
    "-v", `attendance_error_filename=${fixture.attendanceErrorFilename}`,
    "-v", `attendance_deleted_filename=${fixture.attendanceDeletedFilename}`,
    "-v", `review_settlement_id=${fixture.reviewSettlementId}`,
    "-v", `wage_normal_id=${fixture.wageNormalId}`,
    "-v", `correction_id=${fixture.correctionId}`,
  ];
}

function runDashboardExitGateSql(sql: string, variables: string[]): string {
  const result = spawnSync(
    "psql",
    [
      "-h", requiredDashboardExitGateEnv("POSTGRES_HOST"),
      "-U", requiredDashboardExitGateEnv("POSTGRES_USER"),
      "-d", requiredDashboardExitGateEnv("POSTGRES_DB"),
      "-v", "ON_ERROR_STOP=1",
      ...variables,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PGPASSWORD: requiredDashboardExitGateEnv("POSTGRES_PASSWORD"),
      },
      input: sql,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function requiredDashboardExitGateEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for WEB-DASHBOARD-08.`);
  return value;
}
