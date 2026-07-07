import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLETED_UNLOADING_STATUS_VALUES,
  defaultUnloadingSummaryMonth,
  displayText,
  formatUnloadingSummaryDate,
  normalizeUnloadingSummaryMonth,
  unloadingSummaryBusinessTypeCounts,
  unloadingSummaryGeneratedFileAuditText,
  unloadingSummaryHref,
  unloadingSummaryReviewText,
  unloadingSummaryRowKey,
  unloadingSummaryWageTag,
} from "../src/components/reports/unloading-summary-flow";
import type {
  UnloadingSummaryGeneratedFileResponse,
  UnloadingSummaryRowResponse,
} from "../src/lib/api-client";

test("unloading summary month defaults and hrefs are stable", () => {
  const now = new Date("2026-06-15T21:05:09.000Z");

  assert.equal(defaultUnloadingSummaryMonth(now), "2026-06");
  assert.equal(
    normalizeUnloadingSummaryMonth({ month: "2026-07" }, now),
    "2026-07",
  );
  assert.equal(
    normalizeUnloadingSummaryMonth({ month: "not-a-month" }, now),
    "2026-06",
  );
  assert.equal(unloadingSummaryHref("2026-06"), "/unloading-summary?month=2026-06");
});

test("unloading summary exposes the completed status set", () => {
  assert.deepEqual(COMPLETED_UNLOADING_STATUS_VALUES, [
    "UNLOADED",
    "LOADING_IN_PROGRESS",
    "LOADED",
  ]);
});

test("unloading summary business type counts unique containers from API rows", () => {
  const rows = [
    rowFixture({
      businessTag: "海柜",
      classification: "OCEAN_CONTAINER",
      containerId: "container-1",
      destinationId: "dest-1",
    }),
    rowFixture({
      businessTag: "海柜",
      classification: "OCEAN_CONTAINER",
      containerId: "container-1",
      destinationId: "dest-2",
      sequence: 2,
    }),
    rowFixture({
      businessTag: "美转加",
      classification: "US_TO_CANADA_TRANSFER",
      containerId: "container-2",
      destinationId: "dest-3",
      sequence: 3,
    }),
    rowFixture({
      businessTag: "",
      classification: null,
      containerId: "container-3",
      destinationId: "dest-4",
      sequence: 4,
    }),
  ];

  assert.deepEqual(unloadingSummaryBusinessTypeCounts(rows), {
    ocean: 1,
    unknown: 1,
    usToCanada: 1,
  });
});

test("unloading summary review and file text is readable", () => {
  assert.equal(
    unloadingSummaryWageTag(
      rowFixture({ businessTag: "", classification: "US_TO_CANADA_TRANSFER" }),
    ),
    "US-to-Canada transfer",
  );
  assert.equal(
    unloadingSummaryWageTag(
      rowFixture({ businessTag: "", classification: "US_TO_CANADA_TRANSFER" }),
      "zh-CN",
    ),
    "美转加",
  );
  assert.equal(
    unloadingSummaryWageTag(
      rowFixture({ businessTag: "海柜", classification: "OCEAN_CONTAINER" }),
      "en",
    ),
    "Ocean container",
  );
  assert.equal(
    unloadingSummaryReviewText({
      code: "MISSING_COMPLETED_AT",
      containerNo: "ZCSU9025988B",
      field: "completedAt",
      message: "Container is completed but missing completion date.",
      status: "UNLOADED",
    }),
    "Container is completed but missing completion date. (Container ZCSU9025988B | Status UNLOADED | Field completedAt)",
  );
  assert.equal(
    unloadingSummaryGeneratedFileAuditText(fileFixture()),
    "SHA-256 abc123 | Size 1.5 KB | MIME application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
});

test("unloading summary row formatting keeps table keys deterministic", () => {
  const row = rowFixture({
    completedAt: "2026-06-04T17:10:00.000Z",
    containerId: "container-1",
    destinationId: null,
    destinationText: "YEG1",
    sequence: 5,
  });

  assert.equal(formatUnloadingSummaryDate(row.completedAt), "2026-06-04");
  assert.equal(displayText(null), "-");
  assert.equal(unloadingSummaryRowKey(row), "container-1:YEG1:5");
});

function rowFixture(
  overrides: Partial<UnloadingSummaryRowResponse> = {},
): UnloadingSummaryRowResponse {
  return {
    appointmentText: null,
    businessTag: "海柜",
    cartons: 100,
    classification: "OCEAN_CONTAINER",
    completedAt: "2026-06-04T17:10:00.000Z",
    containerId: "container-1",
    containerNo: "ZCSU9025988B",
    dateBusinessTag: "6.4海柜",
    destinationCode: "YEG1",
    destinationId: "destination-1",
    destinationText: "YEG1",
    destinationType: null,
    finalPallets: 5,
    operationNote: null,
    payContainerId: "pay-container-1",
    payContainerNo: "ZCSU9025988B",
    quantityText: "100 cartons / 5 pallets",
    rawJson: {},
    referenceText: null,
    sequence: 1,
    splitOrVarianceText: null,
    status: "UNLOADED",
    trailerNumber: null,
    ...overrides,
  };
}

function fileFixture(): UnloadingSummaryGeneratedFileResponse {
  return {
    containerId: null,
    createdAt: "2026-06-30T20:00:00.000Z",
    downloadUrl: "/api/unloading-summary/exports/file-1/download",
    errorMessage: null,
    fileSha256: "abc123",
    fileSizeBytes: "1536",
    fileType: "MONTHLY_UNLOADING_SUMMARY_XLSX",
    id: "file-1",
    importFileId: null,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    status: "GENERATED",
    storagePath: "generated/unloading_summary/2026-06/file.xlsx",
    updatedAt: "2026-06-30T20:00:00.000Z",
  };
}
