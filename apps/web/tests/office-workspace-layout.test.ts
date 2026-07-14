import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const officeMainSources = [
  "src/app/error.tsx",
  "src/app/not-found.tsx",
  "src/app/page.tsx",
  "src/app/imports/page.tsx",
  "src/app/imports/new/page.tsx",
  "src/app/imports/[id]/page.tsx",
  "src/app/containers/page.tsx",
  "src/app/containers/new/page.tsx",
  "src/app/containers/[id]/page.tsx",
  "src/app/containers/[id]/corrections/page.tsx",
  "src/app/reports/page.tsx",
  "src/app/reports/inventory/page.tsx",
  "src/app/load-jobs/page.tsx",
  "src/app/load-jobs/history/page.tsx",
  "src/app/work-hours/page.tsx",
  "src/app/unloading-wage/page.tsx",
  "src/app/unloading-summary/page.tsx",
  "src/app/settings/page.tsx",
  "src/components/admin/admin-page-shell.tsx",
  "src/components/layout/route-placeholder.tsx",
] as const;

const compactPageSources = [
  "src/app/login/page.tsx",
  "src/app/mobile/load-jobs/page.tsx",
  "src/app/mobile/load-jobs/history/page.tsx",
  "src/app/mobile/load-jobs/[id]/scan/page.tsx",
] as const;

test("authenticated office routes share the named 2048px workspace contract", () => {
  const globals = readSource("src/app/globals.css");

  assert.match(globals, /--office-main-content-max-width:\s*2048px;/);
  assert.match(globals, /\.office-main-content\s*{/);
  assert.match(
    globals,
    /max-width:\s*var\(--office-main-content-max-width\);/,
  );
  assert.match(
    globals,
    /\.office-main-content\s*>\s*\*,\s*\.office-main-content\s*>\s*\.grid\s*>\s*\*\s*{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/,
  );
  assert.doesNotMatch(globals, /\.max-w-7xl\s*{/);
  assert.doesNotMatch(globals, /1920px/);

  for (const sourcePath of officeMainSources) {
    const source = readSource(sourcePath);
    const mainCount = source.match(/<main\b/g)?.length ?? 0;
    const contractCount = source.match(/office-main-content/g)?.length ?? 0;

    assert.ok(mainCount > 0, `${sourcePath} must render an office main landmark`);
    assert.equal(
      contractCount,
      mainCount,
      `${sourcePath} must apply the shared workspace class to every main state`,
    );
    assert.doesNotMatch(
      source,
      /max-w-(?:7xl|\[(?:1600|1800|1920)px\])/,
      `${sourcePath} must not retain a legacy office width cap`,
    );
  }

  for (const adminRoute of [
    "src/app/admin/users/page.tsx",
    "src/app/admin/roles/page.tsx",
  ]) {
    assert.match(readSource(adminRoute), /<AdminPageShell\b/);
  }
});

test("login and web mobile scan routes remain outside the office workspace", () => {
  for (const sourcePath of compactPageSources) {
    assert.doesNotMatch(
      readSource(sourcePath),
      /office-main-content/,
      `${sourcePath} must retain its purpose-specific compact layout`,
    );
  }

  assert.match(readSource("src/app/login/page.tsx"), /max-w-7xl/);
  for (const sourcePath of compactPageSources.slice(1)) {
    assert.match(readSource(sourcePath), /max-w-4xl/);
  }
});

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}
