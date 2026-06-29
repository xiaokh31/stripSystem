"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ApiClientError,
  deleteLoadJob,
  updateLoadJob,
  type LoadJobResponse,
  type UpdateLoadJobRequest,
} from "@/lib/api-client";
import {
  buildLoadJobRequest,
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

export function LoadJobManagementPanel({
  loadJob,
}: {
  loadJob: LoadJobResponse;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<LoadJobDraft>(() =>
    loadJobToDraft(loadJob),
  );
  const [statusDraft, setStatusDraft] = useState<
    "COMPLETED" | "IN_PROGRESS" | "PLANNED"
  >(loadJobStatusValue(loadJob.status));
  const [expanded, setExpanded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(idleSaveState);
  const summary = useMemo(() => loadJobPlanSummary(draft), [draft]);
  const saving = saveState.status === "saving";
  const completed = loadJob.status === "COMPLETED";
  const canDelete = loadJob.status === "PLANNED";
  const editable = !completed && loadJob.status !== "CANCELLED";
  const panelId = `load-job-editor-${loadJob.id.replace(
    /[^a-zA-Z0-9_-]/g,
    "-",
  )}`;

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

  async function saveChanges() {
    if (!editable || saving) {
      return;
    }

    if (statusDraft === "COMPLETED" && !draft.dockNo.trim()) {
      setSaveState({
        message: "Dock No. is required before completing a load job.",
        status: "error",
      });
      return;
    }

    if (
      statusDraft === "COMPLETED" &&
      loadJob.status !== "COMPLETED" &&
      !window.confirm("Complete this load job? Completed jobs cannot be edited.")
    ) {
      return;
    }

    const request = buildLoadJobRequest(draft);
    if (!request.ok) {
      setSaveState({ message: request.error, status: "error" });
      return;
    }

    setSaveState({ message: "Saving load job.", status: "saving" });

    try {
      const payload: UpdateLoadJobRequest = {
        ...request.payload,
        status: statusDraft,
      };
      const result = await updateLoadJob(loadJob.id, payload);
      setSaveState({
        message: `Saved ${result.loadNo ?? result.id}.`,
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setSaveState({
        message: loadJobUpdateErrorMessage(error),
        status: "error",
      });
    }
  }

  async function deletePlan() {
    if (!canDelete || saving) {
      return;
    }

    if (!window.confirm("Delete this planned load job?")) {
      return;
    }

    setSaveState({ message: "Deleting load job.", status: "saving" });

    try {
      await deleteLoadJob(loadJob.id);
      setSaveState({
        message: `Deleted ${loadJob.loadNo ?? loadJob.id}.`,
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setSaveState({
        message: loadJobUpdateErrorMessage(error),
        status: "error",
      });
    }
  }

  return (
    <section className="mt-4 border-t border-zinc-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-zinc-950">
            Load job maintenance
          </h4>
          <p className="mt-1 text-xs font-medium text-zinc-500">
            {editable
              ? "Edit status, dock, truck, and plan lines when needed."
              : "Completed jobs are locked for audit."}
          </p>
        </div>
        <button
          aria-controls={panelId}
          aria-expanded={expanded}
          className="min-h-10 border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:border-teal-700 hover:text-teal-900"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "Hide editor" : "Edit load job"}
        </button>
      </div>

      {expanded ? (
        <div
          className="mt-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"
          id={panelId}
        >
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Lines" value={summary.lineCount} />
            <Metric label="System" value={summary.internalPallets} />
            <Metric label="External" value={summary.externalPallets} />
          </div>
          <TextField
            disabled={!editable || saving}
            label="Load No."
            onChange={(value) => updateField("loadNo", value)}
            required
            value={draft.loadNo}
          />
          <TextField
            disabled={!editable || saving}
            label="Destination region"
            onChange={(value) => updateField("destinationRegion", value)}
            value={draft.destinationRegion}
          />
          <TextField
            disabled={!editable || saving}
            label="Truck No."
            onChange={(value) => updateField("truckNo", value)}
            value={draft.truckNo}
          />
          <TextField
            disabled={!editable || saving}
            label="Dock No."
            onChange={(value) => updateField("dockNo", value)}
            value={draft.dockNo}
          />
          <TextField
            disabled={!editable || saving}
            label="Carrier"
            onChange={(value) => updateField("carrier", value)}
            value={draft.carrier}
          />
          <TextField
            disabled={!editable || saving}
            label="Scheduled departure"
            onChange={(value) => updateField("scheduledDepartureAt", value)}
            type="datetime-local"
            value={draft.scheduledDepartureAt}
          />
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            <span>Status</span>
            <select
              className="min-h-10 border border-zinc-300 bg-white px-3 text-zinc-950 outline-none focus:border-teal-700 disabled:bg-zinc-100 disabled:text-zinc-500"
              disabled={!editable || saving}
              onChange={(event) =>
                setStatusDraft(loadJobStatusValue(event.target.value))
              }
              value={statusDraft}
            >
              <option value="PLANNED">PLANNED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
            </select>
          </label>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-zinc-950">
              Editable plan lines
            </h4>
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-9 border border-teal-700 bg-white px-3 text-xs font-semibold text-teal-900 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400"
                disabled={!editable || saving}
                onClick={() => addLine(false)}
                type="button"
              >
                Add system line
              </button>
              <button
                className="min-h-9 border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400"
                disabled={!editable || saving}
                onClick={() => addLine(true)}
                type="button"
              >
                Add transfer line
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-3">
            {draft.lines.map((line, index) => (
              <LoadJobLineEditor
                disabled={!editable || saving}
                destinationRegion={draft.destinationRegion}
                index={index}
                key={`${index}-${line.sourceText}-${line.containerNo}`}
                line={line}
                onChange={updateLine}
                onRemove={removeLine}
                removable={draft.lines.length > 1}
              />
            ))}
          </div>

          {saveState.message ? (
            <div
              className={`mt-4 border p-3 text-sm ${
                saveState.status === "error"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
              role={saveState.status === "error" ? "alert" : "status"}
            >
              {saveState.message}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {canDelete ? (
              <button
                className="min-h-10 border border-red-300 bg-white px-4 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400"
                disabled={saving}
                onClick={deletePlan}
                type="button"
              >
                Delete plan
              </button>
            ) : null}
            <button
              className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
              disabled={!editable || saving}
              onClick={saveChanges}
              type="button"
            >
              {saving ? "Saving" : "Save changes"}
            </button>
          </div>
        </div>
        </div>
      ) : null}
    </section>
  );
}

function LoadJobLineEditor({
  disabled,
  destinationRegion,
  index,
  line,
  onChange,
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
  onRemove: (index: number) => void;
  removable: boolean;
}) {
  return (
    <div className="border-l-4 border-zinc-300 bg-white px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-8 items-center gap-2 text-sm font-medium text-zinc-700">
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
        <button
          className="min-h-8 border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          disabled={disabled || !removable}
          onClick={() => onRemove(index)}
          type="button"
        >
          Remove
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
      <div className="mt-3">
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
    <div className="border border-zinc-200 bg-zinc-50 p-2">
      <dt className="text-[11px] font-semibold uppercase text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-950">
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
        className="min-h-16 resize-y border border-zinc-300 bg-white px-3 py-2 text-zinc-950 outline-none focus:border-teal-700 disabled:bg-zinc-100 disabled:text-zinc-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function loadJobToDraft(loadJob: LoadJobResponse): LoadJobDraft {
  return {
    carrier: loadJob.carrier ?? "",
    destinationRegion: loadJob.destinationRegion ?? "",
    dockNo: loadJob.dockNo ?? "",
    lines:
      loadJob.lines.length > 0
        ? loadJob.lines.map((line) => ({
            containerNo: line.containerNo ?? line.container?.containerNo ?? "",
            destinationCode:
              loadJob.destinationRegion ?? line.destinationCode ?? "",
            externalTransfer: line.externalTransfer,
            note: line.note ?? "",
            plannedPallets:
              line.plannedPallets > 0 ? String(line.plannedPallets) : "",
            sourceText: line.sourceText ?? "",
          }))
        : [emptyLoadJobLineDraft(false, loadJob.destinationRegion ?? "")],
    loadNo: loadJob.loadNo ?? "",
    scheduledDepartureAt: isoToDateTimeLocal(loadJob.scheduledDepartureAt),
    truckNo: loadJob.truckNo ?? "",
  };
}

function isoToDateTimeLocal(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (item: number) => String(item).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function loadJobStatusValue(
  value: string,
): "COMPLETED" | "IN_PROGRESS" | "PLANNED" {
  if (value === "COMPLETED" || value === "IN_PROGRESS") {
    return value;
  }

  return "PLANNED";
}

function loadJobUpdateErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === "NOT_FOUND" && error.message.includes("Cannot PATCH")) {
      return "The running API has not loaded load job edit routes. Restart the API service and try again.";
    }

    const messages: Record<string, string> = {
      LOAD_JOB_COMPLETED_NOT_EDITABLE:
        "Completed load jobs can no longer be edited.",
      LOAD_JOB_DELETE_NOT_ALLOWED:
        "Only planned load jobs can be deleted. In-progress jobs must remain auditable.",
      LOAD_JOB_DOCK_NO_REQUIRED_FOR_COMPLETED:
        "Dock No. is required before completing a load job.",
      LOAD_JOB_LINE_DESTINATION_REGION_MISMATCH:
        "Every plan line destination must match the Destination region.",
      LOAD_JOB_LINE_PLAN_BELOW_LOADED_COUNT:
        "The plan cannot be lower than pallets already loaded.",
      LOAD_JOB_LOADED_PALLET_OUTSIDE_UPDATED_PLAN:
        "The updated plan would remove a pallet that is already loaded.",
      LOAD_JOB_STATUS_HAS_LOADED_PALLETS:
        "This job has loaded pallets and cannot move back to planned.",
      LOAD_JOB_UPDATE_CONFLICT:
        "Load number already exists. Use a unique load number.",
    };

    return messages[error.code] ?? error.message;
  }

  return error instanceof Error
    ? error.message
    : "Load job could not be saved.";
}
