import test from "node:test";
import assert from "node:assert/strict";
import { NativeApiError } from "../src/api/api-error";
import type { LoadJob, LoadJobScanResponse } from "../src/load-jobs/load-job-types";
import {
  AsyncStorageOfflineQueueStore,
  createOfflineLocalId,
  offlineScanQueueStorageKey,
} from "../src/offline-queue/offline-queue-store";
import { shouldQueueOfflineScan, syncOfflineScanRecord } from "../src/offline-queue/offline-sync";
import { MemorySettingsStore } from "../src/storage/settings-store";

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

test("offline queue persists pending scans with the selected load job id", async () => {
  const settings = new MemorySettingsStore();
  const store = new AsyncStorageOfflineQueueStore(settings, {
    createLocalId: () => "offline-scan-1",
    now: () => new Date("2026-07-02T20:00:00.000Z"),
  });

  const record = await store.enqueue({
    deviceId: "bestar-scan-device",
    loadJobId: "load-job-1",
    qrPayload: "SSP1|PALLET|PALLET-001",
    userId: "user-warehouse",
  });

  assert.deepEqual(record, {
    deviceId: "bestar-scan-device",
    lastError: null,
    loadJobId: "load-job-1",
    localId: "offline-scan-1",
    qrPayload: "SSP1|PALLET|PALLET-001",
    scannedAt: "2026-07-02T20:00:00.000Z",
    syncStatus: "PENDING",
    syncedAt: null,
    userId: "user-warehouse",
  });
  assert.equal(
    await settings.getItem(offlineScanQueueStorageKey),
    JSON.stringify([record]),
  );
});

test("syncOfflineScanRecord retries one pending record through the real scan API route", async () => {
  const requests: Array<{ body?: string; url: string }> = [];
  const settings = new MemorySettingsStore();
  const store = new AsyncStorageOfflineQueueStore(settings, {
    createLocalId: () => "offline-scan-1",
    now: () => new Date("2026-07-02T20:00:00.000Z"),
  });
  const record = await store.enqueue({
    deviceId: "bestar-scan-device",
    loadJobId: "load-job-1",
    qrPayload: "SSP1|PALLET|PALLET-001",
  });

  const result = await syncOfflineScanRecord({
    apiBaseUrl: "http://api.local/api",
    fetcher: async (input, init) => {
      requests.push({
        body: typeof init?.body === "string" ? init.body : undefined,
        url: String(input),
      });
      return new Response(JSON.stringify(loadedScan), { status: 200 });
    },
    record,
    store,
    token: "jwt-token",
  });

  assert.deepEqual(requests, [
    {
      body: JSON.stringify({
        deviceId: "bestar-scan-device",
        qrPayload: "SSP1|PALLET|PALLET-001",
      }),
      url: "http://api.local/api/load-jobs/load-job-1/scan",
    },
  ]);
  assert.equal(result.record.syncStatus, "SYNCED");
  assert.equal(result.response?.progress.remainingPallets, 4);
});

test("syncOfflineScanRecord keeps lastError when retry fails", async () => {
  const settings = new MemorySettingsStore();
  const store = new AsyncStorageOfflineQueueStore(settings, {
    createLocalId: () => "offline-scan-1",
    now: () => new Date("2026-07-02T20:00:00.000Z"),
  });
  const record = await store.enqueue({
    deviceId: "bestar-scan-device",
    loadJobId: "load-job-2",
    qrPayload: "SSP1|PALLET|PALLET-001",
  });

  const result = await syncOfflineScanRecord({
    apiBaseUrl: "http://api.local/api",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          code: "PALLET_NOT_IN_LOAD_PLAN",
          message: "Pallet is not included.",
        }),
        { status: 409 },
      ),
    record,
    store,
    token: "jwt-token",
  });

  assert.equal(result.record.loadJobId, "load-job-2");
  assert.equal(result.record.syncStatus, "FAILED");
  assert.match(result.record.lastError ?? "", /PALLET_NOT_IN_LOAD_PLAN/u);
  assert.equal(result.response, null);
});

test("offline sync preserves separate load job routes for split loading", async () => {
  const requests: string[] = [];
  const settings = new MemorySettingsStore();
  const store = new AsyncStorageOfflineQueueStore(settings, {
    createLocalId: (() => {
      let sequence = 0;
      return () => `offline-scan-${++sequence}`;
    })(),
    now: () => new Date("2026-07-02T20:00:00.000Z"),
  });
  const first = await store.enqueue({
    deviceId: "bestar-scan-device",
    loadJobId: "load-job-part-1",
    qrPayload: "SSP1|PALLET|PALLET-001",
  });
  const second = await store.enqueue({
    deviceId: "bestar-scan-device",
    loadJobId: "load-job-part-2",
    qrPayload: "SSP1|PALLET|PALLET-002",
  });

  for (const record of [first, second]) {
    await syncOfflineScanRecord({
      apiBaseUrl: "http://api.local/api",
      fetcher: async (input) => {
        requests.push(String(input));
        return new Response(JSON.stringify(loadedScan), { status: 200 });
      },
      record,
      store,
      token: "jwt-token",
    });
  }

  assert.deepEqual(requests, [
    "http://api.local/api/load-jobs/load-job-part-1/scan",
    "http://api.local/api/load-jobs/load-job-part-2/scan",
  ]);
});

test("only network style failures are queued as offline scans", () => {
  assert.equal(shouldQueueOfflineScan(new TypeError("fetch failed")), true);
  assert.equal(
    shouldQueueOfflineScan(
      new NativeApiError({
        code: "API_NETWORK_ERROR",
        message: "The scanner could not reach the API.",
        status: 0,
      }),
    ),
    true,
  );
  assert.equal(
    shouldQueueOfflineScan(
      new NativeApiError({
        code: "PALLET_NOT_IN_LOAD_PLAN",
        message: "Pallet is not in plan.",
        status: 409,
      }),
    ),
    false,
  );
});

test("offline local id generation is deterministic when injected", () => {
  assert.equal(
    createOfflineLocalId(
      () => 0,
      () => new Date("2026-07-02T00:00:00.000Z"),
    ),
    "offline-scan-mr2qmtc0-00000000",
  );
});
