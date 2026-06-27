export interface PalletStatsDto {
  totalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
}

export interface ContainerSummaryItemDto extends PalletStatsDto {
  containerId: string;
  containerNo: string;
  status: string;
}

export interface DestinationSummaryItemDto extends PalletStatsDto {
  containerDestinationId: string;
  destinationCode: string;
  destinationType: string | null;
}

export interface ContainerSummaryListResponseDto {
  items: ContainerSummaryItemDto[];
}

export interface ContainerDetailSummaryResponseDto extends ContainerSummaryItemDto {
  destinations: DestinationSummaryItemDto[];
}

export interface DestinationInventoryItemDto extends PalletStatsDto {
  destinationCode: string;
}

export interface InventoryListResponseDto {
  items: DestinationInventoryItemDto[];
}
