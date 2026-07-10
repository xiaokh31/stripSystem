import type {
  AttendanceImportResponse,
  WageGeneratedFileResponse,
} from "@/lib/api-client";
import { DEFAULT_LOCALE, type Locale } from "../../lib/i18n/catalog";
import { translateMessage } from "../../lib/i18n/translator";

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
  locale: Locale = DEFAULT_LOCALE,
): string {
  const sizeLabel = translateMessage("Size", locale) ?? "Size";
  return [
    `SHA-256 ${file.fileSha256 ?? "-"}`,
    `${sizeLabel} ${formatFileSize(file.fileSizeBytes)}`,
    `MIME ${file.mimeType ?? "-"}`,
  ].join(" | ");
}

export function attendanceApiErrorMessage(error: unknown): string {
  if (!isApiErrorLike(error)) {
    return error instanceof Error ? error.message : "The request failed.";
  }

  switch (error.code) {
    case "DUPLICATE_ATTENDANCE_IMPORT":
      return "Duplicate attendance upload: this workbook already exists by SHA-256.";
    case "ATTENDANCE_PARSE_FAILED":
    case "ATTENDANCE_WORKER_INVOCATION_FAILED":
      return "Attendance parse failed. Review parser errors before generating a wage record.";
    case "ATTENDANCE_IMPORT_NOT_PARSED":
      return "Attendance import must be parsed before generating a wage record.";
    case "ATTENDANCE_IMPORT_HAS_PARSE_ERRORS":
      return "Attendance import has parser errors and cannot generate a wage record.";
    case "WAGE_RECORD_GENERATION_FAILED":
    case "WAGE_RECORD_WORKER_INVOCATION_FAILED":
      return "Wage record generation failed. Review generated file history for the failed record.";
    case "FORBIDDEN":
      return "Attendance action permission denied.";
    default:
      return `${error.code}${error.status ? ` (${error.status})` : ""}: ${
        error.message
      }`;
  }
}

function isApiErrorLike(
  error: unknown,
): error is { code: string; message: string; status?: number } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      typeof (error as { code: unknown }).code === "string" &&
      typeof (error as { message: unknown }).message === "string",
  );
}
