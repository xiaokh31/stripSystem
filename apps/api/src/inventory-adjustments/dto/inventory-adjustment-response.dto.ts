export interface InventoryAdjustmentPalletDto {
  id: string;
  palletId: string;
  palletNo: number;
  fromStatus: string;
  toStatus: string;
  eventId: string | null;
}

export interface InventoryAdjustmentResponseDto {
  id: string;
  containerId: string;
  containerDestinationId: string;
  adjustmentType: string;
  palletCount: number;
  reasonCode: string;
  note: string | null;
  metadata: unknown;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  pallets: InventoryAdjustmentPalletDto[];
}

export interface InventoryAdjustmentListResponseDto {
  items: InventoryAdjustmentResponseDto[];
}
