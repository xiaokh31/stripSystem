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
  createdAt: string;
  updatedAt: string;
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
  cartons: number;
  volume: string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  note: string | null;
  warnings: unknown;
  errors: unknown;
}

export interface ContainerResponseDto {
  id: string;
  importFileId: string;
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
