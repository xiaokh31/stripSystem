import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("office shell has one responsive brand touchpoint per viewport", () => {
  const shell = readSource("src/components/layout/office-shell.tsx");

  assert.match(shell, /data-shell-brand="desktop-rail"/);
  assert.match(shell, /data-shell-brand="top"/);
  assert.match(shell, /currentUser \? "min-w-0 lg:hidden" : "min-w-0"/);
  assert.match(shell, /variant="onDark"/);
  assert.match(shell, /responsiveCompact/);
  assert.match(shell, /accessibleName="Bestar Service CCA"/);
  assert.doesNotMatch(shell, /<p[^>]*>\s*\{t\("Bestar Service CCA"\)\}/);
  assert.equal((shell.match(/<BrandLogo/g) ?? []).length, 2);
});

test("responsive logo geometry preserves full wordmark and native compact sizes", () => {
  const globals = readSource("src/app/globals.css");

  assert.match(
    globals,
    /\.shell-brand-logo-responsive\s*{[^}]*width:\s*228px;[^}]*height:\s*50px;[^}]*max-width:\s*none;/,
  );
  assert.match(
    globals,
    /@media\s*\(max-width:\s*359px\)\s*{[\s\S]*?\.shell-brand-logo-responsive\s*{[^}]*width:\s*64px;[^}]*height:\s*64px;/,
  );
});

test("login remains a compact authentication tool without a duplicate logo", () => {
  const login = readSource("src/app/login/page.tsx");

  assert.match(login, /max-w-md/);
  assert.match(login, /t\("Authentication"\)/);
  assert.match(login, /t\("Sign in"\)/);
  assert.match(login, /t\("Check API health"\)/);
  assert.doesNotMatch(login, /BrandLogo|data-shell-brand|images\/logos/);
});
