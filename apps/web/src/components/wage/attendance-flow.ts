import type {
  AttendanceImportResponse,
  WageGeneratedFileResponse,
} from "@/lib/api-client";

export interface FileLike {
  name: string;
  size?: number;
}

export function isAllowedLegacyXlsFile(file: FileLike): boolean {
  return file.name.trim().toLowerCase().endsWith(".xls");
}

export function attendanceUploadError(file: FileLike | null): string | null {
  if (!file) {
    return "Select one legacy .xls attendance workbook.";
  }

  if (!isAllowedLegacyXlsFile(file)) {
    return "Attendance imports must use the legacy .xls time-clock workbook.";
  }

  return null;
}

export function formatHours(value: string | number | null): string {
  if (value === null || value === "") {
    return "-";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  return parsed.toFixed(2);
}

export function canGenerateWageRecord(
  attendanceImport: Pick<
    AttendanceImportResponse,
    "errorCount" | "parseStatus"
  >,
): boolean {
  const parseStatus = attendanceImport.parseStatus.toUpperCase();
  return (
    (parseStatus === "PARSED" || parseStatus === "WARNING") &&
    attendanceImport.errorCount === 0
  );
}

export function wageGenerationBlockReason(
  attendanceImport: Pick<
    AttendanceImportResponse,
    "errorCount" | "parseStatus"
  >,
): string | null {
  if (canGenerateWageRecord(attendanceImport)) {
    return null;
  }

  const parseStatus = attendanceImport.parseStatus.toUpperCase();
  if (parseStatus === "NOT_PARSED" || parseStatus === "PARSING") {
    return "Parse this attendance import before generating a wage record.";
  }

  return "Parser errors must be resolved before generating a wage record.";
}

export function formatFileSize(value: string | null): string {
  if (!value) {
    return "-";
  }

  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return value;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function generatedFileAuditText(
  file: Pick<
    WageGeneratedFileResponse,
    "fileSha256" | "fileSizeBytes" | "mimeType"
  >,
): string {
  return [
    `SHA-256 ${file.fileSha256 ?? "-"}`,
    `Size ${formatFileSize(file.fileSizeBytes)}`,
    `MIME ${file.mimeType ?? "-"}`,
  ].join(" | ");
}
