import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enMessages } from "../src/lib/i18n/locales/en";
import { zhMessages } from "../src/lib/i18n/locales/zh";

const componentSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/wage/attendance-import-deletion.tsx",
  ),
  "utf8",
);
const pageSource = readFileSync(
  resolve(process.cwd(), "src/app/work-hours/page.tsx"),
  "utf8",
);

test("attendance import deletion uses an accessible impact dialog and guarded reason mutation", () => {
  assert.match(componentSource, /role="dialog"/);
  assert.match(componentSource, /aria-modal="true"/);
  assert.match(componentSource, /getAttendanceImportDeletionImpact/);
  assert.match(componentSource, /normalizedReason\.length < 5/);
  assert.match(componentSource, /maxLength=\{500\}/);
  assert.match(componentSource, /status === "running"/);
  assert.match(componentSource, /disabled=\{[\s\S]*!impact/);
  assert.match(componentSource, /onClick=\{\(\) => setOpen\(false\)\}/);
  assert.doesNotMatch(componentSource, /window\.confirm/);
});

test("selected deletion clears employee selection while non-selected deletion preserves current search state", () => {
  assert.match(componentSource, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(componentSource, /if \(isSelected\)/);
  assert.match(componentSource, /params\.delete\("employeeKey"\)/);
  assert.match(componentSource, /result\.fallbackImport/);
  assert.match(componentSource, /router\.replace\(`\/work-hours/);
});

test("work hours renders permission-gated import commands, active fallback, and isolated immutable history", () => {
  assert.match(pageSource, /canDeleteAttendanceImports/);
  assert.match(pageSource, /requestedIsActive/);
  assert.match(pageSource, /staleRequestedImport/);
  assert.match(pageSource, /AttendanceImportDeletionHistory/);
  assert.match(pageSource, /getAttendanceImportDeletionHistory/);
  assert.doesNotMatch(
    pageSource.slice(
      pageSource.indexOf("function AttendanceImportDeletionHistory"),
      pageSource.indexOf("export default async function"),
    ),
    /download|GeneratedFileLink/i,
  );
});

test("attendance import deletion messages have strict English and Chinese catalog entries", () => {
  const keys = [
    "Delete attendance import",
    "i18n.workHours.deleteImportAria",
    "Loading deletion impact.",
    "Enter at least 5 characters for the deletion reason.",
    "Deleting attendance import.",
    "Remove this attendance import from active settlement?",
    "This batch will leave active settlement and downloads. The original workbook, parsed rows, generated files, jobs, and audit evidence remain preserved.",
    "Deleted attendance imports",
    "Attendance import deletion history could not be loaded",
    "Attendance import deleted and audit history recorded.",
    "This attendance import was deleted. Showing the next active import.",
  ] as const;
  for (const key of keys) {
    assert.equal(enMessages[key], key.startsWith("i18n.") ? enMessages[key] : key);
    assert.notEqual(zhMessages[key], enMessages[key]);
    assert.ok(zhMessages[key].trim());
  }
});
