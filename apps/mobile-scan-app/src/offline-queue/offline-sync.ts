import { NativeApiError } from "../api/api-error";
import { scanLoadJobPallet } from "../load-jobs/load-jobs-client";
import type { LoadJobScanResponse } from "../load-jobs/load-job-types";
import type { OfflineQueueStore } from "./offline-queue-store";
import type { OfflineScanRecord } from "./offline-queue-types";

export interface OfflineSyncResult {
  record: OfflineScanRecord;
  response: LoadJobScanResponse | null;
}

export function shouldQueueOfflineScan(error: unknown): boolean {
  if (error instanceof NativeApiError) {
    return error.code === "API_NETWORK_ERROR";
  }

  return error instanceof Error;
}

export function offlineErrorMessage(error: unknown): string {
  if (error instanceof NativeApiError) {
    return `${error.code}: ${error.message}`;
  }

  return error instanceof Error ? error.message : "Offline scan sync failed.";
}

export async function syncOfflineScanRecord(input: {
  apiBaseUrl: string;
  fetcher?: typeof fetch;
  record: OfflineScanRecord;
  store: OfflineQueueStore;
  token: string;
}): Promise<OfflineSyncResult> {
  try {
    const response = await scanLoadJobPallet(
      input.apiBaseUrl,
      input.token,
      input.record.loadJobId,
      {
        deviceId: input.record.deviceId,
        qrPayload: input.record.qrPayload,
      },
      { fetcher: input.fetcher },
    );
    const synced = await input.store.markSynced(input.record.localId);
    return {
      record: synced ?? input.record,
      response,
    };
  } catch (error) {
    if (
      error instanceof NativeApiError &&
      error.status === 401 &&
      error.code === "AUTH_TOKEN_EXPIRED"
    ) {
      throw error;
    }
    const failed = await input.store.markFailed(
      input.record.localId,
      offlineErrorMessage(error),
    );
    return {
      record: failed ?? input.record,
      response: null,
    };
  }
}
