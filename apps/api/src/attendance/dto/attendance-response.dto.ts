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
  dataRevision: number;
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
  activeRowCount: number;
  deletedRowCount: number;
}

export interface AttendanceRowAuditEventResponseDto {
  id: string;
  eventCode: 'DELETED';
  attendanceImportId: string;
  attendanceRowId: string | null;
  rowKey: string;
  employeeId: string | null;
  employeeName: string | null;
  department: string | null;
  workDate: string;
  rowSnapshot: unknown;
  actor: { id: string | null; displayLabel: string };
  reason: string;
  occurredAt: string;
}

export interface AttendanceRowHistoryResponseDto {
  items: AttendanceRowAuditEventResponseDto[];
  limit: number;
  offset: number;
  total: number;
}

export interface DeleteAttendanceRowResponseDto {
  code: 'ATTENDANCE_ROW_DELETED' | 'ATTENDANCE_ROW_ALREADY_DELETED';
  deleted: boolean;
  alreadyDeleted: boolean;
  activeRowCount: number;
  deletedRowCount: number;
  row: AttendanceRowResponseDto;
  event: AttendanceRowAuditEventResponseDto;
  affectedGeneratedFiles: Array<{ id: string; status: 'SUPERSEDED' }>;
}

export interface AttendanceImportFileImpactDto {
  id: string;
  fileType: string;
  previousStatus: string;
  nextStatus: string;
}

export interface AttendanceImportDeletionImpactResponseDto {
  attendanceImportId: string;
  originalFilename: string;
  settlementMonth: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  employeeCount: number;
  dayCount: number;
  activeRowCount: number;
  deletedRowCount: number;
  warningCount: number;
  errorCount: number;
  generatedFileCount: number;
  generatedFileSummary: Array<{
    fileType: string;
    status: string;
    count: number;
  }>;
}

export interface AttendanceImportAuditEventResponseDto {
  id: string;
  eventCode: 'DELETED';
  attendanceImportId: string;
  originalFilename: string;
  fileSha256: string;
  importStatus: string;
  parseStatus: string;
  settlementMonth: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  employeeCount: number;
  dayCount: number;
  activeRowCount: number;
  deletedRowCount: number;
  warningCount: number;
  errorCount: number;
  generatedFiles: AttendanceImportFileImpactDto[];
  actor: { id: string | null; displayLabel: string };
  reason: string;
  occurredAt: string;
}

export interface AttendanceImportDeletionHistoryResponseDto {
  items: AttendanceImportAuditEventResponseDto[];
  limit: number;
  offset: number;
  total: number;
}

export interface DeleteAttendanceImportResponseDto {
  code:
    | 'ATTENDANCE_IMPORT_DELETED'
    | 'ATTENDANCE_IMPORT_ALREADY_DELETED';
  deleted: boolean;
  alreadyDeleted: boolean;
  event: AttendanceImportAuditEventResponseDto;
  affectedGeneratedFiles: AttendanceImportFileImpactDto[];
  fallbackImport: AttendanceImportResponseDto | null;
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
