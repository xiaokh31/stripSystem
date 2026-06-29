import type { GeneratedFileResponse } from "@/lib/api-client";

export type GenerationAction = "labels" | "report";

export function containerStatusLabel(status: string): string {
  return status;
}

export function isContainerOperationLocked(status: string): boolean {
  return status === "LOADING_IN_PROGRESS" || status === "LOADED";
}

export function containerOperationLockMessage(status: string): string {
  if (status === "LOADED") {
    return "This container is loaded and archived. Reports, labels, and destination corrections are locked.";
  }
  if (status === "LOADING_IN_PROGRESS") {
    return "This container is in loading. Reports, labels, and destination corrections are locked until loading corrections are handled by scan workflow.";
  }
  return "";
}

export function hasGeneratedLabelPdf(
  files: readonly GeneratedFileResponse[],
): boolean {
  return files.some(
    (file) =>
      file.fileType === "PALLET_LABEL_PDF" && file.status === "GENERATED",
  );
}

export function canShowLabelReprintAction(
  canReprintLabels: boolean,
  files: readonly GeneratedFileResponse[],
): boolean {
  return canReprintLabels && hasGeneratedLabelPdf(files);
}

export function labelReprintUnavailableMessage(
  canReprintLabels: boolean,
  files: readonly GeneratedFileResponse[],
): string {
  if (!hasGeneratedLabelPdf(files)) {
    return "Generate a label PDF before recording a reprint.";
  }

  if (!canReprintLabels) {
    return "Label reprint requires labels.reprint permission. Ask office staff or an administrator to record the reprint audit.";
  }

  return "";
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

export function generationActionNotice(action: GenerationAction): string {
  if (action === "report") {
    return "Excel report generation uses the latest saved database values and overwrites the current report file record for this container.";
  }

  return "Label PDF generation rebuilds unused planned or label-printed pallets from the latest saved destination totals; loading or loaded containers are locked.";
}

export function generationFailureMessage(
  action: GenerationAction,
  code: string | null,
  message: string,
): string {
  if (action === "labels" && code === "PALLETS_ALREADY_IN_USE") {
    return `${message} Existing pallets have already been assigned, loaded, or entered loading, so the label PDF and pallet records cannot be rebuilt.`;
  }
  if (code === "CONTAINER_GENERATION_LOCKED") {
    return `${message} Use the scan correction workflow for loading changes, or work from a container that has not entered loading.`;
  }

  return message;
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
