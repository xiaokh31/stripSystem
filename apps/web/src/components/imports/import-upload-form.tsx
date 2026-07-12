"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  uploadImportFile,
  type ImportFileResponse,
} from "@/lib/api-client";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { generatedOrImportStatusLabel } from "@/lib/i18n/status-labels";
import {
  buildUploadQueue,
  clampProgressPercent,
  classifyUploadFailure,
  formatFileSize,
  uploadStatusLabel,
  type UploadQueueItem,
} from "./import-upload-flow";

type UploadItemState = UploadQueueItem & {
  file: File;
  result?: ImportFileResponse;
};

export function ImportUploadForm() {
  const { format, locale, t } = useI18n();
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
      setFormError(t("Select at least one .xlsx file before uploading."));
      return;
    }

    if (validCount === 0) {
      setFormError(t("There are no valid .xlsx files to upload."));
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
                    : t("The file could not be uploaded."),
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
            {t("Excel files")}
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
            {t(
              "Only .xlsx files are accepted. Selecting files stages them locally; click upload to send them to the real import API.",
            )}
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
              {uploading
                ? t("Uploading")
                : format("i18n.imports.upload.button", { count: validCount })}
            </button>
            <button
              className="min-h-10 border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
              disabled={uploading || items.length === 0}
              onClick={handleClear}
              type="button"
            >
              {t("Clear")}
            </button>
          </div>

          {items.length ? (
            <p className="mt-4 text-xs font-medium text-zinc-600">
              {format("i18n.imports.upload.finished", {
                completed: completeCount,
                total: items.length,
              })}
            </p>
          ) : null}
        </div>

        <div className="p-5">
          {items.length === 0 ? (
            <div className="border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
              {t(
                "Selected files will appear here with upload progress and API results.",
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                    <th className="w-[30%] py-2 pr-4 font-semibold">{t("File")}</th>
                    <th className="w-[18%] py-2 pr-4 font-semibold">{t("Status")}</th>
                    <th className="w-[22%] py-2 pr-4 font-semibold">
                      {t("Progress")}
                    </th>
                    <th className="w-[30%] py-2 font-semibold">{t("Result")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <UploadRow
                      item={item}
                      key={item.id}
                      locale={locale}
                      t={t}
                    />
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

function UploadRow({
  item,
  locale,
  t,
}: {
  item: UploadItemState;
  locale: Locale;
  t: (key: MessageKey) => string;
}) {
  return (
    <tr className="border-b border-zinc-100 align-top last:border-0">
      <td className="py-3 pr-4">
        <p className="break-all font-medium text-zinc-950">{item.fileName}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatFileSize(item.fileSizeBytes)}
        </p>
      </td>
      <td className="py-3 pr-4">
        <StatusChip locale={locale} status={item.status} />
      </td>
      <td className="py-3 pr-4">
        <ProgressCell item={item} t={t} />
      </td>
      <td className="py-3">
        <ResultCell item={item} locale={locale} t={t} />
      </td>
    </tr>
  );
}

function StatusChip({
  locale,
  status,
}: {
  locale: Locale;
  status: UploadQueueItem["status"];
}) {
  const styles: Record<UploadQueueItem["status"], string> = {
    duplicate: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-800",
    invalid: "border-red-200 bg-red-50 text-red-800",
    queued: "border-zinc-200 bg-zinc-50 text-zinc-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    uploading: "border-cyan-200 bg-cyan-50 text-cyan-800",
  };

  return (
    <span
      className={`inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase ${styles[status]}`}
    >
      {uploadStatusLabel(status, locale)}
    </span>
  );
}

function ProgressCell({
  item,
  t,
}: {
  item: UploadItemState;
  t: (key: MessageKey) => string;
}) {
  if (item.status === "queued") {
    return <span className="text-xs text-zinc-500">{t("Not started")}</span>;
  }

  if (
    item.status === "invalid" ||
    item.status === "duplicate" ||
    item.status === "error"
  ) {
    return <span className="text-xs text-zinc-500">{t("Stopped")}</span>;
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
        {item.progressPercent === null ? t("Uploading") : `${percent}%`}
      </p>
    </div>
  );
}

function ResultCell({
  item,
  locale,
  t,
}: {
  item: UploadItemState;
  locale: Locale;
  t: (key: MessageKey) => string;
}) {
  if (item.result) {
    return (
      <div className="space-y-1">
        <p className="break-all text-xs text-zinc-600">
          {t("Import ID:")}{" "}
          <Link
            className="font-semibold text-teal-700 underline hover:text-teal-900"
            href={`/imports/${item.result.id}`}
          >
            {item.result.id}
          </Link>
        </p>
        <p className="text-xs text-zinc-600">
          {t("File name")}: {" "}
          <span className="font-medium text-zinc-950">
            {item.result.originalFilename}
          </span>
        </p>
        <p className="text-xs text-zinc-600">
          {t("Status")}: {" "}
          <span
            className="font-medium text-zinc-950"
            title={item.result.importStatus}
          >
            {generatedOrImportStatusLabel(item.result.importStatus, locale)}
          </span>
        </p>
        <p className="break-all text-xs text-zinc-600">
          {t("SHA-256")}: {" "}
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
        {item.errorCode ? (
          <p className="font-semibold" data-i18n-ignore>
            {item.errorCode}
          </p>
        ) : null}
        <p>{uploadFailureMessage(item, t)}</p>
        <p>
          {t("Existing import:")}{" "}
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
        {item.errorCode ? (
          <p className="font-semibold" data-i18n-ignore>
            {item.errorCode}
          </p>
        ) : null}
        <p>{uploadFailureMessage(item, t)}</p>
      </div>
    );
  }

  if (item.status === "queued") {
    return (
      <span className="text-xs text-zinc-500">{t("Click upload to start")}</span>
    );
  }

  return <span className="text-xs text-zinc-500">{t("Waiting")}</span>;
}

const uploadFailureMessageKeys: Record<string, MessageKey> = {
  API_NETWORK_ERROR: "The file could not be uploaded.",
  DUPLICATE_IMPORT: "A file with this SHA-256 already exists.",
  INVALID_FILE_TYPE: "Only .xlsx files can be uploaded.",
  UPLOAD_FAILED: "The file could not be uploaded.",
  UPLOAD_UNAVAILABLE: "File uploads must be started from a browser session.",
};

function uploadFailureMessage(
  item: UploadItemState,
  t: (key: MessageKey) => string,
): string {
  return t(
    item.errorCode && uploadFailureMessageKeys[item.errorCode]
      ? uploadFailureMessageKeys[item.errorCode]
      : "The file could not be uploaded.",
  );
}
