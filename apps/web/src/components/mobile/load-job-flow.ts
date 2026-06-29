import type {
  ApiClientError,
  LoadJobProgressResponse,
  LoadJobResponse,
  LoadJobScanResponse,
} from "@/lib/api-client";

export type ScanNoticeTone = "amber" | "emerald" | "red" | "zinc";

export interface ScanNotice {
  code: string | null;
  message: string;
  title: string;
  tone: ScanNoticeTone;
}

export function mobileLoadJobScanHref(loadJobId: string): string {
  return `/mobile/load-jobs/${encodeURIComponent(loadJobId)}/scan`;
}

export function loadJobDisplayName(loadJob: LoadJobResponse): string {
  return loadJob.loadNo?.trim() || loadJob.id;
}

export function loadJobPlanContext(loadJob: LoadJobResponse): string {
  const region = loadJob.destinationRegion?.trim() || "No destination region";
  const truck = loadJob.truckNo?.trim() || "No truck";

  return `${region} / ${truck}`;
}

export function loadJobProgressSnapshot(
  loadJob: LoadJobResponse,
): LoadJobProgressResponse {
  const totalPallets = loadJob.plannedPalletCount;
  const loadedPallets = loadJob.palletCount;

  return {
    totalPallets,
    loadedPallets,
    remainingPallets: Math.max(0, totalPallets - loadedPallets),
  };
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

export function isReverseScanDisabled(input: {
  canScan: boolean;
  confirmed: boolean;
  reason: string;
  reversing: boolean;
  scan: Pick<LoadJobScanResponse, "result"> | null;
}): boolean {
  return (
    input.reversing ||
    !input.canScan ||
    !input.scan ||
    input.scan.result !== "LOADED" ||
    !input.confirmed ||
    input.reason.trim().length === 0
  );
}

export function scanSuccessNotice(response: LoadJobScanResponse): ScanNotice {
  if (response.result === "REMOVED") {
    return {
      code: "REMOVED",
      message: "Pallet was removed from this load job progress.",
      title: "Progress adjusted",
      tone: "amber",
    };
  }

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
  if (isApiClientError(error)) {
    return {
      code: error.code,
      message: scanErrorMessage(error.code, error.message),
      title: scanErrorTitle(error.code),
      tone: scanErrorTone(error.code),
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
    INVALID_QR_PAYLOAD: "Invalid label. Scan a Bestar pallet QR label.",
    LOAD_JOB_LINE_PALLET_LIMIT_REACHED: "当前计划行托数已装满",
    LOAD_JOB_NOT_OPEN: "This load job is closed or not open for scanning.",
    LOAD_JOB_REVERSE_SCAN_CONFIRMATION_REQUIRED:
      "Confirm the progress adjustment before removing a pallet from this load job.",
    PALLET_ALREADY_LOADED: "This pallet was already loaded by another load job.",
    PALLET_CANCELLED: "This pallet is cancelled and cannot be loaded.",
    PALLET_NOT_FOUND: "Pallet was not found in system inventory.",
    PALLET_NOT_IN_LOAD_PLAN: "该托盘不在当前发车计划中",
    PALLET_NOT_LOADED_IN_LOAD_JOB:
      "This pallet is not currently loaded in the selected load job.",
  };

  return messages[code] ?? fallback;
}

export function scanErrorTitle(code: string): string {
  if (code === "LOAD_JOB_NOT_OPEN") {
    return "Load job closed";
  }

  if (code === "PALLET_ALREADY_LOADED") {
    return "Already loaded";
  }

  if (code === "PALLET_NOT_IN_LOAD_PLAN") {
    return "Wrong load job";
  }

  if (code === "LOAD_JOB_LINE_PALLET_LIMIT_REACHED") {
    return "Plan line full";
  }

  if (
    code === "LOAD_JOB_REVERSE_SCAN_CONFIRMATION_REQUIRED" ||
    code === "PALLET_NOT_LOADED_IN_LOAD_JOB"
  ) {
    return "Progress adjustment rejected";
  }

  if (code === "INVALID_QR_PAYLOAD" || code === "PALLET_NOT_FOUND") {
    return "Invalid scan";
  }

  return "Scan rejected";
}

export function scanErrorTone(code: string): ScanNoticeTone {
  return code === "LOAD_JOB_NOT_OPEN" ? "amber" : "red";
}

export function loadJobLineLabel(line: LoadJobResponse["lines"][number]): string {
  if (line.sourceText?.trim()) {
    return line.sourceText.trim();
  }

  const container = line.containerNo ?? line.container?.containerNo ?? "External";
  const destination = line.destinationCode ?? "Any destination";

  return `${container} / ${destination} / ${line.plannedPallets}P`;
}

function isApiClientError(error: unknown): error is ApiClientError {
  return (
    error instanceof Error &&
    error.name === "ApiClientError" &&
    "code" in error &&
    typeof error.code === "string"
  );
}
