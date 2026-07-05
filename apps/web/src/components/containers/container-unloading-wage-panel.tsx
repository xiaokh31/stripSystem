"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ApiClientError,
  completeContainerUnloading,
  saveContainerUnloadingWage,
  updateContainerUnloaders,
  updateContainerUnloadingWageAssociations,
  type ContainerDetailResponse,
  type ContainerPayClassification,
} from "@/lib/api-client";
import {
  buildContainerUnloadersRequest,
  buildContainerUnloadingCompletionRequest,
  buildContainerUnloadingWageSaveRequest,
  classificationLabel,
  completionDraftFromContainer,
  completionStatusLabel,
  emptyContainerUnloaderDraft,
  rateRuleLabel,
  unloaderDraftsFromContainer,
  wageDraftFromContainer,
  type ContainerUnloaderDraft,
  type ContainerUnloadingCompletionDraft,
  type ContainerUnloadingWageDraft,
} from "./container-unloading-wage-flow";

interface ActionState {
  code: string | null;
  message: string;
  status: "error" | "idle" | "running" | "success";
}

const idleState: ActionState = {
  code: null,
  message: "",
  status: "idle",
};

export function ContainerUnloadingWagePanel({
  container,
}: {
  container: ContainerDetailResponse;
}) {
  const router = useRouter();
  const [wageDraft, setWageDraft] = useState<ContainerUnloadingWageDraft>(() =>
    wageDraftFromContainer(container),
  );
  const [unloaderDrafts, setUnloaderDrafts] = useState<
    ContainerUnloaderDraft[]
  >(() => unloaderDraftsFromContainer(container));
  const [completionDraft, setCompletionDraft] =
    useState<ContainerUnloadingCompletionDraft>(() =>
      completionDraftFromContainer(container),
    );
  const [wageState, setWageState] = useState<ActionState>(idleState);
  const [unloaderState, setUnloaderState] = useState<ActionState>(idleState);
  const [completionState, setCompletionState] =
    useState<ActionState>(idleState);
  const wage = container.unloadingWage;
  const isTransfer = wageDraft.classification === "US_TO_CANADA_TRANSFER";

  function updateWageDraft<K extends keyof ContainerUnloadingWageDraft>(
    key: K,
    value: ContainerUnloadingWageDraft[K],
  ) {
    setWageDraft((current) => ({ ...current, [key]: value }));
  }

  function updateUnloader(
    index: number,
    key: keyof ContainerUnloaderDraft,
    value: string,
  ) {
    setUnloaderDrafts((current) =>
      current.map((unloader, unloaderIndex) =>
        unloaderIndex === index
          ? {
              ...unloader,
              [key]: value,
            }
          : unloader,
      ),
    );
  }

  function updateCompletion<K extends keyof ContainerUnloadingCompletionDraft>(
    key: K,
    value: ContainerUnloadingCompletionDraft[K],
  ) {
    setCompletionDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveWage() {
    const request = buildContainerUnloadingWageSaveRequest(
      container.containerNo,
      wageDraft,
    );
    if (!request.ok) {
      setWageState({ code: null, message: request.error, status: "error" });
      return;
    }

    setWageState({
      code: null,
      message: "Saving unloading wage information.",
      status: "running",
    });

    try {
      if (request.payload.kind === "ocean") {
        await saveContainerUnloadingWage(container.id, request.payload.payload);
      } else {
        await updateContainerUnloadingWageAssociations(
          container.id,
          request.payload.payload,
        );
      }
      setWageState({
        code: null,
        message: "Saved. Refreshing from API.",
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setWageState(toActionError(error));
    }
  }

  async function saveUnloaders() {
    const request = buildContainerUnloadersRequest(
      unloaderDrafts,
      "Container detail unloaders updated",
    );
    if (!request.ok) {
      setUnloaderState({
        code: null,
        message: request.error,
        status: "error",
      });
      return;
    }

    setUnloaderState({
      code: null,
      message: "Saving unloaders.",
      status: "running",
    });

    try {
      await updateContainerUnloaders(container.id, request.payload);
      setUnloaderState({
        code: null,
        message: "Saved. Refreshing from API.",
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setUnloaderState(toActionError(error));
    }
  }

  async function markCompleted() {
    const request = buildContainerUnloadingCompletionRequest(completionDraft);
    if (!request.ok) {
      setCompletionState({
        code: null,
        message: request.error,
        status: "error",
      });
      return;
    }

    setCompletionState({
      code: null,
      message: "Saving unloading completion.",
      status: "running",
    });

    try {
      await completeContainerUnloading(container.id, request.payload);
      setCompletionState({
        code: null,
        message: "Saved. Refreshing from API.",
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setCompletionState(toActionError(error));
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            拆柜工资信息
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            {wage?.payContainerNo ?? "未保存工资单元"}
          </p>
        </div>
        <span
          className={`inline-flex min-h-8 items-center border px-3 text-sm font-semibold ${completionBadgeStyles(
            wage?.status ?? null,
          )}`}
        >
          {completionStatusLabel(wage?.status ?? null)}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm md:grid-cols-4">
        <SummaryItem
          label="柜子标签"
          value={classificationLabel(wage?.classification ?? null)}
        />
        <SummaryItem
          label="金额规则"
          value={rateRuleLabel(wage?.classification ?? wageDraft.classification)}
        />
        <SummaryItem label="Trailer number" value={wage?.trailerNumber ?? "-"} />
        <SummaryItem
          label="拆柜人"
          value={wage ? String(wage.unloaders.length) : "-"}
        />
      </dl>

      {wage?.associatedContainers.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            关联柜号
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {wage.associatedContainers.map((item) => (
              <span
                className="border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm font-semibold text-zinc-800"
                key={item.id}
              >
                {item.containerNo}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 border-t border-zinc-100 pt-5">
        <div className="grid gap-3 lg:grid-cols-[220px_260px_minmax(0,1fr)]">
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            柜子标签
            <select
              className="min-h-11 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 focus:border-teal-700 focus:outline-none"
              onChange={(event) =>
                updateWageDraft(
                  "classification",
                  event.target.value as ContainerPayClassification,
                )
              }
              value={wageDraft.classification}
            >
              <option value="OCEAN_CONTAINER">海柜</option>
              <option value="US_TO_CANADA_TRANSFER">美转加</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            Trailer number
            <input
              className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 disabled:bg-zinc-100 disabled:text-zinc-500"
              disabled={!isTransfer}
              onChange={(event) =>
                updateWageDraft("trailerNumber", event.target.value)
              }
              placeholder={isTransfer ? "Required" : "Not required"}
              value={wageDraft.trailerNumber}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            关联柜号
            <textarea
              className="min-h-11 border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 disabled:bg-zinc-100 disabled:text-zinc-500"
              disabled={!isTransfer}
              onChange={(event) =>
                updateWageDraft("associatedContainerNosText", event.target.value)
              }
              placeholder={isTransfer ? "One or more container numbers" : "Not required"}
              value={wageDraft.associatedContainerNosText}
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            Audit note
            <input
              className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
              onChange={(event) => updateWageDraft("note", event.target.value)}
              value={wageDraft.note}
            />
          </label>
          <button
            className="min-h-11 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={wageState.status === "running"}
            onClick={() => void saveWage()}
            type="button"
          >
            保存工资信息
          </button>
        </div>
        <ActionMessage state={wageState} />
      </div>

      <div className="mt-6 border-t border-zinc-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-950">拆柜人</h3>
          <button
            className="min-h-9 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            onClick={() =>
              setUnloaderDrafts((current) => [
                ...current,
                emptyContainerUnloaderDraft(),
              ])
            }
            type="button"
          >
            增加拆柜人
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[620px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <th className="px-3 py-3 font-semibold">Worker name</th>
                <th className="px-3 py-3 font-semibold">Note</th>
                <th className="px-3 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {unloaderDrafts.map((unloader, index) => (
                <tr className="border-b border-zinc-100" key={index}>
                  <td className="px-3 py-3">
                    <input
                      className="min-h-10 w-full border border-zinc-300 px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                      onChange={(event) =>
                        updateUnloader(index, "workerName", event.target.value)
                      }
                      value={unloader.workerName}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      className="min-h-10 w-full border border-zinc-300 px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                      onChange={(event) =>
                        updateUnloader(index, "note", event.target.value)
                      }
                      value={unloader.note}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      className="min-h-9 border border-zinc-300 bg-white px-3 text-xs font-semibold uppercase text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                      disabled={unloaderDrafts.length === 1}
                      onClick={() =>
                        setUnloaderDrafts((current) =>
                          current.filter((_item, itemIndex) => itemIndex !== index),
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={unloaderState.status === "running"}
            onClick={() => void saveUnloaders()}
            type="button"
          >
            保存拆柜人
          </button>
          <ActionMessage state={unloaderState} />
        </div>
      </div>

      <div className="mt-6 border-t border-zinc-100 pt-5">
        <h3 className="text-sm font-semibold text-zinc-950">拆柜状态</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-[260px_minmax(0,1fr)_180px]">
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            已拆完时间
            <input
              className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
              onChange={(event) =>
                updateCompletion("completedAt", event.target.value)
              }
              type="datetime-local"
              value={completionDraft.completedAt}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            Completion note
            <input
              className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
              onChange={(event) => updateCompletion("note", event.target.value)}
              value={completionDraft.note}
            />
          </label>
          <button
            className="min-h-11 self-end border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={completionState.status === "running"}
            onClick={() => void markCompleted()}
            type="button"
          >
            标记已拆完
          </button>
        </div>
        <ActionMessage state={completionState} />
      </div>
    </section>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border-t border-zinc-100 pt-3">
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  const styles =
    state.status === "error"
      ? "border-red-200 bg-red-50 text-red-950"
      : state.status === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <div
      className={`mt-3 border px-3 py-2 text-sm ${styles}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      <p className="font-medium">{state.message}</p>
      {state.code ? (
        <p className="mt-1 text-xs font-semibold uppercase">{state.code}</p>
      ) : null}
    </div>
  );
}

function completionBadgeStyles(status: string | null): string {
  if (status === "COMPLETED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "SETTLED") {
    return "border-zinc-300 bg-zinc-100 text-zinc-800";
  }
  if (status === "NEEDS_REVIEW") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function toActionError(error: unknown): ActionState {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      status: "error",
    };
  }

  return {
    code: "UNLOADING_WAGE_SAVE_FAILED",
    message:
      error instanceof Error
        ? error.message
        : "Unloading wage information could not be saved.",
    status: "error",
  };
}
