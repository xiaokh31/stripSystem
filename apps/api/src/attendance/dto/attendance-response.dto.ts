export interface AttendanceImportResponseDto {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  mimeType: string | null;
  fileSizeBytes: string | null;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  settlementMonth: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  employeeCount: number;
  dayCount: number;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceImportListResponseDto {
  items: AttendanceImportResponseDto[];
  limit: number;
  offset: number;
}

export interface AttendanceRowResponseDto {
  id: string;
  rowKey: string;
  employeeId: string | null;
  employeeName: string | null;
  department: string | null;
  workDate: string;
  dayNumber: number;
  punchTimes: unknown;
  calculationMethod:
    | 'LEGACY_UNKNOWN'
    | 'NO_PUNCHES'
    | 'FIRST_LAST_FALLBACK'
    | 'PAIRED_INTERVALS';
  workIntervals: unknown;
  pairedGrossHours: string | null;
  lunchHours: string;
  calculatedHours: string | null;
  firstPunch: string | null;
  lastPunch: string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
}

export interface WageGeneratedFileResponseDto {
  id: string;
  attendanceImportId: string | null;
  unloadingWageSettlementId: string | null;
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

export interface AttendanceParseResultResponseDto {
  attendanceImport: AttendanceImportResponseDto;
  rows: AttendanceRowResponseDto[];
  warnings: unknown[];
  errors: unknown[];
}

export interface WageGeneratedFileListResponseDto {
  items: WageGeneratedFileResponseDto[];
}

export interface GenerateWageRecordResponseDto {
  generatedFile: WageGeneratedFileResponseDto;
  taskReport: WageGeneratedFileResponseDto | null;
  warnings: unknown[];
  errors: unknown[];
}
