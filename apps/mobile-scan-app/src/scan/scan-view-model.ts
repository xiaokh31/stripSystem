import { NativeApiError } from "../api/api-error";
import type { LoadJobScanResponse } from "../load-jobs/load-job-types";

export type ScanNoticeTone = "amber" | "emerald" | "red";

export interface ScanNotice {
  code: string | null;
  message: string;
  title: string;
  tone: ScanNoticeTone;
}

export function normalizeScanInput(value: string): string {
  return value.trim();
}

export function isScanSubmitDisabled(input: {
  canScan: boolean;
  qrPayload: string;
  submitting: boolean;
}): boolean {
  return (
    input.submitting ||
    !input.canScan ||
    normalizeScanInput(input.qrPayload).length === 0
  );
}

export function isSupervisorOverrideDisabled(input: {
  canOverride: boolean;
  confirmed: boolean;
  overridePayload: string;
  reason: string;
  submitting: boolean;
}): boolean {
  return (
    input.submitting ||
    !input.canOverride ||
    !input.confirmed ||
    normalizeScanInput(input.overridePayload).length === 0 ||
    normalizeScanInput(input.reason).length === 0
  );
}

export function isCompleteLoadingDisabled(input: {
  canComplete: boolean;
  completing: boolean;
  dockNo: string;
}): boolean {
  return (
    input.completing ||
    !input.canComplete ||
    normalizeScanInput(input.dockNo).length === 0
  );
}

export function scanSuccessNotice(response: LoadJobScanResponse): ScanNotice {
  if (response.result === "DUPLICATE") {
    return {
      code: "DUPLICATE",
      message: "This pallet was already scanned for the selected load job.",
      title: "Duplicate scan",
      tone: "amber",
    };
  }

  return {
    code: null,
    message: "Pallet loaded into the selected load job.",
    title: "Scan accepted",
    tone: "emerald",
  };
}

export function scanErrorNotice(error: unknown): ScanNotice {
  if (error instanceof NativeApiError) {
    return {
      code: error.code,
      message: scanErrorMessage(error.code, error.message),
      title: scanErrorTitle(error.code),
      tone: error.code === "LOAD_JOB_NOT_OPEN" ? "amber" : "red",
    };
  }

  return {
    code: "SCAN_FAILED",
    message: error instanceof Error ? error.message : "Scan failed.",
    title: "Scan failed",
    tone: "red",
  };
}

export function scanErrorMessage(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    API_NETWORK_ERROR: "The scanner could not reach the API.",
    FORBIDDEN: "This account does not have permission to scan pallets.",
    INVALID_QR_PAYLOAD: "Invalid label. Scan a Bestar pallet QR label.",
    LOAD_JOB_LINE_PALLET_LIMIT_REACHED:
      "Plan line is full. Ask office staff or a supervisor before loading more pallets.",
    LOAD_JOB_NOT_OPEN: "This load job is closed or not open for scanning.",
    PALLET_ALREADY_LOADED:
      "This pallet was already loaded by another load job.",
    PALLET_CANCELLED: "This pallet is cancelled and cannot be loaded.",
    PALLET_NOT_FOUND: "Pallet was not found in system inventory.",
    PALLET_NOT_IN_LOAD_PLAN:
      "This pallet is not in the selected truck loading plan.",
    UNAUTHENTICATED: "Session expired. Sign in again.",
  };

  return messages[code] ?? fallback;
}

export function scanErrorTitle(code: string): string {
  const titles: Record<string, string> = {
    FORBIDDEN: "Unauthorized",
    INVALID_QR_PAYLOAD: "Invalid QR",
    LOAD_JOB_LINE_PALLET_LIMIT_REACHED: "Plan line full",
    LOAD_JOB_NOT_OPEN: "Load job closed",
    PALLET_ALREADY_LOADED: "Already loaded",
    PALLET_CANCELLED: "Pallet cancelled",
    PALLET_NOT_FOUND: "Invalid scan",
    PALLET_NOT_IN_LOAD_PLAN: "Wrong load job",
    UNAUTHENTICATED: "Session expired",
  };

  return titles[code] ?? "Scan rejected";
}
