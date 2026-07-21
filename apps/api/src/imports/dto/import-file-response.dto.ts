export interface ImportFileContainerSummaryDto {
  id: string;
  containerNo: string;
  status: string;
}

export interface ImportFileResponseDto {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  mimeType: string | null;
  fileSizeBytes: string | null;
  format: string;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  parseSelection: ImportParseSelectionDto | null;
  deletedAt: string | null;
  deletedById: string | null;
  deleteReason: string | null;
  containers: ImportFileContainerSummaryDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportParseSelectionProfileDto {
  id: string;
  familyId: string;
  stableName: string;
  customerLabel: string | null;
  version: number;
  lifecycle: string;
  trustState: string;
}

export interface ImportParseSelectionDto {
  contractVersion: string;
  source: string;
  reasonCode: string;
  outcome: string;
  candidateCount: number;
  durationMs: number;
  autoCommitted: boolean;
  profile: ImportParseSelectionProfileDto | null;
  matchReasons: Array<{ code: string; matched: boolean; params: unknown }>;
  blockingWarningCodes: string[];
  fingerprintHash: string | null;
  matcherVersion: string | null;
  mappingVersion: string | null;
  workerVersion: string | null;
  parserVersion: string | null;
}

export interface ImportFileListResponseDto {
  items: ImportFileResponseDto[];
  limit: number;
  offset: number;
}

export interface ContainerLineResponseDto {
  id: string;
  lineNo: number;
  destinationCode: string | null;
  destinationType: string | null;
  cartons: number | null;
  volume: string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
}

export interface ContainerDestinationResponseDto {
  id: string;
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
  warnings: unknown;
  errors: unknown;
}

export interface ContainerResponseDto {
  id: string;
  importFileId: string | null;
  containerNo: string;
  sourceFormat: string;
  parserVersion: string | null;
  status: string;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
  lines: ContainerLineResponseDto[];
  destinations: ContainerDestinationResponseDto[];
}

export interface ImportParseResultResponseDto {
  importFile: ImportFileResponseDto;
  containers: ContainerResponseDto[];
  warnings: unknown[];
  errors: unknown[];
}
