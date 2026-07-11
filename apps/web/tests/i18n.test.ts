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
  assert.deepEqual(
    Object.keys(zhMessages).sort(),
    Object.keys(enMessages).sort(),
  );
  assert.equal(LOCALE_MESSAGES.en, enMessages);
  assert.equal(LOCALE_MESSAGES["zh-CN"], zhMessages);
});

test("dashboard API label keys are present in every locale catalog", () => {
  const repoRoot = path.resolve(process.cwd(), "../..");
  const dashboardServiceSource = fs.readFileSync(
    path.join(repoRoot, "apps/api/src/dashboard/dashboard.service.ts"),
    "utf8",
  );
  const labelKeys = [
    ...dashboardServiceSource.matchAll(/'dashboard\.[a-zA-Z0-9.]+?'/g),
  ]
    .map((match) => match[0].slice(1, -1))
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .sort();

  assert.notEqual(labelKeys.length, 0);
  assert.deepEqual(
    labelKeys.filter((key) => !(key in enMessages)),
    [],
  );
  assert.deepEqual(
    labelKeys.filter((key) => !(key in zhMessages)),
    [],
  );
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
        zhMessages[key as keyof typeof zhMessages] && !allowedSameText.has(key),
  );

  assert.deepEqual(untranslated, []);
});

test("translates exact UI strings between locale resources", () => {
  assert.equal(translateTextContent("Dashboard", "zh-CN"), "仪表盘");
  assert.equal(
    translateTextContent("Generate Label PDF", "zh-CN"),
    "生成托盘面单 PDF",
  );
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
  assert.equal(
    translateTextContent(
      'Delete import "wrong.xlsx" from active history? This permanently removes the original uploaded file and all related generated storage files. This action remains audited.',
      "zh-CN",
    ),
    '从当前记录中删除导入 "wrong.xlsx"？这会永久删除原始上传文件和所有关联生成文件，并保留审计记录。',
  );
  assert.equal(
    translateTextContent(
      "This import already has business records and cannot be deleted. Blockers: load jobs 1, operational pallets 2.",
      "zh-CN",
    ),
    "此导入已有业务记录，不能删除。阻塞项：load jobs 1, operational pallets 2。",
  );
});

test("translates container rule metadata and warning messages", () => {
  assert.equal(
    translateTextContent(
      "Package carton · Private/commercial carton volume rule · Basis 1.800 CBM · Rounding up",
      "zh-CN",
    ),
    "包装：纸箱 · 私人/商业地址纸箱按体积规则 · 基准 1.800 CBM · 向上取整",
  );
  assert.equal(
    translateTextContent(
      "Unknown destination 1.7 CBM review rule · Basis 1.700 CBM · Rounding up",
      "zh-CN",
    ),
    "未知目的仓 1.7 CBM 待复核规则 · 基准 1.700 CBM · 向上取整",
  );
  assert.equal(
    translateTextContent(
      "Package wooden crate · Private/commercial wooden crate piece-count rule · Rounding by piece count",
      "zh-CN",
    ),
    "包装：木箱/木架 · 私人/商业地址木箱按件数规则 · 按件数计算",
  );
  assert.equal(
    translateTextContent(
      "Destination type was not recognized; pallet rule needs confirmation.  2x",
      "zh-CN",
    ),
    "目的仓类型无法识别，托盘规则需要复核。（2 次）",
  );
  assert.equal(
    translateTextContent(
      "Destination PUR volume is zero with 12 carton(s); 0.01 CBM was used for pallet calculation.",
      "zh-CN",
    ),
    "目的仓 PUR 体积为 0，箱数 12；已按 0.01 CBM 参与托盘计算。",
  );
  assert.equal(
    translateTextContent(
      "包装：纸箱 · 私人/商业地址纸箱按体积规则 · 基准 1.800 CBM · 向上取整",
      "en",
    ),
    "Package carton · Private/commercial carton volume rule · Basis 1.800 CBM · Rounding up",
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
  "aria-description",
  "placeholder",
  "title",
  "alt",
]);

const TRANSLATABLE_PROPERTY_NAMES = new Set([
  "confirmText",
  "description",
  "emptyText",
  "error",
  "fallback",
  "helpText",
  "label",
  "message",
  "notice",
  "placeholder",
  "successText",
  "title",
]);

const TRANSLATABLE_JSX_PROP_NAMES = new Set([
  ...TRANSLATABLE_ATTRIBUTES,
  ...TRANSLATABLE_PROPERTY_NAMES,
]);

const TRANSLATABLE_SETTER_NAMES = new Set([
  "alert",
  "setError",
  "setMessage",
  "setNotice",
  "setStatus",
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
    TRANSLATABLE_JSX_PROP_NAMES.has(node.name.text) &&
    node.initializer &&
    ts.isStringLiteral(node.initializer)
  ) {
    addCandidate(node.initializer.text, node.initializer, sourceFile, records);
  }

  if (
    ts.isStringLiteralLike(node) &&
    ts.isJsxExpression(node.parent) &&
    node.parent.expression === node
  ) {
    addCandidate(node.text, node, sourceFile, records);
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

  if (
    ts.isCallExpression(parent) &&
    parent.arguments.includes(node) &&
    isTranslatableCallExpression(parent.expression)
  ) {
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
    isTranslatableCallExpression(parent.expression)
  ) {
    return true;
  }

  if (ts.isReturnStatement(parent)) {
    return true;
  }

  return false;
}

function isTranslatableCallExpression(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return TRANSLATABLE_SETTER_NAMES.has(expression.text);
  }

  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "confirm" &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "window"
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
  if (isAllowedRawCandidate(value)) {
    return true;
  }

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

function isAllowedRawCandidate(value: string): boolean {
  const allowedRawPatterns = [
    // File size units are standard technical units in both locales.
    /^TEST (B|KB|MB)$/,
    // Load job source labels combine container/destination/pallet-count codes.
    /^TEST \/ TEST \/ TESTP$/,
  ];

  return allowedRawPatterns.some((pattern) => pattern.test(value));
}

function formatUiRecord(record: UiStringRecord): string {
  return `${record.file}:${record.line} ${JSON.stringify(record.value)}`;
}
