import type { GeneratedFileResponse } from "@/lib/api-client";

export type GenerationAction = "labels" | "report";

export function hasGeneratedLabelPdf(
  files: readonly GeneratedFileResponse[],
): boolean {
  return files.some(
    (file) =>
      file.fileType === "PALLET_LABEL_PDF" && file.status === "GENERATED",
  );
}

export function isDownloadableGeneratedFile(
  file: Pick<GeneratedFileResponse, "fileSha256" | "status">,
): boolean {
  return file.status === "GENERATED" && Boolean(file.fileSha256);
}

export function generatedFileTypeLabel(fileType: string): string {
  const labels: Record<string, string> = {
    EXCEL_REPORT: "Excel report",
    PALLET_LABEL_PDF: "Label PDF",
    TASK_REPORT_HTML: "Task report",
  };

  return labels[fileType] ?? fileType;
}

export function generationActionLabel(action: GenerationAction): string {
  return action === "report" ? "Generate Excel Report" : "Generate Label PDF";
}

export function formatFileSizeBytes(value: string | null): string {
  if (!value) {
    return "-";
  }

  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "-";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function newestGeneratedFiles(
  files: readonly GeneratedFileResponse[],
): GeneratedFileResponse[] {
  return [...files].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
