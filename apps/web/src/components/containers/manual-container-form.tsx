"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ApiClientError,
  createManualContainer,
  type ManualContainerResponse,
} from "@/lib/api-client";
import {
  buildManualContainerRequest,
  defaultManualContainerDraft,
  emptyManualDestinationDraft,
  type ManualContainerDraft,
  type ManualDestinationDraft,
} from "./manual-container-flow";

interface SaveState {
  message: string;
  status: "error" | "idle" | "saving" | "saved";
}

const idleSaveState: SaveState = { message: "", status: "idle" };

export function ManualContainerForm({
  sourceImportId,
}: {
  sourceImportId?: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ManualContainerDraft>(() =>
    defaultManualContainerDraft(sourceImportId),
  );
  const [saveState, setSaveState] = useState<SaveState>(idleSaveState);

  const saving = saveState.status === "saving";

  function updateContainerField(
    field: keyof Omit<ManualContainerDraft, "destinations">,
    value: string,
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateDestination(
    index: number,
    field: keyof ManualDestinationDraft,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      destinations: current.destinations.map((destination, itemIndex) =>
        itemIndex === index ? { ...destination, [field]: value } : destination,
      ),
    }));
  }

  function addDestination() {
    setDraft((current) => ({
      ...current,
      destinations: [
        ...current.destinations,
        emptyManualDestinationDraft(),
      ],
    }));
  }

  function removeDestination(index: number) {
    setDraft((current) => {
      if (current.destinations.length <= 1) {
        return current;
      }

      return {
        ...current,
        destinations: current.destinations.filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      };
    });
  }

  async function saveManualContainer() {
    if (saving) {
      return;
    }

    const request = buildManualContainerRequest(draft);
    if (!request.ok) {
      setSaveState({ message: request.error, status: "error" });
      return;
    }

    setSaveState({
      message: "Creating manual unloading report.",
      status: "saving",
    });

    try {
      const result: ManualContainerResponse = await createManualContainer(
        request.payload,
      );
      setSaveState({
        message: `Created ${result.container.containerNo}.`,
        status: "saved",
      });
      router.push(`/containers/${result.container.id}`);
      router.refresh();
    } catch (error) {
      setSaveState({
        message: manualCreateErrorMessage(error),
        status: "error",
      });
    }
  }

  return (
    <section className="border border-zinc-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-zinc-200 p-5 lg:border-r lg:border-b-0">
          <h2 className="text-base font-semibold text-zinc-950">
            Container
          </h2>
          <div className="mt-4 grid gap-4">
            <TextField
              disabled={saving}
              label="Container No."
              onChange={(value) => updateContainerField("containerNo", value)}
              required
              value={draft.containerNo}
            />
            <TextField
              disabled={saving}
              label="Company"
              onChange={(value) => updateContainerField("company", value)}
              value={draft.company}
            />
            <TextField
              disabled={saving}
              label="Dock"
              onChange={(value) => updateContainerField("dockNo", value)}
              value={draft.dockNo}
            />
            <TextAreaField
              disabled={saving}
              label="Reason"
              onChange={(value) => updateContainerField("reason", value)}
              value={draft.reason}
            />
            <TextAreaField
              disabled={saving}
              label="Audit note"
              onChange={(value) =>
                updateContainerField("correctionNote", value)
              }
              value={draft.correctionNote}
            />
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-zinc-950">
              Destinations
            </h2>
            <button
              className="min-h-10 border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400"
              disabled={saving}
              onClick={addDestination}
              type="button"
            >
              Add destination
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {draft.destinations.map((destination, index) => (
              <DestinationEditor
                destination={destination}
                disabled={saving}
                index={index}
                key={index}
                onChange={updateDestination}
                onRemove={removeDestination}
                removable={draft.destinations.length > 1}
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
              onClick={saveManualContainer}
              type="button"
            >
              {saving ? "Creating" : "Create manual report"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DestinationEditor({
  destination,
  disabled,
  index,
  onChange,
  onRemove,
  removable,
}: {
  destination: ManualDestinationDraft;
  disabled: boolean;
  index: number;
  onChange: (
    index: number,
    field: keyof ManualDestinationDraft,
    value: string,
  ) => void;
  onRemove: (index: number) => void;
  removable: boolean;
}) {
  return (
    <div className="border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-950">
          Destination {index + 1}
        </h3>
        <button
          className="min-h-9 border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          disabled={disabled || !removable}
          onClick={() => onRemove(index)}
          type="button"
        >
          Remove
        </button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField
          disabled={disabled}
          idPrefix={`destination-${index}`}
          label="Destination code"
          onChange={(value) => onChange(index, "destinationCode", value)}
          required
          value={destination.destinationCode}
        />
        <TextField
          disabled={disabled}
          idPrefix={`destination-${index}`}
          label="Destination type"
          onChange={(value) => onChange(index, "destinationType", value)}
          value={destination.destinationType}
        />
        <TextField
          disabled={disabled}
          idPrefix={`destination-${index}`}
          inputMode="numeric"
          label="Cartons"
          onChange={(value) => onChange(index, "cartons", value)}
          required
          value={destination.cartons}
        />
        <TextField
          disabled={disabled}
          idPrefix={`destination-${index}`}
          inputMode="numeric"
          label="Pallets"
          onChange={(value) => onChange(index, "pallets", value)}
          required
          value={destination.pallets}
        />
        <TextField
          disabled={disabled}
          idPrefix={`destination-${index}`}
          inputMode="decimal"
          label="Volume CBM"
          onChange={(value) => onChange(index, "volume", value)}
          value={destination.volume}
        />
        <TextField
          disabled={disabled}
          idPrefix={`destination-${index}`}
          label="Note"
          onChange={(value) => onChange(index, "note", value)}
          value={destination.note}
        />
      </div>
    </div>
  );
}

function TextField({
  disabled,
  idPrefix = "container",
  inputMode,
  label,
  onChange,
  required = false,
  value,
}: {
  disabled: boolean;
  idPrefix?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  const id = fieldId(idPrefix, label);
  return (
    <label className="block text-sm font-medium text-zinc-700" htmlFor={id}>
      {label}
      {required ? <span className="text-red-700"> *</span> : null}
      <input
        className="mt-2 block min-h-10 w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 disabled:bg-zinc-100"
        disabled={disabled}
        id={id}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function TextAreaField({
  disabled,
  idPrefix = "container",
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  idPrefix?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = fieldId(idPrefix, label);
  return (
    <label className="block text-sm font-medium text-zinc-700" htmlFor={id}>
      {label}
      <textarea
        className="mt-2 block min-h-20 w-full resize-y border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 disabled:bg-zinc-100"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function manualCreateErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }

  return error instanceof Error
    ? error.message
    : "Manual unloading report could not be created.";
}

function fieldId(prefix: string, label: string): string {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `manual-${safePrefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
