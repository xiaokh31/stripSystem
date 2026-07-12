import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  I18nProvider,
  useI18n,
} from "../src/components/i18n/i18n-provider";
import {
  LOCALE_MESSAGES,
  SAME_TEXT_MESSAGE_KEYS,
  type MessageKey,
} from "../src/lib/i18n/catalog";
import { enMessages } from "../src/lib/i18n/locales/en";
import { zhMessages } from "../src/lib/i18n/locales/zh";
import {
  createTranslator,
  MissingTranslationError,
  normalizeLocale,
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
  const allowedSameText = new Set<string>(SAME_TEXT_MESSAGE_KEYS);
  const untranslated = Object.keys(enMessages).filter(
    (key) =>
      enMessages[key as keyof typeof enMessages] ===
        zhMessages[key as keyof typeof zhMessages] &&
      !allowedSameText.has(key),
  );

  assert.deepEqual(untranslated, []);
});

test("explicit server and client translators render the same locale output", () => {
  assert.equal(createTranslator("zh-CN").t("Dashboard"), "仪表盘");
  assert.equal(
    createTranslator("zh-CN").format("i18n.imports.history.summary", {
      count: 2,
    }),
    "显示导入 API 的最新 2 条记录。",
  );
  const Provider = I18nProvider as (props: {
    children?: ReactNode;
    initialLocale: "en" | "zh-CN";
  }) => ReactElement;

  const html = renderToStaticMarkup(
    createElement(
      Provider,
      { initialLocale: "zh-CN" },
      createElement(TranslationProbe),
    ),
  );

  assert.match(html, /data-locale="zh-CN"/);
  assert.match(html, />仪表盘</);
  assert.doesNotMatch(html, />Dashboard</);
});

test("typed translation templates resolve dynamic business parameters", () => {
  const { format, t } = createTranslator("zh-CN");

  assert.equal(
    format("i18n.admin.actionSaved", { action: t("Save") }),
    "已保存保存，数据已从 API 刷新。",
  );
  assert.equal(
    format("i18n.settings.unknownField", { key: "customRate" }),
    "设置 customRate",
  );
});

test("explicit translator rejects missing keys outside production and uses a localized production fallback", () => {
  assert.throws(
    () => createTranslator("zh-CN").t("missing.translation.key" as MessageKey),
    MissingTranslationError,
  );

  const originalNodeEnv = process.env.NODE_ENV;
  const originalConsoleError = console.error;
  const mutableEnvironment = process.env as { NODE_ENV?: string };
  mutableEnvironment.NODE_ENV = "production";
  console.error = () => undefined;

  try {
    assert.equal(
      createTranslator("zh-CN").t("missing.translation.key" as MessageKey),
      "翻译不可用。",
    );
  } finally {
    console.error = originalConsoleError;
    if (originalNodeEnv === undefined) {
      delete mutableEnvironment.NODE_ENV;
    } else {
      mutableEnvironment.NODE_ENV = originalNodeEnv;
    }
  }
});

test("runtime source has no legacy DOM or source-string translation path", () => {
  const runtimeSource = listSourceFiles(path.join(process.cwd(), "src"))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    runtimeSource,
    /MutationObserver|createTreeWalker|translateDocument|translateNode|document\.body/,
  );
  assert.doesNotMatch(
    runtimeSource,
    /\b(tryT|translate(Message|TextContent|AttributeValue))\b/,
  );
});

test("shared entry boundaries use the explicit translation contract", () => {
  const boundaries: Array<{
    file: string;
    requiredSnippets: string[];
  }> = [
    {
      file: "src/app/layout.tsx",
      requiredSnippets: ["generateMetadata", "createTranslator"],
    },
    {
      file: "src/app/login/page.tsx",
      requiredSnippets: ["createTranslator", 't("Authentication")'],
    },
    {
      file: "src/app/error.tsx",
      requiredSnippets: ["useI18n", 't("Page error")'],
    },
    {
      file: "src/components/layout/office-shell.tsx",
      requiredSnippets: ["createTranslator", 't("Manifest Control Room")'],
    },
    {
      file: "src/components/layout/office-navigation.tsx",
      requiredSnippets: ["useI18n", 't("Office navigation")'],
    },
    {
      file: "src/components/i18n/language-switcher.tsx",
      requiredSnippets: ["useI18n", 't("Language")'],
    },
    {
      file: "src/components/layout/theme-control.tsx",
      requiredSnippets: ["useI18n", 't("Theme")'],
    },
    {
      file: "src/components/auth/login-form.tsx",
      requiredSnippets: ["useI18n", 't("Email")'],
    },
    {
      file: "src/components/admin/admin-page-shell.tsx",
      requiredSnippets: ["createTranslator", 't("Admin API error")'],
    },
    {
      file: "src/app/settings/page.tsx",
      requiredSnippets: ["createTranslator", 't("Settings")'],
    },
    {
      file: "src/components/settings/operational-settings-form.tsx",
      requiredSnippets: ["useI18n", 't("Editable operational settings")'],
    },
    {
      file: "src/components/admin/role-permission-matrix.tsx",
      requiredSnippets: ["useI18n", "permissionDescriptionLabel"],
    },
    {
      file: "src/components/admin/user-management-panel.tsx",
      requiredSnippets: ["useI18n", "roleDisplayLabel"],
    },
    {
      file: "src/app/admin/users/page.tsx",
      requiredSnippets: [
        'export const dynamic = "force-dynamic"',
        "createTranslator",
      ],
    },
    {
      file: "src/app/admin/roles/page.tsx",
      requiredSnippets: [
        'export const dynamic = "force-dynamic"',
        "createTranslator",
      ],
    },
    {
      file: "src/components/layout/route-placeholder.tsx",
      requiredSnippets: ["createTranslator", "t(eyebrow)"],
    },
    {
      file: "src/app/page.tsx",
      requiredSnippets: [
        "createTranslator",
        "function t(key: MessageKey",
        't("Dashboard error", locale)',
      ],
    },
    {
      file: "src/components/dashboard/dashboard-components.tsx",
      requiredSnippets: ["createTranslator", 't("Dock lane strip")'],
    },
  ];

  for (const boundary of boundaries) {
    const source = fs.readFileSync(path.join(process.cwd(), boundary.file), "utf8");

    for (const snippet of boundary.requiredSnippets) {
      assert.ok(
        source.includes(snippet),
        `${boundary.file} must contain ${snippet}`,
      );
    }
  }
});

test("localized component key boundaries retain their MessageKey contracts", () => {
  const boundaries: Array<{ file: string; snippets: string[] }> = [
    {
      file: "src/app/reports/inventory/page.tsx",
      snippets: ["fallback: MessageKey", "return t(knownKey ?? fallback);"],
    },
    {
      file: "src/app/work-hours/page.tsx",
      snippets: ["title: MessageKey", "{t(title)}"],
    },
    {
      file: "src/app/unloading-wage/page.tsx",
      snippets: ["title: MessageKey", "{t(title)}"],
    },
    {
      file: "src/app/unloading-summary/page.tsx",
      snippets: ["title: MessageKey", "{t(title)}"],
    },
  ];

  for (const boundary of boundaries) {
    const source = fs.readFileSync(path.join(process.cwd(), boundary.file), "utf8");
    for (const snippet of boundary.snippets) {
      assert.ok(source.includes(snippet), `${boundary.file} must contain ${snippet}`);
    }
  }
});

test("rendered web modules import an explicit translator", () => {
  const exemptFiles = new Set(["src/app/admin/page.tsx"]);
  const files = renderedSourceFiles();
  const missingTranslator = files
    .map((file) => path.relative(process.cwd(), file))
    .filter(
      (file) =>
        !exemptFiles.has(file) &&
        !/\b(useI18n|createTranslator)\b/.test(
          fs.readFileSync(path.join(process.cwd(), file), "utf8"),
        ),
    )
    .sort();

  assert.deepEqual(missingTranslator, []);
});

test("AST localization gate rejects raw visible copy even when the catalog contains it", () => {
  const fixtures = [
    {
      expected: [{ context: "JSX text", value: "File" }],
      name: "raw table heading",
      source: "const View = () => <th>File</th>;",
    },
    {
      expected: [{ context: "placeholder", value: "Select reason" }],
      name: "raw placeholder",
      source: 'const View = () => <input placeholder="Select reason" />;',
    },
    {
      expected: [{ context: "setError", value: "Save failed" }],
      name: "raw state error",
      source: 'const save = () => setError("Save failed");',
    },
  ];

  for (const fixture of fixtures) {
    assert.deepEqual(
      localizedUiViolations(fixture.source, `${fixture.name}.tsx`).map(
        ({ context, value }) => ({ context, value }),
      ),
      fixture.expected,
    );
  }
});

test("AST localization gate accepts explicit translators and diagnostic raw-value boundaries", () => {
  const source = `
    const View = ({ containerNo }) => (
      <>
        <th>{t("File")}</th>
        <input placeholder={t("Select reason")} />
        <code data-i18n-ignore>RAW_CODE</code>
        <span>{containerNo}</span>
      </>
    );
    const save = () => setError(t("Save failed"));
    const confirmDelete = () => window.confirm(t("Delete this planned load job?"));
  `;

  assert.deepEqual(localizedUiViolations(source, "valid-fixture.tsx"), []);
});

test("AST localization gate protects every rendered web module", () => {
  const violations = renderedSourceFiles().flatMap((file) =>
    localizedUiViolations(fs.readFileSync(file, "utf8"), file),
  );

  assert.deepEqual(violations.map(formatViolation), []);
});

interface LocalizationViolation {
  context: string;
  file: string;
  line: number;
  value: string;
}

const TRANSLATABLE_ATTRIBUTES = new Set([
  "aria-description",
  "aria-label",
  "alt",
  "placeholder",
  "title",
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

const TRANSLATABLE_SETTER_NAMES = new Set([
  "alert",
  "confirm",
  "notify",
  "setError",
  "setMessage",
  "setNotice",
  "setStatus",
  "showToast",
  "toast",
]);

const LOCALIZED_COMPONENT_PROP_BOUNDARIES = new Set([
  "src/app/reports/inventory/page.tsx:ApiErrorPanel.fallback",
  "src/app/unloading-summary/page.tsx:ApiErrorPanel.title",
  "src/app/unloading-wage/page.tsx:ApiErrorPanel.title",
  "src/app/work-hours/page.tsx:ApiErrorPanel.title",
]);

function localizedUiViolations(
  sourceText: string,
  fileName: string,
): LocalizationViolation[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations = new Map<string, LocalizationViolation>();

  function record(node: ts.Node, context: string, value: string) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized || !/[A-Za-z\u4e00-\u9fff]/.test(normalized)) {
      return;
    }

    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    const relativeFile = path.isAbsolute(fileName)
      ? path.relative(process.cwd(), fileName)
      : fileName;
    const key = `${relativeFile}:${position.line}:${context}:${normalized}`;
    violations.set(key, {
      context,
      file: relativeFile,
      line: position.line + 1,
      value: normalized,
    });
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxText(node)) {
      if (!isExplicitRawValueBoundary(node)) {
        record(node, "JSX text", node.getText(sourceFile));
      }
    } else if (ts.isStringLiteralLike(node)) {
      const context = visibleLiteralContext(node);
      if (
        context &&
        !isInsideTranslatorCall(node) &&
        !isExplicitRawValueBoundary(node) &&
        !isApprovedBusinessPlaceholder(node, context)
      ) {
        record(node, context, node.text);
      }
    } else if (ts.isTemplateExpression(node)) {
      const context = visibleLiteralContext(node);
      if (
        context &&
        !isInsideTranslatorCall(node) &&
        !isExplicitRawValueBoundary(node) &&
        !isTechnicalDynamicValue(node, context)
      ) {
        record(node, context, templateExpressionSample(node));
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...violations.values()].sort((left, right) =>
    formatViolation(left).localeCompare(formatViolation(right)),
  );
}

function visibleLiteralContext(node: ts.Node): string | null {
  const attribute = nearestJsxAttribute(node);
  if (attribute) {
    if (!ts.isIdentifier(attribute.name)) {
      return null;
    }
    if (isLocalizedComponentPropBoundary(attribute)) {
      return null;
    }
    if (
      (TRANSLATABLE_ATTRIBUTES.has(attribute.name.text) ||
        TRANSLATABLE_PROPERTY_NAMES.has(attribute.name.text)) &&
      isDirectTranslatableAttributeLiteral(node, attribute)
    ) {
      return attribute.name.text;
    }
    return null;
  }

  if (isDirectJsxExpression(node)) {
    return "JSX expression";
  }

  const property = findAncestor(node, ts.isPropertyAssignment);
  if (
    property &&
    ts.isIdentifier(property.name) &&
    TRANSLATABLE_PROPERTY_NAMES.has(property.name.text) &&
    isMessagePropertyInSetter(property)
  ) {
    return property.name.text;
  }

  const call = findAncestor(node, ts.isCallExpression);
  if (call && isDirectMessageCallArgument(node, call)) {
    return calleeName(call.expression);
  }

  return null;
}

function isInsideTranslatorCall(node: ts.Node): boolean {
  return Boolean(
    findAncestor(node, (ancestor): ancestor is ts.CallExpression =>
      ts.isCallExpression(ancestor) && isTranslatorCall(ancestor.expression),
    ),
  );
}

function isTranslatorCall(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === "t" || expression.text === "format";
  }

  return (
    ts.isPropertyAccessExpression(expression) &&
    (expression.name.text === "t" || expression.name.text === "format")
  );
}

function isUserMessageCall(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return TRANSLATABLE_SETTER_NAMES.has(expression.text);
  }

  return (
    ts.isPropertyAccessExpression(expression) &&
    TRANSLATABLE_SETTER_NAMES.has(expression.name.text)
  );
}

function nearestJsxAttribute(node: ts.Node): ts.JsxAttribute | null {
  let current = node.parent;
  while (current) {
    if (ts.isJsxAttribute(current)) {
      return current;
    }
    if (
      ts.isJsxElement(current) ||
      ts.isJsxFragment(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

function isDirectJsxExpression(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isJsxAttribute(current)) {
      return false;
    }
    if (ts.isJsxExpression(current)) {
      return (
        ts.isJsxElement(current.parent) || ts.isJsxFragment(current.parent)
      );
    }
    if (ts.isCallExpression(current) || ts.isBinaryExpression(current)) {
      return false;
    }
    if (
      ts.isJsxElement(current) ||
      ts.isJsxFragment(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function isDirectTranslatableAttributeLiteral(
  node: ts.Node,
  attribute: ts.JsxAttribute,
): boolean {
  let current = node;
  while (current.parent && current.parent !== attribute) {
    if (ts.isCallExpression(current.parent) || ts.isBinaryExpression(current.parent)) {
      return false;
    }
    current = current.parent;
  }
  return current.parent === attribute;
}

function isMessagePropertyInSetter(property: ts.PropertyAssignment): boolean {
  if (!ts.isObjectLiteralExpression(property.parent)) {
    return false;
  }

  const call = property.parent.parent;
  return (
    ts.isCallExpression(call) &&
    call.arguments.includes(property.parent) &&
    isUserMessageCall(call.expression)
  );
}

function isDirectMessageCallArgument(
  node: ts.Node,
  call: ts.CallExpression,
): boolean {
  if (!isUserMessageCall(call.expression)) {
    return false;
  }

  let current = node;
  while (current.parent && current.parent !== call) {
    if (
      ts.isObjectLiteralExpression(current.parent) ||
      ts.isPropertyAssignment(current.parent)
    ) {
      return false;
    }
    current = current.parent;
  }
  return current.parent === call && call.arguments.includes(current as ts.Expression);
}

function calleeName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  return ts.isPropertyAccessExpression(expression)
    ? expression.name.text
    : "message";
}

function isLocalizedComponentPropBoundary(attribute: ts.JsxAttribute): boolean {
  if (!ts.isIdentifier(attribute.name)) {
    return false;
  }

  const openingElement = attribute.parent.parent;
  if (
    !ts.isJsxOpeningElement(openingElement) &&
    !ts.isJsxSelfClosingElement(openingElement)
  ) {
    return false;
  }

  const relativeFile = path.isAbsolute(openingElement.getSourceFile().fileName)
    ? path.relative(process.cwd(), openingElement.getSourceFile().fileName)
    : openingElement.getSourceFile().fileName;
  const key = `${relativeFile}:${openingElement.tagName.getText()}.${attribute.name.text}`;
  return LOCALIZED_COMPONENT_PROP_BOUNDARIES.has(key);
}

function isExplicitRawValueBoundary(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      return current.openingElement.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          ts.isIdentifier(attribute.name) &&
          attribute.name.text === "data-i18n-ignore",
      );
    }
    if (ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function isApprovedBusinessPlaceholder(
  node: ts.StringLiteralLike,
  context: string,
): boolean {
  if (context !== "placeholder") {
    return false;
  }

  const value = node.text.trim();
  return /^[A-Z]{4}\d{6,}$/.test(value) || /^[A-Z]{3}\d+$/.test(value);
}

function isTechnicalDynamicValue(
  node: ts.TemplateExpression,
  context: string,
): boolean {
  return context === "JSX expression" && /^VALUE%$/.test(templateExpressionSample(node));
}

function findAncestor<T extends ts.Node>(
  node: ts.Node,
  predicate: (ancestor: ts.Node) => ancestor is T,
): T | null {
  let current = node.parent;
  while (current) {
    if (predicate(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function renderedSourceFiles(): string[] {
  return ["src/app", "src/components"]
    .flatMap((root) => listSourceFiles(path.join(process.cwd(), root)))
    .filter((file) => file.endsWith(".tsx"));
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

function templateExpressionSample(node: ts.TemplateExpression): string {
  return [
    node.head.text,
    ...node.templateSpans.flatMap((span) => ["VALUE", span.literal.text]),
  ].join("");
}

function formatViolation(violation: LocalizationViolation): string {
  return `${violation.file}:${violation.line} ${violation.context} ${JSON.stringify(violation.value)}`;
}

function TranslationProbe() {
  const { locale, t } = useI18n();

  return createElement("span", { "data-locale": locale }, t("Dashboard"));
}
