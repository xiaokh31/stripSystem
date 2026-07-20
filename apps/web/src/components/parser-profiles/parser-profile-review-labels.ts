import type { MessageKey } from "@/lib/i18n/catalog";
import type {
  ParserProfileEvidenceOutcome,
  ParserProfileReviewStatus,
} from "@/lib/api-client";

export function parserReviewStatusKey(
  status: ParserProfileReviewStatus,
): MessageKey {
  return `i18n.parserReview.status.${status}` as MessageKey;
}

export function parserEvidenceOutcomeKey(
  outcome: ParserProfileEvidenceOutcome,
): MessageKey {
  return `i18n.parserReview.evidence.${outcome}` as MessageKey;
}

export function parserMatchReasonKey(code: string): MessageKey {
  if (code === "FINGERPRINT_ANCHOR_MATCHED") {
    return "i18n.parserReview.match.anchor";
  }
  if (code === "FINGERPRINT_RELATIVE_COLUMN_MATCHED") {
    return "i18n.parserReview.match.column";
  }
  if (code === "FINGERPRINT_WORKBOOK_TYPE_MATCHED") {
    return "i18n.parserReview.match.workbookType";
  }
  if (code === "FINGERPRINT_DATA_START_MATCHED") {
    return "i18n.parserReview.match.dataStart";
  }
  return "i18n.parserReview.match.other";
}

export function parserReviewIssueKey(code: string): MessageKey {
  if (code === "MISSING_DESTINATION") {
    return "i18n.parserReview.issue.missingDestination";
  }
  if (code === "MISSING_CARTONS") {
    return "i18n.parserReview.issue.missingCartons";
  }
  if (code === "MISSING_VOLUME") {
    return "i18n.parserReview.issue.missingVolume";
  }
  if (code === "ZERO_VOLUME_WITH_CARTONS") {
    return "i18n.parserReview.issue.zeroVolume";
  }
  if (code === "NEED_CONFIRM_DESTINATION_TYPE") {
    return "i18n.parserReview.issue.destinationType";
  }
  return "i18n.parserReview.issue.other";
}

export function parserMaterialFieldKey(field: string): MessageKey {
  const known: Record<string, MessageKey> = {
    cartons: "i18n.parserReview.field.cartons",
    containerNo: "i18n.parserReview.field.containerNo",
    deliveryMethod: "i18n.parserReview.field.deliveryMethod",
    destinationCode: "i18n.parserReview.field.destinationCode",
    included: "i18n.parserReview.field.included",
    lines: "i18n.parserReview.field.rows",
    mappingDefinition: "i18n.parserReview.field.mappingDefinition",
    packageType: "i18n.parserReview.field.packageType",
    poNumber: "i18n.parserReview.field.poNumber",
    referenceNo: "i18n.parserReview.field.referenceNo",
    sourceSelection: "i18n.parserReview.field.sourceSelection",
    volumeCbm: "i18n.parserReview.field.volumeCbm",
    waybillNo: "i18n.parserReview.field.waybillNo",
  };
  return known[field] ?? "i18n.parserReview.field.other";
}
