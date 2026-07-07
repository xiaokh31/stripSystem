import { containerStatusLabel } from "./container-files-flow";
import type { Locale } from "@/lib/i18n/catalog";

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
  "LOADED is scan-only. It can only be produced by loading scans, not office status updates.";

const LOADED_SCAN_ONLY_NOTICE_ZH =
  "已送库是扫码流程状态，只能由装车扫码产生，不能由办公室人工状态更新产生。";

export type ContainerStatusUpdateValue =
  (typeof CONTAINER_STATUS_UPDATE_VALUES)[number];

export function containerStatusSelectLabel(
  status: string,
  locale?: Locale,
): string {
  return containerStatusLabel(status, locale);
}

export function loadedScanOnlyNotice(locale?: Locale): string {
  return locale === "zh-CN"
    ? LOADED_SCAN_ONLY_NOTICE_ZH
    : LOADED_SCAN_ONLY_NOTICE;
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
