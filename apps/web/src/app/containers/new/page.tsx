import Link from "next/link";
import { ManualContainerForm } from "@/components/containers/manual-container-form";
import { parserLearningErrorMessage } from "@/components/parser-learning/parser-learning-labels";
import {
  ApiClientError,
  getParserLearningCase,
  type ParserLearningCaseResponse,
} from "@/lib/api-client";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { getServerApiOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function NewContainerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const learningCaseId = firstQueryValue(params.learningCaseId);
  let learningCase: ParserLearningCaseResponse | null = null;
  let learningCaseError: string | null = null;
  if (learningCaseId) {
    try {
      learningCase = await getParserLearningCase(
        learningCaseId,
        await getServerApiOptions(),
      );
    } catch (error) {
      learningCaseError =
        error instanceof ApiClientError
          ? error.code
          : "PARSER_LEARNING_CASE_NOT_FOUND";
    }
  }
  const sourceImportId =
    learningCase?.sourceImportId ??
    (learningCaseId ? null : firstQueryValue(params.fromImport));
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Manual unloading report")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Create manual container")}
            </h1>
            {sourceImportId ? (
              <p className="mt-3 break-all text-sm text-zinc-600">
                {t("Source import:")}{" "}
                <Link
                  className="font-semibold text-teal-700 underline hover:text-teal-900"
                  href={`/imports/${sourceImportId}`}
                >
                  {sourceImportId}
                </Link>
              </p>
            ) : null}
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href="/containers"
          >
            {t("Containers")}
          </Link>
        </div>
      </section>

      {learningCaseError ? (
        <section
          className="border border-red-200 bg-red-50 p-5 text-red-950"
          role="alert"
        >
          <h2 className="font-semibold">
            {t("i18n.parserLearning.manualLinkUnavailable")}
          </h2>
          <p className="mt-2 text-sm">
            {parserLearningErrorMessage(learningCaseError, t)}
          </p>
          <Link
            className="mt-4 inline-flex min-h-10 items-center border border-red-300 bg-white px-3 text-sm font-semibold"
            href="/imports"
          >
            {t("Imports")}
          </Link>
        </section>
      ) : (
        <ManualContainerForm
          learningCaseId={learningCase?.id ?? null}
          sourceImportId={sourceImportId}
        />
      )}
    </main>
  );
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
