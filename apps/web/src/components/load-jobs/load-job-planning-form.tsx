"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ApiClientError,
  createLoadJob,
  type LoadJobResponse,
} from "@/lib/api-client";
import {
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

export function LoadJobPlanningForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<LoadJobDraft>(() => defaultLoadJobDraft());
  const [saveState, setSaveState] = useState<SaveState>(idleSaveState);
  const summary = useMemo(() => loadJobPlanSummary(draft), [draft]);
  const saving = saveState.status === "saving";

  function updateField(
    field: keyof Omit<LoadJobDraft, "lines">,
    value: string,
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
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
      lines: [...current.lines, emptyLoadJobLineDraft(externalTransfer)],
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
                index={index}
                key={index}
                line={line}
                onChange={updateLine}
                onRemove={removeLine}
                removable={draft.lines.length > 1}
              />
            ))}
          </div>

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
  index,
  line,
  onChange,
  onRemove,
  removable,
}: {
  disabled: boolean;
  index: number;
  line: LoadJobLineDraft;
  onChange: (
    index: number,
    field: keyof LoadJobLineDraft,
    value: boolean | string,
  ) => void;
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
          onChange={(value) => onChange(index, "containerNo", value)}
          value={line.containerNo}
        />
        <TextField
          disabled={disabled}
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
  required = false,
  type = "text",
  value,
}: {
  disabled: boolean;
  inputMode?: "decimal" | "numeric";
  label: string;
  onChange: (value: string) => void;
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
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
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
