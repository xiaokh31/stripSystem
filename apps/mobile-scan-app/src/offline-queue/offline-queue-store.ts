import type { SettingsStore } from "../storage/settings-store";
import type { CreateOfflineScanInput, OfflineScanRecord } from "./offline-queue-types";

export const offlineScanQueueStorageKey = "bestar.mobileScan.offlineQueue";

export interface OfflineQueueStore {
  enqueue(input: CreateOfflineScanInput): Promise<OfflineScanRecord>;
  list(): Promise<OfflineScanRecord[]>;
  markFailed(localId: string, error: string): Promise<OfflineScanRecord | null>;
  markSynced(localId: string): Promise<OfflineScanRecord | null>;
}

export interface OfflineQueueStoreOptions {
  createLocalId?: () => string;
  now?: () => Date;
}

export class AsyncStorageOfflineQueueStore implements OfflineQueueStore {
  private readonly createLocalId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly store: SettingsStore,
    options: OfflineQueueStoreOptions = {},
  ) {
    this.createLocalId = options.createLocalId ?? createOfflineLocalId;
    this.now = options.now ?? (() => new Date());
  }

  async enqueue(input: CreateOfflineScanInput): Promise<OfflineScanRecord> {
    const record: OfflineScanRecord = {
      deviceId: input.deviceId,
      lastError: null,
      loadJobId: input.loadJobId,
      localId: this.createLocalId(),
      qrPayload: input.qrPayload,
      scannedAt: this.now().toISOString(),
      syncStatus: "PENDING",
      syncedAt: null,
      userId: input.userId ?? null,
    };
    const records = await this.list();
    await this.write([record, ...records]);
    return record;
  }

  async list(): Promise<OfflineScanRecord[]> {
    const raw = await this.store.getItem(offlineScanQueueStorageKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter(isOfflineScanRecord)
        : [];
    } catch {
      return [];
    }
  }

  async markFailed(
    localId: string,
    error: string,
  ): Promise<OfflineScanRecord | null> {
    return this.update(localId, (record) => ({
      ...record,
      lastError: error,
      syncStatus: "FAILED",
    }));
  }

  async markSynced(localId: string): Promise<OfflineScanRecord | null> {
    return this.update(localId, (record) => ({
      ...record,
      lastError: null,
      syncStatus: "SYNCED",
      syncedAt: this.now().toISOString(),
    }));
  }

  private async update(
    localId: string,
    updateRecord: (record: OfflineScanRecord) => OfflineScanRecord,
  ): Promise<OfflineScanRecord | null> {
    const records = await this.list();
    let updated: OfflineScanRecord | null = null;
    const next = records.map((record) => {
      if (record.localId !== localId) {
        return record;
      }
      updated = updateRecord(record);
      return updated;
    });
    await this.write(next);
    return updated;
  }

  private async write(records: OfflineScanRecord[]): Promise<void> {
    await this.store.setItem(
      offlineScanQueueStorageKey,
      JSON.stringify(records),
    );
  }
}

export function createOfflineLocalId(
  random = Math.random,
  now = () => new Date(),
): string {
  const timePart = now().getTime().toString(36);
  const randomPart = Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0");
  return `offline-scan-${timePart}-${randomPart}`;
}

function isOfflineScanRecord(value: unknown): value is OfflineScanRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.localId === "string" &&
    typeof record.loadJobId === "string" &&
    typeof record.qrPayload === "string" &&
    typeof record.scannedAt === "string" &&
    typeof record.deviceId === "string" &&
    (record.syncStatus === "PENDING" ||
      record.syncStatus === "FAILED" ||
      record.syncStatus === "SYNCED") &&
    (record.lastError === null || typeof record.lastError === "string") &&
    (record.userId === null || typeof record.userId === "string") &&
    (record.syncedAt === null || typeof record.syncedAt === "string")
  );
}
