export type LoadJobStatus = "COMPLETED" | "IN_PROGRESS" | "PLANNED" | string;

export interface LoadJobContainer {
  id: string;
  containerNo: string;
}

export interface LoadJobUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

export interface LoadJobLine {
  id: string;
  sequence: number;
  sourceText: string | null;
  containerNo: string | null;
  containerId: string | null;
  container: LoadJobContainer | null;
  containerDestinationId: string | null;
  destinationCode: string | null;
  plannedPallets: number;
  externalTransfer: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoadJob {
  id: string;
  containerId: string | null;
  container: LoadJobContainer | null;
  loadNo: string | null;
  truckNo: string | null;
  dockNo: string | null;
  carrier: string | null;
  destinationRegion: string | null;
  status: LoadJobStatus;
  canScan: boolean;
  createdById: string | null;
  createdBy: LoadJobUser | null;
  completedById: string | null;
  completedBy: LoadJobUser | null;
  completedAt: string | null;
  startedAt: string | null;
  scheduledDepartureAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: LoadJobLine[];
  plannedPalletCount: number;
  externalPalletCount: number;
  palletCount: number;
  eventCount: number;
}

export interface LoadJobListResponse {
  items: LoadJob[];
  limit: number;
  offset: number;
}

export interface LoadJobProgress {
  loaded: number;
  planned: number;
  remaining: number;
}

export interface LoadJobProgressResponse {
  totalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
}

export interface ScannedPallet {
  id: string;
  containerId: string;
  containerNo: string;
  containerDestinationId: string;
  destinationCode: string;
  destinationType: string | null;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  loadedAt: string | null;
  loadJobId: string | null;
}

export interface ScanPalletRequest {
  deviceId?: string;
  overrideReason?: string;
  qrPayload: string;
  supervisorOverride?: boolean;
}

export interface CloseLoadJobRequest {
  dockNo?: string;
  note?: string;
  reason?: string;
}

export interface UpdateLoadJobRequest {
  dockNo?: string;
}

export interface LoadJobScanResponse {
  result: "DUPLICATE" | "LOADED" | "REMOVED";
  loadJob: LoadJob;
  pallet: ScannedPallet;
  progress: LoadJobProgressResponse;
  eventId: string | null;
}
