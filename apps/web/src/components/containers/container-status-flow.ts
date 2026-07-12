import { containerStatusLabel } from "./container-files-flow";
import { DEFAULT_LOCALE, type Locale } from "../../lib/i18n/catalog";
import { createTranslator } from "../../lib/i18n/translator";

export const CONTAINER_STATUS_UPDATE_VALUES = [
  "IMPORTED",
  "PARSED",
  "CORRECTED",
  "REPORT_GENERATED",
  "LABELS_GENERATED",
  "UNLOADED",
  "LOADING_IN_PROGRESS",
  "LOADED",
  "ERROR",
] as const;

export const LOADED_SCAN_ONLY_NOTICE =
  "i18n.containers.loadedScanOnlyNotice";

export type ContainerStatusUpdateValue =
  (typeof CONTAINER_STATUS_UPDATE_VALUES)[number];

export function containerStatusSelectLabel(
  status: string,
  locale?: Locale,
): string {
  return containerStatusLabel(status, locale);
}

export function loadedScanOnlyNotice(locale?: Locale): string {
  return createTranslator(locale ?? DEFAULT_LOCALE).t(LOADED_SCAN_ONLY_NOTICE);
}

export function isContainerStatusScanOnly(status: string): boolean {
  return status === "LOADED";
}

export function isContainerStatusOptionDisabled(
  status: string,
  currentStatus: string,
): boolean {
  return isContainerStatusScanOnly(status) && currentStatus !== status;
}
