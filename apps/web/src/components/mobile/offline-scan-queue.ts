import {
  DEFAULT_LOCALE,
  type Locale,
  type MessageKey,
} from "../../lib/i18n/catalog";
import { offlineQueueStatusLabel } from "../../lib/i18n/status-labels";
import { createTranslator } from "../../lib/i18n/translator";

export type OfflineScanSyncStatus = "failed" | "pending" | "synced";

export interface OfflineScanQueueItem {
  localId: string;
  qrPayload: string;
  loadJobId: string;
  scannedAt: string;
  deviceId: string;
  syncStatus: OfflineScanSyncStatus;
  lastError: string | null;
}

export interface OfflineScanQueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface QueueOfflineScanInput {
  deviceId: string;
  loadJobId: string;
  qrPayload: string;
  scannedAt?: string;
  localId?: string;
}

export const OFFLINE_SCAN_QUEUE_STORAGE_KEY =
  "bestar.mobile.offlineScanQueue.v1";

export function createOfflineScanQueueItem(
  input: QueueOfflineScanInput,
  now: () => string = () => new Date().toISOString(),
  idFactory: () => string = createLocalQueueId,
): OfflineScanQueueItem {
  return {
    localId: input.localId ?? idFactory(),
    qrPayload: input.qrPayload,
    loadJobId: input.loadJobId,
    scannedAt: input.scannedAt ?? now(),
    deviceId: input.deviceId,
    syncStatus: "pending",
    lastError: null,
  };
}

export function readOfflineScanQueue(
  storage: OfflineScanQueueStorage,
): OfflineScanQueueItem[] {
  const value = storage.getItem(OFFLINE_SCAN_QUEUE_STORAGE_KEY);
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Offline scan queue storage must contain an array.");
  }

  return parsed.map(assertOfflineScanQueueItem);
}

export function writeOfflineScanQueue(
  storage: OfflineScanQueueStorage,
  items: OfflineScanQueueItem[],
): void {
  storage.setItem(OFFLINE_SCAN_QUEUE_STORAGE_KEY, JSON.stringify(items));
}

export function queueOfflineScan(
  storage: OfflineScanQueueStorage,
  input: QueueOfflineScanInput,
): OfflineScanQueueItem {
  const item = createOfflineScanQueueItem(input);
  const items = readOfflineScanQueue(storage);
  writeOfflineScanQueue(storage, [item, ...items]);
  return item;
}

export function markOfflineScanSynced(
  items: OfflineScanQueueItem[],
  localId: string,
): OfflineScanQueueItem[] {
  return items.map((item) =>
    item.localId === localId
      ? { ...item, lastError: null, syncStatus: "synced" }
      : item,
  );
}

export function markOfflineScanFailed(
  items: OfflineScanQueueItem[],
  localId: string,
  lastError: string,
): OfflineScanQueueItem[] {
  return items.map((item) =>
    item.localId === localId
      ? { ...item, lastError, syncStatus: "failed" }
      : item,
  );
}

export function syncableOfflineScans(
  items: OfflineScanQueueItem[],
): OfflineScanQueueItem[] {
  return items.filter((item) => item.syncStatus !== "synced");
}

export function offlineQueueCounts(items: OfflineScanQueueItem[]): {
  failed: number;
  pending: number;
  synced: number;
} {
  return items.reduce(
    (counts, item) => ({
      ...counts,
      [item.syncStatus]: counts[item.syncStatus] + 1,
    }),
    { failed: 0, pending: 0, synced: 0 },
  );
}

export function offlineScanSyncStatusLabel(
  status: OfflineScanSyncStatus,
  locale?: Locale,
): string {
  return offlineQueueStatusLabel(status, locale);
}

export function offlineScanErrorCode(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  return isApiClientError(error) ? error.code : "OFFLINE_SCAN_SYNC_FAILED";
}

export function offlineScanErrorMessage(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { t } = createTranslator(locale);
  const code = offlineScanErrorCode(error);

  if (isOfflineScanAuthError(error) || isOfflineScanAuthCode(code)) {
    return t(
      "Sign in again before syncing queued scans. Pending scans remain local and inventory was not changed.",
    );
  }

  const messages: Record<string, MessageKey> = {
    API_NETWORK_ERROR: "The scanner could not reach the API.",
  };

  return t(messages[code] ?? "Offline scan sync failed.");
}

export function shouldQueueOfflineScan(error: unknown): boolean {
  return isApiClientError(error) && error.code === "API_NETWORK_ERROR";
}

export function isOfflineScanAuthError(error: unknown): boolean {
  return (
    isApiClientError(error) &&
    (error.status === 401 ||
      error.code === "UNAUTHENTICATED" ||
      error.code === "AUTH_TOKEN_EXPIRED" ||
      error.code === "USER_INACTIVE")
  );
}

export function offlineQueuedNotice(
  item: OfflineScanQueueItem,
  locale: Locale = DEFAULT_LOCALE,
): {
  code: string;
  message: string;
  title: string;
  tone: "amber";
} {
  const { format, t } = createTranslator(locale);

  return {
    code: "OFFLINE_SCAN_QUEUED",
    message: format("i18n.mobile.offlineQueued", {
      loadJobId: item.loadJobId,
    }),
    title: t("Scan queued offline"),
    tone: "amber",
  };
}

function assertOfflineScanQueueItem(value: unknown): OfflineScanQueueItem {
  if (!isOfflineScanQueueItem(value)) {
    throw new Error("Offline scan queue item is invalid.");
  }

  return value;
}

function isOfflineScanQueueItem(value: unknown): value is OfflineScanQueueItem {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.localId === "string" &&
    typeof candidate.qrPayload === "string" &&
    typeof candidate.loadJobId === "string" &&
    typeof candidate.scannedAt === "string" &&
    typeof candidate.deviceId === "string" &&
    isOfflineScanSyncStatus(candidate.syncStatus) &&
    (candidate.lastError === null || typeof candidate.lastError === "string")
  );
}

function isOfflineScanSyncStatus(value: unknown): value is OfflineScanSyncStatus {
  return value === "failed" || value === "pending" || value === "synced";
}

function isApiClientError(
  error: unknown,
): error is Error & { code: string; status: number } {
  return (
    error instanceof Error &&
    error.name === "ApiClientError" &&
    "code" in error &&
    typeof error.code === "string" &&
    "status" in error &&
    typeof error.status === "number"
  );
}

function isOfflineScanAuthCode(code: string): boolean {
  return (
    code === "UNAUTHENTICATED" ||
    code === "AUTH_TOKEN_EXPIRED" ||
    code === "USER_INACTIVE"
  );
}

function createLocalQueueId(): string {
  return `offline-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
