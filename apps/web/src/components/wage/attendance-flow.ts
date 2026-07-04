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
