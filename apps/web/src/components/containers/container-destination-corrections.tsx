"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ApiClientError,
  createContainerDestination,
  deleteContainerDestination,
  generateContainerLabels,
  updateContainerDestination,
  type ContainerDetailDestinationResponse,
} from "@/lib/api-client";
import {
  buildCreateDestinationRequest,
  buildDestinationCorrectionRequest,
  draftFromDestination,
  formatIssueSummary,
  formatNullable,
  summarizeIssues,
  type DestinationCorrectionDraft,
} from "./container-detail-flow";
import {
  containerOperationLockMessage,
  isContainerOperationLocked,
} from "./container-files-flow";

interface DestinationSaveState {
  labelAction?: "generated" | "generating" | "idle";
  labelPrompt?: SupplementalLabelPrompt;
  message: string;
  status: "error" | "idle" | "saved" | "saving";
}

interface SupplementalLabelPrompt {
  addedPallets: number;
  destinationCode: string;
  fromPallets: number;
  toPallets: number;
}

const idleSaveState: DestinationSaveState = {
  message: "",
  status: "idle",
};

export function ContainerDestinationCorrections({
  containerId,
  containerStatus,
  destinations,
}: {
  containerId: string;
  containerStatus: string;
  destinations: ContainerDetailDestinationResponse[];
}) {
  const router = useRouter();
  const locked = isContainerOperationLocked(containerStatus);
  const lockedMessage = containerOperationLockMessage(containerStatus);
  const initialDrafts = useMemo(() => {
    return Object.fromEntries(
      destinations.map((destination) => [
        destination.id,
        draftFromDestination(destination),
      ]),
    );
  }, [destinations]);
  const [drafts, setDrafts] =
    useState<Record<string, DestinationCorrectionDraft>>(initialDrafts);
  const [saveStates, setSaveStates] = useState<
    Record<string, DestinationSaveState>
  >({});
  const [adding, setAdding] = useState(destinations.length === 0);
  const [newDraft, setNewDraft] = useState<DestinationCorrectionDraft>(
    emptyDestinationDraft(),
  );
  const [createState, setCreateState] =
    useState<DestinationSaveState>(idleSaveState);

  function updateDraft(
    destinationId: string,
    field: keyof DestinationCorrectionDraft,
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [destinationId]: {
        ...(current[destinationId] ?? emptyDestinationDraft()),
        [field]: value,
      },
    }));
  }

  function updateNewDraft(
    field: keyof DestinationCorrectionDraft,
    value: string,
  ) {
    setNewDraft((current) => ({ ...current, [field]: value }));
  }

  function setSaveState(destinationId: string, state: DestinationSaveState) {
    setSaveStates((current) => ({ ...current, [destinationId]: state }));
  }

  async function saveDestination(
    destination: ContainerDetailDestinationResponse,
  ) {
    if (locked) {
      return;
    }

    const draft = drafts[destination.id] ?? draftFromDestination(destination);
    const request = buildDestinationCorrectionRequest(destination, draft);

    if (!request.ok) {
      setSaveState(destination.id, {
        message: request.error,
        status: "error",
      });
      return;
    }

    setSaveState(destination.id, {
      message: "Saving correction.",
      status: "saving",
    });

    try {
      const result = await updateContainerDestination(
        destination.id,
        request.payload,
      );
      const labelPrompt = supplementalLabelPrompt(
        destination,
        result.containerDestination.finalPallets,
        request.changedFields,
      );
      setSaveState(destination.id, {
        labelAction: labelPrompt ? "idle" : undefined,
        labelPrompt,
        message: labelPrompt
          ? `Saved ${result.corrections.length} correction record(s). Actual pallets increased from ${labelPrompt.fromPallets} to ${labelPrompt.toPallets}; ${labelPrompt.addedPallets} supplemental label(s) are needed. Regenerate labels now?`
          : `Saved ${result.corrections.length} correction record(s).`,
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setSaveState(destination.id, {
        message: correctionErrorMessage(error),
        status: "error",
      });
    }
  }

  async function generateLabelsForSavedDestination(destinationId: string) {
    if (locked) {
      return;
    }

    const current = saveStates[destinationId] ?? idleSaveState;
    if (!current.labelPrompt) {
      return;
    }

    setSaveState(destinationId, {
      ...current,
      labelAction: "generating",
      message: "Regenerating label PDF from latest destination data.",
      status: "saved",
    });

    try {
      await generateContainerLabels(containerId);
      setSaveState(destinationId, {
        ...current,
        labelAction: "generated",
        message: `Label PDF regenerated. Print supplemental label(s) ${supplementalLabelRange(current.labelPrompt)} for ${current.labelPrompt.destinationCode}.`,
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setSaveState(destinationId, {
        ...current,
        labelAction: "idle",
        message: correctionErrorMessage(error),
        status: "error",
      });
    }
  }

  async function deleteDestination(
    destination: ContainerDetailDestinationResponse,
  ) {
    if (locked) {
      return;
    }

    const confirmed = window.confirm(
      `Delete destination ${destination.destinationCode}? This removes the destination from the actual unloading data and records an audit entry.`,
    );
    if (!confirmed) {
      return;
    }

    setSaveState(destination.id, {
      message: "Deleting destination.",
      status: "saving",
    });

    try {
      const result = await deleteContainerDestination(destination.id);
      setSaveState(destination.id, {
        message: `Deleted ${result.containerDestination.destinationCode}.`,
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setSaveState(destination.id, {
        message: correctionErrorMessage(error),
        status: "error",
      });
    }
  }

  async function saveNewDestination() {
    if (locked) {
      return;
    }

    const request = buildCreateDestinationRequest(newDraft);
    if (!request.ok) {
      setCreateState({
        message: request.error,
        status: "error",
      });
      return;
    }

    setCreateState({
      message: "Saving destination.",
      status: "saving",
    });

    try {
      const result = await createContainerDestination(
        containerId,
        request.payload,
      );
      setCreateState({
        message: `Created ${result.containerDestination.destinationCode}.`,
        status: "saved",
      });
      setNewDraft(emptyDestinationDraft());
      setAdding(false);
      router.refresh();
    } catch (error) {
      setCreateState({
        message: correctionErrorMessage(error),
        status: "error",
      });
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Destinations
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Save actual unloading data after the paper unloading report has
            been returned to the office.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-zinc-600">
            {destinations.length} destination(s)
          </span>
          <button
            className="min-h-10 border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50"
            disabled={locked}
            onClick={() => setAdding((current) => !current)}
            type="button"
          >
            {adding ? "Cancel" : "Add destination"}
          </button>
        </div>
      </div>

      {lockedMessage ? (
        <p className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
          {lockedMessage}
        </p>
      ) : null}

      {destinations.length === 0 ? (
        <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-600">
          This container has no parsed destinations.
        </p>
      ) : (
        <fieldset className="contents" disabled={locked}>
          <DestinationTable
            drafts={drafts}
            destinations={destinations}
            onChange={updateDraft}
            onDelete={deleteDestination}
            onGenerateLabels={generateLabelsForSavedDestination}
            onSave={saveDestination}
            saveStates={saveStates}
          />
        </fieldset>
      )}

      {adding ? (
        <fieldset className="contents" disabled={locked}>
          <NewDestinationForm
            draft={newDraft}
            onChange={updateNewDraft}
            onSave={saveNewDestination}
            saveState={createState}
          />
        </fieldset>
      ) : null}
    </section>
  );
}

function DestinationTable({
  destinations,
  drafts,
  onChange,
  onDelete,
  onGenerateLabels,
  onSave,
  saveStates,
}: {
  destinations: ContainerDetailDestinationResponse[];
  drafts: Record<string, DestinationCorrectionDraft>;
  onChange: (
    destinationId: string,
    field: keyof DestinationCorrectionDraft,
    value: string,
  ) => void;
  onDelete: (destination: ContainerDetailDestinationResponse) => Promise<void>;
  onGenerateLabels: (destinationId: string) => Promise<void>;
  onSave: (destination: ContainerDetailDestinationResponse) => Promise<void>;
  saveStates: Record<string, DestinationSaveState>;
}) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-[1500px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <th className="px-3 py-3 font-semibold">Destination</th>
            <th className="px-3 py-3 font-semibold">Type</th>
            <th className="px-3 py-3 font-semibold">Rule</th>
            <th className="px-3 py-3 text-right font-semibold">
              Actual cartons
            </th>
            <th className="px-3 py-3 text-right font-semibold">Actual CBM</th>
            <th className="px-3 py-3 text-right font-semibold">
              Expected pallets
            </th>
            <th className="px-3 py-3 text-right font-semibold">
              Actual pallets
            </th>
            <th className="px-3 py-3 text-right font-semibold">
              System pallets
            </th>
            <th className="px-3 py-3 font-semibold">Warnings</th>
            <th className="px-3 py-3 font-semibold">Actual note</th>
            <th className="px-3 py-3 font-semibold">Audit note</th>
            <th className="px-3 py-3 font-semibold">Save</th>
          </tr>
        </thead>
        <tbody>
          {destinations.map((destination) => {
            const draft =
              drafts[destination.id] ?? draftFromDestination(destination);
            const saveState = saveStates[destination.id] ?? idleSaveState;
            const warnings = [
              ...summarizeIssues(destination.warnings),
              ...summarizeIssues(destination.errors),
            ];

            return (
              <tr className="border-b border-zinc-100" key={destination.id}>
                <td className="px-3 py-4 align-top">
                  <div className="flex items-start gap-2">
                    <input
                      aria-label={`Destination code for ${destination.destinationCode}`}
                      className={inputClass("w-40 font-semibold")}
                      onChange={(event) =>
                        onChange(
                          destination.id,
                          "destinationCode",
                          event.target.value,
                        )
                      }
                      value={draft.destinationCode}
                    />
                    <button
                      aria-label={`Delete destination ${destination.destinationCode}`}
                      className="min-h-10 border border-red-700 bg-white px-3 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-500"
                      disabled={
                        saveState.status === "saving" ||
                        saveState.labelAction === "generating"
                      }
                      onClick={() => void onDelete(destination)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </td>
                <td className="px-3 py-4 align-top">
                  <input
                    aria-label={`Destination type for ${destination.destinationCode}`}
                    className={inputClass("w-40")}
                    onChange={(event) =>
                      onChange(
                        destination.id,
                        "destinationType",
                        event.target.value,
                      )
                    }
                    placeholder="No type"
                    value={draft.destinationType}
                  />
                </td>
                <td className="max-w-56 px-3 py-4 align-top text-xs text-zinc-600">
                  {ruleSummary(destination)}
                </td>
                <td className="px-3 py-4 align-top">
                  <input
                    aria-label={`Actual cartons for ${destination.destinationCode}`}
                    className={inputClass("w-28 text-right font-semibold")}
                    inputMode="numeric"
                    min={0}
                    onChange={(event) =>
                      onChange(destination.id, "cartons", event.target.value)
                    }
                    type="number"
                    value={draft.cartons}
                  />
                </td>
                <td className="px-3 py-4 align-top">
                  <input
                    aria-label={`Actual CBM for ${destination.destinationCode}`}
                    className={inputClass("w-28 text-right font-semibold")}
                    inputMode="decimal"
                    min={0}
                    onChange={(event) =>
                      onChange(destination.id, "volume", event.target.value)
                    }
                    step="0.001"
                    type="number"
                    value={draft.volume}
                  />
                </td>
                <td className="px-3 py-4 text-right align-top font-medium">
                  {destination.calculatedPallets}
                </td>
                <td className="px-3 py-4 align-top">
                  <input
                    aria-label={`Actual pallets for ${destination.destinationCode}`}
                    className={inputClass("w-28 text-right font-semibold")}
                    inputMode="numeric"
                    min={0}
                    onChange={(event) =>
                      onChange(
                        destination.id,
                        "manualPallets",
                        event.target.value,
                      )
                    }
                    placeholder="Auto"
                    type="number"
                    value={draft.manualPallets}
                  />
                </td>
                <td className="px-3 py-4 text-right align-top font-semibold">
                  {destination.finalPallets}
                </td>
                <td className="max-w-64 px-3 py-4 align-top text-xs text-zinc-600">
                  {warnings.length > 0 ? (
                    <ul className="space-y-1">
                      {warnings.map((warning, index) => (
                        <li key={`${warning.message}-${warning.count}-${index}`}>
                          {formatIssueSummary(warning)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span>{formatNullable(null)}</span>
                  )}
                </td>
                <td className="px-3 py-4 align-top">
                  <textarea
                    aria-label={`Actual note for ${destination.destinationCode}`}
                    className={textareaClass("w-52")}
                    onChange={(event) =>
                      onChange(destination.id, "note", event.target.value)
                    }
                    placeholder="Paper report note"
                    value={draft.note}
                  />
                </td>
                <td className="px-3 py-4 align-top">
                  <textarea
                    aria-label={`Audit note for ${destination.destinationCode}`}
                    className={textareaClass("w-52")}
                    onChange={(event) =>
                      onChange(
                        destination.id,
                        "correctionNote",
                        event.target.value,
                      )
                    }
                    placeholder="Audit note"
                    value={draft.correctionNote}
                  />
                </td>
                <td className="px-3 py-4 align-top">
                  <button
                    className="min-h-10 w-32 border border-teal-700 bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
                    disabled={
                      saveState.status === "saving" ||
                      saveState.labelAction === "generating"
                    }
                    onClick={() => void onSave(destination)}
                    type="button"
                  >
                    {saveState.status === "saving" ? "Saving" : "Save actual"}
                  </button>
                  <SaveMessage
                    onGenerateLabels={() => void onGenerateLabels(destination.id)}
                    state={saveState}
                    widthClass="w-44"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NewDestinationForm({
  draft,
  onChange,
  onSave,
  saveState,
}: {
  draft: DestinationCorrectionDraft;
  onChange: (field: keyof DestinationCorrectionDraft, value: string) => void;
  onSave: () => Promise<void>;
  saveState: DestinationSaveState;
}) {
  return (
    <div className="mt-5 border-t border-zinc-100 pt-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Destination">
          <input
            className={inputClass("w-full font-semibold")}
            onChange={(event) => onChange("destinationCode", event.target.value)}
            value={draft.destinationCode}
          />
        </Field>
        <Field label="Type">
          <input
            className={inputClass("w-full")}
            onChange={(event) => onChange("destinationType", event.target.value)}
            placeholder="No type"
            value={draft.destinationType}
          />
        </Field>
        <Field label="Actual cartons">
          <input
            className={inputClass("w-full text-right font-semibold")}
            inputMode="numeric"
            min={0}
            onChange={(event) => onChange("cartons", event.target.value)}
            type="number"
            value={draft.cartons}
          />
        </Field>
        <Field label="Actual CBM">
          <input
            className={inputClass("w-full text-right font-semibold")}
            inputMode="decimal"
            min={0}
            onChange={(event) => onChange("volume", event.target.value)}
            step="0.001"
            type="number"
            value={draft.volume}
          />
        </Field>
        <Field label="Actual pallets">
          <input
            className={inputClass("w-full text-right font-semibold")}
            inputMode="numeric"
            min={0}
            onChange={(event) => onChange("manualPallets", event.target.value)}
            placeholder="0"
            type="number"
            value={draft.manualPallets}
          />
        </Field>
        <Field label="Actual note">
          <input
            className={inputClass("w-full")}
            onChange={(event) => onChange("note", event.target.value)}
            placeholder="Paper report note"
            value={draft.note}
          />
        </Field>
        <Field label="Audit note">
          <input
            className={inputClass("w-full")}
            onChange={(event) => onChange("correctionNote", event.target.value)}
            placeholder="Audit note"
            value={draft.correctionNote}
          />
        </Field>
        <div className="flex items-end">
          <button
            className="min-h-10 w-full border border-teal-700 bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={saveState.status === "saving"}
            onClick={() => void onSave()}
            type="button"
          >
            {saveState.status === "saving" ? "Saving" : "Create destination"}
          </button>
        </div>
      </div>
      <SaveMessage state={saveState} />
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SaveMessage({
  onGenerateLabels,
  state,
  widthClass = "",
}: {
  onGenerateLabels?: () => void;
  state: DestinationSaveState;
  widthClass?: string;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`mt-2 text-xs ${
        state.status === "error" ? "text-red-700" : "text-emerald-700"
      } ${widthClass}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      <p>{state.message}</p>
      {state.labelPrompt &&
      state.labelAction !== "generated" &&
      state.status !== "error" &&
      onGenerateLabels ? (
        <button
          className="mt-2 min-h-9 w-full border border-teal-700 bg-white px-2 text-xs font-semibold text-teal-900 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-500"
          disabled={state.labelAction === "generating"}
          onClick={onGenerateLabels}
          type="button"
        >
          {state.labelAction === "generating"
            ? "Generating labels"
            : "Regenerate labels"}
        </button>
      ) : null}
    </div>
  );
}

function supplementalLabelPrompt(
  destination: ContainerDetailDestinationResponse,
  nextFinalPallets: number,
  changedFields: string[],
): SupplementalLabelPrompt | undefined {
  const addedPallets = nextFinalPallets - destination.finalPallets;
  if (addedPallets <= 0 || !changedFields.includes("manualPallets")) {
    return undefined;
  }

  return {
    addedPallets,
    destinationCode: destination.destinationCode,
    fromPallets: destination.finalPallets,
    toPallets: nextFinalPallets,
  };
}

function supplementalLabelRange(prompt: SupplementalLabelPrompt): string {
  const first = prompt.fromPallets + 1;
  if (first === prompt.toPallets) {
    return `#${prompt.toPallets}`;
  }

  return `#${first}-#${prompt.toPallets}`;
}

function ruleSummary(destination: ContainerDetailDestinationResponse): string {
  const parts = [
    destination.packageType ? `Package ${destination.packageType}` : null,
    destination.palletRuleCode ? `Rule ${destination.palletRuleCode}` : null,
    destination.calculationBasisCbm
      ? `Basis ${Number(destination.calculationBasisCbm).toFixed(3)} CBM`
      : null,
    destination.roundingMode ? `Rounding ${destination.roundingMode}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : formatNullable(null);
}

function emptyDestinationDraft(): DestinationCorrectionDraft {
  return {
    cartons: "0",
    correctionNote: "",
    destinationCode: "",
    destinationType: "",
    manualPallets: "",
    note: "",
    volume: "0",
  };
}

function inputClass(extra: string): string {
  return `min-h-10 border border-zinc-300 bg-white px-2 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none ${extra}`;
}

function textareaClass(extra: string): string {
  return `min-h-20 resize-y border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none ${extra}`;
}

function correctionErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Correction failed.";
}
