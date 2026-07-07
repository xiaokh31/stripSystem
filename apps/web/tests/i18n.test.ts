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
    "UTC",
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

test("translates dynamic action and API fallback text patterns", () => {
  assert.equal(
    translateTextContent("API request failed with HTTP status 500.", "zh-CN"),
    "API 请求失败，HTTP 状态：500。",
  );
  assert.equal(
    translateTextContent("Uploaded june-attendance.xls.", "zh-CN"),
    "已上传 june-attendance.xls。",
  );
  assert.equal(
    translateTextContent("Parsed 12 employee-day row(s).", "zh-CN"),
    "已解析 12 条员工日工时行。",
  );
  assert.equal(
    translateTextContent("Generated settlement set-2026-06.", "zh-CN"),
    "已生成结算 set-2026-06。",
  );
  assert.equal(
    translateTextContent("PAY-2026-06 marked completed.", "zh-CN"),
    "PAY-2026-06 已标记完成。",
  );
  assert.equal(
    translateTextContent(
      "Scan saved as pending for load job LJ-1. Inventory will not change until sync succeeds.",
      "zh-CN",
    ),
    "扫码已保存为装车任务 LJ-1 的待同步记录。同步成功前库存不会变化。",
  );
  assert.equal(
    translateTextContent(
      'Legacy unloader "Alex" must be reselected from the temporary unloader directory before saving.',
      "zh-CN",
    ),
    '旧拆柜人 "Alex" 保存前必须从临时拆柜工目录重新选择。',
  );
  assert.equal(
    translateTextContent("Duplicate unloader: Alex.", "zh-CN"),
    "重复拆柜人：Alex。",
  );
});

test("restores Chinese exact translations by shared message key", () => {
  assert.equal(translateTextContent("仪表盘", "en"), "Dashboard");
  assert.equal(translateTextContent("移动扫码", "en"), "Mobile Scan");
});

test("all extracted UI display strings are managed by the English locale file", () => {
  const unmanaged = extractUiStringRecords().filter(
    (record) => translateMessage(record.value, "en") === null,
  );

  assert.deepEqual(unmanaged.map(formatUiRecord), []);
});

test("non-i18n source files do not hard-code Chinese UI copy", () => {
  const chineseCopy = extractUiStringRecords().filter((record) =>
    /[\u4e00-\u9fff]/.test(record.value),
  );

  assert.deepEqual(chineseCopy.map(formatUiRecord), []);
});

interface UiStringRecord {
  file: string;
  line: number;
  value: string;
}

function extractUiStringRecords(): UiStringRecord[] {
  const roots = ["src/app", "src/components", "src/lib"].map((root) =>
    path.join(process.cwd(), root),
  );
  const files = roots.flatMap((root) => listSourceFiles(root));
  const records = new Map<string, UiStringRecord>();

  for (const file of files) {
    if (shouldSkipSourceFile(file)) {
      continue;
    }

    const sourceText = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    collectUiStrings(sourceFile, sourceFile, records);
  }

  return Array.from(records.values()).sort((left, right) =>
    formatUiRecord(left).localeCompare(formatUiRecord(right)),
  );
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

const I18N_MANAGED_SOURCE_FILE_PATTERNS = [
  path.join("src", "lib", "i18n", "catalog.ts"),
  path.join("src", "lib", "i18n", "locales", "en.ts"),
  path.join("src", "lib", "i18n", "locales", "zh.ts"),
  path.join("src", "lib", "i18n", "status-labels.ts"),
];

function shouldSkipSourceFile(file: string): boolean {
  const relative = path.relative(process.cwd(), file);
  return I18N_MANAGED_SOURCE_FILE_PATTERNS.some((pattern) =>
    relative.endsWith(pattern),
  );
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
  records: Map<string, UiStringRecord>,
): void {
  if (ts.isJsxText(node)) {
    addCandidate(node.getText(sourceFile), node, sourceFile, records);
  }

  if (
    ts.isJsxAttribute(node) &&
    ts.isIdentifier(node.name) &&
    TRANSLATABLE_ATTRIBUTES.has(node.name.text) &&
    node.initializer &&
    ts.isStringLiteral(node.initializer)
  ) {
    addCandidate(node.initializer.text, node.initializer, sourceFile, records);
  }

  if (ts.isStringLiteralLike(node) && isLikelyUiString(node)) {
    addCandidate(node.text, node, sourceFile, records);
  }

  if (ts.isTemplateExpression(node) && isLikelyUiTemplate(node)) {
    addCandidate(templateExpressionSample(node), node, sourceFile, records);
  }

  ts.forEachChild(node, (child) =>
    collectUiStrings(child, sourceFile, records),
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

function isLikelyUiTemplate(node: ts.TemplateExpression): boolean {
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
    ts.isCallExpression(parent) &&
    parent.arguments.includes(node) &&
    ts.isIdentifier(parent.expression) &&
    /^(setNotice|confirm)$/.test(parent.expression.text)
  ) {
    return true;
  }

  return false;
}

function templateExpressionSample(node: ts.TemplateExpression): string {
  return [
    node.head.text,
    ...node.templateSpans.flatMap((span) => [
      expressionSample(span.expression),
      span.literal.text,
    ]),
  ].join("");
}

function expressionSample(expression: ts.Expression): string {
  if (ts.isConditionalExpression(expression)) {
    const whenTrue = literalExpressionSample(expression.whenTrue);
    const whenFalse = literalExpressionSample(expression.whenFalse);
    return whenTrue.length >= whenFalse.length ? whenTrue : whenFalse;
  }

  return "TEST";
}

function literalExpressionSample(expression: ts.Expression): string {
  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }

  if (ts.isTemplateExpression(expression)) {
    return templateExpressionSample(expression);
  }

  return "TEST";
}

function addCandidate(
  value: string,
  node: ts.Node,
  sourceFile: ts.SourceFile,
  records: Map<string, UiStringRecord>,
): void {
  const candidate = value.replace(/\s+/g, " ").trim();
  if (!candidate || !/[A-Za-z\u4e00-\u9fff]/.test(candidate)) {
    return;
  }

  if (shouldIgnoreCandidate(candidate)) {
    return;
  }

  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const relative = path.relative(process.cwd(), sourceFile.fileName);
  const key = `${relative}:${candidate}`;
  records.set(key, {
    file: relative,
    line: position.line + 1,
    value: candidate,
  });
}

function shouldIgnoreCandidate(value: string): boolean {
  return (
    value.length < 2 ||
    value === "Promise" ||
    value === "string" ||
    value === "; Secure" ||
    /^[,.]/.test(value) ||
    /^[./#?&=:_a-z0-9-]+$/i.test(value) ||
    /^(TEST[\s·:/#().-]*)+$/.test(value) ||
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

function formatUiRecord(record: UiStringRecord): string {
  return `${record.file}:${record.line} ${JSON.stringify(record.value)}`;
}
