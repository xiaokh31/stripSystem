export interface GeneratedFileResponseDto {
  id: string;
  importFileId: string | null;
  containerId: string | null;
  fileType: string;
  filename: string;
  fileSha256: string | null;
  mimeType: string | null;
  fileSizeBytes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateReportResponseDto {
  generatedFile: GeneratedFileResponseDto;
  reportEvidence: {
    expectedDestinationCount: number;
    writtenDestinationCount: number;
    orderedDestinationDigest: string;
    layoutModes: Array<'PRIMARY_ONLY' | 'EXPANDED'>;
    pageEvidence: Array<{
      page: number;
      layoutMode: 'PRIMARY_ONLY' | 'EXPANDED';
      expectedDestinationCount: number;
      writtenDestinationCount: number;
      expectedPhysicalRows: number[];
      writtenPhysicalRows: number[];
    }>;
  };
  warnings: unknown[];
  errors: unknown[];
}

export interface GeneratedFileListResponseDto {
  items: GeneratedFileResponseDto[];
  selection: {
    fileType: string;
    requestedFileId: string;
    resolvedFileId: string;
    status: 'SUPERSEDED_REPLACED';
  } | null;
}

export interface GeneratedFileDownloadDto {
  buffer: Buffer;
  filename: string;
  fileSizeBytes: number;
  mimeType: string;
}
