export interface GeneratedFileResponseDto {
  id: string;
  importFileId: string | null;
  containerId: string | null;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType: string | null;
  fileSizeBytes: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateReportResponseDto {
  generatedFile: GeneratedFileResponseDto;
  warnings: unknown[];
  errors: unknown[];
}

export interface GeneratedFileListResponseDto {
  items: GeneratedFileResponseDto[];
}

export interface GeneratedFileDownloadDto {
  buffer: Buffer;
  filename: string;
  fileSizeBytes: number;
  mimeType: string;
}
