import test from "node:test";
import assert from "node:assert/strict";
import { NativeApiError } from "../src/api/api-error";
import { scanLoadJobPallet } from "../src/load-jobs/load-jobs-client";
import type { LoadJob, LoadJobScanResponse } from "../src/load-jobs/load-job-types";
import { createNativeCameraScanner } from "../src/scan/native-camera-scanner";
import {
  isCompleteLoadingDisabled,
  isScanSubmitDisabled,
  isSupervisorOverrideDisabled,
  normalizeScanInput,
  scanErrorNotice,
  scanSuccessNotice,
} from "../src/scan/scan-view-model";

const loadJob: LoadJob = {
  canScan: true,
  carrier: "Bestar Carrier",
  closedAt: null,
  completedAt: null,
  completedBy: null,
  completedById: null,
  container: null,
  containerId: null,
  createdAt: "2026-07-02T10:00:00.000Z",
  createdBy: null,
  createdById: null,
  destinationRegion: "YEG1",
  dockNo: "D1",
  eventCount: 1,
  externalPalletCount: 0,
  id: "load-job-1",
  lines: [],
  loadNo: "LOAD-2026-001",
  palletCount: 1,
  plannedPalletCount: 5,
  scheduledDepartureAt: "2026-07-02T20:00:00.000Z",
  startedAt: null,
  status: "IN_PROGRESS",
  truckNo: "TRUCK-9",
  updatedAt: "2026-07-02T10:00:00.000Z",
};

const loadedScan: LoadJobScanResponse = {
  eventId: "event-1",
  loadJob,
  pallet: {
    containerDestinationId: "destination-1",
    containerId: "container-1",
    containerNo: "CSNU8877228",
    destinationCode: "YEG1",
    destinationType: "AMAZON_FBA",
    id: "pallet-record-1",
    loadedAt: "2026-07-02T20:00:00.000Z",
    loadJobId: "load-job-1",
    palletId: "PALLET-001",
    palletNo: 3,
    qrPayload: "SSP1|PALLET|PALLET-001",
    status: "LOADED",
  },
  progress: {
    loadedPallets: 1,
    remainingPallets: 4,
    totalPallets: 5,
  },
  result: "LOADED",
};

test("scanLoadJobPallet posts the selected load job id, QR payload, and device id", async () => {
  const requests: Array<{ body?: string; headers: HeadersInit | undefined; url: string }> = [];
  const result = await scanLoadJobPallet(
    "http://api.local/api",
    "jwt-token",
    "load job/1",
    {
      deviceId: "bestar-scan-device",
      qrPayload: "SSP1|PALLET|PALLET-001",
    },
    {
      fetcher: async (input, init) => {
        requests.push({
          body: typeof init?.body === "string" ? init.body : undefined,
          headers: init?.headers,
          url: String(input),
        });
        return new Response(JSON.stringify(loadedScan), { status: 200 });
      },
    },
  );

  assert.equal(
    requests[0]?.url,
    "http://api.local/api/load-jobs/load%20job%2F1/scan",
  );
  assert.deepEqual(requests[0]?.headers, {
    authorization: "Bearer jwt-token",
    "content-type": "application/json",
  });
  assert.equal(
    requests[0]?.body,
    JSON.stringify({
      deviceId: "bestar-scan-device",
      qrPayload: "SSP1|PALLET|PALLET-001",
    }),
  );
  assert.equal(result.progress.remainingPallets, 4);
});

test("scanLoadJobPallet posts supervisor override fields to the real scan route", async () => {
  const requests: Array<{ body?: string; url: string }> = [];
  await scanLoadJobPallet(
    "http://api.local/api",
    "jwt-token",
    "load-job-1",
    {
      deviceId: "bestar-scan-device",
      overrideReason: "Supervisor approved loading this pallet.",
      qrPayload: "SSP1|PALLET|PALLET-001",
      supervisorOverride: true,
    },
    {
      fetcher: async (input, init) => {
        requests.push({
          body: typeof init?.body === "string" ? init.body : undefined,
          url: String(input),
        });
        return new Response(JSON.stringify(loadedScan), { status: 200 });
      },
    },
  );

  assert.equal(requests[0]?.url, "http://api.local/api/load-jobs/load-job-1/scan");
  assert.equal(
    requests[0]?.body,
    JSON.stringify({
      deviceId: "bestar-scan-device",
      overrideReason: "Supervisor approved loading this pallet.",
      qrPayload: "SSP1|PALLET|PALLET-001",
      supervisorOverride: true,
    }),
  );
});

test("scan input supports manual and scanner-gun Enter submission rules", () => {
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
      canScan: true,
      qrPayload: "SSP1|PALLET|PALLET-001",
      submitting: false,
    }),
    false,
  );
});

test("native camera scanner returns the trimmed QR payload from BestarQrScanner", async () => {
  const scanner = createNativeCameraScanner({
    BestarQrScanner: {
      scanOnce: async () => "  SSP1|PALLET|PALLET-001  ",
    },
  });

  assert.equal(await scanner.scanOnce(), "SSP1|PALLET|PALLET-001");
});

test("native camera scanner reports unavailable and invalid payload states", async () => {
  await assert.rejects(
    createNativeCameraScanner({}).scanOnce(),
    /Native camera scanner module is not installed/,
  );
  await assert.rejects(
    createNativeCameraScanner({
      BestarQrScanner: {
        scanOnce: async () => "  ",
      },
    }).scanOnce(),
    /empty QR payload/,
  );
  await assert.rejects(
    createNativeCameraScanner({
      BestarQrScanner: {
        scanOnce: async () => null,
      },
    }).scanOnce(),
    /non-string QR payload/,
  );
});

test("native camera scanner preserves platform scan errors for UI fallback", async () => {
  const scanner = createNativeCameraScanner({
    BestarQrScanner: {
      scanOnce: async () => {
        throw new Error("Camera permission denied.");
      },
    },
  });

  await assert.rejects(scanner.scanOnce(), /Camera permission denied/);
});

test("native supervisor override and completion controls require permission and required fields", () => {
  assert.equal(
    isSupervisorOverrideDisabled({
      canOverride: false,
      confirmed: true,
      overridePayload: "SSP1|PALLET|PALLET-001",
      reason: "Supervisor approved.",
      submitting: false,
    }),
    true,
  );
  assert.equal(
    isSupervisorOverrideDisabled({
      canOverride: true,
      confirmed: false,
      overridePayload: "SSP1|PALLET|PALLET-001",
      reason: "Supervisor approved.",
      submitting: false,
    }),
    true,
  );
  assert.equal(
    isSupervisorOverrideDisabled({
      canOverride: true,
      confirmed: true,
      overridePayload: "SSP1|PALLET|PALLET-001",
      reason: "Supervisor approved.",
      submitting: false,
    }),
    false,
  );
  assert.equal(
    isCompleteLoadingDisabled({
      canComplete: true,
      completing: false,
      dockNo: " ",
    }),
    true,
  );
  assert.equal(
    isCompleteLoadingDisabled({
      canComplete: true,
      completing: false,
      dockNo: "D3",
    }),
    false,
  );
});

test("scan notices explain loaded, duplicate, and expected rejection states", () => {
  assert.deepEqual(scanSuccessNotice(loadedScan), {
    code: null,
    message: "Pallet loaded into the selected load job.",
    title: "Scan accepted",
    tone: "emerald",
  });
  assert.deepEqual(scanSuccessNotice({ ...loadedScan, result: "DUPLICATE" }), {
    code: "DUPLICATE",
    message: "This pallet was already scanned for the selected load job.",
    title: "Duplicate scan",
    tone: "amber",
  });

  const notInPlan = scanErrorNotice(
    new NativeApiError({
      code: "PALLET_NOT_IN_LOAD_PLAN",
      message: "Pallet is not included.",
      status: 409,
    }),
  );
  assert.equal(notInPlan.title, "Wrong load job");
  assert.equal(
    notInPlan.message,
    "This pallet is not in the selected truck loading plan.",
  );

  const planFull = scanErrorNotice(
    new NativeApiError({
      code: "LOAD_JOB_LINE_PALLET_LIMIT_REACHED",
      message: "Line full.",
      status: 409,
    }),
  );
  assert.equal(planFull.title, "Plan line full");
});
