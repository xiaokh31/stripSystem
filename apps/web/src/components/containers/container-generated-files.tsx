"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  getGeneratedFileDownloadUrl,
  reprintContainerLabels,
  submitContainerLabelsJob,
  submitContainerReportJob,
  type ContainerLabelReprintResponse,
  type GeneratedFileResponse,
} from "@/lib/api-client";
import {
  asyncJobFailureMessage,
  waitForAsyncJob,
} from "@/lib/async-job-polling";
import type { Locale } from "@/lib/i18n/catalog";
import { generatedOrImportStatusLabel } from "@/lib/i18n/status-labels";
import { formatOperationalDateTime } from "../../lib/date-time";
import {
  canShowLabelReprintAction,
  formatFileSizeBytes,
  containerOperationLockMessage,
  generationActionNotice,
  generatedFileTypeLabel,
  generationActionLabel,
  generationFailureMessage,
  labelReprintUnavailableMessage,
  isContainerOperationLocked,
  isDownloadableGeneratedFile,
  newestGeneratedFiles,
  type GenerationAction,
} from "./container-files-flow";

interface GenerationState {
  action: GenerationAction | null;
  code: string | null;
  file: GeneratedFileResponse | null;
  message: string;
  status: "error" | "idle" | "running" | "success";
}

interface ReprintState {
  code: string | null;
  message: string;
  response: ContainerLabelReprintResponse | null;
  status: "error" | "idle" | "running" | "success";
}

const idleState: GenerationState = {
  action: null,
  code: null,
  file: null,
  message: "",
  status: "idle",
};

const idleReprintState: ReprintState = {
  code: null,
  message: "",
  response: null,
  status: "idle",
};

export function ContainerGeneratedFiles({
  canReprintLabels,
  containerId,
  containerStatus,
  initialFiles,
}: {
  canReprintLabels: boolean;
  containerId: string;
  containerStatus: string;
  initialFiles: GeneratedFileResponse[];
}) {
  const { format, locale, t } = useI18n();
  const router = useRouter();
  const [generation, setGeneration] = useState<GenerationState>(idleState);
  const [reprint, setReprint] = useState<ReprintState>(idleReprintState);
  const [reprintReason, setReprintReason] = useState("");
  const files = newestGeneratedFiles(initialFiles);
  const runningAction =
    generation.status === "running" ? generation.action : null;
  const locked = isContainerOperationLocked(containerStatus);
  const lockedMessage = containerOperationLockMessage(containerStatus, locale);
  const latestLabelFile =
    files.find(
      (file) =>
        file.fileType === "PALLET_LABEL_PDF" && file.status === "GENERATED",
    ) ?? null;
  const showReprintAction = canShowLabelReprintAction(canReprintLabels, files);
  const reprintUnavailableMessage = labelReprintUnavailableMessage(
    canReprintLabels,
    files,
    locale,
  );

  async function generate(action: GenerationAction) {
    if (runningAction || locked) {
      return;
    }

    setGeneration({
      action,
      code: null,
      file: null,
      message: format("i18n.containers.generationRunning", {
        action: generationActionLabel(action, locale),
      }),
      status: "running",
    });

    try {
      const submitted =
        action === "report"
          ? await submitContainerReportJob(containerId)
          : await submitContainerLabelsJob(containerId);
      setGeneration({
        action,
        code: null,
        file: null,
        message: format("i18n.containers.generationSubmitted", {
          id: submitted.id,
        }),
        status: "running",
      });
      const job = await waitForAsyncJob(submitted.id);
      if (job.status !== "succeeded") {
        setGeneration({
          action,
          code: `ASYNC_JOB_${job.status.toUpperCase()}`,
          file: null,
          message: asyncJobFailureMessage(job),
          status: "error",
        });
        return;
      }
      setGeneration({
        action,
        code: null,
        file: null,
        message:
          action === "report"
            ? "Excel report generated. File history refreshed."
            : "Label PDF generated. File history refreshed.",
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setGeneration(toGenerationError(action, error, locale));
    }
  }

  async function reprintLabels() {
    const reason = reprintReason.trim();
    if (!showReprintAction || reprint.status === "running" || !reason) {
      return;
    }

    setReprint({
      code: null,
      message: t("Recording label reprint audit."),
      response: null,
      status: "running",
    });

    try {
      const response = await reprintContainerLabels(containerId, { reason });
      setReprint({
        code: null,
        message: format("i18n.containers.reprintRecorded", {
          count: response.eventCount,
        }),
        response,
        status: "success",
      });
      setReprintReason("");
      router.refresh();
    } catch (error) {
      setReprint(toReprintError(error, t));
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Reports and labels")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {t("Generate downloadable files from the current container data.")}
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-500">
            <li>{generationActionNotice("report", locale)}</li>
            <li>{generationActionNotice("labels", locale)}</li>
          </ul>
          {lockedMessage ? (
            <p className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
              {lockedMessage}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-11 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={Boolean(runningAction) || locked}
            onClick={() => void generate("report")}
            type="button"
          >
            {runningAction === "report"
              ? t("Generating")
              : t("Generate Excel Report")}
          </button>
          <button
            className="min-h-11 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={Boolean(runningAction) || locked}
            onClick={() => void generate("labels")}
            type="button"
          >
            {runningAction === "labels"
              ? t("Generating")
              : t("Generate Label PDF")}
          </button>
        </div>
      </div>

      {generation.status !== "idle" ? (
        <GenerationStatus containerId={containerId} generation={generation} />
      ) : null}

      {showReprintAction ? (
        <form
          className="mt-4 grid gap-3 border border-zinc-200 bg-zinc-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void reprintLabels();
          }}
        >
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">
              {t("Reprint label PDF")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              {t(
                "Records an audit event for every pallet label in this container. Inventory status, QR payloads, and label dimensions are not changed.",
              )}
            </p>
          </div>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            <span>{t("Reason")}</span>
            <textarea
              className="min-h-20 w-full border border-zinc-300 bg-white p-3 text-sm text-zinc-950 outline-none focus:border-teal-700 disabled:bg-zinc-100"
              disabled={reprint.status === "running"}
              maxLength={500}
              onChange={(event) => setReprintReason(event.target.value)}
              placeholder={t(
                "Damaged label, replacement print packet, printer issue...",
              )}
              required
              value={reprintReason}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="min-h-11 border border-amber-700 bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
              disabled={reprint.status === "running" || !reprintReason.trim()}
              type="submit"
            >
              {reprint.status === "running"
                ? t("Recording reprint")
                : t("Record reprint audit")}
            </button>
            {latestLabelFile && isDownloadableGeneratedFile(latestLabelFile) ? (
              <a
                className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-100"
                href={getGeneratedFileDownloadUrl(
                  containerId,
                  latestLabelFile.id,
                )}
              >
                {t("Download current label PDF")}
              </a>
            ) : null}
          </div>
        </form>
      ) : reprintUnavailableMessage ? (
        <p className="mt-4 border border-zinc-200 bg-zinc-50 p-3 text-sm font-medium text-zinc-600">
          {reprintUnavailableMessage}
        </p>
      ) : null}

      {reprint.status !== "idle" ? (
        <ReprintStatus
          containerId={containerId}
          latestLabelFile={latestLabelFile}
          reprint={reprint}
        />
      ) : null}

      <GeneratedFilesTable
        containerId={containerId}
        files={files}
        locale={locale}
      />
    </section>
  );
}

function GeneratedFilesTable({
  containerId,
  files,
  locale,
}: {
  containerId: string;
  files: GeneratedFileResponse[];
  locale: Locale;
}) {
  const { t } = useI18n();

  if (files.length === 0) {
    return (
      <p className="mt-5 border-t border-zinc-100 pt-4 text-sm text-zinc-600">
        {t("No generated files are recorded for this container yet.")}
      </p>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-[900px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <th className="px-3 py-3 font-semibold">{t("File")}</th>
            <th className="px-3 py-3 font-semibold">{t("Type")}</th>
            <th className="px-3 py-3 font-semibold">{t("Status")}</th>
            <th className="px-3 py-3 text-right font-semibold">{t("Size")}</th>
            <th className="px-3 py-3 font-semibold">{t("Created")}</th>
            <th className="px-3 py-3 font-semibold">{t("Download")}</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr className="border-b border-zinc-100" key={file.id}>
              <td className="max-w-72 px-3 py-4 align-top">
                <p className="break-all font-medium text-zinc-950">
                  {filenameFromStoragePath(file.storagePath)}
                </p>
                {file.errorMessage ? (
                  <p className="mt-1 text-xs text-red-700">
                    {t("Generation failed.")}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-4 align-top">
                {generatedFileTypeLabel(file.fileType, locale)}
              </td>
              <td className="px-3 py-4 align-top">
                <StatusBadge locale={locale} status={file.status} />
              </td>
              <td className="px-3 py-4 text-right align-top">
                {formatFileSizeBytes(file.fileSizeBytes)}
              </td>
              <td className="px-3 py-4 align-top">
                {formatDateTime(file.createdAt)}
              </td>
              <td className="px-3 py-4 align-top">
                {isDownloadableGeneratedFile(file) ? (
                  <a
                    className="inline-flex min-h-10 items-center border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-900 hover:bg-teal-100"
                    href={getGeneratedFileDownloadUrl(containerId, file.id)}
                  >
                    {t("Download")}
                  </a>
                ) : (
                  <span className="text-sm text-zinc-500">
                    {t("Unavailable")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GenerationStatus({
  containerId,
  generation,
}: {
  containerId: string;
  generation: GenerationState;
}) {
  const { t } = useI18n();
  const isError = generation.status === "error";

  return (
    <div
      className={`mt-4 border p-3 text-sm ${
        isError
          ? "border-red-200 bg-red-50 text-red-950"
          : "border-emerald-200 bg-emerald-50 text-emerald-950"
      }`}
      role={isError ? "alert" : "status"}
    >
      <p className="font-semibold">{generation.message}</p>
      {generation.code ? (
        <p className="mt-1 text-xs font-semibold uppercase" data-i18n-ignore>
          {generation.code}
        </p>
      ) : null}
      {generation.file && isDownloadableGeneratedFile(generation.file) ? (
        <a
          className="mt-2 inline-flex min-h-10 items-center border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
          href={getGeneratedFileDownloadUrl(containerId, generation.file.id)}
        >
          {t("Download generated file")}
        </a>
      ) : null}
    </div>
  );
}

function ReprintStatus({
  containerId,
  latestLabelFile,
  reprint,
}: {
  containerId: string;
  latestLabelFile: GeneratedFileResponse | null;
  reprint: ReprintState;
}) {
  const { format, t } = useI18n();
  const isError = reprint.status === "error";

  return (
    <div
      className={`mt-4 border p-3 text-sm ${
        isError
          ? "border-red-200 bg-red-50 text-red-950"
          : "border-emerald-200 bg-emerald-50 text-emerald-950"
      }`}
      role={isError ? "alert" : "status"}
    >
      <p className="font-semibold">{reprint.message}</p>
      {reprint.code ? (
        <p className="mt-1 text-xs font-semibold uppercase" data-i18n-ignore>
          {reprint.code}
        </p>
      ) : null}
      {reprint.response ? (
        <p className="mt-1">
          {format("i18n.containers.reprintAuditEvents", {
            count: reprint.response.eventCount,
          })}
        </p>
      ) : null}
      {latestLabelFile && isDownloadableGeneratedFile(latestLabelFile) ? (
        <a
          className="mt-2 inline-flex min-h-10 items-center border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
          href={getGeneratedFileDownloadUrl(containerId, latestLabelFile.id)}
        >
          {t("Download current label PDF")}
        </a>
      ) : null}
    </div>
  );
}

function StatusBadge({ locale, status }: { locale: Locale; status: string }) {
  const styles =
    status === "GENERATED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "FAILED"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase ${styles}`}
      title={generatedOrImportStatusLabel(status, locale)}
    >
      {generatedOrImportStatusLabel(status, locale)}
    </span>
  );
}

function toGenerationError(
  action: GenerationAction,
  error: unknown,
  locale: Locale,
): GenerationState {
  if (error instanceof ApiClientError) {
    return {
      action,
      code: error.code,
      file: generatedFileFromError(error.details),
      message: generationFailureMessage(action, error.code, error.message, locale),
      status: "error",
    };
  }

  return {
    action,
    code: "GENERATION_FAILED",
    file: null,
    message: generationFailureMessage(action, null, "", locale),
    status: "error",
  };
}

function generatedFileFromError(
  details: unknown,
): GeneratedFileResponse | null {
  if (!details || typeof details !== "object") {
    return null;
  }

  const generatedFile = (details as Record<string, unknown>).generatedFile;
  if (!generatedFile || typeof generatedFile !== "object") {
    return null;
  }

  return generatedFile as GeneratedFileResponse;
}

function toReprintError(
  error: unknown,
  t: (key: "Label reprint audit could not be recorded.") => string,
): ReprintState {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: t("Label reprint audit could not be recorded."),
      response: null,
      status: "error",
    };
  }

  return {
    code: "REPRINT_FAILED",
    message: t("Label reprint audit could not be recorded."),
    response: null,
    status: "error",
  };
}

function filenameFromStoragePath(storagePath: string): string {
  return storagePath.split(/[\\/]/).filter(Boolean).pop() ?? storagePath;
}

function formatDateTime(value: string): string {
  return formatOperationalDateTime(value);
}
