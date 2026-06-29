import test from "node:test";
import assert from "node:assert/strict";
import {
  containerOperationLockMessage,
  containerStatusLabel,
  formatFileSizeBytes,
  generationActionNotice,
  generationFailureMessage,
  generatedFileTypeLabel,
  hasGeneratedLabelPdf,
  isContainerOperationLocked,
  isDownloadableGeneratedFile,
  newestGeneratedFiles,
} from "../src/components/containers/container-files-flow";
import type { GeneratedFileResponse } from "../src/lib/api-client";

test("generated label PDFs are detected", () => {
  assert.equal(hasGeneratedLabelPdf([fileRecord()]), false);
  assert.equal(
    hasGeneratedLabelPdf([
      fileRecord({
        fileSha256: "sha",
        fileType: "PALLET_LABEL_PDF",
        status: "GENERATED",
      }),
    ]),
    true,
  );
});

test("only generated files with a sha are downloadable", () => {
  assert.equal(
    isDownloadableGeneratedFile(
      fileRecord({ fileSha256: "sha", status: "GENERATED" }),
    ),
    true,
  );
  assert.equal(
    isDownloadableGeneratedFile(
      fileRecord({ fileSha256: null, status: "FAILED" }),
    ),
    false,
  );
});

test("generated file labels and sizes are stable", () => {
  assert.equal(generatedFileTypeLabel("EXCEL_REPORT"), "Excel report");
  assert.equal(generatedFileTypeLabel("PALLET_LABEL_PDF"), "Label PDF");
  assert.equal(formatFileSizeBytes("1536"), "1.5 KB");
  assert.equal(formatFileSizeBytes(null), "-");
});

test("generation notices describe report overwrite and label rebuild behavior", () => {
  assert.match(generationActionNotice("report"), /latest saved database values/);
  assert.match(generationActionNotice("report"), /overwrites/);
  assert.match(generationActionNotice("labels"), /rebuilds unused/);
  assert.match(generationActionNotice("labels"), /loading or loaded containers are locked/);
});

test("label in-use conflicts explain why regeneration cannot overwrite", () => {
  assert.equal(
    generationFailureMessage(
      "labels",
      "PALLETS_ALREADY_IN_USE",
      "Existing pallets cannot be replaced.",
    ),
    "Existing pallets cannot be replaced. Existing pallets have already been assigned, loaded, or entered loading, so the label PDF and pallet records cannot be rebuilt.",
  );
  assert.equal(
    generationFailureMessage("report", "REPORT_FAILED", "Report failed."),
    "Report failed.",
  );
  assert.match(
    generationFailureMessage(
      "report",
      "CONTAINER_GENERATION_LOCKED",
      "Container is locked.",
    ),
    /scan correction workflow/,
  );
});

test("container lifecycle labels and operation locks are visible", () => {
  assert.equal(containerStatusLabel("CORRECTED"), "CORRECTED");
  assert.equal(containerStatusLabel("LABELS_GENERATED"), "LABELS_GENERATED");
  assert.equal(
    containerStatusLabel("LOADING_IN_PROGRESS"),
    "LOADING_IN_PROGRESS",
  );
  assert.equal(containerStatusLabel("LOADED"), "LOADED");
  assert.equal(isContainerOperationLocked("LABELS_GENERATED"), false);
  assert.equal(isContainerOperationLocked("LOADING_IN_PROGRESS"), true);
  assert.match(containerOperationLockMessage("LOADED"), /archived/);
});

test("generated files sort newest first", () => {
  const sorted = newestGeneratedFiles([
    fileRecord({ id: "old", createdAt: "2026-06-27T00:00:00.000Z" }),
    fileRecord({ id: "new", createdAt: "2026-06-28T00:00:00.000Z" }),
  ]);

  assert.deepEqual(
    sorted.map((file) => file.id),
    ["new", "old"],
  );
});

function fileRecord(
  overrides: Partial<GeneratedFileResponse> = {},
): GeneratedFileResponse {
  return {
    containerId: "container-1",
    createdAt: "2026-06-27T00:00:00.000Z",
    errorMessage: null,
    fileSha256: "sha",
    fileSizeBytes: "100",
    fileType: "EXCEL_REPORT",
    id: "generated-file-1",
    importFileId: "import-1",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    status: "GENERATED",
    storagePath: "/storage/reports/CSNU8877228.xlsx",
    updatedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}
