"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ApiClientError,
  deleteImportFile,
  type ImportFileResponse,
} from "@/lib/api-client";

export function ImportDeleteButton({
  importFile,
}: {
  importFile: ImportFileResponse;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    const confirmed = window.confirm(
      `Delete import "${importFile.originalFilename}" from active history? The original uploaded file is preserved for audit.`,
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
    return "This import already has business records and cannot be deleted.";
  }
  if (error.code === "FORBIDDEN") {
    return "This account does not have permission to delete imports.";
  }

  return error.message || "The import could not be deleted.";
}
