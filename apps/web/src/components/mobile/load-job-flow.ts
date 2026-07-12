import type {
  ApiClientError,
  LoadJobProgressResponse,
  LoadJobResponse,
  LoadJobScanResponse,
} from "@/lib/api-client";
import {
  DEFAULT_LOCALE,
  type Locale,
  type MessageKey,
} from "../../lib/i18n/catalog";
import { createTranslator } from "../../lib/i18n/translator";

export type ScanNoticeTone = "amber" | "emerald" | "red" | "zinc";

export interface ScanNotice {
  code: string | null;
  message: string;
  title: string;
  tone: ScanNoticeTone;
}

export type CameraQrScannerMode = "canvas" | "native" | "unsupported";

export function cameraQrScannerMode(input: {
  hasBarcodeDetector: boolean;
  hasCanvas: boolean;
  hasGetUserMedia: boolean;
}): CameraQrScannerMode {
  if (!input.hasGetUserMedia) {
    return "unsupported";
  }
  if (input.hasBarcodeDetector) {
    return "native";
  }
  return input.hasCanvas ? "canvas" : "unsupported";
}

export function mobileLoadJobScanHref(loadJobId: string): string {
  return `/mobile/load-jobs/${encodeURIComponent(loadJobId)}/scan`;
}

export function loadJobDisplayName(loadJob: LoadJobResponse): string {
  return loadJob.loadNo?.trim() || loadJob.id;
}

export function loadJobPlanContext(
  loadJob: LoadJobResponse,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { format, t } = createTranslator(locale);
  const region = loadJob.destinationRegion?.trim() || t("No destination region");
  const truck = loadJob.truckNo?.trim() || t("No truck");

  return format("i18n.loadJobs.regionTruck", { region, truck });
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

export function isCompleteLoadJobDisabled(input: {
  canComplete: boolean;
  completing: boolean;
  dockNo: string;
}): boolean {
  return (
    input.completing ||
    !input.canComplete ||
    input.dockNo.trim().length === 0
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

export function scanSuccessNotice(
  response: LoadJobScanResponse,
  locale: Locale = DEFAULT_LOCALE,
): ScanNotice {
  const { t } = createTranslator(locale);

  if (response.result === "REMOVED") {
    return {
      code: "REMOVED",
      message: t("Pallet was removed from this load job progress."),
      title: t("Progress adjusted"),
      tone: "amber",
    };
  }

  if (response.result === "DUPLICATE") {
    return {
      code: "DUPLICATE",
      message: t("This pallet was already scanned for the selected load job."),
      title: t("Duplicate scan"),
      tone: "amber",
    };
  }

  return {
    code: null,
    message: t("Pallet loaded into the selected load job."),
    title: t("Scan accepted"),
    tone: "emerald",
  };
}

export function scanErrorNotice(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE,
): ScanNotice {
  const { t } = createTranslator(locale);

  if (isApiClientError(error)) {
    return {
      code: error.code,
      message: scanErrorMessage(error.code, locale),
      title: scanErrorTitle(error.code, locale),
      tone: scanErrorTone(error.code),
    };
  }

  return {
    code: "SCAN_FAILED",
    message: t("Scan failed."),
    title: t("Scan failed"),
    tone: "red",
  };
}

export function scanErrorMessage(
  code: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const messages: Record<string, MessageKey> = {
    API_NETWORK_ERROR: "The scanner could not reach the API.",
    INVALID_QR_PAYLOAD: "Invalid label. Scan a Bestar pallet QR label.",
    LOAD_JOB_LINE_PALLET_LIMIT_REACHED:
      "Current plan line pallet count is full.",
    LOAD_JOB_NOT_OPEN: "This load job is closed or not open for scanning.",
    LOAD_JOB_REVERSE_SCAN_CONFIRMATION_REQUIRED:
      "Confirm the progress adjustment before removing a pallet from this load job.",
    PALLET_ALREADY_LOADED: "This pallet was already loaded by another load job.",
    PALLET_CANCELLED: "This pallet is cancelled and cannot be loaded.",
    PALLET_NOT_FOUND: "Pallet was not found in system inventory.",
    PALLET_NOT_IN_LOAD_PLAN:
      "This pallet is not in the current departure plan.",
    PALLET_NOT_LOADED_IN_LOAD_JOB:
      "This pallet is not currently loaded in the selected load job.",
  };

  return createTranslator(locale).t(messages[code] ?? "Scan failed.");
}

export function scanErrorTitle(
  code: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { t } = createTranslator(locale);

  if (code === "LOAD_JOB_NOT_OPEN") {
    return t("Load job closed");
  }

  if (code === "PALLET_ALREADY_LOADED") {
    return t("Already loaded");
  }

  if (code === "PALLET_NOT_IN_LOAD_PLAN") {
    return t("Wrong load job");
  }

  if (code === "LOAD_JOB_LINE_PALLET_LIMIT_REACHED") {
    return t("Plan line full");
  }

  if (
    code === "LOAD_JOB_REVERSE_SCAN_CONFIRMATION_REQUIRED" ||
    code === "PALLET_NOT_LOADED_IN_LOAD_JOB"
  ) {
    return t("Progress adjustment rejected");
  }

  if (code === "INVALID_QR_PAYLOAD" || code === "PALLET_NOT_FOUND") {
    return t("Invalid scan");
  }

  return t("Scan rejected");
}

export function scanErrorTone(code: string): ScanNoticeTone {
  return code === "LOAD_JOB_NOT_OPEN" ? "amber" : "red";
}

export function loadJobLineLabel(
  line: LoadJobResponse["lines"][number],
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (line.sourceText?.trim()) {
    return line.sourceText.trim();
  }

  const { format, t } = createTranslator(locale);
  const container =
    line.containerNo ?? line.container?.containerNo ?? t("External");
  const destination = line.destinationCode ?? t("Any destination");

  return format("i18n.loadJobs.lineFallback", {
    container,
    destination,
    pallets: line.plannedPallets,
  });
}

function isApiClientError(error: unknown): error is ApiClientError {
  return (
    error instanceof Error &&
    error.name === "ApiClientError" &&
    "code" in error &&
    typeof error.code === "string"
  );
}
