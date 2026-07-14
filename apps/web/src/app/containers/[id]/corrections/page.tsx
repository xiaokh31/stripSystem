import Link from "next/link";
import {
  ApiClientError,
  getContainerDetail,
  listCorrections,
  type ContainerDetailResponse,
  type CorrectionFeedbackResponse,
} from "@/lib/api-client";
import { formatOperationalDateTime } from "@/lib/date-time";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { getServerApiOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type CorrectionHistoryState =
  | {
      container: ContainerDetailResponse;
      corrections: CorrectionFeedbackResponse[];
      ok: true;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function ContainerCorrectionHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getServerLocale();
  const { format, t } = createTranslator(locale);
  const state = await loadCorrectionHistory(id);

  if (!state.ok) {
    return <CorrectionHistoryError error={state.error} id={id} locale={locale} />;
  }

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Correction history")}
            </p>
            <h1 className="mt-2 break-all text-2xl font-semibold text-zinc-950">
              {state.container.containerNo}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              {t("Every row is loaded from persisted correction feedback records.")}
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
            href={`/containers/${state.container.id}`}
          >
            {t("Container detail")}
          </Link>
        </div>
      </section>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">
              {t("Modification records")}
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              {format("i18n.corrections.showing", {
                count: state.corrections.length,
              })}
            </p>
          </div>
        </div>

        {state.corrections.length === 0 ? (
          <p className="mt-5 border-t border-zinc-100 pt-4 text-sm text-zinc-600">
            {t("No correction records are currently stored for this container.")}
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[1080px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <th className="px-3 py-3 font-semibold">{t("Time")}</th>
                  <th className="px-3 py-3 font-semibold">{t("Target")}</th>
                  <th className="px-3 py-3 font-semibold">{t("Field")}</th>
                  <th className="px-3 py-3 font-semibold">{t("Old value")}</th>
                  <th className="px-3 py-3 font-semibold">{t("New value")}</th>
                  <th className="px-3 py-3 font-semibold">{t("Reason")}</th>
                  <th className="px-3 py-3 font-semibold">{t("Note")}</th>
                </tr>
              </thead>
              <tbody>
                {state.corrections.map((correction) => (
                  <tr className="border-b border-zinc-100" key={correction.id}>
                    <td className="px-3 py-4 align-top text-zinc-700">
                      {formatOperationalDateTime(correction.createdAt)}
                    </td>
                    <td className="px-3 py-4 align-top">
                      <p className="font-semibold text-zinc-950" data-i18n-ignore>
                        {correction.targetType}
                      </p>
                      <p className="mt-1 break-all text-xs text-zinc-500">
                        {targetId(correction)}
                      </p>
                    </td>
                    <td
                      className="px-3 py-4 align-top font-semibold text-zinc-950"
                      data-i18n-ignore
                    >
                      {correction.fieldName}
                    </td>
                    <td className="max-w-64 px-3 py-4 align-top">
                      <ValueBlock value={correction.oldValue} />
                    </td>
                    <td className="max-w-64 px-3 py-4 align-top">
                      <ValueBlock value={correction.newValue} />
                    </td>
                    <td className="max-w-56 px-3 py-4 align-top text-zinc-700">
                      {correction.reason ?? "-"}
                    </td>
                    <td className="max-w-56 px-3 py-4 align-top text-zinc-700">
                      {correction.note ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

async function loadCorrectionHistory(
  id: string,
): Promise<CorrectionHistoryState> {
  try {
    const apiOptions = await getServerApiOptions();
    const [container, correctionList] = await Promise.all([
      getContainerDetail(id, apiOptions),
      listCorrections({ containerId: id, limit: 100 }, apiOptions),
    ]);

    return {
      container,
      corrections: correctionList.items,
      ok: true,
    };
  } catch (error) {
    return { error: toApiClientError(error), ok: false };
  }
}

function ValueBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words border border-zinc-200 bg-zinc-50 p-2 text-xs leading-5 text-zinc-700">
      {formatCorrectionValue(value)}
    </pre>
  );
}

function formatCorrectionValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function targetId(correction: CorrectionFeedbackResponse): string {
  return (
    correction.containerDestinationId ??
    correction.containerLineId ??
    correction.containerId ??
    correction.importFileId ??
    correction.palletId ??
    correction.generatedFileId ??
    "-"
  );
}

function CorrectionHistoryError({
  error,
  id,
  locale,
}: {
  error: ApiClientError;
  id: string;
  locale: Locale;
}) {
  const { format, t } = createTranslator(locale);

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section
        className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-semibold uppercase" data-i18n-ignore>
          {error.code}
        </p>
        <h1 className="mt-2 text-xl font-semibold">
          {format("i18n.corrections.historyLoadError", { id })}
        </h1>
        <p className="mt-3 text-sm">
          {correctionHistoryErrorMessage(error, locale)}
        </p>
      </section>
      <Link
        className="inline-flex min-h-10 w-fit items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
        href={`/containers/${id}`}
      >
        {t("Container detail")}
      </Link>
    </main>
  );
}

const correctionHistoryErrorKeys: Record<string, MessageKey> = {
  API_NETWORK_ERROR: "Correction history could not be loaded.",
  WEB_CORRECTION_HISTORY_ERROR: "Correction history could not be loaded.",
};

function correctionHistoryErrorMessage(
  error: ApiClientError,
  locale: Locale,
): string {
  const { t } = createTranslator(locale);
  const knownKey = correctionHistoryErrorKeys[error.code];
  return t(knownKey ?? "Correction history could not be loaded.");
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "WEB_CORRECTION_HISTORY_ERROR",
    message:
      error instanceof Error ? error.message : "Correction history failed.",
    status: 0,
  });
}
