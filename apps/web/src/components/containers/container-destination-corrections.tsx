"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  createContainerDestination,
  deleteContainerDestination,
  generateContainerLabels,
  updateContainerDestination,
  type ContainerDetailDestinationResponse,
} from "@/lib/api-client";
import type { MessageKey } from "@/lib/i18n/catalog";
import {
  buildCreateDestinationRequest,
  buildDestinationCorrectionRequest,
  draftFromDestination,
  formatIssueSummary,
  formatNullable,
  ruleSummary,
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
  const { format, locale, t } = useI18n();
  const router = useRouter();
  const locked = isContainerOperationLocked(containerStatus);
  const lockedMessage = containerOperationLockMessage(containerStatus, locale);
  const initialDrafts = useMemo(() => {
    return Object.fromEntries(
      destinations.map((destination) => [
        destination.id,
        draftFromDestination(destination),
      ]),
    );
  }, [destinations]);
  const destinationById = useMemo(
    () => new Map(destinations.map((destination) => [destination.id, destination])),
    [destinations],
  );
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
    const destinationDraft = destinationById.get(destinationId);
    setDrafts((current) => ({
      ...current,
      [destinationId]: {
        ...(current[destinationId] ??
          (destinationDraft
            ? draftFromDestination(destinationDraft)
            : emptyDestinationDraft())),
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
        message: correctionValidationMessage(request.error, t),
        status: "error",
      });
      return;
    }

    setSaveState(destination.id, {
      message: t("Saving correction."),
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
          ? format("i18n.destinations.savedSupplemental", {
              added: labelPrompt.addedPallets,
              count: result.corrections.length,
              from: labelPrompt.fromPallets,
              to: labelPrompt.toPallets,
            })
          : format("i18n.destinations.saved", {
              count: result.corrections.length,
            }),
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setSaveState(destination.id, {
        message: correctionErrorMessage(error, t),
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
      message: t("Regenerating label PDF from latest destination data."),
      status: "saved",
    });

    try {
      await generateContainerLabels(containerId);
      setSaveState(destinationId, {
        ...current,
        labelAction: "generated",
        message: format("i18n.destinations.regenerated", {
          destination: current.labelPrompt.destinationCode,
          range: supplementalLabelRange(current.labelPrompt),
        }),
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setSaveState(destinationId, {
        ...current,
        labelAction: "idle",
        message: correctionErrorMessage(error, t),
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
      format("i18n.destinations.deleteConfirm", {
        destination: destination.destinationCode,
      }),
    );
    if (!confirmed) {
      return;
    }

    setSaveState(destination.id, {
      message: t("Deleting destination."),
      status: "saving",
    });

    try {
      const result = await deleteContainerDestination(destination.id);
      setSaveState(destination.id, {
        message: format("i18n.destinations.deleted", {
          destination: result.containerDestination.destinationCode,
        }),
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setSaveState(destination.id, {
        message: correctionErrorMessage(error, t),
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
        message: correctionValidationMessage(request.error, t),
        status: "error",
      });
      return;
    }

    setCreateState({
      message: t("Saving destination."),
      status: "saving",
    });

    try {
      const result = await createContainerDestination(
        containerId,
        request.payload,
      );
      setCreateState({
        message: format("i18n.destinations.created", {
          destination: result.containerDestination.destinationCode,
        }),
        status: "saved",
      });
      setNewDraft(emptyDestinationDraft());
      setAdding(false);
      router.refresh();
    } catch (error) {
      setCreateState({
        message: correctionErrorMessage(error, t),
        status: "error",
      });
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Destinations")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {t(
              "Save actual unloading data after the paper unloading report has been returned to the office.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-zinc-600">
            {format("i18n.destinations.count", { count: destinations.length })}
          </span>
          <button
            className="min-h-10 border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50"
            disabled={locked}
            onClick={() => setAdding((current) => !current)}
            type="button"
          >
            {adding ? t("Cancel") : t("Add destination")}
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
          {t("This container has no parsed destinations.")}
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
  const { format, locale, t } = useI18n();

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-[1380px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <th className="px-3 py-3 font-semibold">{t("Destination")}</th>
            <th className="px-3 py-3 font-semibold">{t("Type")}</th>
            <th className="px-3 py-3 font-semibold">{t("Rule")}</th>
            <th className="px-3 py-3 text-right font-semibold">
              {t("Actual cartons")}
            </th>
            <th className="px-3 py-3 text-right font-semibold">
              {t("Actual CBM")}
            </th>
            <th className="px-3 py-3 text-right font-semibold">
              {t("Expected pallets")}
            </th>
            <th className="px-3 py-3 text-right font-semibold">
              {t("Actual pallets")}
            </th>
            <th className="px-3 py-3 text-right font-semibold">
              {t("System pallets")}
            </th>
            <th className="px-3 py-3 font-semibold">{t("Warnings")}</th>
            <th className="px-3 py-3 font-semibold">{t("Actual note")}</th>
            <th className="px-3 py-3 font-semibold">{t("Audit note")}</th>
            <th className="px-3 py-3 font-semibold">{t("Save")}</th>
          </tr>
        </thead>
        <tbody>
          {destinations.map((destination) => {
            const draft =
              drafts[destination.id] ?? draftFromDestination(destination);
            const saveState = saveStates[destination.id] ?? idleSaveState;
            const warnings = [
              ...summarizeIssues(destination.warnings, locale),
              ...summarizeIssues(destination.errors, locale),
            ];

            return (
              <tr className="border-b border-zinc-100" key={destination.id}>
                <td className="px-3 py-4 align-top">
                  <div className="flex items-start gap-2">
                    <input
                      aria-label={format("i18n.destinations.destinationCodeFor", {
                        destination: destination.destinationCode,
                      })}
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
                      aria-label={format("i18n.destinations.deleteFor", {
                        destination: destination.destinationCode,
                      })}
                      className="min-h-10 border border-red-700 bg-white px-3 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-500"
                      disabled={
                        saveState.status === "saving" ||
                        saveState.labelAction === "generating"
                      }
                      onClick={() => void onDelete(destination)}
                      type="button"
                    >
                      {t("Delete")}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-4 align-top">
                  <input
                    aria-label={format("i18n.destinations.destinationTypeFor", {
                      destination: destination.destinationCode,
                    })}
                    className={inputClass("w-40")}
                    onChange={(event) =>
                      onChange(
                        destination.id,
                        "destinationType",
                        event.target.value,
                      )
                    }
                    placeholder={t("No type")}
                    value={draft.destinationType}
                  />
                </td>
                <td className="max-w-56 px-3 py-4 align-top text-xs text-zinc-600">
                  {ruleSummary(destination, locale)}
                </td>
                <td className="px-3 py-4 align-top">
                  <input
                    aria-label={format("i18n.destinations.actualCartonsFor", {
                      destination: destination.destinationCode,
                    })}
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
                    aria-label={format("i18n.destinations.actualCbmFor", {
                      destination: destination.destinationCode,
                    })}
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
                    aria-label={format("i18n.destinations.actualPalletsFor", {
                      destination: destination.destinationCode,
                    })}
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
                    placeholder={t("Auto")}
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
                          {formatIssueSummary(warning, locale)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span>{formatNullable(null)}</span>
                  )}
                </td>
                <td className="px-3 py-4 align-top">
                  <textarea
                    aria-label={format("i18n.destinations.actualNoteFor", {
                      destination: destination.destinationCode,
                    })}
                    className={textareaClass("w-52")}
                    onChange={(event) =>
                      onChange(destination.id, "note", event.target.value)
                    }
                    placeholder={t("Paper report note")}
                    value={draft.note}
                  />
                </td>
                <td className="px-3 py-4 align-top">
                  <textarea
                    aria-label={format("i18n.destinations.auditNoteFor", {
                      destination: destination.destinationCode,
                    })}
                    className={textareaClass("w-52")}
                    onChange={(event) =>
                      onChange(
                        destination.id,
                        "correctionNote",
                        event.target.value,
                      )
                    }
                    placeholder={t("Audit note")}
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
                    {saveState.status === "saving"
                      ? t("Saving")
                      : t("Save actual")}
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
  const { t } = useI18n();

  return (
    <div className="mt-5 border-t border-zinc-100 pt-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label={t("Destination")}>
          <input
            className={inputClass("w-full font-semibold")}
            onChange={(event) => onChange("destinationCode", event.target.value)}
            value={draft.destinationCode}
          />
        </Field>
        <Field label={t("Type")}>
          <input
            className={inputClass("w-full")}
            onChange={(event) => onChange("destinationType", event.target.value)}
            placeholder={t("No type")}
            value={draft.destinationType}
          />
        </Field>
        <Field label={t("Actual cartons")}>
          <input
            className={inputClass("w-full text-right font-semibold")}
            inputMode="numeric"
            min={0}
            onChange={(event) => onChange("cartons", event.target.value)}
            type="number"
            value={draft.cartons}
          />
        </Field>
        <Field label={t("Actual CBM")}>
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
        <Field label={t("Actual pallets")}>
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
        <Field label={t("Actual note")}>
          <input
            className={inputClass("w-full")}
            onChange={(event) => onChange("note", event.target.value)}
            placeholder={t("Paper report note")}
            value={draft.note}
          />
        </Field>
        <Field label={t("Audit note")}>
          <input
            className={inputClass("w-full")}
            onChange={(event) => onChange("correctionNote", event.target.value)}
            placeholder={t("Audit note")}
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
            {saveState.status === "saving"
              ? t("Saving")
              : t("Create destination")}
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
  const { t } = useI18n();

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
            ? t("Generating labels")
            : t("Regenerate labels")}
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
  const palletAffectingChange = changedFields.some((field) =>
    ["cartons", "destinationCode", "manualPallets", "volume"].includes(field),
  );
  if (addedPallets <= 0 || !palletAffectingChange) {
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

function correctionValidationMessage(
  error: string,
  t: (key: MessageKey) => string,
): string {
  const knownMessages: Record<string, MessageKey> = {
    "Destination code is required.": "Destination code is required.",
    "Manual pallets must be a whole number of 1 or greater. Delete the destination instead when there is no cargo.":
      "Manual pallets must be a whole number of 1 or greater. Delete the destination instead when there is no cargo.",
  };

  return t(
    knownMessages[error] ?? "Destination correction could not be saved.",
  );
}

function correctionErrorMessage(
  error: unknown,
  t: (key: MessageKey) => string,
): string {
  if (error instanceof ApiClientError) {
    return t("Destination correction could not be saved.");
  }

  return t("Destination correction could not be saved.");
}
