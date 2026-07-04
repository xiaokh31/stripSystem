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
} from "../src/components/wage/unloading-wage-flow";

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
