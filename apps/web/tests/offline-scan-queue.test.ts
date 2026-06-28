import test from "node:test";
import assert from "node:assert/strict";
import { ApiClientError } from "../src/lib/api-client";
import {
  OFFLINE_SCAN_QUEUE_STORAGE_KEY,
  createOfflineScanQueueItem,
  markOfflineScanFailed,
  markOfflineScanSynced,
  offlineQueueCounts,
  queueOfflineScan,
  readOfflineScanQueue,
  shouldQueueOfflineScan,
  syncableOfflineScans,
  writeOfflineScanQueue,
  type OfflineScanQueueStorage,
} from "../src/components/mobile/offline-scan-queue";

class MemoryStorage implements OfflineScanQueueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("offline scan queue item contains the required persistence fields", () => {
  const item = createOfflineScanQueueItem(
    {
      deviceId: "web-mobile-scan",
      loadJobId: "load-job-1",
      qrPayload: "SSP1|PALLET|PALLET-001",
    },
    () => "2026-06-27T10:00:00.000Z",
    () => "local-1",
  );

  assert.deepEqual(item, {
    localId: "local-1",
    qrPayload: "SSP1|PALLET|PALLET-001",
    loadJobId: "load-job-1",
    scannedAt: "2026-06-27T10:00:00.000Z",
    deviceId: "web-mobile-scan",
    syncStatus: "pending",
    lastError: null,
  });
});

test("offline scan queue keeps loadJobId and does not merge split-load scans", () => {
  const storage = new MemoryStorage();

  queueOfflineScan(storage, {
    deviceId: "scanner-1",
    loadJobId: "load-job-06-24",
    qrPayload: "SSP1|PALLET|PALLET-001",
  });
  queueOfflineScan(storage, {
    deviceId: "scanner-1",
    loadJobId: "load-job-06-25",
    qrPayload: "SSP1|PALLET|PALLET-001",
  });

  const items = readOfflineScanQueue(storage);

  assert.equal(items.length, 2);
  assert.deepEqual(
    new Set(items.map((item) => item.loadJobId)),
    new Set(["load-job-06-24", "load-job-06-25"]),
  );
});

test("offline scan queue marks records as synced or failed", () => {
  const initial = [
    createOfflineScanQueueItem(
      {
        deviceId: "scanner-1",
        loadJobId: "load-job-1",
        qrPayload: "SSP1|PALLET|PALLET-001",
      },
      () => "2026-06-27T10:00:00.000Z",
      () => "local-1",
    ),
    createOfflineScanQueueItem(
      {
        deviceId: "scanner-1",
        loadJobId: "load-job-2",
        qrPayload: "SSP1|PALLET|PALLET-002",
      },
      () => "2026-06-27T10:01:00.000Z",
      () => "local-2",
    ),
  ];

  const synced = markOfflineScanSynced(initial, "local-1");
  const failed = markOfflineScanFailed(synced, "local-2", "API_NETWORK_ERROR");

  assert.deepEqual(offlineQueueCounts(failed), {
    failed: 1,
    pending: 0,
    synced: 1,
  });
  assert.deepEqual(
    syncableOfflineScans(failed).map((item) => item.localId),
    ["local-2"],
  );
  assert.equal(failed[1]?.lastError, "API_NETWORK_ERROR");
});

test("offline scan queue only queues network send failures", () => {
  assert.equal(
    shouldQueueOfflineScan(
      new ApiClientError({
        code: "API_NETWORK_ERROR",
        message: "fetch failed",
        status: 0,
      }),
    ),
    true,
  );
  assert.equal(
    shouldQueueOfflineScan(
      new ApiClientError({
        code: "PALLET_NOT_IN_LOAD_PLAN",
        message: "Wrong load job.",
        status: 409,
      }),
    ),
    false,
  );
});

test("offline scan queue rejects malformed stored records", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    OFFLINE_SCAN_QUEUE_STORAGE_KEY,
    JSON.stringify([{ loadJobId: "load-job-1" }]),
  );

  assert.throws(
    () => readOfflineScanQueue(storage),
    /Offline scan queue item is invalid/,
  );
});

test("offline scan queue writes and reads serialized items", () => {
  const storage = new MemoryStorage();
  const item = createOfflineScanQueueItem(
    {
      deviceId: "scanner-1",
      loadJobId: "load-job-1",
      qrPayload: "SSP1|PALLET|PALLET-001",
    },
    () => "2026-06-27T10:00:00.000Z",
    () => "local-1",
  );

  writeOfflineScanQueue(storage, [item]);

  assert.deepEqual(readOfflineScanQueue(storage), [item]);
});
