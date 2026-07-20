export interface CorrectionFeedbackResponseDto {
  id: string;
  targetType: string;
  importFileId: string | null;
  containerId: string | null;
  containerLineId: string | null;
  containerDestinationId: string | null;
  palletId: string | null;
  generatedFileId: string | null;
  attendanceImportId: string | null;
  payContainerId: string | null;
  unloadingWageSettlementId: string | null;
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
    importFileId: string | null;
    containerNo: string;
    dockNo: string | null;
    company: string | null;
    status: string;
    payClassification: string | null;
    payTrailerNumber: string | null;
    updatedAt: string;
  };
  corrections: CorrectionFeedbackResponseDto[];
  inventorySync: {
    containerId: string;
    containerNo: string;
    destinations: Array<{
      containerDestinationId: string;
      destinationCode: string;
      expectedPallets: number;
      reusedPallets: number;
      createdPallets: number;
      cancelledPallets: number;
      activeTotalPallets: number;
      warnings: Array<{
        code: 'HISTORICAL_PALLETS_EXCLUDED';
        adjustedOutPallets: number;
        cancelledPallets: number;
      }>;
    }>;
  } | null;
  parserLearning: {
    learningCaseId: string;
    snapshotCreated: boolean;
    replayJobId: string | null;
    warningCodes: string[];
  } | null;
}

export interface ContainerDestinationCorrectionResponseDto {
  containerDestination: {
    id: string;
    containerId: string;
    destinationCode: string;
    destinationType: string | null;
    packageType: string | null;
    cartons: number;
    volume: string;
    calculatedPallets: number;
    manualPallets: number | null;
    finalPallets: number;
    palletRuleCode: string | null;
    calculationBasisCbm: string | null;
    roundingMode: string | null;
    palletPolicySnapshot: unknown;
    note: string | null;
    updatedAt: string;
  };
  corrections: CorrectionFeedbackResponseDto[];
}

export interface ContainerDetailDestinationResponseDto {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string | null;
  packageType: string | null;
  totalCartons: number;
  totalVolumeCbm: string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  palletRuleCode: string | null;
  calculationBasisCbm: string | null;
  roundingMode: string | null;
  palletPolicySnapshot: unknown;
  note: string | null;
  warnings: unknown;
  errors: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ContainerDetailResponseDto {
  id: string;
  importFileId: string | null;
  containerNo: string;
  dockNo: string | null;
  company: string | null;
  sourceFormat: string;
  parserVersion: string | null;
  status: string;
  payClassification: string | null;
  payTrailerNumber: string | null;
  payContainers: Array<{
    id: string;
    payContainerId: string;
    payContainerNo: string;
    status: string;
  }>;
  unloadingWage: {
    payContainerId: string;
    payContainerNo: string;
    classification: string;
    trailerNumber: string | null;
    status: string;
    currency: string;
    rateAmount: string;
    completedAt: string | null;
    completedById: string | null;
    completionNote: string | null;
    associatedContainers: Array<{
      id: string;
      containerId: string;
      containerNo: string;
    }>;
    unloaders: Array<{
      id: string;
      unloadingWorkerId: string | null;
      workerUserId: string | null;
      workerCode: string;
      workerName: string;
      note: string | null;
    }>;
  } | null;
  totalCartons: number;
  totalVolumeCbm: string;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
  createdAt: string;
  updatedAt: string;
  destinations: ContainerDetailDestinationResponseDto[];
}

export interface ManualContainerResponseDto {
  container: ContainerDetailResponseDto;
  corrections: CorrectionFeedbackResponseDto[];
  learningCase:
    | import('../../parser-learning-cases/dto/parser-learning-case.dto').ParserLearningCaseResponseDto
    | null;
}

export interface CorrectionListResponseDto {
  items: CorrectionFeedbackResponseDto[];
  limit: number;
  offset: number;
}
