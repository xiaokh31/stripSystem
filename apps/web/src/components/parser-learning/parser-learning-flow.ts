export const PARSER_CANONICAL_FIELDS = [
  "destinationCode",
  "cartons",
  "volumeCbm",
  "waybillNo",
  "poNumber",
  "deliveryMethod",
  "note",
  "packageType",
] as const;

export type ParserCanonicalField = (typeof PARSER_CANONICAL_FIELDS)[number];

export const REQUIRED_PARSER_FIELDS = [
  "destinationCode",
  "cartons",
  "volumeCbm",
] as const satisfies readonly ParserCanonicalField[];

export type ParserTransformKind =
  | "direct"
  | "trim"
  | "upper"
  | "lower"
  | "integer"
  | "decimal"
  | "cubicFeet"
  | "multiply"
  | "divide"
  | "lookup";

export interface LookupRowDraft {
  from: string;
  to: string;
}

export interface ParserFieldDraft {
  confirmed: boolean;
  header: string;
  suggestionCell: string | null;
  suggestionReasonCode: string | null;
  transform: ParserTransformKind;
  transformNumber: string;
  lookupRows: LookupRowDraft[];
}

export interface PredicateDraft {
  enabled: boolean;
  header: string;
  operator: "contains" | "equals" | "is_blank" | "not_equals";
  value: string;
}

export interface ParserLearningDraft {
  containerCell: string;
  dataEndRow: string;
  dataStartRow: number;
  fields: Record<ParserCanonicalField, ParserFieldDraft>;
  formatType: "BESTAR_RECEIVING" | "UNLOADING_PLAN_CN";
  headerRow: number;
  headerRowCount: number;
  includePredicate: PredicateDraft;
  excludePredicate: PredicateDraft;
  maxRows: number;
  sheetName: string;
  skipBlank: boolean;
  skipSummary: boolean;
  stopHeader: string;
  stopValue: string;
}

export interface InspectedCell {
  cell: string;
  column: number;
  hasCachedValue?: boolean | null;
  isFormula: boolean;
  row: number;
  value: unknown;
  valueType: string;
}

export interface HeaderCandidate {
  cells: InspectedCell[];
  nonEmptyCells: number;
  row: number;
  rowCount: number;
}

export interface DataRangeCandidate {
  endRow: number;
  nonEmptyRows: number;
  startRow: number;
}

export interface InspectedSheet {
  boundedDimensions: {
    maxColumn: number;
    maxRow: number;
    scannedColumns: number;
    scannedRows: number;
  };
  candidateDataRanges: DataRangeCandidate[];
  candidateHeaderAreas: HeaderCandidate[];
  index: number;
  mergedRanges: string[];
  name: string;
  sampleCells: InspectedCell[];
  visibility: string;
}

export interface ParserInspection {
  inputSha256: string;
  issues: ParserIssue[];
  limits: Record<string, number>;
  sheets: InspectedSheet[];
  workbookType: "OOXML_XLSM" | "OOXML_XLSX";
}

export interface ParserMappingSuggestion {
  canonicalField: string;
  certainty: number;
  evidence: {
    cell: string;
    column: number;
    normalizedHeader: string;
    rawHeader: string;
    row: number;
    sheet: string;
  };
  source: { header: string; kind: "column" };
}

export interface ParserIssue {
  code: string;
  field?: string | null;
  params?: Record<string, unknown>;
  path?: string | null;
  row?: number | null;
}

export interface ParserInspectResponse {
  candidateMappings: ParserMappingSuggestion[];
  caseId: string;
  contractVersion: string;
  draftRevision: number;
  inspection: ParserInspection;
  issues: ParserIssue[];
  source: {
    fileSha256: string;
    importFileId: string;
    originalFilename: string | null;
  };
  workerVersion: string;
}

export function isParserInspectionEmpty(
  inspection: ParserInspection,
): boolean {
  return inspection.sheets.every((sheet) => sheet.sampleCells.length === 0);
}

export interface ParserPreviewRow {
  cartons?: number | null;
  deliveryMethod?: string | null;
  destinationCode?: string | null;
  note?: string | null;
  packageType?: string | null;
  poNumber?: string | null;
  provenance?: Record<string, ParserFieldProvenance>;
  rowNumber: number;
  volumeCbm?: number | null;
  waybillNo?: string | null;
}

export interface ParserFieldProvenance {
  field: string;
  sourceRefs: Array<{
    cell: string | null;
    column: number | null;
    row: number | null;
    sheet: string;
  }>;
  transformChain: string[];
}

export interface ParserPreviewResponse {
  caseId: string;
  destinationSummaries: Array<{
    destinationCode: string | null;
    lineCount: number;
    packageType?: string | null;
    totalCartons: number;
    totalVolumeCbm: number;
  }>;
  draftRevision: number;
  errors: ParserIssue[];
  provenance: Record<string, ParserFieldProvenance>;
  sampleRows: ParserPreviewRow[];
  totalRows: number;
  warnings: ParserIssue[];
}

export type SaveStatus =
  | "blocked"
  | "error"
  | "idle"
  | "saved"
  | "saving"
  | "stale";

export interface ParserLearningState {
  activeRequest: number;
  draft: ParserLearningDraft;
  preview: ParserPreviewResponse | null;
  previewStatus: "error" | "idle" | "running" | "success";
  revision: number;
  saveStatus: SaveStatus;
}

export type ParserLearningAction =
  | {
      type: "draftChanged";
      draft: ParserLearningDraft;
      requestId: number;
    }
  | { type: "saveStarted" }
  | { type: "saveSucceeded"; revision: number }
  | { type: "saveFailed" }
  | { type: "saveStale" }
  | { type: "previewStarted"; requestId: number }
  | {
      type: "previewSucceeded";
      requestId: number;
      preview: ParserPreviewResponse;
    }
  | { type: "previewFailed"; requestId: number };

export function parserLearningReducer(
  state: ParserLearningState,
  action: ParserLearningAction,
): ParserLearningState {
  switch (action.type) {
    case "draftChanged":
      return {
        ...state,
        activeRequest: action.requestId,
        draft: action.draft,
        preview: null,
        previewStatus: "idle",
        saveStatus: "idle",
      };
    case "saveStarted":
      return { ...state, saveStatus: "saving" };
    case "saveSucceeded":
      return { ...state, revision: action.revision, saveStatus: "saved" };
    case "saveFailed":
      return { ...state, saveStatus: "error" };
    case "saveStale":
      return { ...state, saveStatus: "stale" };
    case "previewStarted":
      return {
        ...state,
        activeRequest: action.requestId,
        previewStatus: "running",
      };
    case "previewSucceeded":
      if (state.activeRequest !== action.requestId) return state;
      return {
        ...state,
        preview: action.preview,
        previewStatus: "success",
      };
    case "previewFailed":
      if (state.activeRequest !== action.requestId) return state;
      return { ...state, previewStatus: "error" };
  }
}

export function isLatestParserRequest(
  requestId: number,
  activeRequestId: number,
): boolean {
  return requestId === activeRequestId;
}

export function createDraftFromInspection(
  response: ParserInspectResponse,
): ParserLearningDraft {
  const firstSheet = response.inspection.sheets[0];
  const suggestedHeader = firstSheet?.candidateHeaderAreas[0];
  const suggestedRange = firstSheet?.candidateDataRanges[0];
  const fields = emptyFields();

  for (const suggestion of response.candidateMappings) {
    if (!isCanonicalField(suggestion.canonicalField)) continue;
    if (suggestion.evidence.sheet !== firstSheet?.name) continue;
    const field = fields[suggestion.canonicalField];
    if (field.header) continue;
    fields[suggestion.canonicalField] = {
      ...field,
      header: suggestion.source.header,
      suggestionCell: suggestion.evidence.cell,
      suggestionReasonCode:
        suggestion.certainty >= 1
          ? "PROFILE_SUGGESTION_HEADER_ALIAS_EXACT"
          : "PROFILE_SUGGESTION_REVIEW_REQUIRED",
    };
  }

  return {
    containerCell: "",
    dataEndRow: suggestedRange ? String(suggestedRange.endRow) : "",
    dataStartRow:
      suggestedRange?.startRow ??
      (suggestedHeader
        ? suggestedHeader.row + suggestedHeader.rowCount
        : 2),
    fields,
    formatType: "UNLOADING_PLAN_CN",
    headerRow: suggestedHeader?.row ?? 1,
    headerRowCount: suggestedHeader?.rowCount ?? 1,
    includePredicate: emptyPredicate(),
    excludePredicate: emptyPredicate(),
    maxRows: 500,
    sheetName: firstSheet?.name ?? "",
    skipBlank: true,
    skipSummary: false,
    stopHeader: "",
    stopValue: "",
  };
}

export function restoreDraftDefinition(
  value: unknown,
  fallback: ParserLearningDraft,
): ParserLearningDraft {
  const envelope = asRecord(value);
  const mapping = asRecord(envelope?.mappingDefinition);
  if (!mapping) return fallback;
  const sheet = asRecord(mapping.sheet);
  const header = asRecord(mapping.header);
  const dataRange = asRecord(mapping.dataRange);
  const fieldsValue = asRecord(mapping.fields) ?? {};
  const restoredFields = emptyFields();

  for (const field of PARSER_CANONICAL_FIELDS) {
    const mappingField = asRecord(fieldsValue[field]);
    const sources = Array.isArray(mappingField?.sources)
      ? mappingField.sources
      : [];
    const firstSource = asRecord(sources[0]);
    const transforms = Array.isArray(mappingField?.transforms)
      ? mappingField.transforms.map(asRecord).filter(Boolean)
      : [];
    const restoredTransform = restoreTransform(transforms);
    restoredFields[field] = {
      confirmed: Boolean(firstSource?.header),
      header:
        typeof firstSource?.header === "string" ? firstSource.header : "",
      lookupRows: restoredTransform.lookupRows,
      suggestionCell: null,
      suggestionReasonCode: null,
      transform: restoredTransform.transform,
      transformNumber: restoredTransform.transformNumber,
    };
  }

  const container = asRecord(mapping.container);
  const containerSources = Array.isArray(container?.sources)
    ? container.sources
    : [];
  const containerSource = asRecord(containerSources[0]);
  const predicates = Array.isArray(mapping.rowPredicates)
    ? mapping.rowPredicates.map(asRecord).filter(Boolean)
    : [];
  const include = predicates.find((item) => item?.op === "include");
  const exclude = predicates.find((item) => item?.op === "exclude");
  const stop = predicates.find((item) => item?.op === "stop");

  return {
    ...fallback,
    containerCell:
      typeof containerSource?.cell === "string" ? containerSource.cell : "",
    dataEndRow:
      typeof dataRange?.endRow === "number" ? String(dataRange.endRow) : "",
    dataStartRow:
      typeof dataRange?.startRow === "number"
        ? dataRange.startRow
        : fallback.dataStartRow,
    fields: restoredFields,
    formatType:
      mapping.formatType === "BESTAR_RECEIVING"
        ? "BESTAR_RECEIVING"
        : "UNLOADING_PLAN_CN",
    headerRow:
      typeof header?.row === "number" ? header.row : fallback.headerRow,
    headerRowCount:
      typeof header?.rowCount === "number"
        ? header.rowCount
        : fallback.headerRowCount,
    includePredicate: restorePredicate(include),
    excludePredicate: restorePredicate(exclude),
    maxRows:
      typeof dataRange?.maxRows === "number"
        ? dataRange.maxRows
        : fallback.maxRows,
    sheetName:
      typeof sheet?.name === "string" ? sheet.name : fallback.sheetName,
    skipBlank: predicates.some((item) => item?.op === "skip_blank"),
    skipSummary: predicates.some((item) => item?.op === "skip_summary"),
    stopHeader: sourceHeader(stop),
    stopValue: predicateValue(stop),
  };
}

export interface SerializedParserDraft {
  fingerprintDefinition: Record<string, unknown>;
  mappingDefinition: Record<string, unknown>;
}

export function serializeParserDraft(
  caseId: string,
  draft: ParserLearningDraft,
  inspection: ParserInspection,
): SerializedParserDraft | null {
  const sheet = inspection.sheets.find((item) => item.name === draft.sheetName);
  if (!sheet) return null;
  const mappingFields: Record<string, unknown> = {};
  for (const field of PARSER_CANONICAL_FIELDS) {
    const current = draft.fields[field];
    if (!current.header) continue;
    mappingFields[field] = {
      sources: [{ kind: "column", header: current.header }],
      transforms: serializeTransforms(current),
    };
  }
  if (Object.keys(mappingFields).length === 0) return null;

  const anchorField = REQUIRED_PARSER_FIELDS.map(
    (field) => draft.fields[field],
  ).find((field) => field.header);
  if (!anchorField) return null;
  const anchorCell = headerCells(sheet, draft).find(
    (cell) => String(cell.value).trim() === anchorField.header,
  );
  if (!anchorCell) return null;

  const rowPredicates: Record<string, unknown>[] = [];
  const requiredHeaders = REQUIRED_PARSER_FIELDS.map(
    (field) => draft.fields[field].header,
  ).filter(Boolean);
  if (draft.skipBlank && requiredHeaders.length > 0) {
    rowPredicates.push({ op: "skip_blank", headers: requiredHeaders });
  }
  if (draft.skipSummary && requiredHeaders.length > 1) {
    rowPredicates.push({
      op: "skip_summary",
      whenBlank: requiredHeaders.slice(1),
      whenPresent: [requiredHeaders[0]],
    });
  }
  appendPredicate(rowPredicates, "include", draft.includePredicate);
  appendPredicate(rowPredicates, "exclude", draft.excludePredicate);
  if (draft.stopHeader && draft.stopValue.trim()) {
    rowPredicates.push({
      op: "stop",
      operator: "equals",
      source: { kind: "column", header: draft.stopHeader },
      value: draft.stopValue.trim(),
    });
  }

  const dataEndRow = optionalPositiveInteger(draft.dataEndRow);
  const container = draft.containerCell
    ? {
        scope: "workbook",
        sources: [{ kind: "cell", cell: draft.containerCell }],
        transforms: [{ op: "trim" }],
      }
    : undefined;

  return {
    mappingDefinition: {
      schemaVersion: "parser-profile-mapping-v1",
      profileVersion: `learning-${caseId}`,
      formatType: draft.formatType,
      sheet: { name: draft.sheetName },
      header: { row: draft.headerRow, rowCount: draft.headerRowCount },
      dataRange: {
        startRow: draft.dataStartRow,
        maxRows: draft.maxRows,
        ...(dataEndRow ? { endRow: dataEndRow } : {}),
      },
      ...(container ? { container } : {}),
      fields: mappingFields,
      rowPredicates,
      groupBy: ["destinationCode", "packageType"],
    },
    fingerprintDefinition: {
      profileId: `learning-${caseId}`,
      algorithmVersion: "workbook-fingerprint-v1",
      workbookType: inspection.workbookType,
      sheet: { name: draft.sheetName },
      anchors: [
        {
          value: String(anchorCell.value),
          required: true,
          row: anchorCell.row,
          column: anchorCell.column,
          rowTolerance: 0,
          columnTolerance: 0,
        },
      ],
      requiredRelativeColumns: [],
      dataStart: {
        rowOffsetFromHeader: Math.max(0, draft.dataStartRow - draft.headerRow),
      },
      ...(draft.stopHeader && draft.stopValue.trim()
        ? {
            dataStop: {
              header: draft.stopHeader,
              value: draft.stopValue.trim(),
            },
          }
        : {}),
    },
  };
}

export function validateParserDraft(draft: ParserLearningDraft): string[] {
  const errors: string[] = [];
  if (!draft.sheetName) errors.push("sheetName");
  if (!Number.isInteger(draft.headerRow) || draft.headerRow < 1)
    errors.push("headerRow");
  if (!Number.isInteger(draft.dataStartRow) || draft.dataStartRow < 1)
    errors.push("dataStartRow");
  if (draft.dataStartRow <= draft.headerRow) errors.push("dataStartRow");
  if (!draft.containerCell) errors.push("containerCell");
  for (const field of REQUIRED_PARSER_FIELDS) {
    if (!draft.fields[field].header) errors.push(`field-${field}`);
    if (!draft.fields[field].confirmed) errors.push(`confirm-${field}`);
  }
  for (const field of PARSER_CANONICAL_FIELDS) {
    const current = draft.fields[field];
    if (
      (current.transform === "multiply" || current.transform === "divide") &&
      (!Number.isFinite(Number(current.transformNumber)) ||
        Number(current.transformNumber) === 0)
    ) {
      errors.push(`transform-${field}`);
    }
    if (
      current.transform === "lookup" &&
      current.lookupRows.filter((row) => row.from.trim()).length === 0
    ) {
      errors.push(`transform-${field}`);
    }
  }
  return [...new Set(errors)];
}

export function headerCells(
  sheet: InspectedSheet,
  draft: Pick<ParserLearningDraft, "headerRow" | "headerRowCount">,
): InspectedCell[] {
  const end = draft.headerRow + draft.headerRowCount - 1;
  return sheet.sampleCells.filter(
    (cell) =>
      cell.row >= draft.headerRow &&
      cell.row <= end &&
      cell.value !== null &&
      cell.value !== "",
  );
}

function emptyFields(): Record<ParserCanonicalField, ParserFieldDraft> {
  return Object.fromEntries(
    PARSER_CANONICAL_FIELDS.map((field) => [
      field,
      {
        confirmed: false,
        header: "",
        lookupRows: [{ from: "", to: "" }],
        suggestionCell: null,
        suggestionReasonCode: null,
        transform: field === "cartons" ? "integer" : field === "volumeCbm" ? "decimal" : "trim",
        transformNumber: "",
      } satisfies ParserFieldDraft,
    ]),
  ) as Record<ParserCanonicalField, ParserFieldDraft>;
}

function emptyPredicate(): PredicateDraft {
  return { enabled: false, header: "", operator: "equals", value: "" };
}

function isCanonicalField(value: string): value is ParserCanonicalField {
  return (PARSER_CANONICAL_FIELDS as readonly string[]).includes(value);
}

function serializeTransforms(field: ParserFieldDraft): Record<string, unknown>[] {
  switch (field.transform) {
    case "direct":
      return [];
    case "trim":
      return [{ op: "trim" }];
    case "upper":
      return [{ op: "trim" }, { op: "case", mode: "upper" }];
    case "lower":
      return [{ op: "trim" }, { op: "case", mode: "lower" }];
    case "integer":
      return [{ op: "parse_integer", groupSeparator: ",", decimalSeparator: "." }];
    case "decimal":
      return [{ op: "parse_decimal", groupSeparator: ",", decimalSeparator: "." }];
    case "cubicFeet":
      return [
        { op: "parse_decimal", groupSeparator: ",", decimalSeparator: "." },
        { op: "unit_conversion", fromUnit: "CUBIC_FEET", toUnit: "CBM" },
      ];
    case "multiply":
      return [{ op: "parse_decimal" }, { op: "multiply", factor: field.transformNumber }];
    case "divide":
      return [{ op: "parse_decimal" }, { op: "divide", divisor: field.transformNumber }];
    case "lookup":
      return [
        {
          op: "lookup",
          caseSensitive: false,
          dictionary: Object.fromEntries(
            field.lookupRows
              .filter((row) => row.from.trim())
              .map((row) => [row.from.trim(), row.to.trim()]),
          ),
        },
      ];
  }
}

function restoreTransform(transforms: Array<Record<string, unknown> | null>): {
  lookupRows: LookupRowDraft[];
  transform: ParserTransformKind;
  transformNumber: string;
} {
  const valid = transforms.filter((item): item is Record<string, unknown> => Boolean(item));
  const unit = valid.find((item) => item.op === "unit_conversion");
  const lookup = valid.find((item) => item.op === "lookup");
  const multiply = valid.find((item) => item.op === "multiply");
  const divide = valid.find((item) => item.op === "divide");
  const caseTransform = valid.find((item) => item.op === "case");
  const dictionary = asRecord(lookup?.dictionary);
  const lookupRows = dictionary
    ? Object.entries(dictionary).map(([from, to]) => ({
        from,
        to: to === null || to === undefined ? "" : String(to),
      }))
    : [{ from: "", to: "" }];
  if (lookup) return { lookupRows, transform: "lookup", transformNumber: "" };
  if (unit?.fromUnit === "CUBIC_FEET")
    return { lookupRows, transform: "cubicFeet", transformNumber: "" };
  if (multiply)
    return {
      lookupRows,
      transform: "multiply",
      transformNumber: String(multiply.factor ?? ""),
    };
  if (divide)
    return {
      lookupRows,
      transform: "divide",
      transformNumber: String(divide.divisor ?? ""),
    };
  if (caseTransform?.mode === "upper")
    return { lookupRows, transform: "upper", transformNumber: "" };
  if (caseTransform?.mode === "lower")
    return { lookupRows, transform: "lower", transformNumber: "" };
  if (valid.some((item) => item.op === "parse_integer"))
    return { lookupRows, transform: "integer", transformNumber: "" };
  if (valid.some((item) => item.op === "parse_decimal"))
    return { lookupRows, transform: "decimal", transformNumber: "" };
  if (valid.some((item) => item.op === "trim"))
    return { lookupRows, transform: "trim", transformNumber: "" };
  return { lookupRows, transform: "direct", transformNumber: "" };
}

function restorePredicate(
  value: Record<string, unknown> | null | undefined,
): PredicateDraft {
  if (!value) return emptyPredicate();
  const operator = ["contains", "equals", "is_blank", "not_equals"].includes(
    String(value.operator),
  )
    ? (value.operator as PredicateDraft["operator"])
    : "equals";
  return {
    enabled: true,
    header: sourceHeader(value),
    operator,
    value: predicateValue(value),
  };
}

function appendPredicate(
  target: Record<string, unknown>[],
  op: "exclude" | "include",
  draft: PredicateDraft,
): void {
  if (!draft.enabled || !draft.header) return;
  target.push({
    op,
    operator: draft.operator,
    source: { kind: "column", header: draft.header },
    ...(draft.operator === "is_blank" ? {} : { value: draft.value.trim() }),
  });
}

function sourceHeader(
  value: Record<string, unknown> | null | undefined,
): string {
  const source = asRecord(value?.source);
  return typeof source?.header === "string" ? source.header : "";
}

function predicateValue(
  value: Record<string, unknown> | null | undefined,
): string {
  return typeof value?.value === "string" ? value.value : "";
}

function optionalPositiveInteger(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
