import type { ContainerResponse, ImportFileResponse } from "@/lib/api-client";
import { formatOperationalDateTime } from "../../lib/date-time";
import {
  DEFAULT_LOCALE,
  type Locale,
  type MessageKey,
} from "../../lib/i18n/catalog";
import { containerLifecycleStatusLabel } from "../../lib/i18n/status-labels";
import { createTranslator, type Translator } from "../../lib/i18n/translator";

export type StatusTone = "amber" | "emerald" | "red" | "zinc";

export interface ParseResultSummaryData {
  containers: Array<Pick<ContainerResponse, "id" | "containerNo" | "status">>;
  errorCount?: number;
  errorMessage?: string | null;
  parseStatus?: string;
  warningCount?: number;
}

export interface ContainerLink {
  href: string;
  label: string;
}

export function statusTone(status: string): StatusTone {
  if (status === "PARSED" || status === "WARNING") {
    return "emerald";
  }

  if (status === "ERROR") {
    return "red";
  }

  if (status === "PARSING") {
    return "amber";
  }

  return "zinc";
}

export function canTriggerParse(parseStatus: string): boolean {
  return parseStatus !== "PARSING";
}

export function manualReportHref(importId: string): string {
  return `/containers/new?fromImport=${encodeURIComponent(importId)}`;
}

export function shouldOfferManualReportEntry(input: {
  parseResult: ParseResultSummaryData | null;
  parseStatus: string;
}): boolean {
  const status = input.parseResult?.parseStatus ?? input.parseStatus;

  if (status === "ERROR") {
    return true;
  }

  if (
    (status === "PARSED" || status === "WARNING") &&
    input.parseResult !== null &&
    input.parseResult.containers.length === 0
  ) {
    return true;
  }

  return false;
}

export function shouldOfferParserLearning(input: {
  parseResult: ParseResultSummaryData | null;
  parseStatus: string;
}): boolean {
  const status = input.parseResult?.parseStatus ?? input.parseStatus;
  return (
    status === "ERROR" ||
    ((status === "PARSED" || status === "WARNING") &&
      input.parseResult !== null &&
      input.parseResult.containers.length === 0)
  );
}

export function containerLinks(
  containers: readonly Pick<ContainerResponse, "id" | "containerNo" | "status">[],
  locale?: Locale,
): ContainerLink[] {
  return containers.map((container) => ({
    href: `/containers/${container.id}`,
    label: `${container.containerNo} · ${containerLifecycleStatusLabel(
      container.status,
      locale,
    )}`,
  }));
}

export function toParseResultSummary(
  result:
    | {
        containers: Array<Pick<ContainerResponse, "id" | "containerNo" | "status">>;
        importFile?: Pick<
          ImportFileResponse,
          "errorCount" | "errorMessage" | "parseStatus" | "warningCount"
        >;
      }
    | null,
): ParseResultSummaryData | null {
  if (!result) {
    return null;
  }

  return {
    containers: result.containers.map((container) => ({
      id: container.id,
      containerNo: container.containerNo,
      status: container.status,
    })),
    errorCount: result.importFile?.errorCount,
    errorMessage: result.importFile?.errorMessage,
    parseStatus: result.importFile?.parseStatus,
    warningCount: result.importFile?.warningCount,
  };
}

export function issueList(
  issues: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string[] {
  if (!Array.isArray(issues)) {
    return [];
  }

  const translator = createTranslator(locale);
  return issues.map((issue) => issueText(issue, translator));
}

export function formatDateTime(value: string): string {
  return formatOperationalDateTime(value);
}

const parserIssueMessageKeys: Record<string, MessageKey> = {
  COURIER_DELIVERY_METHOD_MISSING_CARRIER:
    "i18n.parserIssue.courierDeliveryMethodMissingCarrier",
  DESTINATION_RANGE_EXCEEDED: "i18n.parserIssue.destinationRangeExceeded",
  DETECTOR_ERROR: "i18n.parserIssue.detectorError",
  DETECTOR_WARNING: "i18n.parserIssue.detectorWarning",
  HEADER_NOT_FOUND: "i18n.parserIssue.headerNotFound",
  INVALID_NUMBER: "i18n.parserIssue.invalidNumber",
  MISSING_CARTONS: "i18n.parserIssue.missingCartons",
  MISSING_CONTAINER_NO: "i18n.parserIssue.missingContainerNo",
  MISSING_DESTINATION: "i18n.parserIssue.missingDestination",
  MISSING_TEMPLATE: "i18n.parserIssue.missingTemplate",
  MISSING_VOLUME: "i18n.parserIssue.missingVolume",
  MISSING_WAYBILL_FOR_ADDRESS_DESTINATION:
    "i18n.parserIssue.missingWaybillForAddressDestination",
  NON_DETAIL_ROW_SKIPPED: "i18n.parserIssue.nonDetailRowSkipped",
  NO_DESTINATION_PLANS: "i18n.parserIssue.noDestinationPlans",
  SUMMARY_ROW_SKIPPED: "i18n.parserIssue.summaryRowSkipped",
  UNPARSEABLE_ROW_SKIPPED: "i18n.parserIssue.unparseableRowSkipped",
  UNSUPPORTED_FORMAT: "i18n.parserIssue.unsupportedFormat",
  WORKBOOK_READ_FAILED: "i18n.parserIssue.workbookReadFailed",
  ZERO_VOLUME_WITH_CARTONS: "i18n.parserIssue.zeroVolumeWithCartons",
};

function issueText(issue: unknown, translator: Translator): string {
  if (isRecord(issue)) {
    const code = typeof issue.code === "string" ? issue.code : null;
    if (code && parserIssueMessageKeys[code]) {
      return translator.t(parserIssueMessageKeys[code]);
    }

    return translator.t("Parser issue details are unavailable.");
  }

  if (typeof issue === "string") {
    return translator.t("Parser issue details are unavailable.");
  }

  return translator.t("Parser issue details are unavailable.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
