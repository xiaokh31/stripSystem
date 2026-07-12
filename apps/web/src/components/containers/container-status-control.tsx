"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { ContainerInventorySyncResult } from "@/components/containers/container-inventory-sync-result";
import { publishInventorySyncRefresh } from "@/components/inventory/inventory-sync-refresh";
import {
  ApiClientError,
  type ContainerPalletInventorySyncSummaryResponse,
  updateContainer,
} from "@/lib/api-client";
import type { MessageKey } from "@/lib/i18n/catalog";
import { containerStatusLabel } from "./container-files-flow";
import {
  CONTAINER_STATUS_UPDATE_VALUES,
  containerStatusSelectLabel,
  isContainerStatusOptionDisabled,
  isContainerStatusScanOnly,
  loadedScanOnlyNotice,
} from "./container-status-flow";

interface StatusUpdateState {
  code: string | null;
  message: string;
  status: "error" | "idle" | "saving" | "success";
}

const idleState: StatusUpdateState = {
  code: null,
  message: "",
  status: "idle",
};

export function ContainerStatusControl({
  containerId,
  currentStatus,
}: {
  containerId: string;
  currentStatus: string;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [state, setState] = useState<StatusUpdateState>(idleState);
  const [inventorySync, setInventorySync] = useState<
    ContainerPalletInventorySyncSummaryResponse[] | null
  >(null);
  const isSaving = state.status === "saving";
  const hasChange = selectedStatus !== currentStatus;
  const currentStatusScanOnly = isContainerStatusScanOnly(currentStatus);

  async function saveStatus() {
    if (!hasChange || isSaving || currentStatusScanOnly) {
      return;
    }

    setState({
      code: null,
      message: t("Saving container status."),
      status: "saving",
    });

    try {
      const response = await updateContainer(containerId, {
        correctionNote: note.trim() || null,
        reason: "Office container status update",
        status: selectedStatus,
      });
      setState({
        code: null,
        message: t("Container status saved."),
        status: "success",
      });
      if (selectedStatus === "UNLOADED") {
        setInventorySync(response.inventorySync ? [response.inventorySync] : []);
        publishInventorySyncRefresh();
      }
      router.refresh();
    } catch (error) {
      setState(toStatusError(error, t));
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Container status update")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {t("Current status:")}{" "}
            <span className="font-semibold text-zinc-950">
              {containerStatusLabel(currentStatus, locale)}
            </span>
          </p>
        </div>
        <button
          className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={!hasChange || isSaving || currentStatusScanOnly}
          onClick={() => void saveStatus()}
          type="button"
        >
          {isSaving ? t("Saving") : t("Save status")}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          {t("Status")}
          <select
            className="min-h-11 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 focus:border-teal-700 focus:outline-none"
            disabled={currentStatusScanOnly}
            onChange={(event) => setSelectedStatus(event.target.value)}
            value={selectedStatus}
          >
            {CONTAINER_STATUS_UPDATE_VALUES.map((status) => (
              <option
                disabled={isContainerStatusOptionDisabled(
                  status,
                  currentStatus,
                )}
                key={status}
                title={containerStatusSelectLabel(status, locale)}
                value={status}
              >
                {containerStatusSelectLabel(status, locale)}
              </option>
            ))}
          </select>
          <span className="text-xs font-medium text-zinc-500">
            {loadedScanOnlyNotice(locale)}
          </span>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          {t("Audit note")}
          <input
            className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
            disabled={currentStatusScanOnly}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("Reason visible in correction feedback")}
            value={note}
          />
        </label>
      </div>

      {state.status !== "idle" ? (
        <div
          className={`mt-4 border p-3 text-sm ${
            state.status === "error"
              ? "border-red-200 bg-red-50 text-red-950"
              : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          <p className="font-semibold">{state.message}</p>
          {state.code ? (
            <p className="mt-1 text-xs font-semibold uppercase" data-i18n-ignore>
              {state.code}
            </p>
          ) : null}
        </div>
      ) : null}
      {state.status === "success" && selectedStatus === "UNLOADED" ? (
        <ContainerInventorySyncResult inventorySync={inventorySync} />
      ) : null}
    </section>
  );
}

const containerStatusErrorKeys: Record<string, MessageKey> = {
  API_NETWORK_ERROR: "Container status could not be saved.",
  CONTAINER_INVENTORY_SYNC_CONCURRENT:
    "Pallet inventory changed while saving. Refresh and try again.",
  CONTAINER_INVENTORY_SYNC_CONTAINER_LOCKED:
    "This container has already entered loading or delivery and cannot be marked unloaded.",
  CONTAINER_INVENTORY_SYNC_FAILED:
    "Pallet inventory could not be synchronized. No unloading completion was saved.",
  CONTAINER_INVENTORY_SYNC_INVALID_FINAL_COUNT:
    "Final pallet count is invalid. Review destination totals before completing unloading.",
  CONTAINER_INVENTORY_SYNC_UNSAFE_SURPLUS:
    "Actual pallet total is lower than the operational pallet history. Resolve loading, delivery, or inventory adjustments before completing unloading.",
  CONTAINER_STATUS_UPDATE_FAILED: "Container status could not be saved.",
  FORBIDDEN: "Container status could not be saved.",
};

function toStatusError(
  error: unknown,
  t: (key: MessageKey) => string,
): StatusUpdateState {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: t(
        containerStatusErrorKeys[error.code] ?? "Container status could not be saved.",
      ),
      status: "error",
    };
  }

  return {
    code: "CONTAINER_STATUS_UPDATE_FAILED",
    message: t("Container status could not be saved."),
    status: "error",
  };
}
