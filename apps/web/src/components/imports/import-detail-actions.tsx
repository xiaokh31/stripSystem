"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ApiClientError,
  parseImportFile,
  type ImportFileResponse,
} from "@/lib/api-client";
import {
  canTriggerParse,
  containerLinks,
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
}: {
  importFile: ImportFileResponse;
  initialParseResult: ParseResultSummaryData | null;
}) {
  const router = useRouter();
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<ParseFailure | null>(null);
  const [parseResult, setParseResult] =
    useState<ParseResultSummaryData | null>(null);

  const currentResult = parseResult ?? initialParseResult;
  const disabled = parsing || !canTriggerParse(importFile.parseStatus);

  async function handleParse() {
    if (disabled) {
      return;
    }

    setParsing(true);
    setParseError(null);
    setParseResult(null);

    try {
      const result = await parseImportFile(importFile.id);
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

  const links = containerLinks(parseResult.containers);

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
        <p className="text-sm font-semibold text-zinc-950">
          Parsed containers
        </p>
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
