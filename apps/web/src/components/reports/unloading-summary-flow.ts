import type {
  UnloadingSummaryAvailableMonthResponse,
  UnloadingSummaryGeneratedFileResponse,
  UnloadingSummaryReviewItemResponse,
  UnloadingSummaryRowResponse,
} from "@/lib/api-client";
import {
  DEFAULT_LOCALE,
  type Locale,
  type MessageKey,
} from "../../lib/i18n/catalog";
import { payClassificationLabel } from "../../lib/i18n/status-labels";
import { createTranslator } from "../../lib/i18n/translator";

export const COMPLETED_UNLOADING_STATUS_VALUES = [
  "UNLOADED",
  "LOADING_IN_PROGRESS",
  "LOADED",
] as const;

export type UnloadingSummarySearchParams = Record<
  string,
  string | string[] | undefined
>;

export interface UnloadingSummaryBusinessTypeCounts {
  ocean: number;
  unknown: number;
  usToCanada: number;
}

export function defaultUnloadingSummaryMonth(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 7);
}

export function normalizeUnloadingSummaryMonth(
  searchParams: UnloadingSummarySearchParams,
  now = new Date(),
): string {
  const month = firstSearchValue(searchParams.month)?.trim();
  return isSummaryMonth(month) ? month : defaultUnloadingSummaryMonth(now);
}

export function resolveUnloadingSummaryMonth(
  searchParams: UnloadingSummarySearchParams,
  availableMonths: UnloadingSummaryAvailableMonthResponse[],
  now = new Date(),
): string {
  const requestedMonth = firstSearchValue(searchParams.month)?.trim();
  if (isSummaryMonth(requestedMonth)) {
    return requestedMonth;
  }

  const currentMonth = defaultUnloadingSummaryMonth(now);
  if (availableMonths.some((available) => available.month === currentMonth)) {
    return currentMonth;
  }

  return availableMonths[0]?.month ?? currentMonth;
}

export function unloadingSummaryHref(month: string): string {
  return `/unloading-summary?month=${encodeURIComponent(month)}`;
}

export function unloadingSummaryBusinessTypeCounts(
  rows: UnloadingSummaryRowResponse[],
): UnloadingSummaryBusinessTypeCounts {
  const containerTypes = new Map<string, keyof UnloadingSummaryBusinessTypeCounts>();

  for (const row of rows) {
    if (containerTypes.has(row.containerId)) {
      continue;
    }
    containerTypes.set(row.containerId, unloadingSummaryBusinessType(row));
  }

  const counts: UnloadingSummaryBusinessTypeCounts = {
    ocean: 0,
    unknown: 0,
    usToCanada: 0,
  };

  for (const type of containerTypes.values()) {
    counts[type] += 1;
  }

  return counts;
}

export function unloadingSummaryWageTag(
  row: Pick<UnloadingSummaryRowResponse, "businessTag" | "classification">,
  locale?: Locale,
): string {
  const tag = row.businessTag.trim();
  if (tag === "海柜" || tag === "Ocean container") {
    return payClassificationLabel("OCEAN_CONTAINER", locale);
  }
  if (tag === "美转加" || tag === "US-to-Canada transfer") {
    return payClassificationLabel("US_TO_CANADA_TRANSFER", locale);
  }
  if (tag) {
    return tag;
  }
  if (row.classification) {
    return payClassificationLabel(row.classification, locale);
  }
  return "-";
}

export function unloadingSummaryReviewText(
  item: UnloadingSummaryReviewItemResponse,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { format, t } = createTranslator(locale);
  const messages: Record<string, MessageKey> = {
    MISSING_APPOINTMENT_TEXT:
      "Appointment or unloading time is missing for this summary row.",
    MISSING_COMPLETED_AT:
      "Completed unloading has no completion date and is not assigned to the selected month.",
    MISSING_DESTINATION:
      "Completed unloading has no destination rows for monthly summary review.",
    MISSING_REFERENCE_TEXT:
      "Reference, appointment number, shipment, or raw note is missing for this summary row.",
    MISSING_UNLOADING_COMPLETED_AT:
      "Completed unloading has no completion date and is not assigned to the selected month.",
    PAY_CONTAINER_DRAFT_WITH_COMPLETED_AT:
      "Pay container has a completion date but is still draft; review before export.",
    SOURCE_CONTAINER_NOT_COMPLETED_UNLOADING_STATUS:
      "Source container is not in a completed unloading status and is excluded from the summary.",
  };
  const message = t(
    messages[item.code] ?? "Unloading summary review issue needs attention.",
  );

  return item.containerNo
    ? format("i18n.unloadingSummary.reviewForContainer", {
        containerNo: item.containerNo,
        message,
      })
    : message;
}

export function unloadingSummaryGeneratedFileAuditText(
  file: UnloadingSummaryGeneratedFileResponse,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const { format, t } = createTranslator(locale);

  return format("i18n.unloadingSummary.generatedFileAudit", {
    mimeType: file.mimeType ?? t("Not recorded"),
    sha256: file.fileSha256 ?? t("No SHA-256 recorded"),
    size: file.fileSizeBytes
      ? formatFileSize(file.fileSizeBytes)
      : t("Not recorded"),
  });
}

export function formatUnloadingSummaryDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return value.slice(0, 10);
}

export function unloadingSummaryRowKey(row: UnloadingSummaryRowResponse): string {
  return [
    row.containerId,
    row.destinationId ?? row.destinationCode ?? row.destinationText,
    row.sequence,
  ].join(":");
}

export function displayText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function unloadingSummaryBusinessType(
  row: Pick<UnloadingSummaryRowResponse, "businessTag" | "classification">,
): keyof UnloadingSummaryBusinessTypeCounts {
  const tag = row.businessTag.trim();
  if (row.classification === "OCEAN_CONTAINER" || tag.includes("海柜")) {
    return "ocean";
  }
  if (
    row.classification === "US_TO_CANADA_TRANSFER" ||
    tag.includes("美转加")
  ) {
    return "usToCanada";
  }
  return "unknown";
}

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSummaryMonth(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function formatFileSize(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return value;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
