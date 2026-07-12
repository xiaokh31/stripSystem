"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  deleteImportFile,
  type ImportFileResponse,
} from "@/lib/api-client";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";

export function ImportDeleteButton({
  importFile,
}: {
  importFile: ImportFileResponse;
}) {
  const router = useRouter();
  const { format, locale, t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    const confirmed = window.confirm(
      format("i18n.imports.delete.confirm", {
        filename: importFile.originalFilename,
      }),
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
        t("Import deleted. Original and generated storage files were cleaned up."),
      );
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof ApiClientError
          ? importDeleteMessage(caught, locale, format, t)
          : t("The import could not be deleted.");
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
        {deleting ? t("Deleting...") : t("Delete")}
      </button>
      {error ? (
        <p className="text-left text-xs leading-5 text-red-700">{error}</p>
      ) : null}
    </>
  );
}

function importDeleteMessage(
  error: ApiClientError,
  locale: Locale,
  format: (key: MessageKey, params: Record<string, string | number>) => string,
  t: (key: MessageKey) => string,
): string {
  if (error.code === "IMPORT_DELETE_BLOCKED_IN_USE") {
    const blockerSummary = importDeleteBlockerSummary(error.details, locale, format);
    return blockerSummary
      ? format("i18n.imports.delete.blockers", { blockers: blockerSummary })
      : t("This import already has business records and cannot be deleted.");
  }
  if (error.code === "FORBIDDEN") {
    return t("This account does not have permission to delete imports.");
  }
  if (error.code === "IMPORT_DELETE_STORAGE_PATH_OUTSIDE_ROOT") {
    return t(
      "Import deletion was blocked because a storage path is outside the configured storage root.",
    );
  }

  return t("The import could not be deleted.");
}

function importDeleteBlockerSummary(
  details: unknown,
  locale: Locale,
  format: (key: MessageKey, params: Record<string, string | number>) => string,
): string | null {
  if (!details || typeof details !== "object") {
    return null;
  }

  const record = details as Record<string, unknown>;
  const entries: Array<[MessageKey, unknown]> = [
    ["i18n.imports.delete.blocker.loadJobs", record.loadJobCount],
    ["i18n.imports.delete.blocker.operationalPallets", record.operationalPalletCount],
    ["i18n.imports.delete.blocker.payContainers", record.payContainerCount],
  ];
  const localizedEntries = entries
    .map(([key, value]) =>
      typeof value === "number" && value > 0 ? format(key, { count: value }) : null,
    )
    .filter((value): value is string => value !== null);

  return localizedEntries.length > 0
    ? new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
        localizedEntries,
      )
    : null;
}
