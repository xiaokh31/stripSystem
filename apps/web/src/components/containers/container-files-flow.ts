import type { GeneratedFileResponse } from "@/lib/api-client";
import { DEFAULT_LOCALE, type Locale } from "../../lib/i18n/catalog";
import {
  containerLifecycleStatusLabel,
  generatedFileTypeLabel as localizedGeneratedFileTypeLabel,
} from "../../lib/i18n/status-labels";
import { createTranslator } from "../../lib/i18n/translator";

export type GenerationAction = "labels" | "report";

export function containerStatusLabel(
  status: string,
  locale?: Locale,
): string {
  return containerLifecycleStatusLabel(status, locale);
}

export function isContainerOperationLocked(status: string): boolean {
  return (
    status === "UNLOADED" ||
    status === "LOADING_IN_PROGRESS" ||
    status === "LOADED"
  );
}

export function containerOperationLockMessage(
  status: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { t } = createTranslator(locale);

  if (status === "LOADED") {
    return t(
      "This container is loaded and archived. Reports, labels, and destination corrections are locked.",
    );
  }
  if (status === "LOADING_IN_PROGRESS") {
    return t(
      "This container is in loading. Reports, labels, and destination corrections are locked until loading corrections are handled by scan workflow.",
    );
  }
  if (status === "UNLOADED") {
    return t(
      "This container is unloaded. Reports, labels, and destination corrections are locked before loading workflow starts.",
    );
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
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { t } = createTranslator(locale);

  if (!hasGeneratedLabelPdf(files)) {
    return t("Generate a label PDF before recording a reprint.");
  }

  if (!canReprintLabels) {
    return t(
      "Label reprint requires labels.reprint permission. Ask office staff or an administrator to record the reprint audit.",
    );
  }

  return "";
}

export function isDownloadableGeneratedFile(
  file: Pick<GeneratedFileResponse, "fileSha256" | "status">,
): boolean {
  return file.status === "GENERATED" && Boolean(file.fileSha256);
}

export function generatedFileTypeLabel(
  fileType: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return localizedGeneratedFileTypeLabel(fileType, locale);
}

export function generationActionLabel(
  action: GenerationAction,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { t } = createTranslator(locale);
  return action === "report" ? t("Generate Excel Report") : t("Generate Label PDF");
}

export function generationActionNotice(
  action: GenerationAction,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { t } = createTranslator(locale);

  if (action === "report") {
    return t(
      "Excel report generation uses the latest saved database values and overwrites the current report file record for this container.",
    );
  }

  return t(
    "Label PDF generation rebuilds unused planned or label-printed pallets from the latest saved destination totals; unloaded, loading, or loaded containers are locked.",
  );
}

export function generationFailureMessage(
  action: GenerationAction,
  code: string | null,
  _message: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { t } = createTranslator(locale);

  if (action === "labels" && code === "PALLETS_ALREADY_IN_USE") {
    return t(
      "The label PDF and pallet records cannot be rebuilt because existing pallets have already been assigned, loaded, marked unloaded, or entered loading.",
    );
  }
  if (code === "CONTAINER_GENERATION_LOCKED") {
    return t(
      "Container generation is locked. Use the scan correction workflow for loading changes, or work from a container that has not entered loading.",
    );
  }

  return t("Generation failed.");
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
