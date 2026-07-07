"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { containerStatusLabel } from "@/components/containers/container-files-flow";
import {
  ApiClientError,
  createLoadJob,
  listLoadJobContainerSuggestions,
  type LoadJobContainerSuggestionResponse,
  type LoadJobResponse,
} from "@/lib/api-client";
import {
  applyContainerSuggestionToDraft,
  buildLoadJobRequest,
  defaultLoadJobDraft,
  emptyLoadJobLineDraft,
  loadJobPlanSummary,
  type LoadJobDraft,
  type LoadJobLineDraft,
} from "./load-job-planning-flow";

interface SaveState {
  message: string;
  status: "error" | "idle" | "saving" | "saved";
}

const idleSaveState: SaveState = { message: "", status: "idle" };

interface SuggestionState {
  activeLineIndex: number | null;
  containerNo: string;
  destinationRegion: string;
  error: string;
  items: LoadJobContainerSuggestionResponse[];
  loading: boolean;
  opened: boolean;
}

const idleSuggestionState: SuggestionState = {
  activeLineIndex: null,
  containerNo: "",
  destinationRegion: "",
  error: "",
  items: [],
  loading: false,
  opened: false,
};

export function LoadJobPlanningForm() {
  const { locale } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState<LoadJobDraft>(() => defaultLoadJobDraft());
  const [saveState, setSaveState] = useState<SaveState>(idleSaveState);
  const [suggestions, setSuggestions] =
    useState<SuggestionState>(idleSuggestionState);
  const suggestionRequestIdRef = useRef(0);
  const summary = useMemo(() => loadJobPlanSummary(draft), [draft]);
  const saving = saveState.status === "saving";

  function updateField(
    field: keyof Omit<LoadJobDraft, "lines">,
    value: string,
  ) {
    setDraft((current) => {
      if (field !== "destinationRegion") {
        return { ...current, [field]: value };
      }

      const destinationCode = value.trim();
      return {
        ...current,
        destinationRegion: value,
        lines: destinationCode
          ? current.lines.map((line) => ({ ...line, destinationCode }))
          : current.lines,
      };
    });
    if (field === "destinationRegion") {
      setSuggestions(idleSuggestionState);
    }
  }

  function updateLine(
    index: number,
    field: keyof LoadJobLineDraft,
    value: boolean | string,
  ) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  }

  function addLine(externalTransfer = false) {
    setDraft((current) => ({
      ...current,
      lines: [
        ...current.lines,
        emptyLoadJobLineDraft(
          externalTransfer,
          current.destinationRegion.trim(),
        ),
      ],
    }));
  }

  function removeLine(index: number) {
    setDraft((current) => {
      if (current.lines.length <= 1) {
        return current;
      }

      return {
        ...current,
        lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
      };
    });
  }

  async function publishLoadJob() {
    if (saving) {
      return;
    }

    const request = buildLoadJobRequest(draft);
    if (!request.ok) {
      setSaveState({ message: request.error, status: "error" });
      return;
    }

    setSaveState({ message: "Publishing load job.", status: "saving" });

    try {
      const result: LoadJobResponse = await createLoadJob(request.payload);
      setSaveState({
        message: `Published ${result.loadNo ?? result.id}.`,
        status: "saved",
      });
      setDraft(defaultLoadJobDraft());
      router.refresh();
    } catch (error) {
      setSaveState({
        message: loadJobCreateErrorMessage(error),
        status: "error",
      });
    }
  }

  async function loadContainerSuggestions(lineIndex: number, containerNo = "") {
    const destinationRegion = draft.destinationRegion.trim();
    const containerNoQuery = containerNo.trim();
    if (!destinationRegion || saving) {
      setSuggestions({
        activeLineIndex: lineIndex,
        containerNo: containerNoQuery,
        destinationRegion,
        error: destinationRegion
          ? ""
          : "Enter Destination region before loading container suggestions.",
        items: [],
        loading: false,
        opened: true,
      });
      return;
    }

    if (
      suggestions.opened &&
      !suggestions.loading &&
      suggestions.destinationRegion === destinationRegion &&
      suggestions.containerNo === containerNoQuery &&
      suggestions.activeLineIndex === lineIndex
    ) {
      return;
    }

    const requestId = suggestionRequestIdRef.current + 1;
    suggestionRequestIdRef.current = requestId;
    setSuggestions((current) => ({
      ...current,
      activeLineIndex: lineIndex,
      containerNo: containerNoQuery,
      destinationRegion,
      error: "",
      loading: true,
      opened: true,
    }));

    try {
      const response = await listLoadJobContainerSuggestions(
        destinationRegion,
        { containerNo: containerNoQuery },
      );
      if (suggestionRequestIdRef.current !== requestId) {
        return;
      }
      setSuggestions({
        activeLineIndex: lineIndex,
        containerNo: containerNoQuery,
        destinationRegion,
        error: "",
        items: response.items,
        loading: false,
        opened: true,
      });
    } catch (error) {
      if (suggestionRequestIdRef.current !== requestId) {
        return;
      }
      setSuggestions({
        activeLineIndex: lineIndex,
        containerNo: containerNoQuery,
        destinationRegion,
        error:
          error instanceof ApiClientError
            ? error.message
            : "Container suggestions could not be loaded.",
        items: [],
        loading: false,
        opened: true,
      });
    }
  }

  function hideContainerSuggestions() {
    suggestionRequestIdRef.current += 1;
    setSuggestions((current) => ({ ...current, opened: false }));
  }

  function selectSuggestion(suggestion: LoadJobContainerSuggestionResponse) {
    setDraft((current) =>
      applyContainerSuggestionToDraft(
        current,
        suggestion,
        suggestions.activeLineIndex ?? undefined,
      ),
    );
    setSuggestions((current) => ({ ...current, opened: false }));
  }

  return (
    <section className="border border-zinc-200 bg-white shadow-sm">
      <div className="grid gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-zinc-200 p-5 xl:border-r xl:border-b-0">
          <h2 className="text-base font-semibold text-zinc-950">
            Publish load job
          </h2>
          <div className="mt-4 grid gap-4">
            <TextField
              disabled={saving}
              label="Load No."
              onChange={(value) => updateField("loadNo", value)}
              required
              value={draft.loadNo}
            />
            <TextField
              disabled={saving}
              label="Destination region"
              onChange={(value) => updateField("destinationRegion", value)}
              value={draft.destinationRegion}
            />
            <TextField
              disabled={saving}
              label="Truck No."
              onChange={(value) => updateField("truckNo", value)}
              value={draft.truckNo}
            />
            <TextField
              disabled={saving}
              label="Dock No."
              onChange={(value) => updateField("dockNo", value)}
              value={draft.dockNo}
            />
            <TextField
              disabled={saving}
              label="Carrier"
              onChange={(value) => updateField("carrier", value)}
              value={draft.carrier}
            />
            <TextField
              disabled={saving}
              label="Scheduled departure"
              onChange={(value) => updateField("scheduledDepartureAt", value)}
              type="datetime-local"
              value={draft.scheduledDepartureAt}
            />
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            <Metric label="Lines" value={summary.lineCount} />
            <Metric label="System" value={summary.internalPallets} />
            <Metric label="External" value={summary.externalPallets} />
          </dl>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-zinc-950">
              Plan lines
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-10 border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400"
                disabled={saving}
                onClick={() => addLine(false)}
                type="button"
              >
                Add system line
              </button>
              <button
                className="min-h-10 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400"
                disabled={saving}
                onClick={() => addLine(true)}
                type="button"
              >
                Add transfer line
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            {draft.lines.map((line, index) => (
              <LoadJobLineEditor
                disabled={saving}
                destinationRegion={draft.destinationRegion}
                index={index}
                key={index}
                line={line}
                onChange={updateLine}
                onContainerBlur={hideContainerSuggestions}
                onContainerFocus={(lineIndex) => {
                  void loadContainerSuggestions(lineIndex, line.containerNo);
                }}
                onContainerInput={(lineIndex, containerNo) => {
                  void loadContainerSuggestions(lineIndex, containerNo);
                }}
                onRemove={removeLine}
                removable={draft.lines.length > 1}
              />
            ))}
          </div>
          <ContainerSuggestionPanel
            locale={locale}
            onSelect={selectSuggestion}
            state={suggestions}
          />

          {saveState.message ? (
            <div
              className={`mt-5 border p-3 text-sm ${
                saveState.status === "error"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
              role={saveState.status === "error" ? "alert" : "status"}
            >
              {saveState.message}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              className="min-h-11 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
              disabled={saving}
              onClick={publishLoadJob}
              type="button"
            >
              {saving ? "Publishing" : "Publish load job"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function LoadJobLineEditor({
  disabled,
  destinationRegion,
  index,
  line,
  onChange,
  onContainerBlur,
  onContainerFocus,
  onContainerInput,
  onRemove,
  removable,
}: {
  disabled: boolean;
  destinationRegion: string;
  index: number;
  line: LoadJobLineDraft;
  onChange: (
    index: number,
    field: keyof LoadJobLineDraft,
    value: boolean | string,
  ) => void;
  onContainerBlur: () => void;
  onContainerFocus: (index: number) => void;
  onContainerInput: (index: number, containerNo: string) => void;
  onRemove: (index: number) => void;
  removable: boolean;
}) {
  return (
    <div className="border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">
            Plan line {index + 1}
          </h3>
          <label className="mt-2 inline-flex min-h-8 items-center gap-2 text-sm font-medium text-zinc-700">
            <input
              checked={line.externalTransfer}
              className="h-4 w-4 accent-teal-700"
              disabled={disabled}
              onChange={(event) =>
                onChange(index, "externalTransfer", event.target.checked)
              }
              type="checkbox"
            />
            External transfer
          </label>
        </div>
        <button
          className="min-h-9 border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          disabled={disabled || !removable}
          onClick={() => onRemove(index)}
          type="button"
        >
          Remove
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TextField
          disabled={disabled}
          label="Source text"
          onChange={(value) => onChange(index, "sourceText", value)}
          value={line.sourceText}
        />
        <TextField
          disabled={disabled || line.externalTransfer}
          label="Container No."
          onBlur={onContainerBlur}
          onChange={(value) => {
            onChange(index, "containerNo", value);
            onContainerInput(index, value);
          }}
          onFocus={() => onContainerFocus(index)}
          value={line.containerNo}
        />
        <TextField
          disabled={disabled || Boolean(destinationRegion.trim())}
          label="Destination"
          onChange={(value) => onChange(index, "destinationCode", value)}
          value={line.destinationCode}
        />
        <TextField
          disabled={disabled}
          inputMode="numeric"
          label="Planned pallets"
          onChange={(value) => onChange(index, "plannedPallets", value)}
          value={line.plannedPallets}
        />
      </div>
      <div className="mt-4">
        <TextAreaField
          disabled={disabled}
          label="Note"
          onChange={(value) => onChange(index, "note", value)}
          value={line.note}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-950">
        {value}
      </dd>
    </div>
  );
}

function TextField({
  disabled,
  inputMode,
  label,
  onChange,
  onBlur,
  onFocus,
  required = false,
  type = "text",
  value,
}: {
  disabled: boolean;
  inputMode?: "decimal" | "numeric";
  label: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700">
      <span>
        {label}
        {required ? <span className="text-red-700"> *</span> : null}
      </span>
      <input
        className="min-h-10 border border-zinc-300 bg-white px-3 text-zinc-950 outline-none focus:border-teal-700 disabled:bg-zinc-100 disabled:text-zinc-500"
        disabled={disabled}
        inputMode={inputMode}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        type={type}
        value={value}
      />
    </label>
  );
}

function ContainerSuggestionPanel({
  locale,
  onSelect,
  state,
}: {
  locale: ReturnType<typeof useI18n>["locale"];
  onSelect: (suggestion: LoadJobContainerSuggestionResponse) => void;
  state: SuggestionState;
}) {
  if (!state.opened) {
    return null;
  }

  return (
    <div className="border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-zinc-900">
          Container suggestions
        </span>
        <span className="text-xs font-medium text-zinc-500">
          From current inventory
        </span>
      </div>
      {state.loading ? (
        <p className="mt-2 text-zinc-600">Loading suggestions.</p>
      ) : state.error ? (
        <p className="mt-2 text-red-800">{state.error}</p>
      ) : state.items.length === 0 ? (
        <p className="mt-2 text-zinc-600">
          No eligible containers with remaining pallets were found.
        </p>
      ) : (
        <div className="mt-2 grid gap-2">
          {state.items.map((item) => (
            <button
              className="grid min-h-12 gap-1 border border-zinc-300 bg-white px-3 py-2 text-left hover:border-teal-700 hover:bg-teal-50"
              key={item.containerDestinationId}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
              type="button"
            >
              <span className="font-semibold text-zinc-950">
                {item.containerNo} / {item.destinationCode}
              </span>
              <span className="text-xs text-zinc-600">
                Remaining {item.remainingPallets} pallets, loaded{" "}
                {item.loadedPallets}, status{" "}
                <span title={item.status}>
                  {containerStatusLabel(item.status, locale)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TextAreaField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700">
      <span>{label}</span>
      <textarea
        className="min-h-20 resize-y border border-zinc-300 bg-white px-3 py-2 text-zinc-950 outline-none focus:border-teal-700 disabled:bg-zinc-100 disabled:text-zinc-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function loadJobCreateErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const messages: Record<string, string> = {
      LOAD_JOB_CONTAINER_DESTINATION_NOT_FOUND:
        "Destination was not found for this system container.",
      LOAD_JOB_CONTAINER_NOT_FOUND:
        "System container was not found. Check the container number.",
      LOAD_JOB_CREATE_CONFLICT:
        "Load number already exists. Use a unique load number.",
      LOAD_JOB_LINE_PALLETS_REQUIRED: "Each plan line needs a pallet count.",
      LOAD_JOB_LINES_REQUIRED: "At least one plan line is required.",
    };

    return messages[error.code] ?? error.message;
  }

  return error instanceof Error
    ? error.message
    : "Load job could not be saved.";
}
