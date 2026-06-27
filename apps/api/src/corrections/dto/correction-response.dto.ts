export interface CorrectionFeedbackResponseDto {
  id: string;
  targetType: string;
  importFileId: string | null;
  containerId: string | null;
  containerLineId: string | null;
  containerDestinationId: string | null;
  palletId: string | null;
  generatedFileId: string | null;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  note: string | null;
  correctedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContainerCorrectionResponseDto {
  container: {
    id: string;
    importFileId: string;
    containerNo: string;
    dockNo: string | null;
    company: string | null;
    status: string;
    updatedAt: string;
  };
  corrections: CorrectionFeedbackResponseDto[];
}

export interface ContainerDestinationCorrectionResponseDto {
  containerDestination: {
    id: string;
    containerId: string;
    destinationCode: string;
    destinationType: string | null;
    cartons: number;
    volume: string;
    calculatedPallets: number;
    manualPallets: number | null;
    finalPallets: number;
    note: string | null;
    updatedAt: string;
  };
  corrections: CorrectionFeedbackResponseDto[];
}

export interface CorrectionListResponseDto {
  items: CorrectionFeedbackResponseDto[];
  limit: number;
  offset: number;
}
