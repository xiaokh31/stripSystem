"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  deleteImportFile,
  type ImportFileResponse,
} from "@/lib/api-client";
import { translateTextContent } from "@/lib/i18n/translator";

export function ImportDeleteButton({
  importFile,
}: {
  importFile: ImportFileResponse;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    const confirmed = window.confirm(
      translateTextContent(
        `Delete import "${importFile.originalFilename}" from active history? This permanently removes the original uploaded file and all related generated storage files. This action remains audited.`,
        locale,
      ),
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await deleteImportFile(importFile.id, {
        reason: "Deleted from imports page after office review.",
      });
      window.alert(
        translateTextContent(
          "Import deleted. Original and generated storage files were cleaned up.",
          locale,
        ),
      );
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof ApiClientError
          ? importDeleteMessage(caught)
          : caught instanceof Error
            ? caught.message
            : "The import could not be deleted.";
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        className="inline-flex min-h-9 w-full items-center justify-center border border-red-700 bg-white px-3 text-xs font-semibold uppercase text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400"
        disabled={deleting}
        onClick={onDelete}
        type="button"
      >
        {deleting ? "Deleting..." : "Delete"}
      </button>
      {error ? (
        <p className="text-left text-xs leading-5 text-red-700">{error}</p>
      ) : null}
    </>
  );
}

function importDeleteMessage(error: ApiClientError): string {
  if (error.code === "IMPORT_DELETE_BLOCKED_IN_USE") {
    const blockerSummary = importDeleteBlockerSummary(error.details);
    return blockerSummary
      ? `This import already has business records and cannot be deleted. Blockers: ${blockerSummary}.`
      : "This import already has business records and cannot be deleted.";
  }
  if (error.code === "FORBIDDEN") {
    return "This account does not have permission to delete imports.";
  }
  if (error.code === "IMPORT_DELETE_STORAGE_PATH_OUTSIDE_ROOT") {
    return "Import deletion was blocked because a storage path is outside the configured storage root.";
  }

  return error.message || "The import could not be deleted.";
}

function importDeleteBlockerSummary(details: unknown): string | null {
  if (!details || typeof details !== "object") {
    return null;
  }

  const record = details as Record<string, unknown>;
  const entries = [
    ["load jobs", record.loadJobCount],
    ["operational pallets", record.operationalPalletCount],
    ["pay containers", record.payContainerCount],
  ]
    .map(([label, value]) =>
      typeof value === "number" && value > 0 ? `${label} ${value}` : null,
    )
    .filter((value): value is string => value !== null);

  return entries.length > 0 ? entries.join(", ") : null;
}
