"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { ApiClientError, startParserLearningCase } from "@/lib/api-client";
import { parserLearningErrorMessage } from "./parser-learning-labels";

export function ParserLearningEntry({ importId }: { importId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [starting, setStarting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function openLearningCase() {
    if (starting) return;
    setStarting(true);
    setErrorCode(null);
    try {
      await startParserLearningCase(importId);
      router.push(`/imports/${encodeURIComponent(importId)}/parser-learning`);
    } catch (error) {
      setErrorCode(
        error instanceof ApiClientError
          ? error.code
          : "PARSER_LEARNING_START_FAILED",
      );
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mt-4 border border-teal-300 bg-teal-50 p-3 text-teal-950">
      <p className="text-sm font-semibold">
        {t("i18n.parserLearning.entryTitle")}
      </p>
      <p className="mt-1 text-sm leading-6">
        {t("i18n.parserLearning.entryDescription")}
      </p>
      <button
        className="mt-3 min-h-10 border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-950 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={starting}
        onClick={openLearningCase}
        type="button"
      >
        {starting
          ? t("i18n.parserLearning.starting")
          : t("i18n.parserLearning.openWizard")}
      </button>
      {errorCode ? (
        <p className="mt-2 text-sm text-red-800" role="alert">
          {parserLearningErrorMessage(errorCode, t)}
        </p>
      ) : null}
    </div>
  );
}
