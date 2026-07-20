"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  getParserLearningReplayArtifact,
  getParserLearningReplayJob,
  inspectParserLearningCase,
  previewParserLearningDraft,
  queueParserLearningReplay,
  saveParserLearningDraft,
  startParserLearningCase,
  submitParserLearningCandidate,
  type ParserLearningCaseResponse,
  type ParserReplayArtifactDocument,
} from "@/lib/api-client";
import {
  PARSER_CANONICAL_FIELDS,
  REQUIRED_PARSER_FIELDS,
  createDraftFromInspection,
  isParserInspectionEmpty,
  headerCells,
  isLatestParserRequest,
  parserLearningReducer,
  restoreDraftDefinition,
  serializeParserDraft,
  validateParserDraft,
  type InspectedCell,
  type ParserCanonicalField,
  type ParserFieldDraft,
  type ParserInspectResponse,
  type ParserLearningDraft,
  type ParserLearningState,
  type ParserTransformKind,
  type PredicateDraft,
} from "./parser-learning-flow";
import {
  parserFieldLabel,
  parserLearningErrorMessage,
  parserLearningIssueMessage,
  parserLearningStatusLabel,
  parserLearningValidationLabel,
  parserReplayEvidenceText,
  parserReplayDiffLabel,
  parserSuggestionReason,
  parserTransformLabel,
} from "./parser-learning-labels";

const TRANSFORMS: ParserTransformKind[] = [
  "direct",
  "trim",
  "upper",
  "lower",
  "integer",
  "decimal",
  "cubicFeet",
  "multiply",
  "divide",
  "lookup",
];

type LoadState =
  | { status: "loading" }
  | {
      caseData?: ParserLearningCaseResponse;
      code: string;
      status: "error";
    }
  | {
      caseData: ParserLearningCaseResponse;
      inspection: ParserInspectResponse;
      initialState: ParserLearningState;
      status: "ready";
    };

export function ParserLearningWizard({
  canTrain,
  importId,
}: {
  canTrain: boolean;
  importId: string;
}) {
  const { t } = useI18n();
  const [loadState, setLoadState] = useState<LoadState>(() =>
    canTrain
      ? { status: "loading" }
      : {
          code: "PARSER_LEARNING_PERMISSION_DENIED",
          status: "error",
        },
  );

  useEffect(() => {
    let active = true;
    if (!canTrain) {
      return () => {
        active = false;
      };
    }
    void (async () => {
      let caseData: ParserLearningCaseResponse | undefined;
      try {
        caseData = await startParserLearningCase(importId);
        const inspection = await inspectParserLearningCase(caseData.id);
        const suggested = createDraftFromInspection(inspection);
        const draft = restoreDraftDefinition(
          caseData.draftDefinition,
          suggested,
        );
        if (!active) return;
        setLoadState({
          caseData,
          inspection,
          initialState: {
            activeRequest: 0,
            draft,
            preview: null,
            previewStatus: "idle",
            revision: caseData.draftRevision,
            saveStatus: caseData.draftRevision > 0 ? "saved" : "idle",
          },
          status: "ready",
        });
      } catch (error) {
        if (!active) return;
        setLoadState({
          caseData,
          code:
            error instanceof ApiClientError
              ? error.code
              : "WORKBOOK_READ_FAILED",
          status: "error",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [canTrain, importId]);

  if (loadState.status === "loading") {
    return (
      <WizardShellMessage
        importId={importId}
        text={t("i18n.parserLearning.loading")}
      />
    );
  }
  if (loadState.status === "error") {
    return (
      <WizardShellMessage
        error
        importId={importId}
        learningCaseId={loadState.caseData?.id}
        text={parserLearningErrorMessage(loadState.code, t)}
      />
    );
  }
  if (isParserInspectionEmpty(loadState.inspection.inspection)) {
    return (
      <WizardShellMessage
        importId={importId}
        learningCaseId={loadState.caseData.id}
        text={t("i18n.parserLearning.emptyWorkbook")}
      />
    );
  }
  return (
    <ReadyWizard
      caseData={loadState.caseData}
      importId={importId}
      initialState={loadState.initialState}
      inspection={loadState.inspection}
    />
  );
}

function ReadyWizard({
  caseData: initialCase,
  importId,
  initialState,
  inspection,
}: {
  caseData: ParserLearningCaseResponse;
  importId: string;
  initialState: ParserLearningState;
  inspection: ParserInspectResponse;
}) {
  const { format, t } = useI18n();
  const [state, dispatch] = useReducer(parserLearningReducer, initialState);
  const [caseData, setCaseData] = useState(initialCase);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [sourcePage, setSourcePage] = useState(0);
  const [saveRetry, setSaveRetry] = useState(0);
  const [actionCode, setActionCode] = useState<string | null>(null);
  const [replayStatus, setReplayStatus] = useState<
    "error" | "idle" | "running" | "success"
  >("idle");
  const [replayDocument, setReplayDocument] =
    useState<ParserReplayArtifactDocument | null>(null);
  const [stableName, setStableName] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [profileVersionId, setProfileVersionId] = useState(
    caseData.latestProfileVersion?.id ?? null,
  );
  const [submitted, setSubmitted] = useState(
    caseData.status === "AWAITING_COMPLETION" ||
      caseData.status === "AWAITING_APPROVAL",
  );
  const revisionRef = useRef(state.revision);
  const saveSequence = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const previewSequence = useRef(0);
  const replaySequence = useRef(0);
  const hydrated = useRef(false);

  const selectedSheet =
    inspection.inspection.sheets.find(
      (sheet) => sheet.name === state.draft.sheetName,
    ) ?? inspection.inspection.sheets[0];
  const availableHeaders = useMemo(
    () =>
      headerCells(selectedSheet, state.draft)
        .map((cell) => String(cell.value).trim())
        .filter(
          (value, index, values) => value && values.indexOf(value) === index,
        ),
    [selectedSheet, state.draft],
  );
  const validationErrors = useMemo(
    () => validateParserDraft(state.draft),
    [state.draft],
  );
  const invalidControls = useMemo(
    () => new Set(validationErrors),
    [validationErrors],
  );
  const inspectionIssues = useMemo(
    () =>
      [...inspection.issues, ...inspection.inspection.issues].filter(
        (issue, index, issues) =>
          issues.findIndex(
            (candidate) =>
              candidate.code === issue.code &&
              candidate.field === issue.field &&
              candidate.row === issue.row,
          ) === index,
      ),
    [inspection],
  );
  const serialized = useMemo(
    () =>
      serializeParserDraft(
        caseData.id,
        state.draft,
        inspection.inspection,
      ),
    [caseData.id, inspection.inspection, state.draft],
  );

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const sequence = ++saveSequence.current;
    if (!serialized || validationErrors.length > 0) return;
    const timeout = window.setTimeout(() => {
      dispatch({ type: "saveStarted" });
      saveChain.current = saveChain.current
        .catch(() => undefined)
        .then(async () => {
          if (sequence !== saveSequence.current) return;
          try {
            const saved = await saveParserLearningDraft(caseData.id, {
              expectedRevision: revisionRef.current,
              ...serialized,
            });
            revisionRef.current = saved.draftRevision;
            setCaseData(saved);
            if (sequence === saveSequence.current) {
              dispatch({
                type: "saveSucceeded",
                revision: saved.draftRevision,
              });
              setActionCode(null);
            }
          } catch (error) {
            if (sequence !== saveSequence.current) return;
            if (
              error instanceof ApiClientError &&
              error.code === "PROFILE_DRAFT_REVISION_CONFLICT"
            ) {
              dispatch({ type: "saveStale" });
            } else {
              dispatch({ type: "saveFailed" });
            }
            setActionCode(
              error instanceof ApiClientError
                ? error.code
                : "PROFILE_MAPPING_DEFINITION_INVALID",
            );
          }
        });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [caseData.id, saveRetry, serialized, validationErrors.length]);

  function changeDraft(next: ParserLearningDraft) {
    dispatch({
      type: "draftChanged",
      draft: next,
      requestId: ++previewSequence.current,
    });
    replaySequence.current += 1;
    setReplayDocument(null);
    setReplayStatus("idle");
    setSubmitted(false);
  }

  function updateField(
    field: ParserCanonicalField,
    patch: Partial<ParserFieldDraft>,
  ) {
    changeDraft({
      ...state.draft,
      fields: {
        ...state.draft.fields,
        [field]: { ...state.draft.fields[field], ...patch },
      },
    });
  }

  function locateSource(cell: string) {
    const sourceCell = selectedSheet.sampleCells.find(
      (candidate) => candidate.cell === cell,
    );
    setSelectedCell(cell);
    if (sourceCell) {
      setSourcePage(Math.floor((sourceCell.row - 1) / 15));
    }
    window.setTimeout(() => {
      document.getElementById(`source-${cell}`)?.focus();
    }, 0);
  }

  async function runPreview() {
    const errors = validateParserDraft(state.draft);
    if (errors.length > 0) {
      document.getElementById(errors[0])?.focus();
      setActionCode("PARSER_LEARNING_VALIDATION_FAILED");
      return;
    }
    if (state.saveStatus !== "saved") {
      setActionCode("PROFILE_DRAFT_REVISION_CONFLICT");
      return;
    }
    const requestId = ++previewSequence.current;
    dispatch({ type: "previewStarted", requestId });
    setActionCode(null);
    try {
      const preview = await previewParserLearningDraft(
        caseData.id,
        revisionRef.current,
      );
      dispatch({ type: "previewSucceeded", preview, requestId });
    } catch (error) {
      dispatch({ type: "previewFailed", requestId });
      if (isLatestParserRequest(requestId, previewSequence.current)) {
        setActionCode(
          error instanceof ApiClientError
            ? error.code
            : "PROFILE_PREVIEW_STALE_RESULT",
        );
      }
    }
  }

  async function runReplay() {
    if (!caseData.linkedContainer || state.saveStatus !== "saved") {
      setActionCode("PROFILE_REPLAY_NOT_READY");
      return;
    }
    const requestId = ++replaySequence.current;
    setReplayStatus("running");
    setActionCode(null);
    try {
      let job = await queueParserLearningReplay(caseData.id, {
        idempotencyKey: replayRequestKey(caseData.id, revisionRef.current),
        revision: revisionRef.current,
      });
      for (let attempt = 0; attempt < 90; attempt += 1) {
        if (
          job.status === "succeeded" ||
          job.status === "failed" ||
          job.status === "cancelled"
        )
          break;
        await delay(1000);
        if (!isLatestParserRequest(requestId, replaySequence.current)) return;
        job = await getParserLearningReplayJob(caseData.id, job.id);
      }
      if (!isLatestParserRequest(requestId, replaySequence.current)) return;
      const artifactId = job.result?.replay?.artifactId;
      if (job.status !== "succeeded" || !artifactId) {
        throw new ApiClientError({
          code: job.lastErrorCode ?? "PROFILE_REPLAY_WORKER_FAILED",
          message: "PROFILE_REPLAY_WORKER_FAILED",
          status: 0,
        });
      }
      const artifact = await getParserLearningReplayArtifact(
        caseData.id,
        artifactId,
      );
      if (!isLatestParserRequest(requestId, replaySequence.current)) return;
      setReplayDocument(artifact);
      setReplayStatus("success");
    } catch (error) {
      if (!isLatestParserRequest(requestId, replaySequence.current)) return;
      setReplayStatus("error");
      setActionCode(
        error instanceof ApiClientError
          ? error.code
          : "PROFILE_REPLAY_WORKER_FAILED",
      );
    }
  }

  async function submitCandidate() {
    if (!replayDocument?.passed || !stableName.trim()) {
      setActionCode("PROFILE_CANDIDATE_NOT_READY");
      document.getElementById("parser-profile-name")?.focus();
      return;
    }
    try {
      const result = await submitParserLearningCandidate(caseData.id, {
        customerLabel: customerLabel.trim() || null,
        replayArtifactId: replayDocument.artifactId,
        revision: revisionRef.current,
        stableName: stableName.trim(),
      });
      setCaseData(result.learningCase);
      setProfileVersionId(result.profileVersion.id);
      setSubmitted(true);
      setActionCode(null);
    } catch (error) {
      setActionCode(
        error instanceof ApiClientError
          ? error.code
          : "PROFILE_CANDIDATE_NOT_READY",
      );
    }
  }

  const sourceRows = paginatedSourceRows(
    selectedSheet.sampleCells,
    sourcePage,
    15,
  );
  const maxSourcePage = Math.max(
    0,
    Math.ceil(selectedSheet.boundedDimensions.scannedRows / 15) - 1,
  );

  return (
    <main
      className="office-main-content flex flex-1 flex-col gap-4 overflow-x-hidden py-6"
      data-parser-learning-workspace="true"
    >
      <header className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              {t("i18n.parserLearning.eyebrow")}
            </p>
            <h1 className="mt-1 break-words text-2xl font-semibold text-zinc-950">
              {t("i18n.parserLearning.title")}
            </h1>
            <p className="mt-2 break-all text-sm text-zinc-600">
              {inspection.source.originalFilename ??
                t("i18n.parserLearning.sourceWorkbook")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill text={parserLearningStatusLabel(caseData.status, t)} />
            <Link
              className="min-h-10 border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold"
              href={`/imports/${encodeURIComponent(importId)}`}
            >
              {t("i18n.parserLearning.backToImport")}
            </Link>
          </div>
        </div>
        <ol className="mt-5 grid gap-px border border-zinc-200 bg-zinc-200 text-xs font-semibold sm:grid-cols-4 xl:grid-cols-7">
          {[
            t("i18n.parserLearning.step.structure"),
            t("i18n.parserLearning.step.mapping"),
            t("i18n.parserLearning.step.transforms"),
            t("i18n.parserLearning.step.rows"),
            t("i18n.parserLearning.step.preview"),
            t("i18n.parserLearning.step.manual"),
            t("i18n.parserLearning.step.reconcile"),
          ].map((step, index) => (
            <li className="bg-white px-3 py-2" key={`${index}-${step}`}>
              <span className="mr-2 text-teal-700">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </header>

      <section
        aria-labelledby="structure-heading"
        className="border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <SectionHeading
          id="structure-heading"
          number="1"
          title={t("i18n.parserLearning.step.structure")}
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
          <fieldset className="grid content-start gap-3">
            <legend className="sr-only">
              {t("i18n.parserLearning.step.structure")}
            </legend>
            <SelectField
              errorMessage={
                invalidControls.has("sheetName")
                  ? parserLearningValidationLabel("sheetName", t)
                  : undefined
              }
              id="sheetName"
              label={t("i18n.parserLearning.sheet")}
              value={state.draft.sheetName}
              onChange={(value) => {
                setSourcePage(0);
                changeDraft({ ...state.draft, sheetName: value });
              }}
              options={inspection.inspection.sheets.map((sheet) => ({
                label: sheet.name,
                value: sheet.name,
              }))}
            />
            <SelectField
              id="format-type"
              label={t("i18n.parserLearning.workbookLayout")}
              value={state.draft.formatType}
              onChange={(value) =>
                changeDraft({
                  ...state.draft,
                  formatType:
                    value === "BESTAR_RECEIVING"
                      ? "BESTAR_RECEIVING"
                      : "UNLOADING_PLAN_CN",
                })
              }
              options={[
                {
                  label: t("i18n.parserLearning.layout.unloadingPlan"),
                  value: "UNLOADING_PLAN_CN",
                },
                {
                  label: t("i18n.parserLearning.layout.receivingReport"),
                  value: "BESTAR_RECEIVING",
                },
              ]}
            />
            <NumberField
              errorMessage={
                invalidControls.has("headerRow")
                  ? parserLearningValidationLabel("headerRow", t)
                  : undefined
              }
              id="headerRow"
              label={t("i18n.parserLearning.headerRow")}
              min={1}
              value={state.draft.headerRow}
              onChange={(value) =>
                changeDraft({ ...state.draft, headerRow: value })
              }
            />
            <NumberField
              id="header-row-count"
              label={t("i18n.parserLearning.headerHeight")}
              min={1}
              max={3}
              value={state.draft.headerRowCount}
              onChange={(value) =>
                changeDraft({ ...state.draft, headerRowCount: value })
              }
            />
            <NumberField
              errorMessage={
                invalidControls.has("dataStartRow")
                  ? parserLearningValidationLabel("dataStartRow", t)
                  : undefined
              }
              id="dataStartRow"
              label={t("i18n.parserLearning.dataStart")}
              min={1}
              value={state.draft.dataStartRow}
              onChange={(value) =>
                changeDraft({ ...state.draft, dataStartRow: value })
              }
            />
            <label className="text-sm font-medium" htmlFor="data-end-row">
              {t("i18n.parserLearning.dataEnd")}
              <input
                className="mt-1 min-h-10 w-full border border-zinc-300 bg-white px-3"
                id="data-end-row"
                inputMode="numeric"
                onChange={(event) =>
                  changeDraft({
                    ...state.draft,
                    dataEndRow: event.target.value,
                  })
                }
                value={state.draft.dataEndRow}
              />
            </label>
            <SelectField
              errorMessage={
                invalidControls.has("containerCell")
                  ? parserLearningValidationLabel("containerCell", t)
                  : undefined
              }
              id="containerCell"
              label={parserFieldLabel("containerNo", t)}
              value={state.draft.containerCell}
              onChange={(value) => {
                setSelectedCell(value);
                changeDraft({ ...state.draft, containerCell: value });
              }}
              options={[
                { label: t("i18n.parserLearning.chooseCell"), value: "" },
                ...selectedSheet.sampleCells
                  .filter((cell) => cell.value !== null && cell.value !== "")
                  .map((cell) => ({
                    label: `${cell.cell} — ${String(cell.value)}`,
                    value: cell.cell,
                  })),
              ]}
            />
          </fieldset>
          <SourcePreview
            cells={sourceRows.cells}
            columns={sourceRows.columns}
            mergedRanges={selectedSheet.mergedRanges}
            onSelect={setSelectedCell}
            page={sourcePage}
            maxPage={maxSourcePage}
            selectedCell={selectedCell}
            setPage={setSourcePage}
          />
        </div>
        {inspectionIssues.length > 0 ? (
          <div
            className="mt-4 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"
            role="status"
          >
            <h3 className="font-semibold">
              {t("i18n.parserLearning.inspectionIssues")}
            </h3>
            <ul className="mt-2 grid gap-1">
              {inspectionIssues.map((issue, index) => (
                <li key={`${issue.code}-${issue.field ?? ""}-${issue.row ?? ""}-${index}`}>
                  {parserLearningIssueMessage(issue.code, t)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="mapping-heading"
        className="border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <SectionHeading
          id="mapping-heading"
          number="2"
          title={t("i18n.parserLearning.step.mapping")}
        />
        <p className="mt-2 text-sm text-zinc-600">
          {t("i18n.parserLearning.mappingInstruction")}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="p-3">
                  {t("i18n.parserLearning.canonicalField")}
                </th>
                <th className="p-3">{t("i18n.parserLearning.sourceHeader")}</th>
                <th className="p-3">{t("i18n.parserLearning.transform")}</th>
                <th className="p-3">{t("i18n.parserLearning.suggestion")}</th>
                <th className="p-3">{t("i18n.parserLearning.confirm")}</th>
              </tr>
            </thead>
            <tbody>
              {PARSER_CANONICAL_FIELDS.map((field) => (
                <MappingRow
                  availableHeaders={availableHeaders}
                  field={field}
                  key={field}
                  mapping={state.draft.fields[field]}
                  invalidControls={invalidControls}
                  onChange={(patch) => updateField(field, patch)}
                  onLocate={locateSource}
                  required={(
                    REQUIRED_PARSER_FIELDS as readonly string[]
                  ).includes(field)}
                  sourceCell={
                    headerCells(selectedSheet, state.draft).find(
                      (cell) =>
                        String(cell.value).trim() ===
                        state.draft.fields[field].header,
                    )?.cell ?? null
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="rows-heading"
        className="border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <SectionHeading
          id="rows-heading"
          number="3–4"
          title={t("i18n.parserLearning.transformAndRows")}
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <fieldset className="grid gap-3 border border-zinc-200 p-4">
            <legend className="px-2 text-sm font-semibold">
              {t("i18n.parserLearning.rowRules")}
            </legend>
            <Toggle
              checked={state.draft.skipBlank}
              label={t("i18n.parserLearning.skipBlank")}
              onChange={(checked) =>
                changeDraft({ ...state.draft, skipBlank: checked })
              }
            />
            <Toggle
              checked={state.draft.skipSummary}
              label={t("i18n.parserLearning.skipSummary")}
              onChange={(checked) =>
                changeDraft({ ...state.draft, skipSummary: checked })
              }
            />
            <SelectField
              id="stop-header"
              label={t("i18n.parserLearning.stopHeader")}
              value={state.draft.stopHeader}
              onChange={(value) =>
                changeDraft({ ...state.draft, stopHeader: value })
              }
              options={[
                { label: t("i18n.parserLearning.none"), value: "" },
                ...availableHeaders.map((value) => ({ label: value, value })),
              ]}
            />
            <label className="text-sm font-medium" htmlFor="stop-value">
              {t("i18n.parserLearning.stopValue")}
              <input
                className="mt-1 min-h-10 w-full border border-zinc-300 bg-white px-3"
                id="stop-value"
                onChange={(event) =>
                  changeDraft({ ...state.draft, stopValue: event.target.value })
                }
                value={state.draft.stopValue}
              />
            </label>
          </fieldset>
          <div className="grid gap-3">
            <PredicateEditor
              draft={state.draft.includePredicate}
              headers={availableHeaders}
              id="include"
              label={t("i18n.parserLearning.includeRule")}
              onChange={(includePredicate) =>
                changeDraft({ ...state.draft, includePredicate })
              }
            />
            <PredicateEditor
              draft={state.draft.excludePredicate}
              headers={availableHeaders}
              id="exclude"
              label={t("i18n.parserLearning.excludeRule")}
              onChange={(excludePredicate) =>
                changeDraft({ ...state.draft, excludePredicate })
              }
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="preview-heading"
        className="border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            id="preview-heading"
            number="5"
            title={t("i18n.parserLearning.step.preview")}
          />
          <button
            className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            disabled={state.previewStatus === "running"}
            onClick={runPreview}
            type="button"
          >
            {state.previewStatus === "running"
              ? t("i18n.parserLearning.previewRunning")
              : t("i18n.parserLearning.runPreview")}
          </button>
        </div>
        <StatusRegion
          actionCode={actionCode}
          caseData={caseData}
          retry={() => setSaveRetry((value) => value + 1)}
          saveStatus={state.saveStatus}
          validationErrors={validationErrors}
        />
        <PreviewRegion state={state} />
      </section>

      <section
        aria-labelledby="manual-heading"
        className="border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <SectionHeading
          id="manual-heading"
          number="6"
          title={t("i18n.parserLearning.step.manual")}
        />
        <p className="mt-2 text-sm text-zinc-600">
          {t("i18n.parserLearning.manualDescription")}
        </p>
        {caseData.linkedContainer ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-l-4 border-emerald-600 bg-emerald-50 p-3">
            <span className="font-semibold">
              {caseData.linkedContainer.containerNo}
            </span>
            <Link
              className="font-semibold text-teal-800 underline"
              href={`/containers/${caseData.linkedContainer.id}`}
            >
              {t("i18n.parserLearning.openManualReport")}
            </Link>
          </div>
        ) : (
          <Link
            className="mt-4 inline-flex min-h-10 items-center border border-amber-700 bg-amber-50 px-4 text-sm font-semibold text-amber-950"
            href={`/containers/new?learningCaseId=${encodeURIComponent(caseData.id)}`}
          >
            {t("i18n.parserLearning.createManualReport")}
          </Link>
        )}
        <p className="mt-3 break-all text-xs text-zinc-500">
          {format("i18n.parserLearning.sourceImportLink", {
            id: caseData.sourceImportId,
          })}
        </p>
      </section>

      <section
        aria-labelledby="reconcile-heading"
        className="border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            id="reconcile-heading"
            number="7"
            title={t("i18n.parserLearning.step.reconcile")}
          />
          <button
            className="min-h-10 border border-zinc-700 bg-white px-4 text-sm font-semibold disabled:opacity-50"
            disabled={
              !caseData.linkedContainer ||
              replayStatus === "running" ||
              state.saveStatus !== "saved"
            }
            onClick={runReplay}
            type="button"
          >
            {replayStatus === "running"
              ? t("i18n.parserLearning.replayRunning")
              : t("i18n.parserLearning.runReplay")}
          </button>
        </div>
        <ReplayRegion document={replayDocument} status={replayStatus} />
        <fieldset className="mt-4 grid gap-3 border-t border-zinc-200 pt-4 md:grid-cols-2">
          <legend className="text-sm font-semibold">
            {t("i18n.parserLearning.submitCandidate")}
          </legend>
          <label className="text-sm font-medium" htmlFor="parser-profile-name">
            {t("i18n.parserLearning.profileName")}
            <input
              className="mt-1 min-h-10 w-full border border-zinc-300 bg-white px-3"
              id="parser-profile-name"
              onChange={(event) =>
                setStableName(
                  event.target.value.replace(/[^A-Za-z0-9._-]/g, ""),
                )
              }
              placeholder={t("i18n.parserLearning.profileNamePlaceholder")}
              value={stableName}
            />
          </label>
          <label
            className="text-sm font-medium"
            htmlFor="parser-customer-label"
          >
            {t("i18n.parserLearning.customerLabel")}
            <input
              className="mt-1 min-h-10 w-full border border-zinc-300 bg-white px-3"
              id="parser-customer-label"
              onChange={(event) => setCustomerLabel(event.target.value)}
              value={customerLabel}
            />
          </label>
          <div className="md:col-span-2">
            <button
              className="min-h-11 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!replayDocument?.passed || submitted}
              onClick={submitCandidate}
              type="button"
            >
              {submitted
                ? t("i18n.parserLearning.submittedDraft")
                : t("i18n.parserLearning.submitDraft")}
            </button>
            <p className="mt-2 text-sm text-zinc-600">
              {submitted
                ? t("i18n.parserLearning.awaitingCompletionNotice")
                : t("i18n.parserLearning.notApprovedNotice")}
            </p>
            {submitted && profileVersionId ? (
              <Link
                className="mt-3 inline-flex min-h-10 items-center border border-zinc-400 px-3 text-sm font-semibold"
                href={`/parser-profiles/${encodeURIComponent(profileVersionId)}/review`}
              >
                {t("i18n.parserProfiles.open")}
              </Link>
            ) : null}
          </div>
        </fieldset>
      </section>
    </main>
  );
}

function MappingRow({
  availableHeaders,
  field,
  invalidControls,
  mapping,
  onChange,
  onLocate,
  required,
  sourceCell,
}: {
  availableHeaders: string[];
  field: ParserCanonicalField;
  invalidControls: ReadonlySet<string>;
  mapping: ParserFieldDraft;
  onChange: (patch: Partial<ParserFieldDraft>) => void;
  onLocate: (cell: string) => void;
  required: boolean;
  sourceCell: string | null;
}) {
  const { format, t } = useI18n();
  const id = `field-${field}`;
  const fieldInvalid = invalidControls.has(id);
  const confirmationId = `confirm-${field}`;
  const confirmationInvalid = invalidControls.has(confirmationId);
  const transformId = `transform-${field}`;
  const transformInvalid = invalidControls.has(transformId);
  return (
    <tr className="border-t border-zinc-200 align-top">
      <th className="p-3 font-semibold" scope="row">
        {parserFieldLabel(field, t)}
        {required ? <span className="text-red-700"> *</span> : null}
      </th>
      <td className="p-3">
        <select
          aria-describedby={fieldInvalid ? `${id}-error` : undefined}
          aria-invalid={fieldInvalid}
          className="min-h-10 w-full border border-zinc-300 bg-white px-2"
          id={id}
          onChange={(event) =>
            onChange({
              confirmed: false,
              header: event.target.value,
              suggestionCell: null,
              suggestionReasonCode: null,
            })
          }
          value={mapping.header}
        >
          <option value="">{t("i18n.parserLearning.notMapped")}</option>
          {availableHeaders.map((header) => (
            <option key={header} value={header}>
              {header}
            </option>
          ))}
        </select>
        {fieldInvalid ? (
          <p className="mt-1 text-xs text-red-700" id={`${id}-error`}>
            {parserLearningValidationLabel(id, t)}
          </p>
        ) : null}
      </td>
      <td className="p-3">
        <select
          className="min-h-10 w-full border border-zinc-300 bg-white px-2"
          aria-label={format("i18n.parserLearning.fieldTransformAria", {
            action: t("i18n.parserLearning.transform"),
            field: parserFieldLabel(field, t),
          })}
          onChange={(event) =>
            onChange({ transform: event.target.value as ParserTransformKind })
          }
          value={mapping.transform}
        >
          {TRANSFORMS.map((transform) => (
            <option key={transform} value={transform}>
              {parserTransformLabel(transform, t)}
            </option>
          ))}
        </select>
        <TransformControls
          field={field}
          mapping={mapping}
          onChange={onChange}
          validationError={
            transformInvalid
              ? parserLearningValidationLabel(transformId, t)
              : undefined
          }
        />
      </td>
      <td className="p-3">
        {mapping.suggestionReasonCode ? (
          <div className="border-l-4 border-amber-500 pl-3">
            <span className="font-semibold text-amber-800">
              {t("i18n.parserLearning.uncertain")}
            </span>
            <p className="mt-1 text-xs text-zinc-600">
              {parserSuggestionReason(mapping.suggestionReasonCode, t)}
            </p>
            {(sourceCell ?? mapping.suggestionCell) ? (
              <button
                className="mt-2 text-xs font-semibold text-teal-800 underline"
                onClick={() => onLocate((sourceCell ?? mapping.suggestionCell)!)}
                type="button"
              >
                {sourceCell ?? mapping.suggestionCell} ·{" "}
                {t("i18n.parserLearning.locateSource")}
              </button>
            ) : null}
          </div>
        ) : (
          <div>
            <span className="text-zinc-500">
              {t("i18n.parserLearning.noSuggestion")}
            </span>
            {sourceCell ? (
              <button
                className="mt-2 block text-xs font-semibold text-teal-800 underline"
                onClick={() => onLocate(sourceCell)}
                type="button"
              >
                {sourceCell} · {t("i18n.parserLearning.locateSource")}
              </button>
            ) : null}
          </div>
        )}
      </td>
      <td className="p-3">
        {required ? (
          <>
            <label
              className="flex min-h-10 items-center gap-2"
              htmlFor={`confirm-${field}`}
            >
              <input
                checked={mapping.confirmed}
                aria-describedby={
                  confirmationInvalid ? `${confirmationId}-error` : undefined
                }
                aria-invalid={confirmationInvalid}
                disabled={!mapping.header}
                id={confirmationId}
                onChange={(event) =>
                  onChange({ confirmed: event.target.checked })
                }
                type="checkbox"
              />
              {t("i18n.parserLearning.confirmMapping")}
            </label>
            {confirmationInvalid ? (
              <p
                className="mt-1 text-xs text-red-700"
                id={`${confirmationId}-error`}
              >
                {parserLearningValidationLabel(confirmationId, t)}
              </p>
            ) : null}
          </>
        ) : (
          <span className="text-zinc-500">
            {t("i18n.parserLearning.optional")}
          </span>
        )}
      </td>
    </tr>
  );
}

function TransformControls({
  field,
  mapping,
  onChange,
  validationError,
}: {
  field: ParserCanonicalField;
  mapping: ParserFieldDraft;
  onChange: (patch: Partial<ParserFieldDraft>) => void;
  validationError?: string;
}) {
  const { t } = useI18n();
  if (mapping.transform === "multiply" || mapping.transform === "divide")
    return (
      <label className="mt-2 block text-xs" htmlFor={`transform-${field}`}>
        {t("i18n.parserLearning.factor")}
        <input
          aria-describedby={validationError ? `transform-${field}-error` : undefined}
          aria-invalid={Boolean(validationError)}
          className="mt-1 min-h-9 w-full border border-zinc-300 bg-white px-2"
          id={`transform-${field}`}
          inputMode="decimal"
          onChange={(event) =>
            onChange({ transformNumber: event.target.value })
          }
          value={mapping.transformNumber}
        />
        {validationError ? (
          <span
            className="mt-1 block text-xs text-red-700"
            id={`transform-${field}-error`}
          >
            {validationError}
          </span>
        ) : null}
      </label>
    );
  if (mapping.transform !== "lookup") return null;
  return (
    <div className="mt-2 grid gap-2">
      {mapping.lookupRows.map((row, index) => (
        <div className="grid grid-cols-2 gap-1" key={index}>
          <input
            aria-describedby={
              validationError ? `transform-${field}-error` : undefined
            }
            aria-invalid={Boolean(validationError)}
            aria-label={t("i18n.parserLearning.lookupSource")}
            className="min-h-9 border border-zinc-300 bg-white px-2"
            id={index === 0 ? `transform-${field}` : undefined}
            onChange={(event) =>
              onChange({
                lookupRows: mapping.lookupRows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, from: event.target.value }
                    : item,
                ),
              })
            }
            value={row.from}
          />
          <input
            aria-describedby={
              validationError ? `transform-${field}-error` : undefined
            }
            aria-invalid={Boolean(validationError)}
            aria-label={t("i18n.parserLearning.lookupResult")}
            className="min-h-9 border border-zinc-300 bg-white px-2"
            onChange={(event) =>
              onChange({
                lookupRows: mapping.lookupRows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, to: event.target.value }
                    : item,
                ),
              })
            }
            value={row.to}
          />
        </div>
      ))}
      <button
        className="justify-self-start text-xs font-semibold text-teal-800 underline"
        onClick={() =>
          onChange({
            lookupRows: [...mapping.lookupRows, { from: "", to: "" }],
          })
        }
        type="button"
      >
        {t("i18n.parserLearning.addLookupRow")}
      </button>
      {validationError ? (
        <p className="text-xs text-red-700" id={`transform-${field}-error`}>
          {validationError}
        </p>
      ) : null}
    </div>
  );
}

function PredicateEditor({
  draft,
  headers,
  id,
  label,
  onChange,
}: {
  draft: PredicateDraft;
  headers: string[];
  id: string;
  label: string;
  onChange: (draft: PredicateDraft) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="grid gap-2 border border-zinc-200 p-4">
      <legend className="px-2 text-sm font-semibold">{label}</legend>
      <Toggle
        checked={draft.enabled}
        label={t("i18n.parserLearning.enableRule")}
        onChange={(enabled) => onChange({ ...draft, enabled })}
      />
      <SelectField
        id={`${id}-header`}
        label={t("i18n.parserLearning.sourceHeader")}
        value={draft.header}
        onChange={(header) => onChange({ ...draft, header })}
        options={[
          { label: t("i18n.parserLearning.none"), value: "" },
          ...headers.map((value) => ({ label: value, value })),
        ]}
      />
      <SelectField
        id={`${id}-operator`}
        label={t("i18n.parserLearning.comparison")}
        value={draft.operator}
        onChange={(operator) =>
          onChange({
            ...draft,
            operator: operator as PredicateDraft["operator"],
          })
        }
        options={[
          { label: t("i18n.parserLearning.equals"), value: "equals" },
          { label: t("i18n.parserLearning.notEquals"), value: "not_equals" },
          { label: t("i18n.parserLearning.contains"), value: "contains" },
          { label: t("i18n.parserLearning.isBlank"), value: "is_blank" },
        ]}
      />
      {draft.operator !== "is_blank" ? (
        <label className="text-sm font-medium" htmlFor={`${id}-value`}>
          {t("i18n.parserLearning.matchValue")}
          <input
            className="mt-1 min-h-10 w-full border border-zinc-300 bg-white px-3"
            id={`${id}-value`}
            onChange={(event) =>
              onChange({ ...draft, value: event.target.value })
            }
            value={draft.value}
          />
        </label>
      ) : null}
    </fieldset>
  );
}

function SourcePreview({
  cells,
  columns,
  mergedRanges,
  onSelect,
  page,
  maxPage,
  selectedCell,
  setPage,
}: {
  cells: InspectedCell[];
  columns: number[];
  mergedRanges: string[];
  onSelect: (cell: string) => void;
  page: number;
  maxPage: number;
  selectedCell: string | null;
  setPage: (page: number) => void;
}) {
  const { format, t } = useI18n();
  const rows = [...new Set(cells.map((cell) => cell.row))];
  return (
    <div className="min-w-0 border border-zinc-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <div>
          <p className="text-sm font-semibold">
            {t("i18n.parserLearning.sourcePreview")}
          </p>
          <p className="text-xs text-zinc-500">
            {format("i18n.parserLearning.mergedRanges", {
              count: mergedRanges.length,
            })}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            aria-label={t("i18n.parserLearning.previousSourcePage")}
            className="min-h-9 border border-zinc-300 bg-white px-3 disabled:opacity-50"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            type="button"
          >
            ←
          </button>
          <span className="min-h-9 px-2 py-2 text-xs">
            {format("i18n.parserLearning.page", {
              current: page + 1,
              total: maxPage + 1,
            })}
          </span>
          <button
            aria-label={t("i18n.parserLearning.nextSourcePage")}
            className="min-h-9 border border-zinc-300 bg-white px-3 disabled:opacity-50"
            disabled={page >= maxPage}
            onClick={() => setPage(page + 1)}
            type="button"
          >
            →
          </button>
        </div>
      </div>
      <div
        className="max-h-[420px] min-w-0 max-w-full overflow-auto"
        style={{ contain: "inline-size paint" }}
      >
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-100">
            <tr>
              <th className="border border-zinc-200 p-2">
                {t("i18n.parserLearning.row")}
              </th>
              {columns.map((column) => (
                <th
                  className="border border-zinc-200 p-2 font-mono"
                  key={column}
                >
                  {columnName(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th className="border border-zinc-200 bg-zinc-50 p-2 font-mono">
                  {row}
                </th>
                {columns.map((column) => {
                  const cell = cells.find(
                    (item) => item.row === row && item.column === column,
                  );
                  const coordinate =
                    cell?.cell ?? `${columnName(column)}${row}`;
                  return (
                    <td
                      className={`border border-zinc-200 p-0 ${selectedCell === coordinate ? "outline-2 outline-offset-[-2px] outline-teal-700" : ""}`}
                      key={column}
                    >
                      <button
                        aria-pressed={selectedCell === coordinate}
                        className="min-h-10 w-full px-2 py-1 text-left focus:outline-2 focus:outline-teal-700"
                        id={`source-${coordinate}`}
                        onClick={() => onSelect(coordinate)}
                        title={cell ? String(cell.value ?? "") : ""}
                        type="button"
                      >
                        <span className="sr-only">{coordinate}: </span>
                        <span className="line-clamp-2">
                          {cell ? String(cell.value ?? "") : ""}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewRegion({ state }: { state: ParserLearningState }) {
  const { format, t } = useI18n();
  if (state.previewStatus === "idle")
    return (
      <div className="mt-4 flex h-72 items-center justify-center border border-dashed border-zinc-300 text-sm text-zinc-500">
        {t("i18n.parserLearning.previewIdle")}
      </div>
    );
  if (state.previewStatus === "running")
    return (
      <div className="mt-4 flex h-72 items-center justify-center border border-zinc-200 bg-zinc-50 text-sm">
        {t("i18n.parserLearning.previewRunning")}
      </div>
    );
  if (state.previewStatus === "error" || !state.preview)
    return (
      <div className="mt-4 flex h-72 items-center justify-center border border-red-200 bg-red-50 text-sm text-red-900">
        {t("i18n.parserLearning.previewError")}
      </div>
    );
  return (
    <div className="mt-4 grid h-[420px] gap-3 overflow-auto border border-zinc-200 p-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <strong>
          {format("i18n.parserLearning.previewRows", {
            count: state.preview.totalRows,
          })}
        </strong>
        <span>
          {format("i18n.parserLearning.previewWarnings", {
            count: state.preview.warnings.length,
          })}
        </span>
        <span>
          {format("i18n.parserLearning.previewErrors", {
            count: state.preview.errors.length,
          })}
        </span>
      </div>
      {state.preview.warnings.length || state.preview.errors.length ? (
        <ul className="grid gap-1 text-sm">
          {[...state.preview.errors, ...state.preview.warnings].map(
            (issue, index) => (
              <li
                className="border-l-4 border-amber-500 bg-amber-50 p-2"
                key={`${issue.code}-${index}`}
              >
                {parserLearningIssueMessage(issue.code, t)}
              </li>
            ),
          )}
        </ul>
      ) : null}
      <div className="overflow-auto">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead className="bg-zinc-50">
            <tr>
              <th className="p-2">{t("i18n.parserLearning.row")}</th>
              {PARSER_CANONICAL_FIELDS.map((field) => (
                <th className="p-2" key={field}>
                  {parserFieldLabel(field, t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.preview.sampleRows.map((row) => (
              <tr className="border-t border-zinc-200" key={row.rowNumber}>
                <th className="p-2 font-mono">{row.rowNumber}</th>
                {PARSER_CANONICAL_FIELDS.map((field) => {
                  const provenance = row.provenance?.[field]?.sourceRefs?.[0];
                  return (
                    <td className="p-2 align-top" key={field}>
                      <span>
                        {field === "packageType"
                          ? parserReplayEvidenceText(row[field], t, field)
                          : String(row[field] ?? "")}
                      </span>
                      {provenance?.cell ? (
                        <span className="mt-1 block font-mono text-[10px] text-teal-800">
                          {provenance.cell}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[620px] text-sm">
          <caption className="mb-2 text-left font-semibold">
            {t("i18n.parserLearning.destinationTotals")}
          </caption>
          <thead>
            <tr>
              <th className="p-2 text-left">
                {parserFieldLabel("destinationCode", t)}
              </th>
              <th className="p-2 text-right">
                {parserFieldLabel("cartons", t)}
              </th>
              <th className="p-2 text-right">
                {parserFieldLabel("volumeCbm", t)}
              </th>
              <th className="p-2 text-right">
                {t("i18n.parserLearning.lines")}
              </th>
            </tr>
          </thead>
          <tbody>
            {state.preview.destinationSummaries.map((item, index) => (
              <tr
                className="border-t border-zinc-200"
                key={`${item.destinationCode}-${index}`}
              >
                <td className="p-2">{item.destinationCode}</td>
                <td className="p-2 text-right">{item.totalCartons}</td>
                <td className="p-2 text-right">{item.totalVolumeCbm}</td>
                <td className="p-2 text-right">{item.lineCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReplayRegion({
  document,
  status,
}: {
  document: ParserReplayArtifactDocument | null;
  status: "error" | "idle" | "running" | "success";
}) {
  const { format, t } = useI18n();
  if (status === "idle")
    return (
      <div className="mt-4 flex h-44 items-center justify-center border border-dashed border-zinc-300 text-sm text-zinc-500">
        {t("i18n.parserLearning.replayIdle")}
      </div>
    );
  if (status === "running")
    return (
      <div className="mt-4 flex h-44 items-center justify-center border border-zinc-200 bg-zinc-50 text-sm">
        {t("i18n.parserLearning.replayRunning")}
      </div>
    );
  if (status === "error" || !document)
    return (
      <div className="mt-4 flex h-44 items-center justify-center border border-red-200 bg-red-50 text-sm text-red-900">
        {t("i18n.parserLearning.replayError")}
      </div>
    );
  return (
    <div className="mt-4 max-h-[360px] overflow-auto border border-zinc-200 p-3">
      <p
        className={`font-semibold ${document.passed ? "text-emerald-800" : "text-amber-800"}`}
      >
        {document.passed
          ? t("i18n.parserLearning.replayMatched")
          : t("i18n.parserLearning.replayMismatch")}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {format("i18n.parserLearning.replaySummary", {
          compared: document.diff.summary.compared,
          differences: document.diff.summary.materialDifferences,
        })}
      </p>
      <table className="mt-3 w-full min-w-[680px] text-sm">
        <thead className="bg-zinc-50">
          <tr>
            <th className="p-2 text-left">
              {t("i18n.parserLearning.comparisonItem")}
            </th>
            <th className="p-2 text-left">{t("i18n.parserLearning.result")}</th>
            <th className="p-2 text-left">{t("i18n.parserLearning.scope")}</th>
            <th className="p-2 text-left">
              {t("i18n.parserLearning.expectedValue")}
            </th>
            <th className="p-2 text-left">
              {t("i18n.parserLearning.actualValue")}
            </th>
          </tr>
        </thead>
        <tbody>
          {document.diff.items.map((item, index) => (
            <tr
              className="border-t border-zinc-200"
              key={`${item.field}-${item.key}-${index}`}
            >
              <td className="p-2">{parserReplayDiffLabel(item.code, t)}</td>
              <td className="p-2">
                {item.equal
                  ? t("i18n.parserLearning.matched")
                  : t("i18n.parserLearning.needsReview")}
              </td>
              <td className="p-2">
                {item.key ?? t("i18n.parserLearning.wholeWorkbook")}
              </td>
              <td className="p-2 break-words">
                {parserReplayEvidenceText(item.expected, t, item.field)}
              </td>
              <td className="p-2 break-words">
                {parserReplayEvidenceText(item.actual, t, item.field)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusRegion({
  actionCode,
  caseData,
  retry,
  saveStatus,
  validationErrors,
}: {
  actionCode: string | null;
  caseData: ParserLearningCaseResponse;
  retry: () => void;
  saveStatus: ParserLearningState["saveStatus"];
  validationErrors: string[];
}) {
  const { format, t } = useI18n();
  const saveText = {
    blocked: t("i18n.parserLearning.saveBlocked"),
    error: t("i18n.parserLearning.saveError"),
    idle: t("i18n.parserLearning.savePending"),
    saved: t("i18n.parserLearning.saved"),
    saving: t("i18n.parserLearning.saving"),
    stale: t("i18n.parserLearning.saveStale"),
  }[saveStatus];
  return (
    <div
      className="mt-4 min-h-24 border border-zinc-200 bg-zinc-50 p-3 text-sm"
      role={
        actionCode || saveStatus === "error" || saveStatus === "stale"
          ? "alert"
          : "status"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{saveText}</span>
        <span>
          {format("i18n.parserLearning.revision", {
            revision: caseData.draftRevision,
          })}
        </span>
      </div>
      {validationErrors.length > 0 ? (
        <div className="mt-2 text-amber-900">
          <p>
            {format("i18n.parserLearning.validationCount", {
              count: validationErrors.length,
            })}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {validationErrors.map((controlId) => (
              <li key={controlId}>
                <a className="underline" href={`#${controlId}`}>
                  {parserLearningValidationLabel(controlId, t)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {actionCode ? (
        <p className="mt-2 text-red-800">
          {parserLearningErrorMessage(actionCode, t)}
        </p>
      ) : null}
      {saveStatus === "error" ? (
        <button
          className="mt-2 font-semibold text-teal-800 underline"
          onClick={retry}
          type="button"
        >
          {t("i18n.parserLearning.retrySave")}
        </button>
      ) : null}
      {saveStatus === "stale" ? (
        <p className="mt-2">{t("i18n.parserLearning.reloadMerge")}</p>
      ) : null}
    </div>
  );
}

function WizardShellMessage({
  error = false,
  importId,
  learningCaseId,
  text,
}: {
  error?: boolean;
  importId: string;
  learningCaseId?: string;
  text: string;
}) {
  const { t } = useI18n();
  return (
    <main className="office-main-content flex flex-1 py-6">
      <div
        className={`w-full border p-6 text-sm ${error ? "border-red-200 bg-red-50 text-red-900" : "border-zinc-200 bg-white"}`}
        role={error ? "alert" : "status"}
      >
        <p>{text}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-3 font-semibold text-zinc-950"
            href={`/imports/${encodeURIComponent(importId)}`}
          >
            {t("i18n.parserLearning.backToImport")}
          </Link>
          {learningCaseId ? (
            <Link
              className="inline-flex min-h-10 items-center border border-amber-700 bg-amber-50 px-3 font-semibold text-amber-950"
              href={`/containers/new?learningCaseId=${encodeURIComponent(learningCaseId)}`}
            >
              {t("i18n.parserLearning.continueManualReport")}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
function SectionHeading({
  id,
  number,
  title,
}: {
  id: string;
  number: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="inline-flex min-h-8 min-w-8 items-center justify-center bg-zinc-900 px-2 font-mono text-xs font-semibold text-white"
      >
        {number}
      </span>
      <h2 className="text-base font-semibold" id={id}>
        {title}
      </h2>
    </div>
  );
}
function StatusPill({ text }: { text: string }) {
  return (
    <span className="inline-flex min-h-9 items-center border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900">
      {text}
    </span>
  );
}
function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}
function SelectField({
  errorMessage,
  id,
  label,
  onChange,
  options,
  value,
}: {
  errorMessage?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="text-sm font-medium" htmlFor={id}>
      {label}
      <select
        aria-describedby={errorMessage ? `${id}-error` : undefined}
        aria-invalid={Boolean(errorMessage)}
        className="mt-1 min-h-10 w-full border border-zinc-300 bg-white px-2"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {errorMessage ? (
        <span className="mt-1 block text-xs text-red-700" id={`${id}-error`}>
          {errorMessage}
        </span>
      ) : null}
    </label>
  );
}
function NumberField({
  errorMessage,
  id,
  label,
  max,
  min,
  onChange,
  value,
}: {
  errorMessage?: string;
  id: string;
  label: string;
  max?: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="text-sm font-medium" htmlFor={id}>
      {label}
      <input
        aria-describedby={errorMessage ? `${id}-error` : undefined}
        aria-invalid={Boolean(errorMessage)}
        className="mt-1 min-h-10 w-full border border-zinc-300 bg-white px-3"
        id={id}
        inputMode="numeric"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
      {errorMessage ? (
        <span className="mt-1 block text-xs text-red-700" id={`${id}-error`}>
          {errorMessage}
        </span>
      ) : null}
    </label>
  );
}

function paginatedSourceRows(
  cells: InspectedCell[],
  page: number,
  size: number,
): { cells: InspectedCell[]; columns: number[] } {
  const start = page * size + 1;
  const end = start + size - 1;
  const pageCells = cells.filter(
    (cell) => cell.row >= start && cell.row <= end,
  );
  const columns = [...new Set(pageCells.map((cell) => cell.column))]
    .sort((a, b) => a - b)
    .slice(0, 16);
  return {
    cells: pageCells.filter((cell) => columns.includes(cell.column)),
    columns,
  };
}
function columnName(column: number): string {
  let value = column;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}
function replayRequestKey(caseId: string, revision: number): string {
  return `web-${caseId.slice(-12)}-${revision}-${Date.now().toString(36)}`
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .slice(0, 128);
}
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
