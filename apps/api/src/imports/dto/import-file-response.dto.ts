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
