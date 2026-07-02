import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { LOCALE_MESSAGES } from "../src/lib/i18n/catalog";
import { enMessages } from "../src/lib/i18n/locales/en";
import { zhMessages } from "../src/lib/i18n/locales/zh";
import {
  normalizeLocale,
  translateMessage,
  translateTextContent,
} from "../src/lib/i18n/translator";

test("normalizes supported and browser zh locales", () => {
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("zh-CN"), "zh-CN");
  assert.equal(normalizeLocale("zh-Hans-CA"), "zh-CN");
  assert.equal(normalizeLocale("fr-CA"), "en");
});

test("locale files expose the same managed message keys", () => {
  assert.deepEqual(Object.keys(zhMessages).sort(), Object.keys(enMessages).sort());
  assert.equal(LOCALE_MESSAGES.en, enMessages);
  assert.equal(LOCALE_MESSAGES["zh-CN"], zhMessages);
});

test("Chinese locale does not silently fall back to English for translatable copy", () => {
  const allowedSameText = new Set([
    "0 B",
    "Bestar Service CCA",
    "English",
    "P5 Pilot Ready",
    "中文",
  ]);
  const untranslated = Object.keys(enMessages).filter(
    (key) =>
      enMessages[key as keyof typeof enMessages] ===
        zhMessages[key as keyof typeof zhMessages] &&
      !allowedSameText.has(key),
  );

  assert.deepEqual(untranslated, []);
});

test("translates exact UI strings between locale resources", () => {
  assert.equal(translateTextContent("Dashboard", "zh-CN"), "仪表盘");
  assert.equal(translateTextContent("Generate Label PDF", "zh-CN"), "生成托盘面单 PDF");
  assert.equal(translateTextContent("Mobile Scan", "zh-CN"), "移动扫码");
  assert.equal(translateTextContent("移动扫码", "en"), "Mobile Scan");
});

test("preserves surrounding whitespace when translating text nodes", () => {
  assert.equal(translateTextContent("  Load Jobs\n", "zh-CN"), "  装车任务\n");
});

test("translates dynamic count and login text patterns", () => {
  assert.equal(translateTextContent("1 pallet", "zh-CN"), "1 托");
  assert.equal(translateTextContent("12 pallets", "zh-CN"), "12 托");
  assert.equal(
    translateTextContent("Signed in as user@example.com.", "zh-CN"),
    "当前登录：user@example.com。",
  );
});

test("restores Chinese exact translations by shared message key", () => {
  assert.equal(translateTextContent("仪表盘", "en"), "Dashboard");
  assert.equal(translateTextContent("移动扫码", "en"), "Mobile Scan");
});

test("all extracted UI display strings are managed by the English locale file", () => {
  const unmanaged = extractUiStrings().filter(
    (value) => translateMessage(value, "en") === null,
  );

  assert.deepEqual(unmanaged, []);
});

function extractUiStrings(): string[] {
  const roots = ["src/app", "src/components"].map((root) =>
    path.join(process.cwd(), root),
  );
  const files = roots.flatMap((root) => listSourceFiles(root));
  const strings = new Set<string>();

  for (const file of files) {
    const sourceText = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    collectUiStrings(sourceFile, sourceFile, strings);
  }

  return Array.from(strings).sort();
}

function listSourceFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

const TRANSLATABLE_ATTRIBUTES = new Set([
  "aria-label",
  "placeholder",
  "title",
  "alt",
]);

const TRANSLATABLE_PROPERTY_NAMES = new Set([
  "description",
  "emptyText",
  "error",
  "fallback",
  "label",
  "message",
  "placeholder",
  "successText",
  "title",
]);

function collectUiStrings(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  strings: Set<string>,
): void {
  if (ts.isJsxText(node)) {
    addCandidate(node.getText(sourceFile), strings);
  }

  if (
    ts.isJsxAttribute(node) &&
    ts.isIdentifier(node.name) &&
    TRANSLATABLE_ATTRIBUTES.has(node.name.text) &&
    node.initializer &&
    ts.isStringLiteral(node.initializer)
  ) {
    addCandidate(node.initializer.text, strings);
  }

  if (ts.isStringLiteralLike(node) && isLikelyUiString(node)) {
    addCandidate(node.text, strings);
  }

  ts.forEachChild(node, (child) =>
    collectUiStrings(child, sourceFile, strings),
  );
}

function isLikelyUiString(node: ts.StringLiteralLike): boolean {
  const parent = node.parent;

  if (
    ts.isPropertyAssignment(parent) &&
    parent.initializer === node &&
    ts.isIdentifier(parent.name) &&
    TRANSLATABLE_PROPERTY_NAMES.has(parent.name.text)
  ) {
    return true;
  }

  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === node &&
    ts.isIdentifier(parent.name) &&
    /(label|message|title|notice|error|text|fallback)/i.test(parent.name.text)
  ) {
    return true;
  }

  if (ts.isConditionalExpression(parent)) {
    return true;
  }

  if (ts.isReturnStatement(parent)) {
    return true;
  }

  return false;
}

function addCandidate(value: string, strings: Set<string>): void {
  const candidate = value.replace(/\s+/g, " ").trim();
  if (!candidate || !/[A-Za-z]/.test(candidate)) {
    return;
  }

  if (shouldIgnoreCandidate(candidate)) {
    return;
  }

  strings.add(candidate);
}

function shouldIgnoreCandidate(value: string): boolean {
  return (
    value.length < 2 ||
    value === "Promise" ||
    value === "string" ||
    /^[,.]/.test(value) ||
    /^[./#?&=:_a-z0-9-]+$/i.test(value) ||
    /^(border|bg|text|mt|break|inline|flex|grid|space|px|py|p|m|w|h|min|max|items|justify|rounded|shadow|hover|disabled|focus|overflow|uppercase|font|leading|tracking|tabular)-/.test(
      value,
    ) ||
    value.includes(" border-") ||
    value.includes(" bg-") ||
    value.includes(" text-") ||
    value.includes("className") ||
    value.endsWith('."') ||
    value.endsWith(',"')
  );
}
