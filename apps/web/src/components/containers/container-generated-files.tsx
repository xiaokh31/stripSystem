"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ApiClientError,
  generateContainerLabels,
  generateContainerReport,
  getGeneratedFileDownloadUrl,
  type GeneratedFileResponse,
} from "@/lib/api-client";
import {
  formatFileSizeBytes,
  generatedFileTypeLabel,
  generationActionLabel,
  hasGeneratedLabelPdf,
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

const idleState: GenerationState = {
  action: null,
  code: null,
  file: null,
  message: "",
  status: "idle",
};

export function ContainerGeneratedFiles({
  containerId,
  initialFiles,
}: {
  containerId: string;
  initialFiles: GeneratedFileResponse[];
}) {
  const router = useRouter();
  const [generation, setGeneration] = useState<GenerationState>(idleState);
  const files = newestGeneratedFiles(initialFiles);
  const labelsAlreadyGenerated = hasGeneratedLabelPdf(files);
  const runningAction = generation.status === "running" ? generation.action : null;

  async function generate(action: GenerationAction) {
    if (runningAction) {
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

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Reports and labels
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Generated files are read from the API after each generation action.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-11 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={Boolean(runningAction)}
            onClick={() => void generate("report")}
            type="button"
          >
            {runningAction === "report" ? "Generating" : "Generate Excel Report"}
          </button>
          <button
            className="min-h-11 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={Boolean(runningAction)}
            onClick={() => void generate("labels")}
            type="button"
          >
            {runningAction === "labels" ? "Generating" : "Generate Label PDF"}
          </button>
        </div>
      </div>

      {labelsAlreadyGenerated ? (
        <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          A label PDF has already been generated for this container. Generating
          labels again can create duplicate operational documents, and the API
          may block the request if pallets already exist.
        </div>
      ) : null}

      {generation.status !== "idle" ? (
        <GenerationStatus containerId={containerId} generation={generation} />
      ) : null}

      <GeneratedFilesTable containerId={containerId} files={files} />
    </section>
  );
}

function GeneratedFilesTable({
  containerId,
  files,
}: {
  containerId: string;
  files: GeneratedFileResponse[];
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
                <StatusBadge status={file.status} />
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
        {generation.code ? `${generation.code}: ` : ""}
        {generation.message}
      </p>
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

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "GENERATED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "FAILED"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase ${styles}`}
    >
      {status}
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
      message: error.message,
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

function filenameFromStoragePath(storagePath: string): string {
  return storagePath.split(/[\\/]/).filter(Boolean).pop() ?? storagePath;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
