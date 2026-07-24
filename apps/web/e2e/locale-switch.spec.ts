import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  configureBrowserActor,
  E2E_BASE_URL,
  authHeaders,
  expectNoPageError,
  loginThroughApi,
} from "./helpers";

const repoRoot = path.resolve(process.cwd(), "../..");
const attendanceFixturePath = path.join(
  repoRoot,
  "samples",
  "wage",
  "workAttendanceRecordForm_June.xls",
);
const unloadingFixturePath = path.join(
  repoRoot,
  "samples",
  "unloading-plans",
  "Unloading Plan CSNU8877228.xlsx",
);
const settlementMonth = "2026-06";
const completedAt = "2026-06-18T20:30:00.000Z";

const forbiddenBilingualStatusPatterns = [
  /已拆完\s*\(UNLOADED\)/,
  /已送库\s*\(LOADED\)/,
  /Unloaded\s*\/\s*已拆完/,
  /Delivered to destination\s*\/\s*已送库/,
] as const;

const forbiddenEnglishChineseStatusPatterns = [
  /已拆完/,
  /装车中/,
  /已送库/,
  /已装车/,
  /已装托盘/,
  /完成装车/,
  /已生成/,
  /已完成/,
  /需复核/,
  /待同步/,
  /上传中/,
  /行动队列/,
  /柜子流转/,
  /库存压力/,
  /复核队列/,
  /最新运营记录/,
  /运营中控台/,
] as const;

const forbiddenChineseEnglishStatusPatterns = [
  /\bUnloaded\b/,
  /Loading in progress/,
  /Delivered to destination/,
  /\bLoaded pallets\b/,
  /\bComplete loading\b/,
  /\bGenerated\b/,
  /\bCompleted\b/,
  /Needs review/,
  /\bUploaded\b/,
  /\bParsed\b/,
  /\bFailed\b/,
  /\bPending\b/,
  /\bUploading\b/,
  /Action queue/,
  /Container lifecycle/,
  /Inventory pressure/,
  /Review queue/,
  /Latest operational records/,
  /Operations dashboard/,
] as const;

const forbiddenChineseUiTextPatterns = [
  /Backup policy/,
  /Human Resources Manager/,
  /Inventory remaining is global warehouse inventory/,
  /LABELS_GENERATED stays out/,
  /Limit \d+, offset \d+/,
  /No usable punch times found/,
  /Odd punch count requires manual review/,
  /Planned pallets/,
  /Polling \d+s/,
  /Roles:/,
  /Scheduled departure/,
  /Showing \d+ latest/,
  /Showing \d+ load jobs/,
  /Source text/,
  /Upload attendance files\./,
] as const;

test("core pages switch locale, persist refresh, and keep status labels single-language", async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.setTimeout(300_000);
  const adminToken = await loginThroughApi(page, request);
  const fixture = await prepareLocaleFixture(request, adminToken, testInfo);
  const pages: LocalePageCheck[] = [
    {
      enText: "Operations dashboard",
      path: "/",
      requiredEnglish: [
        "Action queue",
        "Container lifecycle",
        "Inventory pressure",
      ],
      requiredChinese: ["行动队列", "柜子流转", "库存压力"],
      zhText: "运营中控台",
    },
    { enText: "Imports", path: "/imports", zhText: "导入" },
    {
      enText: "Import detail",
      path: `/imports/${fixture.importId}`,
      requiredEnglish: ["File status"],
      requiredChinese: ["文件状态"],
      zhText: "导入详情",
    },
    {
      enText: fixture.loadedContainerNo,
      path: "/containers",
      requiredEnglish: ["Unloaded", "Loading in progress", "Delivered to destination"],
      requiredChinese: ["已拆完", "装车中", "已送库"],
      zhText: fixture.loadedContainerNo,
    },
    {
      enText: fixture.loadedContainerNo,
      path: `/containers/${fixture.loadedContainerId}`,
      requiredEnglish: ["Delivered to destination"],
      requiredChinese: ["已送库"],
      zhText: fixture.loadedContainerNo,
    },
    {
      enText: "Select a container and manage destination inventory",
      path: "/inventory",
      requiredEnglish: ["Delivered to destination"],
      requiredChinese: ["已送库"],
      zhText: "选择柜子并管理目的仓库存",
    },
    {
      enText: "Warehouse reports",
      path: "/reports",
      requiredEnglish: ["Inventory report"],
      requiredChinese: ["库存报告"],
      zhText: "仓库报告",
    },
    {
      enText: "Work Hours Settlement",
      path: `/work-hours?attendanceImportId=${encodeURIComponent(
        fixture.attendanceImportId,
      )}`,
      requiredEnglish: ["Uploaded", "Parsed", "Generated"],
      requiredChinese: ["已上传", "已解析", "已生成"],
      zhText: "工时结算",
    },
    {
      enText: "Warehouse Unloading Wage Settlement",
      path: `/unloading-wage?settlementMonth=${settlementMonth}`,
      requiredEnglish: ["Generated", "Completed"],
      requiredChinese: ["已生成", "已完成"],
      zhText: "仓库卸柜工资结算",
    },
    {
      enText: "Monthly Unloading Data Summary",
      path: `/unloading-summary?month=${settlementMonth}`,
      requiredEnglish: ["Unloaded", "Loading in progress", "Delivered to destination"],
      requiredChinese: ["已拆完", "装车中", "已送库"],
      zhText: "月度拆柜数据汇总",
    },
    {
      enText: "Load jobs",
      path: "/load-jobs",
      requiredEnglish: ["In progress"],
      requiredChinese: ["进行中"],
      zhText: "装车任务",
    },
    {
      enText: "Historical load jobs",
      path: "/load-jobs/history",
      requiredEnglish: ["In progress"],
      requiredChinese: ["进行中"],
      zhText: "历史装车任务",
    },
    {
      enText: "Select open load job",
      path: "/mobile/load-jobs",
      requiredEnglish: ["In progress"],
      requiredChinese: ["进行中"],
      zhText: "选择打开的装车任务",
    },
    {
      enText: "Complete loading",
      path: `/mobile/load-jobs/${fixture.mobileLoadJobId}/scan`,
      requiredEnglish: ["Loaded pallet", "Complete loading"],
      requiredChinese: ["已装托盘", "完成装车"],
      zhText: "完成装车",
    },
    { enText: "User management", path: "/admin/users", zhText: "用户管理" },
    {
      enText: "Roles and permissions",
      path: "/admin/roles",
      requiredEnglish: ["Administrator"],
      requiredChinese: ["管理员"],
      zhText: "角色和权限",
    },
    { enText: "Operational settings", path: "/settings", zhText: "运营设置" },
  ];

  for (const item of pages) {
    await expectLocaleSwitch(page, item);
  }

  await expectNoJavaScriptSsr(browser, adminToken, pages);
  await expectChineseFirstFramesWithoutHydrationWarnings(
    browser,
    adminToken,
    pages,
  );
  await expectLocaleThemeAndClientNavigation(page);
});

interface LocalePageCheck {
  enText: string;
  path: string;
  requiredEnglish?: string[];
  requiredChinese?: string[];
  zhText: string;
}

interface LocaleFixture {
  attendanceImportId: string;
  importId: string;
  loadedContainerId: string;
  loadedContainerNo: string;
  mobileLoadJobId: string;
}

async function expectLocaleSwitch(
  page: Page,
  check: LocalePageCheck,
): Promise<void> {
  await page.goto(check.path);
  await switchToEnglish(page);
  await expect(await visibleTextLocator(page, check.enText)).toBeVisible();
  for (const text of check.requiredEnglish ?? []) {
    await expect(page.locator("body")).toContainText(text);
  }
  await expectNoForbiddenVisibleText(
    page,
    [...forbiddenBilingualStatusPatterns, ...forbiddenEnglishChineseStatusPatterns],
    `English ${check.path}`,
  );
  await expectNoPageError(page);

  await switchToChinese(page);
  await expect(await visibleTextLocator(page, check.zhText)).toBeVisible();
  for (const text of check.requiredChinese ?? []) {
    await expect(page.locator("body")).toContainText(text);
  }
  await expectNoForbiddenVisibleText(
    page,
    [
      ...forbiddenBilingualStatusPatterns,
      ...forbiddenChineseEnglishStatusPatterns,
      ...forbiddenChineseUiTextPatterns,
    ],
    `Chinese ${check.path}`,
  );
  await expectNoPageError(page);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(await visibleTextLocator(page, check.zhText)).toBeVisible();
  await expectNoForbiddenVisibleText(
    page,
    [
      ...forbiddenBilingualStatusPatterns,
      ...forbiddenChineseEnglishStatusPatterns,
      ...forbiddenChineseUiTextPatterns,
    ],
    `Chinese refresh ${check.path}`,
  );

  await switchToEnglish(page);
  await expect(await visibleTextLocator(page, check.enText)).toBeVisible();
  await expectNoForbiddenVisibleText(
    page,
    [...forbiddenBilingualStatusPatterns, ...forbiddenEnglishChineseStatusPatterns],
    `English restore ${check.path}`,
  );
}

async function expectNoJavaScriptSsr(
  browser: Browser,
  token: string,
  checks: LocalePageCheck[],
): Promise<void> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  try {
    await configureBrowserActor(context, token);
    await context.addCookies([
      browserCookie("bestar_theme", "dark"),
    ]);

    for (const locale of ["en", "zh-CN"] as const) {
      await context.addCookies([browserCookie("bestar_locale", locale)]);

      for (const check of checks) {
        await page.goto(absoluteUrl(check.path), { waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

        const expected = locale === "zh-CN" ? check.zhText : check.enText;
        const unexpected = locale === "zh-CN" ? check.enText : check.zhText;
        const expectedShell =
          locale === "zh-CN" ? "清单作业控制室" : "Manifest Control Room";
        const required =
          locale === "zh-CN"
            ? check.requiredChinese ?? []
            : check.requiredEnglish ?? [];

        await expect
          .poll(
            async () => normalizeVisibleText(await page.locator("body").innerText()),
            {
              message: `${locale} SSR ${check.path} should finish streaming its route copy`,
              timeout: 15_000,
            },
          )
          .toContain(normalizeVisibleText(expected));
        const body = await page.locator("body").innerText();

        expectBodyToContain(
          body,
          expectedShell,
          `${locale} SSR ${check.path} should render its shell`,
        );
        expectBodyToContain(
          body,
          expected,
          `${locale} SSR ${check.path} should render its route copy`,
        );
        if (expected !== unexpected) {
          expectBodyNotToContain(
            body,
            unexpected,
            `${locale} SSR ${check.path} should not expose the other locale`,
          );
        }
        for (const text of required) {
          expectBodyToContain(
            body,
            text,
            `${locale} SSR ${check.path} should render ${text}`,
          );
        }
        await expectNoForbiddenVisibleText(
          page,
          locale === "zh-CN"
            ? [
                ...forbiddenBilingualStatusPatterns,
                ...forbiddenChineseEnglishStatusPatterns,
                ...forbiddenChineseUiTextPatterns,
              ]
            : [
                ...forbiddenBilingualStatusPatterns,
                ...forbiddenEnglishChineseStatusPatterns,
              ],
          `${locale} SSR ${check.path}`,
        );
      }
    }

    const loginContext = await browser.newContext({ javaScriptEnabled: false });
    const loginPage = await loginContext.newPage();
    try {
      for (const locale of ["en", "zh-CN"] as const) {
        await loginContext.addCookies([browserCookie("bestar_locale", locale)]);
        await loginPage.goto(absoluteUrl("/login"), { waitUntil: "domcontentloaded" });
        await expect(loginPage.locator("html")).toHaveAttribute("lang", locale);
        const body = await loginPage.locator("body").innerText();
        const expected = locale === "zh-CN" ? "认证" : "Authentication";
        const unexpected = locale === "zh-CN" ? "Authentication" : "认证";
        expectBodyToContain(
          body,
          expected,
          `${locale} login SSR should render authentication copy`,
        );
        expectBodyNotToContain(
          body,
          unexpected,
          `${locale} login SSR should not expose the other locale`,
        );
      }
    } finally {
      await loginContext.close();
    }
  } finally {
    await context.close();
  }
}

async function expectChineseFirstFramesWithoutHydrationWarnings(
  browser: Browser,
  token: string,
  checks: LocalePageCheck[],
): Promise<void> {
  const context = await browser.newContext();
  await configureBrowserActor(context, token);
  await context.addCookies([
    browserCookie("bestar_locale", "zh-CN"),
    browserCookie("bestar_theme", "dark"),
  ]);
  const page = await context.newPage();
  const consoleMessages: string[] = [];
  const onConsole = (message: { text: () => string; type: () => string }) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push(message.text());
    }
  };
  page.on("console", onConsole);

  try {
    for (const check of checks) {
      await page.goto(absoluteUrl(check.path), { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

      const firstFrame = await page.locator("body").innerText();
      expect(firstFrame, `Chinese first frame ${check.path}`).toContain(check.zhText);
      for (const text of check.requiredChinese ?? []) {
        expect(firstFrame, `Chinese first frame ${check.path}`).toContain(text);
      }
      await expectNoForbiddenVisibleText(
        page,
        [
          ...forbiddenBilingualStatusPatterns,
          ...forbiddenChineseEnglishStatusPatterns,
          ...forbiddenChineseUiTextPatterns,
        ],
        `Chinese first frame ${check.path}`,
      );
      const bodyStyle = await page.locator("body").evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
          display: style.display,
          opacity: style.opacity,
          visibility: style.visibility,
        };
      });
      expect(bodyStyle.display).not.toBe("none");
      expect(bodyStyle.opacity).not.toBe("0");
      expect(bodyStyle.visibility).not.toBe("hidden");

      await page.waitForLoadState("networkidle");
      const hydrated = await page.locator("body").innerText();
      expect(hydrated, `Chinese hydrated frame ${check.path}`).toContain(
        check.zhText,
      );
      for (const text of check.requiredChinese ?? []) {
        expect(hydrated, `Chinese hydrated frame ${check.path}`).toContain(text);
      }
      await expectNoForbiddenVisibleText(
        page,
        [
          ...forbiddenBilingualStatusPatterns,
          ...forbiddenChineseEnglishStatusPatterns,
          ...forbiddenChineseUiTextPatterns,
        ],
        `Chinese hydrated frame ${check.path}`,
      );
    }

    const hydrationMessages = consoleMessages.filter((message) =>
      /hydration|mismatch|expected server html|mutationobserver/i.test(message),
    );
    expect(hydrationMessages).toEqual([]);
  } finally {
    page.off("console", onConsole);
    await context.close();
  }
}

async function expectLocaleThemeAndClientNavigation(page: Page): Promise<void> {
  await page.context().addCookies([
    browserCookie("bestar_locale", "zh-CN"),
    browserCookie("bestar_theme", "dark"),
  ]);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const inventoryLink = page.locator('a[href="/inventory"]:visible').first();
  await expect(inventoryLink).toBeVisible();
  await inventoryLink.click();
  await expect(page).toHaveURL(/\/inventory/);
  await expect(await visibleTextLocator(page, "库存工作区")).toBeVisible();

  await page.getByRole("button", { name: "浅色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(await visibleTextLocator(page, "库存工作区")).toBeVisible();

  await switchToEnglish(page);
  await expect(await visibleTextLocator(page, "Inventory workspace")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
}

function browserCookie(name: string, value: string) {
  return {
    httpOnly: false,
    name,
    sameSite: "Lax" as const,
    secure: false,
    url: E2E_BASE_URL,
    value,
  };
}

function absoluteUrl(pathname: string): string {
  return new URL(pathname, E2E_BASE_URL).toString();
}

function expectBodyToContain(body: string, text: string, message: string): void {
  expect(normalizeVisibleText(body), message).toContain(normalizeVisibleText(text));
}

function expectBodyNotToContain(
  body: string,
  text: string,
  message: string,
): void {
  expect(normalizeVisibleText(body), message).not.toContain(
    normalizeVisibleText(text),
  );
}

function normalizeVisibleText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

async function visibleTextLocator(page: Page, text: string): Promise<Locator> {
  const candidates = page.getByText(text, { exact: true });
  await expect
    .poll(
      () => visibleCandidateIndex(candidates),
      { message: `Expected visible text ${JSON.stringify(text)}` },
    )
    .toBeGreaterThanOrEqual(0);
  const index = await visibleCandidateIndex(candidates);

  if (index >= 0) {
    return candidates.nth(index);
  }

  throw new Error(`Expected visible text ${JSON.stringify(text)} after polling.`);
}

async function visibleCandidateIndex(candidates: Locator): Promise<number> {
  const count = await candidates.count();

  for (let index = 0; index < count; index += 1) {
    if (await candidates.nth(index).isVisible()) {
      return index;
    }
  }

  return -1;
}

async function switchToChinese(page: Page): Promise<void> {
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByLabel("语言")).toHaveAttribute("aria-busy", "false");
}

async function switchToEnglish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByLabel("Language")).toHaveAttribute("aria-busy", "false");
}

async function expectNoForbiddenVisibleText(
  page: Page,
  patterns: readonly RegExp[],
  context: string,
): Promise<void> {
  const text = await page.locator("body").innerText();
  for (const pattern of patterns) {
    expect(text, `${context} should not show ${pattern}`).not.toMatch(pattern);
  }
}

async function prepareLocaleFixture(
  request: APIRequestContext,
  adminToken: string,
  testInfo: { project: { name: string } },
): Promise<LocaleFixture> {
  const suffix = uniqueSuffix(testInfo.project.name);
  const worker = await createTemporaryUnloader(request, adminToken, suffix);
  await createCompletedContainer(
    request,
    adminToken,
    `LQAU${suffix}U`,
    worker.id,
  );
  const inProgress = await createScannedContainer(
    request,
    adminToken,
    `LQBU${suffix}P`,
    {
      palletCount: 2,
      scanCount: 1,
      suffix,
    },
  );
  const loaded = await createScannedContainer(
    request,
    adminToken,
    `LQCU${suffix}L`,
    {
      palletCount: 1,
      scanCount: 1,
      suffix,
    },
  );

  await createSettlement(request, adminToken, settlementMonth);
  const attendanceImportId = await ensureGeneratedAttendanceImport(
    request,
    adminToken,
  );
  const importId = await ensureImportedUnloadingPlan(request, adminToken);

  return {
    attendanceImportId,
    importId,
    loadedContainerId: loaded.containerId,
    loadedContainerNo: loaded.containerNo,
    mobileLoadJobId: inProgress.loadJobId,
  };
}

async function createCompletedContainer(
  request: APIRequestContext,
  token: string,
  containerNo: string,
  workerId: string,
): Promise<{ containerId: string; containerNo: string }> {
  const container = await createManualContainer(request, token, containerNo, 1);
  await saveOceanPayUnit(request, token, container.id);
  await generateLabels(request, token, container.id);
  await expectOk(
    request.put(`/api/containers/${container.id}/unloaders`, {
      data: {
        reason: "Playwright locale switch unloading worker",
        unloaders: [{ unloadingWorkerId: workerId }],
      },
      headers: authHeaders(token),
    }),
  );
  await completeUnloading(request, token, container.id);
  return { containerId: container.id, containerNo };
}

async function createScannedContainer(
  request: APIRequestContext,
  token: string,
  containerNo: string,
  input: { palletCount: number; scanCount: number; suffix: string },
): Promise<{ containerId: string; containerNo: string; loadJobId: string }> {
  const container = await createManualContainer(
    request,
    token,
    containerNo,
    input.palletCount,
  );
  await saveOceanPayUnit(request, token, container.id);
  const labels = await generateLabels(request, token, container.id);
  await completeUnloading(request, token, container.id);
  const loadJob = await createLoadJob(
    request,
    token,
    containerNo,
    input.scanCount,
    input.suffix,
  );
  await expectOk(
    request.patch(`/api/load-jobs/${loadJob.id}`, {
      data: { status: "IN_PROGRESS" },
      headers: authHeaders(token),
    }),
  );

  for (const pallet of labels.pallets.slice(0, input.scanCount)) {
    await expectOk(
      request.post(`/api/load-jobs/${loadJob.id}/scan`, {
        data: {
          deviceId: "playwright-locale-switch",
          qrPayload: pallet.qrPayload,
        },
        headers: authHeaders(token),
      }),
      201,
    );
  }

  return { containerId: container.id, containerNo, loadJobId: loadJob.id };
}

async function createManualContainer(
  request: APIRequestContext,
  token: string,
  containerNo: string,
  pallets: number,
): Promise<{ id: string }> {
  const response = await expectOk(
    request.post("/api/containers/manual", {
      data: {
        company: "Bestar Locale E2E",
        containerNo,
        correctionNote: "Playwright locale switch fixture",
        destinations: [
          {
            cartons: pallets * 12,
            destinationCode: "YEG2",
            destinationType: "WAREHOUSE",
            note: "Playwright locale switch destination",
            pallets,
            volume: 1.25,
          },
        ],
        dockNo: "E2E",
        reason: "Playwright locale switch fixture",
      },
      headers: authHeaders(token),
    }),
    201,
  );
  const body = (await response.json()) as { container: { id: string } };
  return body.container;
}

async function createTemporaryUnloader(
  request: APIRequestContext,
  token: string,
  suffix: string,
): Promise<{ id: string }> {
  const response = await expectOk(
    request.post("/api/unloading-wage/workers", {
      data: {
        displayName: `Locale Switch Worker ${suffix}`,
        note: "Playwright locale switch worker",
        workerCode: `LSW-${suffix}`,
      },
      headers: authHeaders(token),
    }),
    201,
  );
  return (await response.json()) as { id: string };
}

async function saveOceanPayUnit(
  request: APIRequestContext,
  token: string,
  containerId: string,
): Promise<void> {
  await expectOk(
    request.patch(`/api/containers/${containerId}/unloading-wage`, {
      data: {
        classification: "OCEAN_CONTAINER",
        reason: "Playwright locale switch wage unit",
      },
      headers: authHeaders(token),
    }),
  );
}

async function completeUnloading(
  request: APIRequestContext,
  token: string,
  containerId: string,
): Promise<void> {
  await expectOk(
    request.post(`/api/containers/${containerId}/complete-unloading`, {
      data: {
        completedAt,
        note: "Playwright locale switch completion",
        reason: "Playwright locale switch completion",
      },
      headers: authHeaders(token),
    }),
    201,
  );
}

async function generateLabels(
  request: APIRequestContext,
  token: string,
  containerId: string,
): Promise<{ pallets: Array<{ qrPayload: string }> }> {
  const response = await expectOk(
    request.post(`/api/containers/${containerId}/generate-labels`, {
      headers: authHeaders(token),
    }),
    201,
  );
  return (await response.json()) as { pallets: Array<{ qrPayload: string }> };
}

async function createLoadJob(
  request: APIRequestContext,
  token: string,
  containerNo: string,
  plannedPallets: number,
  suffix: string,
): Promise<{ id: string }> {
  const response = await expectOk(
    request.post("/api/load-jobs", {
      data: {
        destinationRegion: "YEG2",
        dockNo: "LS",
        lines: [
          {
            containerNo,
            destinationCode: "YEG2",
            plannedPallets,
            sourceText: `${containerNo}-${plannedPallets}P`,
          },
        ],
        loadNo: `LOC-${suffix}-${containerNo.slice(-1)}`,
        scheduledDepartureAt: "2026-06-18T22:00:00.000Z",
        truckNo: `TR-${suffix}`,
      },
      headers: authHeaders(token),
    }),
    201,
  );
  return (await response.json()) as { id: string };
}

async function createSettlement(
  request: APIRequestContext,
  token: string,
  month: string,
): Promise<void> {
  await expectOk(
    request.post("/api/unloading-wage-settlements", {
      data: { settlementMonth: month },
      headers: authHeaders(token),
    }),
    201,
  );
}

async function ensureGeneratedAttendanceImport(
  request: APIRequestContext,
  token: string,
): Promise<string> {
  const fileBuffer = await readFile(attendanceFixturePath);
  const uploadResponse = await request.post("/api/attendance-imports", {
    headers: authHeaders(token),
    multipart: {
      file: {
        buffer: fileBuffer,
        mimeType: "application/vnd.ms-excel",
        name: "workAttendanceRecordForm_June.xls",
      },
    },
  });
  expect([201, 409]).toContain(uploadResponse.status());
  const uploadBody = (await uploadResponse.json()) as {
    details?: {
      existingImport?: { id?: string };
      existingImportId?: string;
    };
    id?: string;
  };
  const id =
    uploadBody.id ??
    uploadBody.details?.existingImportId ??
    uploadBody.details?.existingImport?.id;
  expect(id).toBeTruthy();

  await expectOk(
    request.post(`/api/attendance-imports/${id}/parse`, {
      headers: authHeaders(token),
    }),
    201,
  );
  await expectOk(
    request.post(`/api/attendance-imports/${id}/generate-wage-record`, {
      headers: authHeaders(token),
    }),
    201,
  );

  return id!;
}

async function ensureImportedUnloadingPlan(
  request: APIRequestContext,
  token: string,
): Promise<string> {
  const fileBuffer = await readFile(unloadingFixturePath);
  const uploadResponse = await request.post("/api/imports", {
    headers: authHeaders(token),
    multipart: {
      file: {
        buffer: fileBuffer,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        name: "Unloading Plan CSNU8877228.xlsx",
      },
    },
  });
  expect([201, 409]).toContain(uploadResponse.status());
  const body = (await uploadResponse.json()) as {
    details?: { existingImport?: { id?: string } };
    id?: string;
  };
  const id = body.id ?? body.details?.existingImport?.id;
  expect(id).toBeTruthy();
  return id!;
}

async function expectOk(
  responsePromise: Promise<APIResponse>,
  status = 200,
): Promise<APIResponse> {
  const response = await responsePromise;
  expect(response.status()).toBe(status);
  return response;
}

function uniqueSuffix(projectName: string): string {
  const projectDigit = projectName.includes("mobile") ? "2" : "1";
  return `${projectDigit}${Date.now().toString().slice(-6)}`;
}
