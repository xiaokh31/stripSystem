"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, updateContainer } from "@/lib/api-client";
import { containerStatusLabel } from "./container-files-flow";
import {
  CONTAINER_STATUS_UPDATE_VALUES,
  LOADED_SCAN_ONLY_NOTICE,
  containerStatusSelectLabel,
  isContainerStatusOptionDisabled,
  isContainerStatusScanOnly,
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
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [state, setState] = useState<StatusUpdateState>(idleState);
  const isSaving = state.status === "saving";
  const hasChange = selectedStatus !== currentStatus;
  const currentStatusScanOnly = isContainerStatusScanOnly(currentStatus);

  async function saveStatus() {
    if (!hasChange || isSaving || currentStatusScanOnly) {
      return;
    }

    setState({
      code: null,
      message: "Saving container status.",
      status: "saving",
    });

    try {
      await updateContainer(containerId, {
        correctionNote: note.trim() || null,
        reason: "Office container status update",
        status: selectedStatus,
      });
      setState({
        code: null,
        message: "Container status saved.",
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setState(toStatusError(error));
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Container status update
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Current status:{" "}
            <span className="font-semibold text-zinc-950">
              {containerStatusLabel(currentStatus)}
            </span>
          </p>
        </div>
        <button
          className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={!hasChange || isSaving || currentStatusScanOnly}
          onClick={() => void saveStatus()}
          type="button"
        >
          {isSaving ? "Saving" : "Save status"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Status
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
                value={status}
              >
                {containerStatusSelectLabel(status)}
              </option>
            ))}
          </select>
          <span className="text-xs font-medium text-zinc-500">
            {LOADED_SCAN_ONLY_NOTICE}
          </span>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Audit note
          <input
            className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
            disabled={currentStatusScanOnly}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reason visible in correction feedback"
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
            <p className="mt-1 text-xs font-semibold uppercase">
              {state.code}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function toStatusError(error: unknown): StatusUpdateState {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      status: "error",
    };
  }

  return {
    code: "CONTAINER_STATUS_UPDATE_FAILED",
    message:
      error instanceof Error
        ? error.message
        : "Container status could not be saved.",
    status: "error",
  };
}
