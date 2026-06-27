import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUploadQueue,
  clampProgressPercent,
  classifyUploadFailure,
  formatFileSize,
  isAllowedXlsxFile,
} from "../src/components/imports/import-upload-flow";

test("upload flow accepts only xlsx files", () => {
  assert.equal(isAllowedXlsxFile({ name: "Unloading Plan.xlsx" }), true);
  assert.equal(isAllowedXlsxFile({ name: "BESTAR.XLSX" }), true);
  assert.equal(isAllowedXlsxFile({ name: "notes.xls" }), false);
  assert.equal(isAllowedXlsxFile({ name: "notes.csv" }), false);
});

test("upload queue marks invalid files without treating them as uploaded", () => {
  const queue = buildUploadQueue([
    { name: "plan-a.xlsx", size: 2048 },
    { name: "readme.txt", size: 10 },
  ]);

  assert.equal(queue.length, 2);
  assert.equal(queue[0]?.status, "queued");
  assert.equal(queue[0]?.progressPercent, 0);
  assert.equal(queue[1]?.status, "invalid");
  assert.equal(queue[1]?.errorCode, "INVALID_FILE_TYPE");
});

test("duplicate import errors expose existing import details", () => {
  const failure = classifyUploadFailure({
    code: "DUPLICATE_IMPORT",
    message: "A file with this SHA-256 already exists.",
    details: {
      existingImport: {
        id: "import-1",
        originalFilename: "Unloading Plan CSNU8877228.xlsx",
        fileSha256: "sha256",
        importStatus: "UPLOADED",
        parseStatus: "NOT_PARSED",
      },
    },
  });

  assert.equal(failure.status, "duplicate");
  assert.equal(failure.errorCode, "DUPLICATE_IMPORT");
  assert.equal(failure.existingImport?.id, "import-1");
});

test("progress and file size formatting stay stable for upload rows", () => {
  assert.equal(clampProgressPercent(-1), 0);
  assert.equal(clampProgressPercent(23.6), 24);
  assert.equal(clampProgressPercent(101), 100);
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(1536), "1.5 KB");
});
