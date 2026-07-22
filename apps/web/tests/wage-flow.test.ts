import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  attendanceApiErrorMessage,
  attendanceUploadError,
  canGenerateWageRecord,
  formatFileSize,
  formatHours,
  generatedFileAuditText,
  isAllowedLegacyXlsFile,
  isOfficeVisibleWageFile,
  officeVisibleWageFiles,
  wageGenerationBlockReason,
} from "../src/components/wage/attendance-flow";
import { WorkHoursGeneratedFiles } from "../src/components/wage/work-hours-generated-files";
import {
  buildCompletePayContainerRequest,
  buildCreatePayContainerRequest,
  parseContainerIds,
  selectSettlementForMonth,
  settlementLineContainerNumbers,
  settlementReviewAlerts,
} from "../src/components/wage/unloading-wage-flow";
import type {
  UnloadingWageSettlementResponse,
  WageGeneratedFileResponse,
} from "../src/lib/api-client";

test("attendance upload flow accepts only legacy xls files", () => {
  assert.equal(isAllowedLegacyXlsFile({ name: "workAttendance.xls" }), true);
  assert.equal(isAllowedLegacyXlsFile({ name: "workAttendance.XLS" }), true);
  assert.equal(isAllowedLegacyXlsFile({ name: "workAttendance.xlsx" }), false);
  assert.equal(
    attendanceUploadError({ name: "workAttendance.xlsx" }),
    "Attendance imports must use the legacy .xls time-clock workbook.",
  );
  assert.equal(
    attendanceUploadError(null),
    "Select one legacy .xls attendance workbook.",
  );
  assert.equal(formatHours("7.5"), "7.50");
});

test("attendance wage generation is blocked until parse succeeds without errors", () => {
  assert.equal(
    canGenerateWageRecord({ errorCount: 0, parseStatus: "PARSED" }),
    true,
  );
  assert.equal(
    canGenerateWageRecord({ errorCount: 0, parseStatus: "WARNING" }),
    true,
  );
  assert.equal(
    canGenerateWageRecord({ errorCount: 0, parseStatus: "NOT_PARSED" }),
    false,
  );
  assert.equal(
    wageGenerationBlockReason({ errorCount: 0, parseStatus: "NOT_PARSED" }),
    "Parse this attendance import before generating a wage record.",
  );
  assert.equal(
    wageGenerationBlockReason({ errorCount: 1, parseStatus: "ERROR" }),
    "Parser errors must be resolved before generating a wage record.",
  );
});

test("generated attendance file metadata is formatted for review", () => {
  assert.equal(formatFileSize("1536"), "1.5 KB");
  assert.equal(
    generatedFileAuditText({
      fileSha256: "abc123",
      fileSizeBytes: "1536",
      mimeType: "application/vnd.ms-excel",
    }),
    "SHA-256 abc123 | Size 1.5 KB | MIME application/vnd.ms-excel",
  );
});

test("office wage file allowlist keeps every wage workbook status and defaults to hidden", () => {
  const files = [
    generatedFileFixture("wage-current", "WAGE_RECORD_XLS", "GENERATED"),
    generatedFileFixture("wage-superseded", "WAGE_RECORD_XLS", "SUPERSEDED"),
    generatedFileFixture("wage-failed", "WAGE_RECORD_XLS", "FAILED"),
    generatedFileFixture("parsed", "ATTENDANCE_PARSED_JSON", "GENERATED"),
    generatedFileFixture("report", "TASK_REPORT_HTML", "GENERATED"),
    generatedFileFixture("future", "FUTURE_DIAGNOSTIC", "GENERATED"),
    generatedFileFixture("empty", "", "GENERATED"),
  ] as const;
  const inputOrder = files.map((file) => file.id);
  const visible = officeVisibleWageFiles(files);

  assert.deepEqual(
    visible.map((file) => [file.id, file.status]),
    [
      ["wage-current", "GENERATED"],
      ["wage-superseded", "SUPERSEDED"],
      ["wage-failed", "FAILED"],
    ],
  );
  assert.deepEqual(files.map((file) => file.id), inputOrder);
  assert.notEqual(visible, files);
  assert.equal(visible[0], files[0]);
  assert.equal(isOfficeVisibleWageFile({ fileType: null }), false);
  assert.equal(isOfficeVisibleWageFile({}), false);
});

test("work hours file render omits technical cards, metadata, and download anchors", () => {
  const files = [
    generatedFileFixture("wage-current", "WAGE_RECORD_XLS", "GENERATED"),
    generatedFileFixture("wage-superseded", "WAGE_RECORD_XLS", "SUPERSEDED"),
    generatedFileFixture("wage-failed", "WAGE_RECORD_XLS", "FAILED", "wage failure"),
    generatedFileFixture("parsed-file-id", "ATTENDANCE_PARSED_JSON", "GENERATED"),
    generatedFileFixture("report-file-id", "TASK_REPORT_HTML", "GENERATED"),
    generatedFileFixture("future-file-id", "FUTURE_DIAGNOSTIC", "GENERATED"),
  ];
  const html = renderToStaticMarkup(
    createElement(WorkHoursGeneratedFiles, {
      attendanceImportId: "attendance-1",
      files,
      locale: "en",
    }),
  );

  assert.equal((html.match(/data-testid="wage-record-file"/g) ?? []).length, 3);
  assert.equal((html.match(/>Wage record</g) ?? []).length, 3);
  assert.match(
    html,
    /href="\/work-hours\/attendance-1\/files\/wage-current\/download"/,
  );
  assert.doesNotMatch(html, /parsed-file-id|report-file-id|future-file-id/);
  assert.doesNotMatch(
    html,
    /Parsed attendance data|Task report|FUTURE_DIAGNOSTIC|technical-sha/,
  );
});

test("work hours file render uses the filtered wage-record empty state", () => {
  const html = renderToStaticMarkup(
    createElement(WorkHoursGeneratedFiles, {
      attendanceImportId: "attendance-1",
      files: [
        generatedFileFixture("parsed-file-id", "ATTENDANCE_PARSED_JSON", "GENERATED"),
        generatedFileFixture("report-file-id", "TASK_REPORT_HTML", "GENERATED"),
      ],
      locale: "zh-CN",
    }),
  );

  assert.match(html, /尚未生成工资表。/);
  assert.doesNotMatch(html, /已解析考勤数据|任务报告|download/);
});

test("attendance API errors map to review workflow messages", () => {
  assert.equal(
    attendanceApiErrorMessage({
      code: "DUPLICATE_ATTENDANCE_IMPORT",
      message: "Attendance file content already exists by SHA-256.",
      status: 409,
    }),
    "Duplicate attendance upload: this workbook already exists by SHA-256.",
  );
  assert.equal(
    attendanceApiErrorMessage({
      code: "ATTENDANCE_PARSE_FAILED",
      message: "The attendance file could not be parsed.",
      status: 400,
    }),
    "Attendance parse failed. Review parser errors before generating a wage record.",
  );
  assert.equal(
    attendanceApiErrorMessage({
      code: "WAGE_RECORD_GENERATION_FAILED",
      message: "Worker failed.",
      status: 500,
    }),
    "Wage record generation failed. Review generated file history for the failed record.",
  );
  assert.equal(
    attendanceApiErrorMessage(
      { code: "ATTENDANCE_IMPORT_BUSY", message: "busy", status: 409 },
      "zh-CN",
    ),
    "考勤解析或工资表生成正在运行，请在完成后重试。",
  );
  assert.equal(
    attendanceApiErrorMessage({
      code: "ATTENDANCE_DATA_REVISION_CHANGED",
      message: "changed",
      status: 409,
    }),
    "Attendance data changed during generation. Generate the wage record again.",
  );
});

test("pay container draft validates classification-specific fields", () => {
  assert.deepEqual(parseContainerIds("container-a, container-b\ncontainer-c"), [
    "container-a",
    "container-b",
    "container-c",
  ]);

  assert.deepEqual(
    buildCreatePayContainerRequest({
      classification: "US_TO_CANADA_TRANSFER",
      containerIdsText: "container-a container-b",
      rateAmount: "",
      reason: "Reviewed",
      trailerNumber: "",
    }),
    {
      error: "US-to-Canada transfer pay units require a trailer number.",
      ok: false,
    },
  );

  assert.deepEqual(
    buildCreatePayContainerRequest({
      classification: "OCEAN_CONTAINER",
      containerIdsText: "container-a",
      rateAmount: "300",
      reason: "Reviewed",
      trailerNumber: "",
    }),
    {
      ok: true,
      payload: {
        classification: "OCEAN_CONTAINER",
        containerIds: ["container-a"],
        rateAmount: 300,
        reason: "Reviewed",
        trailerNumber: null,
      },
    },
  );
});

test("complete unloading draft builds API payload", () => {
  const result = buildCompletePayContainerRequest({
    allocationMethod: "EQUAL_SPLIT",
    completedAt: "2026-06-04T17:10",
    note: "Dock 4",
    reason: "Completed",
    unloaders: [
      {
        allocationAmount: "",
        allocationPercent: "",
        note: "",
        workerCode: "W1",
        workerName: "Worker One",
      },
      {
        allocationAmount: "",
        allocationPercent: "",
        note: "Lead",
        workerCode: "W2",
        workerName: "Worker Two",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.allocationMethod, "EQUAL_SPLIT");
    assert.equal(result.payload.unloaders.length, 2);
    assert.equal(result.payload.unloaders[1]?.note, "Lead");
  }
});

test("monthly settlement review selects the requested month version only", () => {
  const settlements = [
    settlementFixture({
      id: "july-generated",
      settlementMonth: "2026-07",
      status: "GENERATED",
    }),
    settlementFixture({
      id: "june-superseded",
      settlementMonth: "2026-06",
      status: "SUPERSEDED",
    }),
    settlementFixture({
      id: "june-generated",
      settlementMonth: "2026-06",
      status: "GENERATED",
    }),
  ];

  assert.equal(
    selectSettlementForMonth(settlements, "2026-06", null)?.id,
    "june-generated",
  );
  assert.equal(
    selectSettlementForMonth(settlements, "2026-06", "june-superseded")?.id,
    "june-superseded",
  );
  assert.equal(selectSettlementForMonth(settlements, "2026-05", null), null);
});

test("monthly settlement review alerts expose stale and superseded versions", () => {
  const alerts = settlementReviewAlerts(
    [
      settlementFixture({
        id: "needs-review",
        settlementMonth: "2026-06",
        status: "NEEDS_REVIEW",
      }),
      settlementFixture({
        id: "superseded",
        settlementMonth: "2026-06",
        status: "SUPERSEDED",
      }),
      settlementFixture({
        id: "other-month",
        settlementMonth: "2026-07",
        status: "NEEDS_REVIEW",
      }),
    ],
    "2026-06",
  );

  assert.equal(alerts.length, 2);
  assert.match(alerts[0] ?? "", /need review/);
  assert.match(alerts[1] ?? "", /superseded/);
});

test("settlement detail parses associated container numbers for display", () => {
  assert.deepEqual(settlementLineContainerNumbers(["ZCSU1", "TGBU2"]), [
    "ZCSU1",
    "TGBU2",
  ]);
  assert.deepEqual(settlementLineContainerNumbers("ZCSU1+TGBU2, MSKU3"), [
    "ZCSU1",
    "TGBU2",
    "MSKU3",
  ]);
  assert.deepEqual(settlementLineContainerNumbers(null), []);
});

function settlementFixture(
  input: Pick<
    UnloadingWageSettlementResponse,
    "id" | "settlementMonth" | "status"
  >,
): UnloadingWageSettlementResponse {
  return {
    id: input.id,
    settlementMonth: input.settlementMonth,
    status: input.status,
    createdAt: "2026-06-30T20:00:00.000Z",
    currency: "CAD",
    errorCount: 0,
    errors: [],
    generatedFiles: [],
    lines: [],
    totalAmount: "0.00",
    updatedAt: "2026-06-30T20:00:00.000Z",
    warningCount: 0,
    warnings: [],
    workers: [],
  };
}

function generatedFileFixture(
  id: string,
  fileType: string,
  status: string,
  errorMessage: string | null = null,
): WageGeneratedFileResponse {
  return {
    attendanceImportId: "attendance-1",
    createdAt: "2026-07-22T12:00:00.000Z",
    errorMessage,
    fileSha256: fileType === "WAGE_RECORD_XLS" ? `${id}-sha` : "technical-sha",
    fileSizeBytes: "1536",
    fileType,
    id,
    mimeType:
      fileType === "WAGE_RECORD_XLS"
        ? "application/vnd.ms-excel"
        : "application/octet-stream",
    status,
    storagePath: `/workspace/storage/${id}`,
    unloadingWageSettlementId: null,
    updatedAt: "2026-07-22T12:00:00.000Z",
  };
}
