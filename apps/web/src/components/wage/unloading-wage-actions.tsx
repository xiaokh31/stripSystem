"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ApiClientError,
  completePayContainer,
  createPayContainer,
  generateUnloadingWageSettlement,
  type ContainerPayClassification,
  type PayAllocationMethod,
  type PayContainerResponse,
} from "@/lib/api-client";
import {
  buildCompletePayContainerRequest,
  buildCreatePayContainerRequest,
  defaultCompletedAtInput,
  emptyUnloaderDraft,
  type CompletePayContainerDraft,
  type CreatePayContainerDraft,
  type UnloaderDraft,
} from "./unloading-wage-flow";

interface ActionState {
  message: string;
  status: "error" | "idle" | "running" | "success";
}

const idleState: ActionState = { message: "", status: "idle" };

export function CreatePayContainerPanel({
  defaultClassification = "OCEAN_CONTAINER",
  defaultContainerIdsText = "",
  defaultTrailerNumber = "",
  title = "Create pay container",
}: {
  defaultClassification?: ContainerPayClassification;
  defaultContainerIdsText?: string;
  defaultTrailerNumber?: string;
  title?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CreatePayContainerDraft>({
    classification: defaultClassification,
    containerIdsText: defaultContainerIdsText,
    rateAmount: "",
    reason: "Pay container created from office review",
    trailerNumber: defaultTrailerNumber,
  });
  const [created, setCreated] = useState<PayContainerResponse | null>(null);
  const [state, setState] = useState<ActionState>(idleState);

  function update<K extends keyof CreatePayContainerDraft>(
    key: K,
    value: CreatePayContainerDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    const request = buildCreatePayContainerRequest(draft);
    if (!request.ok) {
      setState({ message: request.error, status: "error" });
      return;
    }

    setState({ message: "Creating pay container.", status: "running" });
    try {
      const result = await createPayContainer(request.payload);
      setCreated(result);
      setState({
        message: `Created ${result.payContainerNo}.`,
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setState({ message: apiErrorMessage(error), status: "error" });
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Classification</span>
          <select
            className="min-h-10 border border-zinc-300 bg-white px-3 text-sm"
            onChange={(event) =>
              update(
                "classification",
                event.target.value as ContainerPayClassification,
              )
            }
            value={draft.classification}
          >
            <option value="OCEAN_CONTAINER">Ocean container</option>
            <option value="US_TO_CANADA_TRANSFER">US-to-Canada transfer</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Trailer number</span>
          <input
            className="min-h-10 border border-zinc-300 px-3 text-sm"
            onChange={(event) => update("trailerNumber", event.target.value)}
            placeholder="Required for transfer"
            value={draft.trailerNumber}
          />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="font-semibold text-zinc-700">Container IDs</span>
          <textarea
            className="min-h-24 border border-zinc-300 px-3 py-2 text-sm"
            onChange={(event) => update("containerIdsText", event.target.value)}
            placeholder="Paste one or more container database ids"
            value={draft.containerIdsText}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Override rate</span>
          <input
            className="min-h-10 border border-zinc-300 px-3 text-sm"
            inputMode="decimal"
            onChange={(event) => update("rateAmount", event.target.value)}
            placeholder="Blank uses operational setting"
            value={draft.rateAmount}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Audit reason</span>
          <input
            className="min-h-10 border border-zinc-300 px-3 text-sm"
            onChange={(event) => update("reason", event.target.value)}
            value={draft.reason}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={state.status === "running"}
          onClick={() => void submit()}
          type="button"
        >
          Create pay container
        </button>
        <ActionMessage state={state} />
      </div>
      {created ? (
        <p className="mt-3 break-all border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Pay container id: {created.id}
        </p>
      ) : null}
    </section>
  );
}

export function CompletePayContainerPanel({
  defaultPayContainerId = "",
  title = "Complete unloading",
}: {
  defaultPayContainerId?: string;
  title?: string;
}) {
  const router = useRouter();
  const [payContainerId, setPayContainerId] = useState(defaultPayContainerId);
  const [draft, setDraft] = useState<CompletePayContainerDraft>({
    allocationMethod: "EQUAL_SPLIT",
    completedAt: defaultCompletedAtInput(),
    note: "",
    reason: "Unloading completed from office review",
    unloaders: [
      {
        ...emptyUnloaderDraft(),
      },
    ],
  });
  const [state, setState] = useState<ActionState>(idleState);

  function update<K extends keyof CompletePayContainerDraft>(
    key: K,
    value: CompletePayContainerDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateUnloader(
    index: number,
    key: keyof UnloaderDraft,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      unloaders: current.unloaders.map((unloader, unloaderIndex) =>
        unloaderIndex === index ? { ...unloader, [key]: value } : unloader,
      ),
    }));
  }

  async function submit() {
    const id = payContainerId.trim();
    if (!id) {
      setState({ message: "Pay container id is required.", status: "error" });
      return;
    }

    const request = buildCompletePayContainerRequest(draft);
    if (!request.ok) {
      setState({ message: request.error, status: "error" });
      return;
    }

    setState({ message: "Completing unloading.", status: "running" });
    try {
      const result = await completePayContainer(id, request.payload);
      setState({
        message: `${result.payContainerNo} marked completed.`,
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setState({ message: apiErrorMessage(error), status: "error" });
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Pay container id</span>
          <input
            className="min-h-10 border border-zinc-300 px-3 text-sm"
            onChange={(event) => setPayContainerId(event.target.value)}
            value={payContainerId}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Completed at</span>
          <input
            className="min-h-10 border border-zinc-300 px-3 text-sm"
            onChange={(event) => update("completedAt", event.target.value)}
            type="datetime-local"
            value={draft.completedAt}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Allocation method</span>
          <select
            className="min-h-10 border border-zinc-300 bg-white px-3 text-sm"
            onChange={(event) =>
              update("allocationMethod", event.target.value as PayAllocationMethod)
            }
            value={draft.allocationMethod}
          >
            <option value="EQUAL_SPLIT">Equal split</option>
            <option value="MANUAL_AMOUNT">Manual amount</option>
            <option value="MANUAL_PERCENT">Manual percent</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Audit reason</span>
          <input
            className="min-h-10 border border-zinc-300 px-3 text-sm"
            onChange={(event) => update("reason", event.target.value)}
            value={draft.reason}
          />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <th className="px-3 py-3 font-semibold">Worker code</th>
              <th className="px-3 py-3 font-semibold">Worker name</th>
              <th className="px-3 py-3 font-semibold">Amount</th>
              <th className="px-3 py-3 font-semibold">Percent</th>
              <th className="px-3 py-3 font-semibold">Note</th>
              <th className="px-3 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {draft.unloaders.map((unloader, index) => (
              <tr className="border-b border-zinc-100" key={index}>
                <td className="px-3 py-3">
                  <input
                    className="min-h-9 w-full border border-zinc-300 px-2 text-sm"
                    onChange={(event) =>
                      updateUnloader(index, "workerCode", event.target.value)
                    }
                    value={unloader.workerCode}
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    className="min-h-9 w-full border border-zinc-300 px-2 text-sm"
                    onChange={(event) =>
                      updateUnloader(index, "workerName", event.target.value)
                    }
                    value={unloader.workerName}
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    className="min-h-9 w-28 border border-zinc-300 px-2 text-sm"
                    inputMode="decimal"
                    onChange={(event) =>
                      updateUnloader(
                        index,
                        "allocationAmount",
                        event.target.value,
                      )
                    }
                    value={unloader.allocationAmount}
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    className="min-h-9 w-28 border border-zinc-300 px-2 text-sm"
                    inputMode="decimal"
                    onChange={(event) =>
                      updateUnloader(
                        index,
                        "allocationPercent",
                        event.target.value,
                      )
                    }
                    value={unloader.allocationPercent}
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    className="min-h-9 w-full border border-zinc-300 px-2 text-sm"
                    onChange={(event) =>
                      updateUnloader(index, "note", event.target.value)
                    }
                    value={unloader.note}
                  />
                </td>
                <td className="px-3 py-3">
                  <button
                    className="min-h-9 border border-zinc-300 bg-white px-3 text-xs font-semibold uppercase text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                    disabled={draft.unloaders.length === 1}
                    onClick={() =>
                      update(
                        "unloaders",
                        draft.unloaders.filter(
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
            ))}
          </tbody>
        </table>
      </div>

      <label className="mt-4 grid gap-1 text-sm">
        <span className="font-semibold text-zinc-700">Completion note</span>
        <textarea
          className="min-h-20 border border-zinc-300 px-3 py-2 text-sm"
          onChange={(event) => update("note", event.target.value)}
          value={draft.note}
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="min-h-10 border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
          onClick={() =>
            update("unloaders", [...draft.unloaders, emptyUnloaderDraft()])
          }
          type="button"
        >
          Add unloader
        </button>
        <button
          className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={state.status === "running"}
          onClick={() => void submit()}
          type="button"
        >
          Complete unloading
        </button>
        <ActionMessage state={state} />
      </div>
    </section>
  );
}

export function SettlementGeneratePanel({
  defaultSettlementMonth,
}: {
  defaultSettlementMonth: string;
}) {
  const router = useRouter();
  const [settlementMonth, setSettlementMonth] = useState(defaultSettlementMonth);
  const [state, setState] = useState<ActionState>(idleState);

  async function generate() {
    if (!/^\d{4}-\d{2}$/.test(settlementMonth)) {
      setState({
        message: "Settlement month must use YYYY-MM.",
        status: "error",
      });
      return;
    }

    setState({ message: "Generating unloading wage settlement.", status: "running" });
    try {
      const result = await generateUnloadingWageSettlement({ settlementMonth });
      setState({
        message: `Generated settlement ${result.id}.`,
        status: "success",
      });
      router.push(
        `/unloading-wage?settlementMonth=${encodeURIComponent(
          settlementMonth,
        )}&settlementId=${encodeURIComponent(result.id)}`,
      );
      router.refresh();
    } catch (error) {
      setState({ message: apiErrorMessage(error), status: "error" });
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        Generate monthly settlement
      </h2>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-zinc-700">Settlement month</span>
          <input
            className="min-h-10 border border-zinc-300 px-3 text-sm"
            onChange={(event) => setSettlementMonth(event.target.value)}
            type="month"
            value={settlementMonth}
          />
        </label>
        <button
          className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={state.status === "running"}
          onClick={() => void generate()}
          type="button"
        >
          Generate settlement
        </button>
        <ActionMessage state={state} />
      </div>
    </section>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  const styles =
    state.status === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : state.status === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <p className={`border px-3 py-2 text-sm ${styles}`} role="status">
      {state.message}
    </p>
  );
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}${error.status ? ` (${error.status})` : ""}: ${
      error.message
    }`;
  }

  return error instanceof Error ? error.message : "The request failed.";
}
