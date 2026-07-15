"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import { publishInventorySyncRefresh } from "@/components/inventory/inventory-sync-refresh";
import {
  ApiClientError,
  createInventoryAdjustment,
  type AuthUserResponse,
  type ContainerDetailInventoryDestinationResponse,
  type ContainerDetailInventorySummaryResponse,
  type InventoryAdjustmentResponse,
} from "@/lib/api-client";
import { formatOperationalDateTime } from "@/lib/date-time";
import {
  destinationTypeLabel,
  inventoryAdjustmentReasonLabel,
  palletEventTypeLabel,
  palletStatusLabel,
} from "@/lib/i18n/status-labels";
import type { MessageKey } from "@/lib/i18n/catalog";
import {
  buildManualInventoryDepletionRequest,
  emptyManualInventoryDepletionDraft,
  expectedManualInventoryRemaining,
  inventoryAdjustmentReasonOptions,
  manualInventoryAdjustmentErrorMessage,
  type ManualInventoryDepletionDraft,
} from "./container-inventory-adjustment-flow";

interface AdjustmentActionState {
  message: string;
  status: "error" | "idle" | "saving" | "success";
}

interface ActiveAdjustment {
  summary: ContainerDetailInventoryDestinationResponse;
  draft: ManualInventoryDepletionDraft;
  state: AdjustmentActionState;
}

const idleActionState: AdjustmentActionState = {
  message: "",
  status: "idle",
};

export function ContainerInventoryAdjustmentPanel({
  canAdjust,
  currentUser,
  historyByDestinationId,
  historyErrorByDestinationId,
  inventoryError,
  inventorySummary,
}: {
  canAdjust: boolean;
  currentUser: AuthUserResponse | null;
  historyByDestinationId: Record<string, InventoryAdjustmentResponse[]>;
  historyErrorByDestinationId: Record<string, boolean>;
  inventoryError: boolean;
  inventorySummary: ContainerDetailInventorySummaryResponse | null;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [activeAdjustment, setActiveAdjustment] =
    useState<ActiveAdjustment | null>(null);
  const [actionState, setActionState] =
    useState<AdjustmentActionState>(idleActionState);
  const summaries = inventorySummary?.destinations ?? [];
  const historyCount = Object.values(historyByDestinationId).reduce(
    (total, history) => total + history.length,
    0,
  );
  const useBoundedWorkspace = summaries.length > 5 || historyCount > 10;
  const reasonOptions = useMemo(
    () => inventoryAdjustmentReasonOptions(locale),
    [locale],
  );

  function openAdjustment(summary: ContainerDetailInventoryDestinationResponse) {
    if (!canAdjust || summary.remainingPallets < 1) {
      return;
    }

    setActiveAdjustment({
      draft: emptyManualInventoryDepletionDraft(),
      state: idleActionState,
      summary,
    });
  }

  function updateDraft<K extends keyof ManualInventoryDepletionDraft>(
    key: K,
    value: ManualInventoryDepletionDraft[K],
  ) {
    setActiveAdjustment((current) =>
      current
        ? {
            ...current,
            draft: { ...current.draft, [key]: value },
            state:
              current.state.status === "error" ? idleActionState : current.state,
          }
        : current,
    );
  }

  async function submitAdjustment() {
    if (!activeAdjustment) {
      return;
    }

    const request = buildManualInventoryDepletionRequest(
      activeAdjustment.draft,
      activeAdjustment.summary.remainingPallets,
    );
    if (!request.ok) {
      setActiveAdjustment((current) =>
        current
          ? {
              ...current,
              state: {
                message: inventoryValidationMessage(request.error, t),
                status: "error",
              },
            }
          : current,
      );
      return;
    }

    setActiveAdjustment((current) =>
      current
        ? {
            ...current,
            state: {
              message:
                t("Saving manual inventory depletion."),
              status: "saving",
            },
          }
        : current,
    );

    try {
      await createInventoryAdjustment(
        activeAdjustment.summary.containerDestinationId,
        request.payload,
      );
      const message = t(
        "Manual inventory depletion saved. Inventory and adjustment history were refreshed from the API.",
      );
      setActiveAdjustment(null);
      setActionState({ message, status: "success" });
      publishInventorySyncRefresh();
      router.refresh();
    } catch (error) {
      const errorCode = error instanceof ApiClientError ? error.code : null;
      setActiveAdjustment((current) =>
        current
          ? {
              ...current,
              state: {
                message: manualInventoryAdjustmentErrorMessage(errorCode, locale),
                status: "error",
              },
            }
          : current,
      );
    }
  }

  return (
    <section className="min-w-0 border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Destination inventory")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
            {t(
              "Manual inventory depletion removes pallets from remaining inventory. It is not a loading scan and does not count pallets as loaded.",
            )}
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700">
          {canAdjust
            ? t("Inventory adjustment enabled")
            : t("Inventory read-only")}
        </span>
      </div>

      {actionState.status !== "idle" ? (
        <ActionMessage state={actionState} />
      ) : null}

      {inventoryError || !inventorySummary ? (
        <div
          className="mt-4 border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-950"
          role="alert"
        >
          {t("Destination inventory could not be loaded. Refresh and try again.")}
        </div>
      ) : summaries.length === 0 ? (
        <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-600">
          {t("No generated pallets are available for destination inventory review.")}
        </p>
      ) : (
        <div
          aria-label={
            useBoundedWorkspace
              ? t("Scrollable destination inventory and adjustment history")
              : undefined
          }
          className={`mt-4 divide-y divide-zinc-100 border-y border-zinc-100 ${
            useBoundedWorkspace
              ? "max-h-[48rem] overflow-y-auto overscroll-contain pr-2"
              : ""
          }`}
          data-bounded-inventory-workspace={
            useBoundedWorkspace ? "true" : "false"
          }
          role={useBoundedWorkspace ? "region" : undefined}
          tabIndex={useBoundedWorkspace ? 0 : undefined}
        >
          {summaries.map((summary) => (
            <DestinationInventoryRow
              canAdjust={canAdjust}
              currentUser={currentUser}
              history={historyByDestinationId[summary.containerDestinationId] ?? []}
              historyError={
                historyErrorByDestinationId[summary.containerDestinationId] ?? false
              }
              key={summary.containerDestinationId}
              onAdjust={openAdjustment}
              summary={summary}
            />
          ))}
        </div>
      )}

      {activeAdjustment ? (
        <ManualInventoryDepletionDialog
          activeAdjustment={activeAdjustment}
          containerNo={inventorySummary?.containerNo ?? ""}
          onClose={() => setActiveAdjustment(null)}
          onDraftChange={updateDraft}
          onSubmit={() => void submitAdjustment()}
          reasonOptions={reasonOptions}
        />
      ) : null}
    </section>
  );
}

function DestinationInventoryRow({
  canAdjust,
  currentUser,
  history,
  historyError,
  onAdjust,
  summary,
}: {
  canAdjust: boolean;
  currentUser: AuthUserResponse | null;
  history: InventoryAdjustmentResponse[];
  historyError: boolean;
  onAdjust: (summary: ContainerDetailInventoryDestinationResponse) => void;
  summary: ContainerDetailInventoryDestinationResponse;
}) {
  const { locale, t } = useI18n();

  return (
    <article
      className="py-4 first:pt-0 last:pb-0"
      data-container-destination-id={summary.containerDestinationId}
    >
      <div className="grid min-w-0 gap-4 min-[2400px]:grid-cols-[minmax(180px,1.1fr)_repeat(5,minmax(84px,0.42fr))_minmax(180px,0.8fr)]">
        <div>
          <h3 className="break-words text-sm font-semibold text-zinc-950">
            {summary.destinationCode}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            {destinationTypeLabel(summary.destinationType, locale)}
          </p>
          <p className="mt-2 break-all font-mono text-[11px] text-zinc-500">
            <span className="font-sans font-semibold">{t("Destination record")}:</span>{" "}
            <span data-i18n-ignore="true">{summary.containerDestinationId}</span>
          </p>
        </div>
        <Metric label={t("Active pallets")} value={summary.activeTotalPallets} />
        <Metric label={t("Loaded pallets")} value={summary.loadedPallets} />
        <Metric
          label={palletStatusLabel("ADJUSTED_OUT", locale)}
          value={summary.adjustedOutPallets}
        />
        <Metric label={t("Cancelled")} value={summary.cancelledPallets} />
        <Metric
          label={t("Remaining pallets")}
          value={summary.remainingPallets}
        />
        <div className="flex items-end min-[2400px]:justify-end">
          {canAdjust && summary.remainingPallets > 0 ? (
            <button
              className="inline-flex min-h-10 w-full items-center justify-center border border-amber-700 bg-amber-700 px-3 text-sm font-semibold text-white hover:bg-amber-800 min-[2400px]:w-auto"
              onClick={() => onAdjust(summary)}
              type="button"
            >
              {t("Manual inventory depletion")}
            </button>
          ) : (
            <span className="text-sm text-zinc-500">
              {summary.remainingPallets > 0
                ? t("Inventory read-only")
                : t("No remaining pallets")}
            </span>
          )}
        </div>
      </div>

      <AdjustmentHistory
        currentUser={currentUser}
        history={history}
        historyError={historyError}
      />
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <dl className="border-t border-zinc-100 pt-2 min-[2400px]:border-t-0 min-[2400px]:pt-0">
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-950">
        {value}
      </dd>
    </dl>
  );
}

function AdjustmentHistory({
  currentUser,
  history,
  historyError,
}: {
  currentUser: AuthUserResponse | null;
  history: InventoryAdjustmentResponse[];
  historyError: boolean;
}) {
  const { locale, t } = useI18n();

  return (
    <div className="mt-4 border-t border-zinc-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-900">
          {t("Manual inventory depletion history")}
        </h4>
        <span className="text-xs font-medium text-zinc-500">
          {palletEventTypeLabel("MANUAL_INVENTORY_DEPLETION", locale)}
        </span>
      </div>
      {historyError ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {t("Manual inventory depletion history could not be loaded.")}
        </p>
      ) : history.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">
          {t("No manual inventory depletion history.")}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[760px] w-full border-collapse text-left text-sm">
            <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("Time")}</th>
                <th className="px-3 py-2 font-semibold">{t("Operator")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("Pallets")}</th>
                <th className="px-3 py-2 font-semibold">{t("Reason")}</th>
                <th className="px-3 py-2 font-semibold">{t("Note")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {history.map((adjustment) => (
                <tr key={adjustment.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                    {formatOperationalDateTime(adjustment.createdAt)}
                  </td>
                  <td className="max-w-60 break-all px-3 py-3 text-zinc-700">
                    {operatorDisplay(adjustment, currentUser)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-zinc-950">
                    {adjustment.palletCount}
                  </td>
                  <td className="px-3 py-3 text-zinc-700">
                    {inventoryAdjustmentReasonLabel(adjustment.reasonCode, locale)}
                  </td>
                  <td className="max-w-80 break-words px-3 py-3 text-zinc-700">
                    {adjustment.note ?? t("No note")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ManualInventoryDepletionDialog({
  activeAdjustment,
  containerNo,
  onClose,
  onDraftChange,
  onSubmit,
  reasonOptions,
}: {
  activeAdjustment: ActiveAdjustment;
  containerNo: string;
  onClose: () => void;
  onDraftChange: <K extends keyof ManualInventoryDepletionDraft>(
    key: K,
    value: ManualInventoryDepletionDraft[K],
  ) => void;
  onSubmit: () => void;
  reasonOptions: Array<{ label: string; value: string }>;
}) {
  const { t } = useI18n();
  const { draft, state, summary } = activeAdjustment;
  const isSaving = state.status === "saving";
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const isSavingRef = useRef(isSaving);
  const expectedRemaining = expectedManualInventoryRemaining(
    summary.remainingPallets,
    draft.count,
  );

  useEffect(() => {
    onCloseRef.current = onClose;
    isSavingRef.current = isSaving;
  }, [isSaving, onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSavingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      aria-describedby="manual-inventory-depletion-description"
      aria-labelledby="manual-inventory-depletion-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-zinc-950/40 p-0 sm:items-center sm:justify-center sm:p-6"
      ref={dialogRef}
      role="dialog"
    >
      <form
        className="max-h-[92vh] w-full overflow-y-auto border border-zinc-300 bg-white p-5 shadow-xl sm:max-w-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-amber-800">
              {t("Manual inventory depletion")}
            </p>
            <h3
              className="mt-1 text-xl font-semibold text-zinc-950"
              id="manual-inventory-depletion-title"
            >
              {containerNo} · {summary.destinationCode}
            </h3>
          </div>
          <button
            aria-label={t("Close manual inventory depletion")}
            className="min-h-10 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            disabled={isSaving}
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            {t("Close")}
          </button>
        </div>

        <p
          className="mt-4 border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950"
          id="manual-inventory-depletion-description"
        >
          {t(
            "This action removes pallets from remaining inventory. It does not create a loading scan and does not count pallets as loaded.",
          )}
        </p>

        <div className="mt-5 grid gap-4">
          <dl className="grid grid-cols-2 gap-3 border-b border-zinc-100 pb-4 text-sm">
            <div>
              <dt className="text-zinc-500">{t("Container No.")}</dt>
              <dd className="mt-1 break-all font-semibold text-zinc-950">
                {containerNo}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">{t("Destination")}</dt>
              <dd className="mt-1 break-words font-semibold text-zinc-950">
                {summary.destinationCode}
              </dd>
            </div>
          </dl>
          <label className="grid gap-2 text-sm font-medium text-zinc-700">
            {t("Current remaining inventory")}
            <input
              className="min-h-11 border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold tabular-nums text-zinc-950"
              readOnly
              value={summary.remainingPallets}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-zinc-700">
            {t("Depletion count")}
            <input
              aria-label={t("Manual inventory depletion count")}
              className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-amber-700"
              disabled={isSaving}
              inputMode="numeric"
              max={summary.remainingPallets}
              min={1}
              onChange={(event) => onDraftChange("count", event.target.value)}
              type="number"
              value={draft.count}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-zinc-700">
            {t("Expected remaining inventory")}
            <input
              className="min-h-11 border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold tabular-nums text-zinc-950"
              readOnly
              value={expectedRemaining ?? t("Enter a valid depletion count")}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-zinc-700">
            {t("Reason")}
            <select
              aria-label={t("Manual inventory depletion reason")}
              className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-amber-700"
              disabled={isSaving}
              onChange={(event) =>
                onDraftChange(
                  "reasonCode",
                  event.target.value as ManualInventoryDepletionDraft["reasonCode"],
                )
              }
              value={draft.reasonCode}
            >
              <option value="">{t("Select reason")}</option>
              {reasonOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-zinc-700">
            {t("Note")}
            <textarea
              aria-label={t("Manual inventory depletion note")}
              className="min-h-24 resize-y border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-amber-700"
              disabled={isSaving}
              onChange={(event) => onDraftChange("note", event.target.value)}
              placeholder={t("Required when Other is selected")}
              value={draft.note}
            />
          </label>
          <label className="flex items-start gap-3 border-t border-zinc-100 pt-4 text-sm leading-6 text-zinc-700">
            <input
              aria-label={t("Confirm manual inventory depletion")}
              checked={draft.confirmed}
              className="mt-1 size-4 accent-amber-700"
              disabled={isSaving}
              onChange={(event) => onDraftChange("confirmed", event.target.checked)}
              type="checkbox"
            />
            <span>
              {t(
                "I confirm these pallets must be removed from remaining inventory and must not be counted as loaded.",
              )}
            </span>
          </label>
        </div>

        {state.status !== "idle" ? <ActionMessage state={state} /> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            className="min-h-10 border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            {t("Cancel")}
          </button>
          <button
            className="min-h-10 border border-amber-800 bg-amber-800 px-4 text-sm font-semibold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={!draft.confirmed || isSaving}
            type="submit"
          >
            {isSaving
              ? t("Saving")
              : t("Confirm manual inventory depletion")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ActionMessage({ state }: { state: AdjustmentActionState }) {
  const styles =
    state.status === "error"
      ? "border-red-200 bg-red-50 text-red-950"
      : state.status === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <div
      className={`mt-4 border px-3 py-3 text-sm ${styles}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </div>
  );
}

const inventoryValidationMessageKeys: Record<string, MessageKey> = {
  "A note is required when Other is selected.":
    "A note is required when Other is selected.",
  "Enter a whole number from 1 to the current remaining inventory.":
    "Enter a whole number from 1 to the current remaining inventory.",
  "Select a reason for manual inventory depletion.":
    "Select a reason for manual inventory depletion.",
};

function inventoryValidationMessage(
  error: string,
  t: (key: MessageKey) => string,
): string {
  return t(
    inventoryValidationMessageKeys[error] ??
      "Manual inventory depletion could not be saved. Refresh the destination inventory and try again.",
  );
}

function operatorDisplay(
  adjustment: InventoryAdjustmentResponse,
  currentUser: AuthUserResponse | null,
): string {
  if (
    adjustment.createdById &&
    currentUser?.id === adjustment.createdById
  ) {
    return currentUser.name ?? currentUser.email ?? adjustment.createdById;
  }

  return adjustment.createdById ?? "-";
}
