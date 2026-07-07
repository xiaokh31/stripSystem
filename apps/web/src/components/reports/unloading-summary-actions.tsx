"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ApiClientError,
  exportUnloadingSummary,
  getUnloadingSummaryExportDownloadUrl,
  type UnloadingSummaryGeneratedFileResponse,
} from "@/lib/api-client";

interface ExportState {
  generatedFile: UnloadingSummaryGeneratedFileResponse | null;
  message: string;
  status: "error" | "idle" | "running" | "success";
}

const idleState: ExportState = {
  generatedFile: null,
  message: "",
  status: "idle",
};

export function UnloadingSummaryExportPanel({
  month,
}: {
  month: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<ExportState>(idleState);

  async function exportSummary() {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setState({
        generatedFile: null,
        message: "Summary month must use YYYY-MM.",
        status: "error",
      });
      return;
    }

    setState({
      generatedFile: null,
      message: "Exporting monthly unloading data summary.",
      status: "running",
    });
    try {
      const result = await exportUnloadingSummary({ month });
      setState({
        generatedFile: result.generatedFile,
        message: `Generated summary export ${result.generatedFile.id}.`,
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setState({
        generatedFile: null,
        message: apiErrorMessage(error),
        status: "error",
      });
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        Export monthly unloading data
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Generate an Excel workbook for office review from the selected month
        summary API.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex min-h-10 items-center justify-center border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={state.status === "running"}
          onClick={() => void exportSummary()}
          type="button"
        >
          Export Excel
        </button>
        <ExportMessage state={state} />
      </div>
      {state.generatedFile ? (
        <Link
          className="mt-4 inline-flex min-h-10 items-center border border-teal-800 bg-white px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
          href={getUnloadingSummaryExportDownloadUrl(state.generatedFile.id)}
        >
          Download generated summary
        </Link>
      ) : null}
    </section>
  );
}

function ExportMessage({ state }: { state: ExportState }) {
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
