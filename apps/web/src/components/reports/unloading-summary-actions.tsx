"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  exportUnloadingSummary,
  getUnloadingSummaryExportDownloadUrl,
  type UnloadingSummaryAvailableMonthResponse,
  type UnloadingSummaryGeneratedFileResponse,
} from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/catalog";
import { createTranslator } from "@/lib/i18n/translator";
import { unloadingSummaryHref } from "./unloading-summary-flow";

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
  availableMonths,
  month,
  rowCount,
}: {
  availableMonths: UnloadingSummaryAvailableMonthResponse[];
  month: string;
  rowCount: number;
}) {
  const { format, locale, t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<ExportState>(idleState);

  async function exportSummary() {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setState({
        generatedFile: null,
        message: t("Summary month must use YYYY-MM."),
        status: "error",
      });
      return;
    }
    if (rowCount === 0) {
      setState({
        generatedFile: null,
        message:
          t(
            "Selected month has no summary rows. Choose an available completed month before exporting.",
          ),
        status: "error",
      });
      return;
    }

    setState({
      generatedFile: null,
      message: t("Exporting monthly unloading data summary."),
      status: "running",
    });
    try {
      const result = await exportUnloadingSummary({ month });
      setState({
        generatedFile: result.generatedFile,
        message: format("i18n.unloadingSummary.generatedExport", {
          id: result.generatedFile.id,
        }),
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setState({
        generatedFile: null,
        message: apiErrorMessage(error, locale),
        status: "error",
      });
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        {t("Export monthly unloading data")}
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        {t(
          "Generate an Excel workbook for office review from the selected month summary API.",
        )}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex min-h-10 items-center justify-center border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={state.status === "running" || rowCount === 0}
          onClick={() => void exportSummary()}
          type="button"
        >
          {t("Export Excel")}
        </button>
        <ExportMessage state={state} />
      </div>
      {state.generatedFile ? (
        <Link
          className="mt-4 inline-flex min-h-10 items-center border border-teal-800 bg-white px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
          href={getUnloadingSummaryExportDownloadUrl(state.generatedFile.id)}
        >
          {t("Download generated summary")}
        </Link>
      ) : null}
      {rowCount === 0 ? (
        <EmptyMonthExportHint availableMonths={availableMonths} />
      ) : null}
    </section>
  );
}

function EmptyMonthExportHint({
  availableMonths,
}: {
  availableMonths: UnloadingSummaryAvailableMonthResponse[];
}) {
  const { t } = useI18n();

  return (
    <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">{t("Export is disabled for empty months.")}</p>
      <p className="mt-1 leading-6">
        {t(
          "Pick a month with completed unloading rows before generating a workbook.",
        )}
      </p>
      {availableMonths.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {availableMonths.slice(0, 4).map((availableMonth) => (
            <Link
              className="inline-flex min-h-8 items-center border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-950 hover:bg-amber-100"
              href={unloadingSummaryHref(availableMonth.month)}
              key={availableMonth.month}
            >
              {availableMonth.month}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
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

function apiErrorMessage(
  error: unknown,
  locale: Locale,
): string {
  const { t } = createTranslator(locale);
  const messages = {
    UNLOADING_SUMMARY_EXPORT_FAILED:
      "Monthly unloading summary export could not be generated.",
    UNLOADING_SUMMARY_NO_ROWS_FOR_MONTH:
      "Selected month has no summary rows. Choose an available completed month before exporting.",
  } as const;

  if (error instanceof ApiClientError) {
    return t(
      messages[error.code as keyof typeof messages] ?? "The request failed.",
    );
  }

  return t("The request failed.");
}
