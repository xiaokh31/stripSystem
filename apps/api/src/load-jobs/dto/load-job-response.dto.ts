export interface LoadJobUserResponseDto {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

export interface LoadJobContainerResponseDto {
  id: string;
  containerNo: string;
}

export interface LoadJobLineResponseDto {
  id: string;
  sequence: number;
  sourceText: string | null;
  containerNo: string | null;
  containerId: string | null;
  container: LoadJobContainerResponseDto | null;
  containerDestinationId: string | null;
  destinationCode: string | null;
  plannedPallets: number;
  externalTransfer: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoadJobResponseDto {
  id: string;
  containerId: string | null;
  container: LoadJobContainerResponseDto | null;
  loadNo: string | null;
  truckNo: string | null;
  dockNo: string | null;
  carrier: string | null;
  destinationRegion: string | null;
  status: string;
  canScan: boolean;
  createdById: string | null;
  createdBy: LoadJobUserResponseDto | null;
  completedById: string | null;
  completedBy: LoadJobUserResponseDto | null;
  completedAt: string | null;
  startedAt: string | null;
  scheduledDepartureAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: LoadJobLineResponseDto[];
  plannedPalletCount: number;
  externalPalletCount: number;
  palletCount: number;
  eventCount: number;
}

export interface LoadJobListResponseDto {
  items: LoadJobResponseDto[];
  limit: number;
  offset: number;
}

export interface LoadJobProgressDto {
  totalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
}

export interface ScannedPalletResponseDto {
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

export interface LoadJobScanResponseDto {
  result: 'LOADED' | 'DUPLICATE' | 'REMOVED';
  loadJob: LoadJobResponseDto;
  pallet: ScannedPalletResponseDto;
  progress: LoadJobProgressDto;
  eventId: string | null;
}

export interface LoadJobLoadedPalletsResponseDto {
  items: ScannedPalletResponseDto[];
}

export interface LoadJobOperatorHistoryItemDto {
  id: string;
  loadNo: string | null;
  destinationRegion: string | null;
  truckNo: string | null;
  dockNo: string | null;
  carrier: string | null;
  scheduledDepartureAt: string | null;
  completedAt: string | null;
  completedById: string | null;
  completedBy: LoadJobUserResponseDto | null;
  totalPallets: number;
  pallets: ScannedPalletResponseDto[];
}

export interface LoadJobOperatorHistoryResponseDto {
  items: LoadJobOperatorHistoryItemDto[];
  limit: number;
  offset: number;
}
