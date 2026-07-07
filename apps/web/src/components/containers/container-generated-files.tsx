"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  generateContainerLabels,
  generateContainerReport,
  getGeneratedFileDownloadUrl,
  reprintContainerLabels,
  type ContainerLabelReprintResponse,
  type GeneratedFileResponse,
} from "@/lib/api-client";
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
  const { locale } = useI18n();
  const router = useRouter();
  const [generation, setGeneration] = useState<GenerationState>(idleState);
  const [reprint, setReprint] = useState<ReprintState>(idleReprintState);
  const [reprintReason, setReprintReason] = useState("");
  const files = newestGeneratedFiles(initialFiles);
  const runningAction = generation.status === "running" ? generation.action : null;
  const locked = isContainerOperationLocked(containerStatus);
  const lockedMessage = containerOperationLockMessage(containerStatus);
  const latestLabelFile =
    files.find(
      (file) =>
        file.fileType === "PALLET_LABEL_PDF" && file.status === "GENERATED",
    ) ?? null;
  const showReprintAction = canShowLabelReprintAction(canReprintLabels, files);
  const reprintUnavailableMessage = labelReprintUnavailableMessage(
    canReprintLabels,
    files,
  );

  async function generate(action: GenerationAction) {
    if (runningAction || locked) {
      return;
    }

    setGeneration({
      action,
      code: null,
      file: null,
      message: `${generationActionLabel(action)} is running.`,
      status: "running",
    });

    try {
      const result =
        action === "report"
          ? await generateContainerReport(containerId)
          : await generateContainerLabels(containerId);
      setGeneration({
        action,
        code: null,
        file: result.generatedFile,
        message:
          action === "report"
            ? "Excel report generated."
            : "Label PDF generated.",
        status: "success",
      });
      router.refresh();
    } catch (error) {
      setGeneration(toGenerationError(action, error));
    }
  }

  async function reprintLabels() {
    const reason = reprintReason.trim();
    if (!showReprintAction || reprint.status === "running" || !reason) {
      return;
    }

    setReprint({
      code: null,
      message: "Recording label reprint audit.",
      response: null,
      status: "running",
    });

    try {
      const response = await reprintContainerLabels(containerId, { reason });
      setReprint({
        code: null,
        message: `Reprint audit recorded for ${response.eventCount} pallet label${response.eventCount === 1 ? "" : "s"}.`,
        response,
        status: "success",
      });
      setReprintReason("");
      router.refresh();
    } catch (error) {
      setReprint(toReprintError(error));
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Reports and labels
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Generate downloadable files from the current container data.
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-500">
            <li>{generationActionNotice("report")}</li>
            <li>{generationActionNotice("labels")}</li>
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
            {runningAction === "report" ? "Generating" : "Generate Excel Report"}
          </button>
          <button
            className="min-h-11 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={Boolean(runningAction) || locked}
            onClick={() => void generate("labels")}
            type="button"
          >
            {runningAction === "labels" ? "Generating" : "Generate Label PDF"}
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
              Reprint label PDF
            </h3>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Records an audit event for every pallet label in this container.
              Inventory status, QR payloads, and label dimensions are not
              changed.
            </p>
          </div>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            <span>Reason</span>
            <textarea
              className="min-h-20 w-full border border-zinc-300 bg-white p-3 text-sm text-zinc-950 outline-none focus:border-teal-700 disabled:bg-zinc-100"
              disabled={reprint.status === "running"}
              maxLength={500}
              onChange={(event) => setReprintReason(event.target.value)}
              placeholder="Damaged label, replacement print packet, printer issue..."
              required
              value={reprintReason}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="min-h-11 border border-amber-700 bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
              disabled={
                reprint.status === "running" || !reprintReason.trim()
              }
              type="submit"
            >
              {reprint.status === "running"
                ? "Recording reprint"
                : "Record reprint audit"}
            </button>
            {latestLabelFile && isDownloadableGeneratedFile(latestLabelFile) ? (
              <a
                className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-100"
                href={getGeneratedFileDownloadUrl(containerId, latestLabelFile.id)}
              >
                Download current label PDF
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
  if (files.length === 0) {
    return (
      <p className="mt-5 border-t border-zinc-100 pt-4 text-sm text-zinc-600">
        No generated files are recorded for this container yet.
      </p>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-[900px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <th className="px-3 py-3 font-semibold">File</th>
            <th className="px-3 py-3 font-semibold">Type</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 text-right font-semibold">Size</th>
            <th className="px-3 py-3 font-semibold">Created</th>
            <th className="px-3 py-3 font-semibold">Download</th>
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
                    {file.errorMessage}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-4 align-top">
                {generatedFileTypeLabel(file.fileType)}
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
                    Download
                  </a>
                ) : (
                  <span className="text-sm text-zinc-500">Unavailable</span>
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
      <p className="font-semibold">
        {generation.message}
      </p>
      {generation.code ? (
        <p className="mt-1 text-xs font-semibold uppercase">
          {generation.code}
        </p>
      ) : null}
      {generation.file && isDownloadableGeneratedFile(generation.file) ? (
        <a
          className="mt-2 inline-flex min-h-10 items-center border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
          href={getGeneratedFileDownloadUrl(containerId, generation.file.id)}
        >
          Download generated file
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
        <p className="mt-1 text-xs font-semibold uppercase">{reprint.code}</p>
      ) : null}
      {reprint.response ? (
        <p className="mt-1">
          Audit events: {reprint.response.eventCount}. Operator IDs are recorded
          by the API from the current signed-in user.
        </p>
      ) : null}
      {latestLabelFile && isDownloadableGeneratedFile(latestLabelFile) ? (
        <a
          className="mt-2 inline-flex min-h-10 items-center border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
          href={getGeneratedFileDownloadUrl(containerId, latestLabelFile.id)}
        >
          Download current label PDF
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
      title={status}
    >
      {generatedOrImportStatusLabel(status, locale)}
    </span>
  );
}

function toGenerationError(
  action: GenerationAction,
  error: unknown,
): GenerationState {
  if (error instanceof ApiClientError) {
    return {
      action,
      code: error.code,
      file: generatedFileFromError(error.details),
      message: generationFailureMessage(action, error.code, error.message),
      status: "error",
    };
  }

  return {
    action,
    code: "GENERATION_FAILED",
    file: null,
    message: error instanceof Error ? error.message : "Generation failed.",
    status: "error",
  };
}

function generatedFileFromError(details: unknown): GeneratedFileResponse | null {
  if (!details || typeof details !== "object") {
    return null;
  }

  const generatedFile = (details as Record<string, unknown>).generatedFile;
  if (!generatedFile || typeof generatedFile !== "object") {
    return null;
  }

  return generatedFile as GeneratedFileResponse;
}

function toReprintError(error: unknown): ReprintState {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: error.message,
      response: null,
      status: "error",
    };
  }

  return {
    code: "REPRINT_FAILED",
    message:
      error instanceof Error
        ? error.message
        : "Label reprint audit could not be recorded.",
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
