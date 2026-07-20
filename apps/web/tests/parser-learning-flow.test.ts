import assert from "node:assert/strict";
import test from "node:test";
import {
  createDraftFromInspection,
  isParserInspectionEmpty,
  isLatestParserRequest,
  parserLearningReducer,
  restoreDraftDefinition,
  serializeParserDraft,
  validateParserDraft,
  type ParserInspectResponse,
  type ParserPreviewResponse,
} from "../src/components/parser-learning/parser-learning-flow";
import {
  parserLearningErrorMessage,
  parserLearningIssueMessage,
  parserLearningValidationLabel,
  parserReplayEvidenceText,
} from "../src/components/parser-learning/parser-learning-labels";
import { createTranslator } from "../src/lib/i18n/translator";

const inspection: ParserInspectResponse = {
  candidateMappings: [
    suggestion("destinationCode", "Destination", "A1", 1),
    suggestion("cartons", "Cartons", "B1", 2),
    suggestion("volumeCbm", "Volume", "C1", 3),
  ],
  caseId: "case-1",
  contractVersion: "workbook-inspection-v1",
  draftRevision: 0,
  inspection: {
    inputSha256: "a".repeat(64),
    issues: [],
    limits: { maxCells: 20000 },
    sheets: [
      {
        boundedDimensions: {
          maxColumn: 4,
          maxRow: 100000,
          scannedColumns: 4,
          scannedRows: 500,
        },
        candidateDataRanges: [
          { endRow: 44, nonEmptyRows: 43, startRow: 2 },
        ],
        candidateHeaderAreas: [
          {
            cells: [
              cell("A1", 1, 1, "Destination"),
              cell("B1", 1, 2, "Cartons"),
              cell("C1", 1, 3, "Volume"),
            ],
            nonEmptyCells: 3,
            row: 1,
            rowCount: 1,
          },
        ],
        index: 0,
        mergedRanges: [],
        name: "Data",
        sampleCells: [
          cell("A1", 1, 1, "Destination"),
          cell("B1", 1, 2, "Cartons"),
          cell("C1", 1, 3, "Volume"),
          cell("D1", 1, 4, "Container"),
          cell("D2", 2, 4, "CAIU1234567"),
        ],
        visibility: "visible",
      },
    ],
    workbookType: "OOXML_XLSX",
  },
  issues: [],
  source: {
    fileSha256: "a".repeat(64),
    importFileId: "import-1",
    originalFilename: "real-failed.xlsx",
  },
  workerVersion: "parser-profile-engine-v1",
};

test("suggestions remain unconfirmed until required mappings are reviewed", () => {
  const draft = createDraftFromInspection(inspection);
  assert.equal(draft.fields.destinationCode.header, "Destination");
  assert.equal(draft.fields.destinationCode.confirmed, false);
  assert.ok(validateParserDraft(draft).includes("confirm-destinationCode"));
});

test("workbooks with sheets but no previewable cells use the empty recovery flow", () => {
  assert.equal(isParserInspectionEmpty({ ...inspection.inspection, sheets: [] }), true);
  assert.equal(
    isParserInspectionEmpty({
      ...inspection.inspection,
      sheets: inspection.inspection.sheets.map((sheet) => ({
        ...sheet,
        sampleCells: [],
      })),
    }),
    true,
  );
  assert.equal(isParserInspectionEmpty(inspection.inspection), false);
});

test("draft serialization produces allowlisted mapping and bounded fingerprint contracts", () => {
  const draft = createDraftFromInspection(inspection);
  draft.containerCell = "D2";
  for (const field of ["destinationCode", "cartons", "volumeCbm"] as const) {
    draft.fields[field].confirmed = true;
  }
  draft.fields.destinationCode.transform = "lookup";
  draft.fields.destinationCode.lookupRows = [{ from: "Edmonton", to: "YEG1" }];
  draft.excludePredicate = {
    enabled: true,
    header: "Destination",
    operator: "equals",
    value: "Total",
  };

  assert.deepEqual(validateParserDraft(draft), []);
  const serialized = serializeParserDraft(
    inspection.caseId,
    draft,
    inspection.inspection,
  );
  assert.ok(serialized);
  assert.equal(
    (serialized.mappingDefinition.dataRange as { maxRows: number }).maxRows,
    500,
  );
  assert.deepEqual(
    (
      (serialized.mappingDefinition.fields as Record<string, unknown>)
        .destinationCode as { transforms: unknown[] }
    ).transforms,
    [
      {
        caseSensitive: false,
        dictionary: { Edmonton: "YEG1" },
        op: "lookup",
      },
    ],
  );
  assert.equal(JSON.stringify(serialized).includes("storagePath"), false);

  const restored = restoreDraftDefinition(
    {
      fingerprintDefinition: serialized.fingerprintDefinition,
      mappingDefinition: serialized.mappingDefinition,
    },
    createDraftFromInspection(inspection),
  );
  assert.equal(restored.fields.destinationCode.confirmed, true);
  assert.equal(restored.fields.destinationCode.transform, "lookup");
  assert.equal(restored.containerCell, "D2");
});

test("stale preview completions cannot overwrite the latest request", () => {
  const draft = createDraftFromInspection(inspection);
  const initial = {
    activeRequest: 0,
    draft,
    preview: null,
    previewStatus: "idle" as const,
    revision: 1,
    saveStatus: "saved" as const,
  };
  const first = parserLearningReducer(initial, {
    requestId: 1,
    type: "previewStarted",
  });
  const second = parserLearningReducer(first, {
    requestId: 2,
    type: "previewStarted",
  });
  const stale = parserLearningReducer(second, {
    preview: preview(1),
    requestId: 1,
    type: "previewSucceeded",
  });
  assert.equal(stale.preview, null);
  const staleFailure = parserLearningReducer(stale, {
    requestId: 1,
    type: "previewFailed",
  });
  assert.equal(staleFailure.previewStatus, "running");
  const latest = parserLearningReducer(stale, {
    preview: preview(2),
    requestId: 2,
    type: "previewSucceeded",
  });
  assert.equal(latest.preview?.draftRevision, 2);
});

test("editing the draft invalidates an in-flight preview before another preview starts", () => {
  const draft = createDraftFromInspection(inspection);
  const running = parserLearningReducer(
    {
      activeRequest: 0,
      draft,
      preview: null,
      previewStatus: "idle" as const,
      revision: 1,
      saveStatus: "saved" as const,
    },
    { requestId: 1, type: "previewStarted" },
  );
  const edited = parserLearningReducer(running, {
    draft: { ...draft, skipSummary: true },
    requestId: 2,
    type: "draftChanged",
  });
  const stale = parserLearningReducer(edited, {
    preview: preview(1),
    requestId: 1,
    type: "previewSucceeded",
  });

  assert.equal(stale.preview, null);
  assert.equal(stale.previewStatus, "idle");
  assert.equal(stale.activeRequest, 2);
});

test("preview and replay completions share a strict latest-request guard", () => {
  assert.equal(isLatestParserRequest(4, 4), true);
  assert.equal(isLatestParserRequest(3, 4), false);
});

test("revision conflicts move autosave into the explicit stale recovery state", () => {
  const draft = createDraftFromInspection(inspection);
  const initial = {
    activeRequest: 0,
    draft,
    preview: null,
    previewStatus: "idle" as const,
    revision: 3,
    saveStatus: "saved" as const,
  };

  const saving = parserLearningReducer(initial, { type: "saveStarted" });
  assert.equal(saving.saveStatus, "saving");

  const stale = parserLearningReducer(saving, { type: "saveStale" });
  assert.equal(stale.saveStatus, "stale");
  assert.equal(stale.revision, 3);
  assert.equal(stale.draft, draft);
});

test("worker failures and inspection limits use recoverable localized messages", () => {
  const english = createTranslator("en");
  const chinese = createTranslator("zh-CN");

  for (const code of [
    "PROFILE_WORKER_INVOCATION_FAILED",
    "PROFILE_WORKER_EMPTY_OUTPUT",
    "PROFILE_WORKER_INVALID_OUTPUT",
    "PROFILE_REPLAY_WORKER_FAILED",
    "QUEUE_UNAVAILABLE",
  ]) {
    assert.equal(
      parserLearningErrorMessage(code, english.t),
      "Workbook processing is temporarily unavailable. The draft is safe; retry this action.",
    );
    assert.equal(
      parserLearningErrorMessage(code, chinese.t),
      "工作簿处理暂不可用。草稿已安全保存，请重试此操作。",
    );
  }

  assert.equal(
    parserLearningIssueMessage("INSPECTION_ROW_LIMIT_EXCEEDED", english.t),
    "The preview reached a safety limit. Use the bounded rows shown or continue manually.",
  );
  assert.equal(
    parserLearningIssueMessage("INSPECTION_CELL_LIMIT_EXCEEDED", chinese.t),
    "预览已达到安全限制，请使用当前受限数据或继续手工作业。",
  );

  assert.equal(
    parserLearningIssueMessage("MISSING_DESTINATION", english.t),
    "A mapped data row has no destination.",
  );
  assert.equal(
    parserLearningIssueMessage("ZERO_VOLUME_WITH_CARTONS", chinese.t),
    "映射行有箱数但体积为零，需要确认。",
  );
});

test("validation and replay evidence helpers remain localized and business-readable", () => {
  const english = createTranslator("en");
  const chinese = createTranslator("zh-CN");

  assert.equal(
    parserLearningValidationLabel("confirm-cartons", english.t),
    "Cartons / pieces — Confirm this required mapping.",
  );
  assert.equal(
    parserLearningValidationLabel("containerCell", chinese.t),
    "请选择包含柜号的源单元格。",
  );
  assert.equal(
    parserReplayEvidenceText(
      [{ waybillNo: "WB-1", poNumber: null }, { waybillNo: "WB-2" }],
      english.t,
    ),
    "WB-1 · WB-2",
  );
  assert.equal(
    parserReplayEvidenceText(null, chinese.t),
    "暂无可用值",
  );
  assert.equal(
    parserReplayEvidenceText(
      ["CARTON", "WOODEN_CRATE"],
      english.t,
      "packageEvidence",
    ),
    "carton · wooden crate",
  );
  assert.equal(
    parserReplayEvidenceText("CARTON", chinese.t, "packageEvidence"),
    "纸箱",
  );
  assert.equal(
    parserReplayEvidenceText("CARTON", english.t, "packageType"),
    "carton",
  );
  assert.equal(
    parserReplayEvidenceText("WOODEN_CRATE", chinese.t, "packageType"),
    "木箱",
  );
  assert.equal(
    parserReplayEvidenceText("PALLET", english.t, "packageEvidence"),
    "Unknown - review",
  );
});

function suggestion(
  canonicalField: string,
  header: string,
  coordinate: string,
  column: number,
) {
  return {
    canonicalField,
    certainty: 1,
    evidence: {
      cell: coordinate,
      column,
      normalizedHeader: header.toLowerCase(),
      rawHeader: header,
      row: 1,
      sheet: "Data",
    },
    source: { header, kind: "column" as const },
  };
}

function cell(cellValue: string, row: number, column: number, value: string) {
  return {
    cell: cellValue,
    column,
    isFormula: false,
    row,
    value,
    valueType: "string",
  };
}

function preview(revision: number): ParserPreviewResponse {
  return {
    caseId: "case-1",
    destinationSummaries: [],
    draftRevision: revision,
    errors: [],
    provenance: {},
    sampleRows: [],
    totalRows: 0,
    warnings: [],
  };
}
