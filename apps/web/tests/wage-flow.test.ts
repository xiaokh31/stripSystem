import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceUploadError,
  formatHours,
  isAllowedLegacyXlsFile,
} from "../src/components/wage/attendance-flow";
import {
  buildCompletePayContainerRequest,
  buildCreatePayContainerRequest,
  parseContainerIds,
  selectSettlementForMonth,
  settlementLineContainerNumbers,
  settlementReviewAlerts,
} from "../src/components/wage/unloading-wage-flow";
import type { UnloadingWageSettlementResponse } from "../src/lib/api-client";

test("attendance upload flow accepts only legacy xls files", () => {
  assert.equal(isAllowedLegacyXlsFile({ name: "workAttendance.xls" }), true);
  assert.equal(isAllowedLegacyXlsFile({ name: "workAttendance.XLS" }), true);
  assert.equal(isAllowedLegacyXlsFile({ name: "workAttendance.xlsx" }), false);
  assert.equal(
    attendanceUploadError({ name: "workAttendance.xlsx" }),
    "Attendance imports must use the legacy .xls time-clock workbook.",
  );
  assert.equal(formatHours("7.5"), "7.50");
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
