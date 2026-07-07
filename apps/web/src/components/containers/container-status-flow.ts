import { containerStatusLabel } from "./container-files-flow";

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

export type ContainerStatusUpdateValue =
  (typeof CONTAINER_STATUS_UPDATE_VALUES)[number];

export function containerStatusSelectLabel(status: string): string {
  const label = containerStatusLabel(status);
  return label === status ? status : `${label} (${status})`;
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
