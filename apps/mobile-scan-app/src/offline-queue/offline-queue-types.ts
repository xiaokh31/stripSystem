export type OfflineScanSyncStatus = "FAILED" | "PENDING" | "SYNCED";

export interface OfflineScanRecord {
  localId: string;
  loadJobId: string;
  qrPayload: string;
  scannedAt: string;
  deviceId: string;
  syncStatus: OfflineScanSyncStatus;
  lastError: string | null;
  userId: string | null;
  syncedAt: string | null;
}

export interface CreateOfflineScanInput {
  deviceId: string;
  loadJobId: string;
  qrPayload: string;
  userId?: string | null;
}
