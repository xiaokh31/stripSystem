"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  getImportParseResult,
  submitImportParseJob,
  type ImportFileResponse,
} from "@/lib/api-client";
import {
  asyncJobFailureMessage,
  waitForAsyncJob,
} from "@/lib/async-job-polling";
import {
  canTriggerParse,
  containerLinks,
  shouldOfferManualReportEntry,
  toParseResultSummary,
  type ParseResultSummaryData,
} from "./import-detail-flow";

interface ParseFailure {
  code: string;
  message: string;
  status: number;
}

export function ImportDetailActions({
  importFile,
  initialParseResult,
  manualReportHref,
}: {
  importFile: ImportFileResponse;
  initialParseResult: ParseResultSummaryData | null;
  manualReportHref: string;
}) {
  const router = useRouter();
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<ParseFailure | null>(null);
  const [parseJobId, setParseJobId] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResultSummaryData | null>(
    null,
  );

  const currentResult = parseResult ?? initialParseResult;
  const disabled = parsing || !canTriggerParse(importFile.parseStatus);
  const showManualEntry =
    parseError !== null ||
    (parseResult !== null &&
      shouldOfferManualReportEntry({
        parseResult,
        parseStatus: importFile.parseStatus,
      }));

  async function handleParse() {
    if (disabled) {
      return;
    }

    setParsing(true);
    setParseError(null);
    setParseJobId(null);
    setParseResult(null);

    try {
      const submitted = await submitImportParseJob(importFile.id);
      setParseJobId(submitted.id);
      const job = await waitForAsyncJob(submitted.id);
      if (job.status !== "succeeded") {
        setParseError({
          code: `ASYNC_JOB_${job.status.toUpperCase()}`,
          message: asyncJobFailureMessage(job),
          status: 0,
        });
        return;
      }

      const result = await getImportParseResult(importFile.id);
      setParseResult(toParseResultSummary(result));
      router.refresh();
    } catch (error) {
      setParseError(toParseFailure(error));
    } finally {
      setParsing(false);
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">Parse action</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Parse reads the preserved original Excel file through the API and saves
        the detected container data.
      </p>
      <button
        className="mt-4 min-h-11 w-full border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
        disabled={disabled}
        onClick={handleParse}
        type="button"
      >
        {parsing ? "Parsing" : "Parse file"}
      </button>

      {importFile.parseStatus === "PARSING" ? (
        <p className="mt-3 text-sm text-amber-800">
          The API currently reports this import as parsing.
        </p>
      ) : null}

      {parsing && parseJobId ? (
        <p className="mt-3 break-all text-xs font-medium text-zinc-500">
          {`Job ${parseJobId} submitted. Waiting for worker result.`}
        </p>
      ) : null}

      {parseError ? (
        <div
          className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          role="alert"
        >
          <p className="font-semibold">
            {parseError.code}
            {parseError.status ? ` (${parseError.status})` : ""}
          </p>
          <p className="mt-1">{parseError.message}</p>
        </div>
      ) : null}

      <ParseResultSummary parseResult={currentResult} compact />

      {showManualEntry ? (
        <ManualReportEntryPanel href={manualReportHref} compact />
      ) : null}
    </section>
  );
}

export function ParseResultSummary({
  compact = false,
  parseResult,
}: {
  compact?: boolean;
  parseResult: ParseResultSummaryData | null;
}) {
  const { locale } = useI18n();
  if (!parseResult) {
    return compact ? (
      <p className="mt-4 text-sm text-zinc-600">
        No parsed container is available yet.
      </p>
    ) : (
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-950">
          Parsed containers
        </h2>
        <p className="mt-3 text-sm text-zinc-600">
          No parsed container is available yet.
        </p>
      </section>
    );
  }

  const links = containerLinks(parseResult.containers, locale);

  const content =
    links.length > 0 ? (
      <ul className={compact ? "mt-4 space-y-2" : "mt-4 grid gap-2"}>
        {links.map((link) => (
          <li key={link.href}>
            <Link
              className="inline-flex min-h-10 items-center border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-900 hover:bg-teal-100"
              href={link.href}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-3 text-sm text-zinc-600">
        Parse result is available, but it contains no container records.
      </p>
    );

  if (compact) {
    return (
      <div className="mt-5 border-t border-zinc-100 pt-4">
        <p className="text-sm font-semibold text-zinc-950">Parsed containers</p>
        {content}
      </div>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">
        Parsed containers
      </h2>
      {content}
    </section>
  );
}

export function ManualReportEntryPanel({
  compact = false,
  href,
}: {
  compact?: boolean;
  href: string;
}) {
  return (
    <section
      className={
        compact
          ? "mt-4 border border-amber-200 bg-amber-50 p-3 text-amber-950"
          : "border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm"
      }
    >
      <h2
        className={
          compact ? "text-sm font-semibold" : "text-base font-semibold"
        }
      >
        Manual unloading report
      </h2>
      <p className="mt-2 text-sm leading-6">
        Create a manual unloading report when the customer workbook cannot be
        parsed into container records.
      </p>
      <Link
        className="mt-3 inline-flex min-h-10 items-center border border-amber-700 bg-white px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100"
        href={href}
      >
        Create manual unloading report
      </Link>
    </section>
  );
}

function toParseFailure(error: unknown): ParseFailure {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  return {
    code: "PARSE_FAILED",
    message: error instanceof Error ? error.message : "Parse failed.",
    status: 0,
  };
}
