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

export interface LoadJobResponseDto {
  id: string;
  containerId: string;
  container: LoadJobContainerResponseDto | null;
  loadNo: string | null;
  truckNo: string | null;
  carrier: string | null;
  destinationRegion: string | null;
  status: string;
  canScan: boolean;
  createdById: string | null;
  createdBy: LoadJobUserResponseDto | null;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  palletCount: number;
  eventCount: number;
}

export interface LoadJobListResponseDto {
  items: LoadJobResponseDto[];
  limit: number;
  offset: number;
}
