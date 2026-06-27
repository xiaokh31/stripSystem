export const XLSX_EXTENSION = ".xlsx";

export type UploadStatus =
  | "queued"
  | "uploading"
  | "success"
  | "duplicate"
  | "error"
  | "invalid";

export interface FileLike {
  name: string;
  size?: number;
}

export interface ExistingImportSummary {
  id: string;
  originalFilename: string;
  fileSha256?: string;
  importStatus?: string;
  parseStatus?: string;
}

export interface UploadQueueItem {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  progressPercent: number | null;
  status: UploadStatus;
  errorCode?: string;
  errorMessage?: string;
  existingImport?: ExistingImportSummary;
}

export interface UploadFailureInput {
  code: string;
  message: string;
  details?: unknown;
}

export function isAllowedXlsxFile(file: FileLike): boolean {
  return file.name.trim().toLowerCase().endsWith(XLSX_EXTENSION);
}

export function buildUploadQueue(files: readonly FileLike[]): UploadQueueItem[] {
  return files.map((file, index) => {
    const valid = isAllowedXlsxFile(file);

    return {
      id: `${index}-${file.name}-${file.size ?? 0}`,
      fileName: file.name,
      fileSizeBytes: file.size ?? 0,
      progressPercent: valid ? 0 : null,
      status: valid ? "queued" : "invalid",
      errorCode: valid ? undefined : "INVALID_FILE_TYPE",
      errorMessage: valid ? undefined : "Only .xlsx files can be uploaded.",
    };
  });
}

export function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function classifyUploadFailure(
  input: UploadFailureInput,
): Pick<
  UploadQueueItem,
  "status" | "errorCode" | "errorMessage" | "existingImport"
> {
  const existingImport = extractExistingImport(input.details);

  return {
    status: input.code === "DUPLICATE_IMPORT" ? "duplicate" : "error",
    errorCode: input.code,
    errorMessage: input.message,
    existingImport,
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function extractExistingImport(details: unknown): ExistingImportSummary | undefined {
  if (!isRecord(details)) {
    return undefined;
  }

  const existingImport = details.existingImport;
  if (!isRecord(existingImport)) {
    return undefined;
  }

  if (
    typeof existingImport.id !== "string" ||
    typeof existingImport.originalFilename !== "string"
  ) {
    return undefined;
  }

  return {
    id: existingImport.id,
    originalFilename: existingImport.originalFilename,
    fileSha256:
      typeof existingImport.fileSha256 === "string"
        ? existingImport.fileSha256
        : undefined,
    importStatus:
      typeof existingImport.importStatus === "string"
        ? existingImport.importStatus
        : undefined,
    parseStatus:
      typeof existingImport.parseStatus === "string"
        ? existingImport.parseStatus
        : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
