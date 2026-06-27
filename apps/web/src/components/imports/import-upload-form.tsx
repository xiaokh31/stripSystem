"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ApiClientError,
  uploadImportFile,
  type ImportFileResponse,
} from "@/lib/api-client";
import {
  buildUploadQueue,
  clampProgressPercent,
  classifyUploadFailure,
  formatFileSize,
  type UploadQueueItem,
} from "./import-upload-flow";

type UploadItemState = UploadQueueItem & {
  file: File;
  result?: ImportFileResponse;
};

export function ImportUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItemState[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const validCount = items.filter((item) => item.status !== "invalid").length;
  const completeCount = items.filter(
    (item) =>
      item.status === "success" ||
      item.status === "duplicate" ||
      item.status === "error" ||
      item.status === "invalid",
  ).length;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const queue = buildUploadQueue(files);
    setItems(
      queue.map((item, index) => ({
        ...item,
        file: files[index],
      })),
    );
    setFormError(null);
  }

  async function handleUpload() {
    if (uploading) {
      return;
    }

    if (items.length === 0) {
      setFormError("Select at least one .xlsx file before uploading.");
      return;
    }

    if (validCount === 0) {
      setFormError("There are no valid .xlsx files to upload.");
      return;
    }

    setUploading(true);
    setFormError(null);

    for (const item of items) {
      if (item.status === "invalid") {
        continue;
      }

      updateItem(item.id, { status: "uploading", progressPercent: 0 });

      try {
        const result = await uploadImportFile(item.file, {
          onProgress: ({ percent }) => {
            updateItem(item.id, {
              progressPercent:
                percent === null ? null : clampProgressPercent(percent),
            });
          },
        });

        updateItem(item.id, {
          progressPercent: 100,
          result,
          status: "success",
        });
      } catch (error) {
        const failure =
          error instanceof ApiClientError
            ? classifyUploadFailure(error)
            : classifyUploadFailure({
                code: "UPLOAD_FAILED",
                message:
                  error instanceof Error
                    ? error.message
                    : "The file could not be uploaded.",
              });

        updateItem(item.id, {
          ...failure,
          progressPercent: null,
        });
      }
    }

    setUploading(false);
  }

  function handleClear() {
    if (uploading) {
      return;
    }

    setItems([]);
    setFormError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function updateItem(id: string, patch: Partial<UploadItemState>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  return (
    <section className="border border-zinc-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-zinc-200 p-5 lg:border-r lg:border-b-0">
          <label
            className="block text-sm font-semibold text-zinc-950"
            htmlFor="import-files"
          >
            Excel files
          </label>
          <input
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-3 block w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 file:mr-3 file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-zinc-200"
            disabled={uploading}
            id="import-files"
            multiple
            onChange={handleFileChange}
            ref={inputRef}
            type="file"
          />
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            Only .xlsx files are accepted. Selecting files stages them locally;
            click upload to send them to the real import API.
          </p>

          {formError ? (
            <div
              className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              role="alert"
            >
              {formError}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="min-h-10 border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
              disabled={uploading || validCount === 0}
              onClick={handleUpload}
              type="button"
            >
              {uploading ? "Uploading" : uploadButtonLabel(validCount)}
            </button>
            <button
              className="min-h-10 border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
              disabled={uploading || items.length === 0}
              onClick={handleClear}
              type="button"
            >
              Clear
            </button>
          </div>

          {items.length ? (
            <p className="mt-4 text-xs font-medium text-zinc-600">
              {completeCount} of {items.length} files finished. Ready files
              have not been sent until upload starts.
            </p>
          ) : null}
        </div>

        <div className="p-5">
          {items.length === 0 ? (
            <div className="border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
              Selected files will appear here with upload progress and API
              results.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                    <th className="w-[30%] py-2 pr-4 font-semibold">File</th>
                    <th className="w-[18%] py-2 pr-4 font-semibold">Status</th>
                    <th className="w-[22%] py-2 pr-4 font-semibold">
                      Progress
                    </th>
                    <th className="w-[30%] py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <UploadRow item={item} key={item.id} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function UploadRow({ item }: { item: UploadItemState }) {
  return (
    <tr className="border-b border-zinc-100 align-top last:border-0">
      <td className="py-3 pr-4">
        <p className="break-all font-medium text-zinc-950">{item.fileName}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatFileSize(item.fileSizeBytes)}
        </p>
      </td>
      <td className="py-3 pr-4">
        <StatusChip status={item.status} />
      </td>
      <td className="py-3 pr-4">
        <ProgressCell item={item} />
      </td>
      <td className="py-3">
        <ResultCell item={item} />
      </td>
    </tr>
  );
}

function StatusChip({ status }: { status: UploadQueueItem["status"] }) {
  const styles: Record<UploadQueueItem["status"], string> = {
    duplicate: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-800",
    invalid: "border-red-200 bg-red-50 text-red-800",
    queued: "border-zinc-200 bg-zinc-50 text-zinc-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    uploading: "border-cyan-200 bg-cyan-50 text-cyan-800",
  };
  const labels: Record<UploadQueueItem["status"], string> = {
    duplicate: "duplicate",
    error: "error",
    invalid: "invalid",
    queued: "ready",
    success: "success",
    uploading: "uploading",
  };

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function ProgressCell({ item }: { item: UploadItemState }) {
  if (item.status === "queued") {
    return <span className="text-xs text-zinc-500">Not started</span>;
  }

  if (
    item.status === "invalid" ||
    item.status === "duplicate" ||
    item.status === "error"
  ) {
    return <span className="text-xs text-zinc-500">Stopped</span>;
  }

  const percent = item.progressPercent ?? 0;

  return (
    <div>
      <div className="h-2 w-full min-w-32 bg-zinc-100">
        <div
          className="h-2 bg-teal-600 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {item.progressPercent === null ? "Uploading" : `${percent}%`}
      </p>
    </div>
  );
}

function ResultCell({ item }: { item: UploadItemState }) {
  if (item.result) {
    return (
      <div className="space-y-1">
        <p className="break-all text-xs text-zinc-600">
          Import ID:{" "}
          <Link
            className="font-semibold text-teal-700 underline hover:text-teal-900"
            href={`/imports/${item.result.id}`}
          >
            {item.result.id}
          </Link>
        </p>
        <p className="text-xs text-zinc-600">
          Filename:{" "}
          <span className="font-medium text-zinc-950">
            {item.result.originalFilename}
          </span>
        </p>
        <p className="text-xs text-zinc-600">
          Status:{" "}
          <span className="font-medium text-zinc-950">
            {item.result.importStatus}
          </span>
        </p>
        <p className="break-all text-xs text-zinc-600">
          SHA-256:{" "}
          <span className="font-medium text-zinc-950">
            {item.result.fileSha256}
          </span>
        </p>
      </div>
    );
  }

  if (item.existingImport) {
    return (
      <div className="space-y-1 text-xs text-amber-900">
        <p className="font-semibold">{item.errorCode}</p>
        <p>{item.errorMessage}</p>
        <p>
          Existing import:{" "}
          <Link
            className="font-semibold underline hover:text-amber-950"
            href={`/imports/${item.existingImport.id}`}
          >
            {item.existingImport.originalFilename}
          </Link>
        </p>
      </div>
    );
  }

  if (item.errorMessage) {
    return (
      <div className="space-y-1 text-xs text-red-900">
        <p className="font-semibold">{item.errorCode}</p>
        <p>{item.errorMessage}</p>
      </div>
    );
  }

  if (item.status === "queued") {
    return (
      <span className="text-xs text-zinc-500">Click upload to start</span>
    );
  }

  return <span className="text-xs text-zinc-500">Waiting</span>;
}

function uploadButtonLabel(validCount: number): string {
  if (validCount <= 1) {
    return "Upload file";
  }

  return `Upload ${validCount} files`;
}
