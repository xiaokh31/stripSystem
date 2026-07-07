"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  completeContainerUnloading,
  createUnloadingWageWorker,
  saveContainerUnloadingWage,
  updateContainerUnloaders,
  updateContainerUnloadingWageAssociations,
  type ContainerDetailResponse,
  type ContainerPayClassification,
  type UnloadingWageWorkerResponse,
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

interface WorkerCreateDraft {
  displayName: string;
  note: string;
  phone: string;
  workerCode: string;
}

const emptyWorkerCreateDraft: WorkerCreateDraft = {
  displayName: "",
  note: "",
  phone: "",
  workerCode: "",
};

export function ContainerUnloadingWagePanel({
  canEdit,
  container,
  workerOptions,
  workerOptionsError,
}: {
  canEdit: boolean;
  container: ContainerDetailResponse;
  workerOptions: UnloadingWageWorkerResponse[];
  workerOptionsError: ApiClientError | null;
}) {
  const { locale } = useI18n();
  const router = useRouter();
  const [wageDraft, setWageDraft] = useState<ContainerUnloadingWageDraft>(() =>
    wageDraftFromContainer(container),
  );
  const [unloaderDrafts, setUnloaderDrafts] = useState<
    ContainerUnloaderDraft[]
  >(() => unloaderDraftsFromContainer(container));
  const [activeWorkers, setActiveWorkers] =
    useState<UnloadingWageWorkerResponse[]>(() => sortedWorkers(workerOptions));
  const [workerCreateDraft, setWorkerCreateDraft] = useState<WorkerCreateDraft>(
    emptyWorkerCreateDraft,
  );
  const [showWorkerCreate, setShowWorkerCreate] = useState(false);
  const [completionDraft, setCompletionDraft] =
    useState<ContainerUnloadingCompletionDraft>(() =>
      completionDraftFromContainer(container),
    );
  const [wageState, setWageState] = useState<ActionState>(idleState);
  const [unloaderState, setUnloaderState] = useState<ActionState>(idleState);
  const [workerCreateState, setWorkerCreateState] =
    useState<ActionState>(idleState);
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

  function selectUnloaderWorker(index: number, unloadingWorkerId: string) {
    const worker =
      activeWorkers.find((item) => item.id === unloadingWorkerId) ?? null;
    setUnloaderDrafts((current) =>
      current.map((unloader, unloaderIndex) =>
        unloaderIndex === index
          ? {
              ...unloader,
              unloadingWorkerId: worker?.id ?? null,
              workerCode: worker?.workerCode ?? "",
              workerName: worker?.displayName ?? "",
              workerUserId: null,
            }
          : unloader,
      ),
    );
  }

  function updateWorkerCreateDraft<K extends keyof WorkerCreateDraft>(
    key: K,
    value: WorkerCreateDraft[K],
  ) {
    setWorkerCreateDraft((current) => ({ ...current, [key]: value }));
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
    if (workerOptionsError) {
      setUnloaderState({
        code: workerOptionsError.code,
        message: "Worker directory could not be loaded.",
        status: "error",
      });
      return;
    }

    if (activeWorkers.length === 0) {
      setUnloaderState({
        code: null,
        message: "Create or load an active temporary unloader before saving.",
        status: "error",
      });
      return;
    }

    const missingWorker = unloaderDrafts.find(
      (unloader) =>
        unloader.unloadingWorkerId &&
        !activeWorkers.some(
          (worker) => worker.id === unloader.unloadingWorkerId,
        ),
    );
    if (missingWorker) {
      setUnloaderState({
        code: null,
        message:
          "Saved temporary unloader is inactive or unavailable. Select an active temporary worker before saving.",
        status: "error",
      });
      return;
    }

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

  async function createTemporaryWorker() {
    const displayName = workerCreateDraft.displayName.trim();
    if (!displayName) {
      setWorkerCreateState({
        code: null,
        message: "Temporary unloader name is required.",
        status: "error",
      });
      return;
    }

    setWorkerCreateState({
      code: null,
      message: "Creating temporary unloader.",
      status: "running",
    });

    try {
      const created = await createUnloadingWageWorker({
        displayName,
        note: nullableInput(workerCreateDraft.note),
        phone: nullableInput(workerCreateDraft.phone),
        workerCode: nullableInput(workerCreateDraft.workerCode),
      });
      setActiveWorkers((current) => sortedWorkers([...current, created]));
      setUnloaderDrafts((current) => {
        const createdDraft = draftFromWorker(created);
        const emptyIndex = current.findIndex(
          (unloader) =>
            !unloader.unloadingWorkerId &&
            !unloader.workerName &&
            !unloader.note,
        );
        if (emptyIndex >= 0) {
          return current.map((unloader, index) =>
            index === emptyIndex ? createdDraft : unloader,
          );
        }
        return [...current, createdDraft];
      });
      setWorkerCreateDraft(emptyWorkerCreateDraft);
      setWorkerCreateState({
        code: null,
        message: "Created and selected temporary unloader.",
        status: "success",
      });
      setShowWorkerCreate(false);
    } catch (error) {
      setWorkerCreateState(toActionError(error));
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
          {completionStatusLabel(wage?.status ?? null, locale)}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm md:grid-cols-4">
        <SummaryItem
          label="柜子标签"
          value={classificationLabel(wage?.classification ?? null, locale)}
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

      {wage?.unloaders.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            已保存拆柜人
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-[520px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <th className="px-3 py-2 font-semibold">Worker</th>
                  <th className="px-3 py-2 font-semibold">Code</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {wage.unloaders.map((unloader) => {
                  const activeWorker = unloader.unloadingWorkerId
                    ? activeWorkers.find(
                        (worker) => worker.id === unloader.unloadingWorkerId,
                      )
                    : null;
                  return (
                    <tr className="border-b border-zinc-100" key={unloader.id}>
                      <td className="px-3 py-2 font-semibold text-zinc-950">
                        {unloader.workerName}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {unloader.workerCode}
                      </td>
                      <td className="px-3 py-2">
                        <SnapshotBadge
                          isActiveDirectoryWorker={
                            Boolean(activeWorker) ||
                            (!canEdit && Boolean(unloader.unloadingWorkerId))
                          }
                          unloadingWorkerId={unloader.unloadingWorkerId}
                          workerUserId={unloader.workerUserId}
                        />
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {unloader.note ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <>
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
                  <option value="OCEAN_CONTAINER">
                    {classificationLabel("OCEAN_CONTAINER", locale)}
                  </option>
                  <option value="US_TO_CANADA_TRANSFER">
                    {classificationLabel("US_TO_CANADA_TRANSFER", locale)}
                  </option>
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
                    updateWageDraft(
                      "associatedContainerNosText",
                      event.target.value,
                    )
                  }
                  placeholder={
                    isTransfer ? "One or more container numbers" : "Not required"
                  }
                  value={wageDraft.associatedContainerNosText}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="grid gap-1 text-sm font-medium text-zinc-700">
                Audit note
                <input
                  className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                  onChange={(event) =>
                    updateWageDraft("note", event.target.value)
                  }
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
              <div className="flex flex-wrap gap-2">
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
                <button
                  className="min-h-9 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
                  onClick={() => {
                    setShowWorkerCreate((current) => !current);
                    setWorkerCreateState(idleState);
                  }}
                  type="button"
                >
                  新增临时拆柜工（无需登录账号）
                </button>
              </div>
            </div>
            {showWorkerCreate ? (
              <div className="mt-3 border border-zinc-200 bg-zinc-50 p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_minmax(0,1fr)]">
                  <label className="grid gap-1 text-sm font-medium text-zinc-700">
                    Name
                    <input
                      className="min-h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                      onChange={(event) =>
                        updateWorkerCreateDraft(
                          "displayName",
                          event.target.value,
                        )
                      }
                      value={workerCreateDraft.displayName}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-zinc-700">
                    Worker code
                    <input
                      className="min-h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                      onChange={(event) =>
                        updateWorkerCreateDraft(
                          "workerCode",
                          event.target.value,
                        )
                      }
                      placeholder="Auto if blank"
                      value={workerCreateDraft.workerCode}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-zinc-700">
                    Phone
                    <input
                      className="min-h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                      onChange={(event) =>
                        updateWorkerCreateDraft("phone", event.target.value)
                      }
                      value={workerCreateDraft.phone}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-zinc-700">
                    Note
                    <input
                      className="min-h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                      onChange={(event) =>
                        updateWorkerCreateDraft("note", event.target.value)
                      }
                      value={workerCreateDraft.note}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
                    disabled={workerCreateState.status === "running"}
                    onClick={() => void createTemporaryWorker()}
                    type="button"
                  >
                    新增并选择
                  </button>
                  <ActionMessage state={workerCreateState} />
                </div>
              </div>
            ) : null}
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[620px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                    <th className="px-3 py-3 font-semibold">Worker</th>
                    <th className="px-3 py-3 font-semibold">Note</th>
                    <th className="px-3 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {unloaderDrafts.map((unloader, index) => {
                    const selectedWorker = activeWorkers.find(
                      (worker) => worker.id === unloader.unloadingWorkerId,
                    );
                    const hasLegacyName =
                      !unloader.unloadingWorkerId &&
                      unloader.initialWorkerName;
                    const hasMissingWorker =
                      unloader.unloadingWorkerId && !selectedWorker;

                    return (
                      <tr className="border-b border-zinc-100" key={index}>
                        <td className="px-3 py-3">
                          <select
                            className="min-h-10 w-full border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-teal-700 focus:outline-none"
                            onChange={(event) =>
                              selectUnloaderWorker(index, event.target.value)
                            }
                            value={unloader.unloadingWorkerId ?? ""}
                          >
                            <option value="">Select temporary worker</option>
                            {hasMissingWorker ? (
                              <option value={unloader.unloadingWorkerId ?? ""}>
                                Saved worker inactive/unavailable:{" "}
                                {unloader.workerName}
                              </option>
                            ) : null}
                            {activeWorkers.map((worker) => (
                              <option key={worker.id} value={worker.id}>
                                {workerOptionLabel(worker)}
                              </option>
                            ))}
                          </select>
                          {hasLegacyName ? (
                            <p className="mt-2 border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950">
                              Legacy snapshot: {unloader.initialWorkerName}.
                              Select an active temporary worker before saving.
                            </p>
                          ) : null}
                          {hasMissingWorker ? (
                            <p className="mt-2 border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950">
                              Saved temporary worker is inactive or unavailable.
                              Select an active temporary worker before saving.
                            </p>
                          ) : null}
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
                                current.filter(
                                  (_item, itemIndex) => itemIndex !== index,
                                ),
                              )
                            }
                            type="button"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {workerOptionsError ? (
              <div
                className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950"
                role="alert"
              >
                <p className="font-medium">
                  Worker directory could not be loaded.
                </p>
                <p className="mt-1 text-xs font-semibold uppercase">
                  {workerOptionsError.code}
                </p>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
                disabled={
                  unloaderState.status === "running" || Boolean(workerOptionsError)
                }
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
                  onChange={(event) =>
                    updateCompletion("note", event.target.value)
                  }
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
        </>
      ) : (
        <PermissionRequiredPanel />
      )}
    </section>
  );
}

function PermissionRequiredPanel() {
  return (
    <div className="mt-6 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <h3 className="font-semibold">
        Warehouse manager permission required
      </h3>
      <p className="mt-2 leading-6">
        Ask an administrator for unloading_wage.classify,
        unloading_wage.complete, and corrections.create before editing
        container unloading wage information.
      </p>
    </div>
  );
}

function SnapshotBadge({
  isActiveDirectoryWorker,
  unloadingWorkerId,
  workerUserId,
}: {
  isActiveDirectoryWorker: boolean;
  unloadingWorkerId: string | null;
  workerUserId: string | null;
}) {
  if (unloadingWorkerId && isActiveDirectoryWorker) {
    return (
      <span className="inline-flex min-h-7 items-center border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800">
        Temporary directory
      </span>
    );
  }
  if (unloadingWorkerId) {
    return (
      <span className="inline-flex min-h-7 items-center border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-900">
        Inactive snapshot
      </span>
    );
  }
  if (workerUserId) {
    return (
      <span className="inline-flex min-h-7 items-center border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-900">
        Legacy user-backed
      </span>
    );
  }
  return (
    <span className="inline-flex min-h-7 items-center border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-900">
      Legacy snapshot
    </span>
  );
}

function workerOptionLabel(worker: UnloadingWageWorkerResponse): string {
  return [
    worker.displayName,
    worker.workerCode,
    worker.phone ? worker.phone : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function sortedWorkers(
  workers: UnloadingWageWorkerResponse[],
): UnloadingWageWorkerResponse[] {
  const byId = new Map<string, UnloadingWageWorkerResponse>();
  for (const worker of workers) {
    byId.set(worker.id, worker);
  }
  return [...byId.values()].sort((left, right) => {
    const nameDelta = left.displayName.localeCompare(right.displayName);
    return nameDelta || left.workerCode.localeCompare(right.workerCode);
  });
}

function draftFromWorker(
  worker: UnloadingWageWorkerResponse,
): ContainerUnloaderDraft {
  return {
    initialWorkerName: "",
    note: "",
    unloadingWorkerId: worker.id,
    workerCode: worker.workerCode,
    workerName: worker.displayName,
    workerUserId: null,
  };
}

function nullableInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
