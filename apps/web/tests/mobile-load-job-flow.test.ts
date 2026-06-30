import test from "node:test";
import assert from "node:assert/strict";
import { ApiClientError, type LoadJobResponse } from "../src/lib/api-client";
import {
  cameraQrScannerMode,
  isReverseScanDisabled,
  isScanSubmitDisabled,
  loadJobDisplayName,
  loadJobLineLabel,
  loadJobProgressSnapshot,
  mobileLoadJobScanHref,
  normalizeScanInput,
  scanErrorNotice,
  scanSuccessNotice,
} from "../src/components/mobile/load-job-flow";

const loadJob: LoadJobResponse = {
  id: "load-job 1",
  containerId: null,
  container: null,
  loadNo: "LOAD-2026-001",
  truckNo: "TRUCK-9",
  dockNo: "D3",
  carrier: "Carrier",
  destinationRegion: "YEG2",
  status: "IN_PROGRESS",
  canScan: true,
  createdById: null,
  startedAt: null,
  scheduledDepartureAt: "2026-06-27T21:00:00.000Z",
  closedAt: null,
  createdAt: "2026-06-27T10:00:00.000Z",
  updatedAt: "2026-06-27T10:00:00.000Z",
  lines: [
    {
      id: "line-1",
      sequence: 0,
      sourceText: "CSNU8877228-1P-part1",
      containerNo: "CSNU8877228",
      containerId: "container-1",
      container: {
        id: "container-1",
        containerNo: "CSNU8877228",
      },
      containerDestinationId: "destination-1",
      destinationCode: "YEG2",
      plannedPallets: 1,
      externalTransfer: false,
      note: null,
      createdAt: "2026-06-27T10:00:00.000Z",
      updatedAt: "2026-06-27T10:00:00.000Z",
    },
  ],
  plannedPalletCount: 5,
  externalPalletCount: 12,
  palletCount: 2,
  eventCount: 2,
};

test("mobile load job links keep the load job id in the scan route", () => {
  assert.equal(loadJobDisplayName(loadJob), "LOAD-2026-001");
  assert.equal(
    mobileLoadJobScanHref("load-job 1"),
    "/mobile/load-jobs/load-job%201/scan",
  );
  assert.equal(loadJobLineLabel(loadJob.lines[0]!), "CSNU8877228-1P-part1");
});

test("camera QR scanning falls back to canvas when BarcodeDetector is missing", () => {
  assert.equal(
    cameraQrScannerMode({
      hasBarcodeDetector: true,
      hasCanvas: true,
      hasGetUserMedia: true,
    }),
    "native",
  );
  assert.equal(
    cameraQrScannerMode({
      hasBarcodeDetector: false,
      hasCanvas: true,
      hasGetUserMedia: true,
    }),
    "canvas",
  );
  assert.equal(
    cameraQrScannerMode({
      hasBarcodeDetector: false,
      hasCanvas: false,
      hasGetUserMedia: true,
    }),
    "unsupported",
  );
});

test("scan submit is disabled for empty input, closed jobs, or active submit", () => {
  assert.equal(normalizeScanInput("  SSP1|PALLET|PALLET-001  "), "SSP1|PALLET|PALLET-001");
  assert.equal(
    isScanSubmitDisabled({
      canScan: true,
      qrPayload: " ",
      submitting: false,
    }),
    true,
  );
  assert.equal(
    isScanSubmitDisabled({
      canScan: false,
      qrPayload: "SSP1|PALLET|PALLET-001",
      submitting: false,
    }),
    true,
  );
  assert.equal(
    isScanSubmitDisabled({
      canScan: true,
      qrPayload: "SSP1|PALLET|PALLET-001",
      submitting: false,
    }),
    false,
  );
});

test("reverse scan requires a loaded scan, reason, and explicit confirmation", () => {
  const loadedScan = {
    result: "LOADED" as const,
    loadJob,
    pallet: {
      id: "pallet-1",
      containerId: "container-1",
      containerNo: "CSNU8877228",
      containerDestinationId: "destination-1",
      destinationCode: "YEG2",
      destinationType: "AMAZON_FBA",
      palletNo: 1,
      palletId: "PALLET-001",
      qrPayload: "SSP1|PALLET|PALLET-001",
      status: "LOADED",
      loadedAt: "2026-06-27T10:00:00.000Z",
      loadJobId: "load-job 1",
    },
    progress: {
      totalPallets: 5,
      loadedPallets: 3,
      remainingPallets: 2,
    },
    eventId: "event-1",
  };

  assert.equal(
    isReverseScanDisabled({
      canScan: true,
      confirmed: false,
      reason: "Need to combine pallets",
      reversing: false,
      scan: loadedScan,
    }),
    true,
  );
  assert.equal(
    isReverseScanDisabled({
      canScan: true,
      confirmed: true,
      reason: " ",
      reversing: false,
      scan: loadedScan,
    }),
    true,
  );
  assert.equal(
    isReverseScanDisabled({
      canScan: true,
      confirmed: true,
      reason: "Need to combine pallets",
      reversing: false,
      scan: loadedScan,
    }),
    false,
  );
});

test("load job progress uses API supplied planned and loaded counts", () => {
  assert.deepEqual(loadJobProgressSnapshot(loadJob), {
    totalPallets: 5,
    loadedPallets: 2,
    remainingPallets: 3,
  });
});

test("scan notices distinguish success and duplicate responses", () => {
  const success = scanSuccessNotice({
    result: "LOADED",
    loadJob,
    pallet: {
      id: "pallet-1",
      containerId: "container-1",
      containerNo: "CSNU8877228",
      containerDestinationId: "destination-1",
      destinationCode: "YEG2",
      destinationType: "AMAZON_FBA",
      palletNo: 1,
      palletId: "PALLET-001",
      qrPayload: "SSP1|PALLET|PALLET-001",
      status: "LOADED",
      loadedAt: "2026-06-27T10:00:00.000Z",
      loadJobId: "load-job 1",
    },
    progress: {
      totalPallets: 5,
      loadedPallets: 3,
      remainingPallets: 2,
    },
    eventId: "event-1",
  });
  const duplicate = scanSuccessNotice({
    result: "DUPLICATE",
    loadJob,
    pallet: {
      id: "pallet-1",
      containerId: "container-1",
      containerNo: "CSNU8877228",
      containerDestinationId: "destination-1",
      destinationCode: "YEG2",
      destinationType: "AMAZON_FBA",
      palletNo: 1,
      palletId: "PALLET-001",
      qrPayload: "SSP1|PALLET|PALLET-001",
      status: "LOADED",
      loadedAt: "2026-06-27T10:00:00.000Z",
      loadJobId: "load-job 1",
    },
    progress: {
      totalPallets: 5,
      loadedPallets: 2,
      remainingPallets: 3,
    },
    eventId: null,
  });
  const removed = scanSuccessNotice({
    result: "REMOVED",
    loadJob,
    pallet: {
      id: "pallet-1",
      containerId: "container-1",
      containerNo: "CSNU8877228",
      containerDestinationId: "destination-1",
      destinationCode: "YEG2",
      destinationType: "AMAZON_FBA",
      palletNo: 1,
      palletId: "PALLET-001",
      qrPayload: "SSP1|PALLET|PALLET-001",
      status: "LABEL_PRINTED",
      loadedAt: null,
      loadJobId: null,
    },
    progress: {
      totalPallets: 5,
      loadedPallets: 1,
      remainingPallets: 4,
    },
    eventId: "event-2",
  });

  assert.equal(success.title, "Scan accepted");
  assert.equal(success.tone, "emerald");
  assert.equal(duplicate.title, "Duplicate scan");
  assert.equal(duplicate.tone, "amber");
  assert.equal(removed.title, "Progress adjusted");
  assert.equal(removed.tone, "amber");
});

test("scan API errors map load plan codes to operator-readable messages", () => {
  const notInPlan = scanErrorNotice(
    new ApiClientError({
      code: "PALLET_NOT_IN_LOAD_PLAN",
      message: "Pallet is not included in this load job.",
      status: 409,
    }),
  );
  const lineFull = scanErrorNotice(
    new ApiClientError({
      code: "LOAD_JOB_LINE_PALLET_LIMIT_REACHED",
      message: "Line is full.",
      status: 409,
    }),
  );
  const reverseRejected = scanErrorNotice(
    new ApiClientError({
      code: "PALLET_NOT_LOADED_IN_LOAD_JOB",
      message: "Pallet is not loaded in this load job.",
      status: 409,
    }),
  );

  assert.equal(notInPlan.message, "该托盘不在当前发车计划中");
  assert.equal(notInPlan.title, "Wrong load job");
  assert.equal(lineFull.message, "当前计划行托数已装满");
  assert.equal(lineFull.title, "Plan line full");
  assert.equal(
    reverseRejected.message,
    "This pallet is not currently loaded in the selected load job.",
  );
  assert.equal(reverseRejected.title, "Progress adjustment rejected");
});
