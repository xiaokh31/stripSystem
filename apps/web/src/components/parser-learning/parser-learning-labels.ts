import type { MessageKey } from "@/lib/i18n/catalog";
import type {
  ParserCanonicalField,
  ParserTransformKind,
} from "./parser-learning-flow";

type Translate = (key: MessageKey) => string;

const fieldKeys: Record<ParserCanonicalField | "containerNo", MessageKey> = {
  cartons: "i18n.parserLearning.field.cartons",
  containerNo: "i18n.parserLearning.field.containerNo",
  deliveryMethod: "i18n.parserLearning.field.deliveryMethod",
  destinationCode: "i18n.parserLearning.field.destinationCode",
  note: "i18n.parserLearning.field.note",
  packageType: "i18n.parserLearning.field.packageType",
  poNumber: "i18n.parserLearning.field.poNumber",
  volumeCbm: "i18n.parserLearning.field.volumeCbm",
  waybillNo: "i18n.parserLearning.field.waybillNo",
};

const transformKeys: Record<ParserTransformKind, MessageKey> = {
  cubicFeet: "i18n.parserLearning.transform.cubicFeet",
  decimal: "i18n.parserLearning.transform.decimal",
  direct: "i18n.parserLearning.transform.direct",
  divide: "i18n.parserLearning.transform.divide",
  integer: "i18n.parserLearning.transform.integer",
  lookup: "i18n.parserLearning.transform.lookup",
  lower: "i18n.parserLearning.transform.lower",
  multiply: "i18n.parserLearning.transform.multiply",
  trim: "i18n.parserLearning.transform.trim",
  upper: "i18n.parserLearning.transform.upper",
};

const statusKeys: Record<string, MessageKey> = {
  AWAITING_APPROVAL: "i18n.parserLearning.status.awaitingApproval",
  AWAITING_COMPLETION: "i18n.parserLearning.status.awaitingCompletion",
  CLOSED: "i18n.parserLearning.status.closed",
  MAPPING: "i18n.parserLearning.status.mapping",
  OPEN: "i18n.parserLearning.status.open",
  READY_FOR_REPLAY: "i18n.parserLearning.status.readyForReplay",
  REPLAY_FAILED: "i18n.parserLearning.status.replayFailed",
};

const codeKeys: Record<string, MessageKey> = {
  FORMULA_CACHED_VALUE_MISSING:
    "i18n.parserLearning.code.formulaCachedValueMissing",
  INSPECTION_CELL_LIMIT_EXCEEDED:
    "i18n.parserLearning.code.inspectionLimit",
  INSPECTION_COLUMN_LIMIT_EXCEEDED:
    "i18n.parserLearning.code.inspectionLimit",
  INSPECTION_MERGED_RANGE_LIMIT_EXCEEDED:
    "i18n.parserLearning.code.inspectionLimit",
  INSPECTION_ROW_LIMIT_EXCEEDED:
    "i18n.parserLearning.code.inspectionLimit",
  INSPECTION_SHEET_LIMIT_EXCEEDED:
    "i18n.parserLearning.code.inspectionLimit",
  MAPPING_CELL_LIMIT_EXCEEDED:
    "i18n.parserLearning.code.inspectionLimit",
  MAPPING_COLUMN_LIMIT_EXCEEDED:
    "i18n.parserLearning.code.inspectionLimit",
  MAPPING_ROW_BUDGET_EXCEEDED:
    "i18n.parserLearning.code.inspectionLimit",
  MAPPING_ROW_LIMIT_EXCEEDED:
    "i18n.parserLearning.code.inspectionLimit",
  MAPPING_SOURCE_COLUMN_NOT_FOUND:
    "i18n.parserLearning.code.mappingInvalid",
  MAPPING_TRANSFORM_FAILED: "i18n.parserLearning.code.mappingInvalid",
  MISSING_CARTONS: "i18n.parserLearning.code.missingCartons",
  MISSING_CONTAINER_NO: "i18n.parserLearning.code.missingContainerNo",
  MISSING_DESTINATION: "i18n.parserLearning.code.missingDestination",
  MISSING_VOLUME: "i18n.parserLearning.code.missingVolume",
  NEED_MANUAL_DESTINATION:
    "i18n.parserLearning.code.manualDestinationRequired",
  PARSER_LEARNING_IMPORT_NOT_ELIGIBLE:
    "i18n.parserLearning.code.importNotEligible",
  PARSER_LEARNING_CASE_NOT_FOUND:
    "i18n.parserLearning.code.learningCaseUnavailable",
  PARSER_LEARNING_PERMISSION_DENIED:
    "i18n.parserLearning.permissionDenied",
  PARSER_LEARNING_START_FAILED: "i18n.parserLearning.code.startFailed",
  PARSER_LEARNING_VALIDATION_FAILED:
    "i18n.parserLearning.code.validationFailed",
  PARSER_PROFILE_REQUEST_VALIDATION_FAILED:
    "i18n.parserLearning.code.validationFailed",
  PROFILE_CANDIDATE_NOT_READY:
    "i18n.parserLearning.code.candidateNotReady",
  PROFILE_DRAFT_REVISION_CONFLICT:
    "i18n.parserLearning.code.revisionConflict",
  PROFILE_MAPPING_DEFINITION_INVALID:
    "i18n.parserLearning.code.mappingInvalid",
  PROFILE_PREVIEW_STALE_RESULT:
    "i18n.parserLearning.code.previewStale",
  PROFILE_REPLAY_NOT_READY: "i18n.parserLearning.code.replayNotReady",
  PROFILE_REPLAY_QUEUE_FAILED: "i18n.parserLearning.code.workerUnavailable",
  PROFILE_REPLAY_WORKER_FAILED: "i18n.parserLearning.code.workerUnavailable",
  PROFILE_WORKER_EMPTY_OUTPUT: "i18n.parserLearning.code.workerUnavailable",
  PROFILE_WORKER_INVALID_OUTPUT: "i18n.parserLearning.code.workerUnavailable",
  PROFILE_WORKER_INVOCATION_FAILED:
    "i18n.parserLearning.code.workerUnavailable",
  QUEUE_DISABLED: "i18n.parserLearning.code.workerUnavailable",
  QUEUE_ENQUEUE_FAILED: "i18n.parserLearning.code.workerUnavailable",
  PROFILE_SOURCE_FILE_MISSING: "i18n.parserLearning.code.sourceUnavailable",
  PROFILE_SOURCE_WORKBOOK_NOT_FOUND:
    "i18n.parserLearning.code.sourceUnavailable",
  QUEUE_UNAVAILABLE: "i18n.parserLearning.code.workerUnavailable",
  WORKBOOK_READ_FAILED: "i18n.parserLearning.code.workbookReadFailed",
  WORKBOOK_NOT_FOUND: "i18n.parserLearning.code.sourceUnavailable",
  WORKBOOK_TYPE_UNSUPPORTED:
    "i18n.parserLearning.code.workbookUnsupported",
  ZERO_VOLUME_WITH_CARTONS:
    "i18n.parserLearning.code.zeroVolumeWithCartons",
  FORBIDDEN: "i18n.parserLearning.permissionDenied",
  PARSER_PROFILE_TRAIN_FORBIDDEN:
    "i18n.parserLearning.permissionDenied",
  UNAUTHENTICATED: "i18n.parserLearning.permissionDenied",
};

const suggestionKeys: Record<string, MessageKey> = {
  PROFILE_SUGGESTION_HEADER_ALIAS_EXACT:
    "i18n.parserLearning.suggestion.exactHeader",
  PROFILE_SUGGESTION_REVIEW_REQUIRED:
    "i18n.parserLearning.suggestion.reviewRequired",
};

const diffKeys: Record<string, MessageKey> = {
  PROFILE_EVIDENCE_DETAIL_ROWS_UNVERIFIED:
    "i18n.parserLearning.diff.detailRowsUnverified",
  PROFILE_EVIDENCE_REFERENCE_UNVERIFIED:
    "i18n.parserLearning.diff.referenceUnverified",
  PROFILE_EVIDENCE_VOLUME_UNVERIFIED:
    "i18n.parserLearning.diff.volumeUnverified",
  PROFILE_REPLAY_CARTONS_MISMATCH:
    "i18n.parserLearning.diff.cartonsMismatch",
  PROFILE_REPLAY_CONTAINER_MISMATCH:
    "i18n.parserLearning.diff.containerMismatch",
  PROFILE_REPLAY_DESTINATION_SET_MISMATCH:
    "i18n.parserLearning.diff.destinationMismatch",
  PROFILE_REPLAY_DETAIL_ROWS_MISMATCH:
    "i18n.parserLearning.diff.detailRowsMismatch",
  PROFILE_REPLAY_FIELD_MATCHED: "i18n.parserLearning.diff.matched",
  PROFILE_REPLAY_PACKAGE_EVIDENCE_MISMATCH:
    "i18n.parserLearning.diff.packageMismatch",
  PROFILE_REPLAY_REFERENCE_EVIDENCE_MISMATCH:
    "i18n.parserLearning.diff.referenceMismatch",
  PROFILE_REPLAY_VOLUME_MISMATCH:
    "i18n.parserLearning.diff.volumeMismatch",
};

export function parserFieldLabel(
  field: ParserCanonicalField | "containerNo",
  t: Translate,
): string {
  return t(fieldKeys[field]);
}

export function parserTransformLabel(
  transform: ParserTransformKind,
  t: Translate,
): string {
  return t(transformKeys[transform]);
}

export function parserLearningStatusLabel(
  status: string,
  t: Translate,
): string {
  return t(statusKeys[status] ?? "i18n.parserLearning.status.unknown");
}

export function parserLearningErrorMessage(
  code: string,
  t: Translate,
): string {
  return t(codeKeys[code] ?? "i18n.parserLearning.code.unknownError");
}

export function parserLearningIssueMessage(
  code: string,
  t: Translate,
): string {
  return t(codeKeys[code] ?? "i18n.parserLearning.code.issueUnavailable");
}

export function parserSuggestionReason(
  code: string | null,
  t: Translate,
): string {
  const key = code ? suggestionKeys[code] : undefined;
  return t(key ?? "i18n.parserLearning.suggestion.reviewRequired");
}

export function parserReplayDiffLabel(code: string, t: Translate): string {
  return t(diffKeys[code] ?? "i18n.parserLearning.diff.unavailable");
}

export function parserLearningValidationLabel(
  controlId: string,
  t: Translate,
): string {
  if (controlId === "sheetName")
    return t("i18n.parserLearning.validation.sheet");
  if (controlId === "headerRow")
    return t("i18n.parserLearning.validation.headerRow");
  if (controlId === "dataStartRow")
    return t("i18n.parserLearning.validation.dataStartRow");
  if (controlId === "containerCell")
    return t("i18n.parserLearning.validation.containerCell");
  const field = controlId.match(/^field-(.+)$/)?.[1];
  if (field && isCanonicalField(field)) {
    return `${parserFieldLabel(field, t)} — ${t("i18n.parserLearning.validation.mappingRequired")}`;
  }
  const confirmation = controlId.match(/^confirm-(.+)$/)?.[1];
  if (confirmation && isCanonicalField(confirmation)) {
    return `${parserFieldLabel(confirmation, t)} — ${t("i18n.parserLearning.validation.confirmationRequired")}`;
  }
  const transform = controlId.match(/^transform-(.+)$/)?.[1];
  if (transform && isCanonicalField(transform)) {
    return `${parserFieldLabel(transform, t)} — ${t("i18n.parserLearning.validation.transformInvalid")}`;
  }
  return t("i18n.parserLearning.validation.controlInvalid");
}

export function parserReplayEvidenceText(
  value: unknown,
  t: Translate,
  field?: string,
): string {
  const values = evidenceValues(value, field, t);
  return values.length > 0
    ? values.join(" · ")
    : t("i18n.parserLearning.valueUnavailable");
}

function evidenceValues(
  value: unknown,
  field: string | undefined,
  t: Translate,
): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value))
    return value.flatMap((item) => evidenceValues(item, field, t));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(
      (item) => evidenceValues(item, field, t),
    );
  }
  if (field === "packageEvidence" || field === "packageType") {
    const packageType = String(value).trim().toUpperCase();
    if (packageType === "CARTON")
      return [t("i18n.containers.packageType.carton")];
    if (packageType === "WOODEN_CRATE")
      return [t("i18n.containers.packageType.woodenCrate")];
    return [t("Unknown - review")];
  }
  return [String(value)];
}

function isCanonicalField(value: string): value is ParserCanonicalField {
  return (
    [
      "cartons",
      "deliveryMethod",
      "destinationCode",
      "note",
      "packageType",
      "poNumber",
      "volumeCbm",
      "waybillNo",
    ] as readonly string[]
  ).includes(value);
}
