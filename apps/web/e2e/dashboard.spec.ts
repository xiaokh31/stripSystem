import { writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  chromium,
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
  type Worker,
} from "@playwright/test";
import {
  configureBrowserActor,
  ensureTestUser,
  expectNoPageError,
  loginThroughApi,
  loginWithCredentials,
  type E2ETestUser,
} from "./helpers";

const dashboardUsers = [
  {
    email: "e2e-dashboard-office@bestarcca.com",
    name: "E2E Dashboard Office",
    password: "Bestar-E2E-Dashboard-Office-123!",
    roleCodes: ["OFFICE"],
  },
  {
    email: "e2e-dashboard-warehouse@bestarcca.com",
    name: "E2E Dashboard Warehouse",
    password: "Bestar-E2E-Dashboard-Warehouse-123!",
    roleCodes: ["WAREHOUSE"],
  },
  {
    email: "e2e-dashboard-hr-manager@bestarcca.com",
    name: "E2E Dashboard HR Manager",
    password: "Bestar-E2E-Dashboard-HR-123!",
    roleCodes: ["HR_MANAGER"],
  },
  {
    email: "e2e-dashboard-warehouse-manager@bestarcca.com",
    name: "E2E Dashboard Warehouse Manager",
    password: "Bestar-E2E-Dashboard-WM-123!",
    roleCodes: ["WAREHOUSE_MANAGER"],
  },
] as const;

const forbiddenBilingualPatterns = [
  /已拆完\s*\(UNLOADED\)/,
  /已送库\s*\(LOADED\)/,
  /Delivered to destination\s*\/\s*已送库/,
  /Unloaded\s*\/\s*已拆完/,
] as const;

const lifecycleLabels = {
  en: [
    "Uploaded",
    "Parsed",
    "Report generated",
    "Labels generated",
    "Unloaded",
    "Loading in progress",
    "Delivered to destination",
  ],
  "zh-CN": ["已上传", "已解析", "已生成报告", "已生成面单", "已拆完", "装车中", "已送库"],
} as const;

const lifecycleLaneCodes = [
  "UPLOADED",
  "PARSED",
  "REPORT_GENERATED",
  "LABELS_GENERATED",
  "UNLOADED",
  "LOADING_IN_PROGRESS",
  "LOADED",
] as const;

test("operations dashboard trims visible sections by role", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const adminToken = await loginThroughApi(page, request);
  const users = Object.fromEntries(
    await Promise.all(
      dashboardUsers.map(async (input) => [
        input.roleCodes[0],
        await ensureTestUser(request, adminToken, {
          ...input,
          roleCodes: [...input.roleCodes],
        }),
      ]),
    ),
  ) as Record<string, E2ETestUser>;

  await assertAdminDashboard(page);
  await assertOfficeDashboard(page, request, users.OFFICE);
  await assertWarehouseDashboard(page, request, users.WAREHOUSE);
  await assertHrDashboard(page, request, users.HR_MANAGER);
  await assertWarehouseManagerDashboard(
    page,
    request,
    users.WAREHOUSE_MANAGER,
  );
});

test("operations dashboard switches locale without mixed status text", async ({
  page,
  request,
}) => {
  await loginThroughApi(page, request);
  await page.goto("/");

  await switchToEnglish(page);
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText("Action queue");
  await expect(page.locator("body")).toContainText("Container lifecycle");
  await expectNoForbiddenDashboardText(page, "English dashboard");

  await switchToChinese(page);
  await expectDashboardChrome(page, "运营中控台");
  await expect(page.locator("body")).toContainText("行动队列");
  await expect(page.locator("body")).toContainText("柜子流转");
  await expect(page.locator("body")).not.toContainText("Action queue");
  await expect(page.locator("body")).not.toContainText("Container lifecycle");
  await expectNoForbiddenDashboardText(page, "Chinese dashboard");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expectDashboardChrome(page, "运营中控台");
  await expect(page.locator("body")).not.toContainText("dashboard.workQueue");

  await switchToEnglish(page);
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).not.toContainText("运营中控台");
  await expectNoPageError(page);
});

test("dashboard drilldowns show matching records and exclude non-matching sentinels", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const prefix = `DASH07-${uniqueSuffix(testInfo.project.name)}`;
  cleanupDashboardDrilldownFixture(prefix);
  const fixture = createDashboardDrilldownFixture(prefix);

  try {
    await loginThroughApi(page, request);
    await page.goto("/");
    await setDashboardLocale(page, "en");

    await openDashboardDrilldown(page, "IMPORTS_AWAITING_PARSE");
    await expect(page.locator(`[data-record-id="${fixture.matchImportId}"]`))
      .toBeVisible();
    await expect(page.locator(`[data-record-id="${fixture.otherImportId}"]`))
      .toHaveCount(0);

    await page.goto("/");
    await page.locator('[data-lane-code="PARSED"]').click();
    await expect(page.locator(`[data-record-id="${fixture.lifecycleContainerId}"]`))
      .toBeVisible();
    await expect(page.locator(`[data-record-id="${fixture.otherContainerId}"]`))
      .toHaveCount(0);

    await page.goto("/");
    await page
      .locator('[data-drilldown-code="INVENTORY_DESTINATION_REMAINING"]')
      .filter({ hasText: fixture.destinationCode })
      .click();
    await expect(page).toHaveURL(/scope=REMAINING/);
    await expect(page).toHaveURL(
      new RegExp(`destinationCode=${fixture.destinationCode}`),
    );
    await expect(page.locator(`[data-record-id="${fixture.lifecycleContainerId}"]`))
      .toBeVisible();
    await expect(page.locator(`[data-record-id="${fixture.otherContainerId}"]`))
      .toHaveCount(0);

    await page.goto("/");
    await page
      .locator(
        `[data-drilldown-code="ACTIVE_LOAD_JOB"][data-record-id="${fixture.loadJobId}"]`,
      )
      .click();
    await expect(page).toHaveURL(
      new RegExp(`selectedId=${fixture.loadJobId}`),
    );
    await expect(
      page.locator(
        `[data-record-id="${fixture.loadJobId}"][data-selected-record="true"]`,
      ),
    )
      .toHaveAttribute("data-selected-record", "true");

    await page.goto("/");
    await openDashboardDrilldown(page, "ZERO_VOLUME_WITH_CARTONS");
    await expect(page.locator(`[data-record-id="${fixture.exceptionLineId}"]`))
      .toBeVisible();
    await expect(page.locator(`[data-record-id="${fixture.normalLineId}"]`))
      .toHaveCount(0);

    await page.goto("/");
    await openDashboardDrilldown(page, "ATTENDANCE_IMPORTS_NEED_PARSE");
    await expect(page.getByText(fixture.matchAttendanceFilename, { exact: true }))
      .toBeVisible();
    await expect(page.getByText(fixture.otherAttendanceFilename, { exact: true }))
      .toHaveCount(0);

    await page.goto("/");
    await openDashboardDrilldown(page, "WAGE_SETTLEMENTS_NEED_REVIEW");
    await expect(page.locator(`[data-record-id="${fixture.reviewSettlementId}"]`))
      .toBeVisible();
    await expect(page.locator(`[data-record-id="${fixture.otherSettlementId}"]`))
      .toHaveCount(0);

    await page.goto("/");
    await page
      .locator(
        `[data-activity-kind="GENERATED_FILE"][data-record-id="${fixture.generatedFileId}"]`,
      )
      .click();
    await expect(page).toHaveURL(
      new RegExp(`fileId=${fixture.generatedFileId}`),
    );
    await expect(
      page.locator(
        `[data-record-id="${fixture.generatedFileId}"][data-selected-record="true"]`,
      ),
    )
      .toHaveAttribute("data-selected-record", "true");
    await expectNoPageError(page);
  } finally {
    cleanupDashboardDrilldownFixture(prefix);
  }

  expect(dashboardDrilldownFixtureCount(prefix)).toBe(0);
});

test("operations dashboard stays within the page viewport on desktop and mobile", async ({
  page,
  request,
}) => {
  await loginThroughApi(page, request);

  for (const viewport of [
    { height: 768, width: 1366 },
    { height: 1080, width: 1920 },
    { height: 844, width: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expectDashboardChrome(page, "Operations dashboard");
    await expectNoPageError(page);
    expect(
      await hasPageLevelHorizontalOverflow(page),
      `${viewport.width}x${viewport.height} should not create page-level horizontal overflow`,
    ).toBe(false);
  }
});

test("lifecycle dock strip keeps English and Chinese lanes aligned", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const adminToken = await loginThroughApi(page, request);
  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      for (const viewport of [
        { height: 768, width: 1366 },
        { height: 1080, width: 1920 },
        { height: 1024, width: 768 },
        { height: 844, width: 390 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await setDashboardLocale(page, locale);
        await setDashboardTheme(page, locale, theme);
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectDashboardChrome(
          page,
          locale === "en" ? "Operations dashboard" : "运营中控台",
        );
        const strip = page.locator(".lifecycle-dock-strip");
        const panel = page.locator("section.dashboard-panel").filter({ has: strip });
        await expect(strip).toBeVisible();
        await expect(panel).toBeVisible();
        await expectLifecycleLanguage(strip, locale);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          fullPage: true,
          path: `test-results/web-dashboard-06/after/dashboard-lifecycle-${locale}-${theme}-${viewport.width}x${viewport.height}-zoom-100-full.png`,
        });
        await panel.screenshot({
          path: `test-results/web-dashboard-06/after/dashboard-lifecycle-${locale}-${theme}-${viewport.width}x${viewport.height}-zoom-100-panel.png`,
        });
        await assertLifecycleLaneGeometry(page, viewport.width);
        await expectNoForbiddenDashboardText(
          page,
          `${locale}-${theme}-${viewport.width}x${viewport.height}`,
        );

        if (viewport.width <= 768) {
          await strip.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
          });
          await expect(
            strip.getByText(
              locale === "en" ? "Delivered to destination" : "已送库",
              { exact: true },
            ),
          ).toBeVisible();
          await strip.screenshot({
            path: `test-results/web-dashboard-06/after/dashboard-lifecycle-${locale}-${theme}-${viewport.width}x${viewport.height}-zoom-100-strip-end.png`,
          });
        }
      }
    }
  }

  const baseURL = String(testInfo.project.use.baseURL);
  const extensionPath = path.join(
    process.cwd(),
    "e2e/fixtures/browser-zoom-extension",
  );
  const zoomContext = await chromium.launchPersistentContext(
    testInfo.outputPath("browser-zoom-profile"),
    {
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      baseURL,
      channel: "chromium",
      headless: true,
      viewport: { height: 768, width: 1366 },
    },
  );
  try {
    const zoomWorker = await getBrowserZoomWorker(zoomContext);
    await configureBrowserActor(zoomContext, adminToken);
    for (const theme of ["light", "dark"] as const) {
      for (const scale of [1.25, 2]) {
        const zoomPage =
          zoomContext.pages()[0] ?? (await zoomContext.newPage());
        zoomPage.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        zoomPage.on("pageerror", (error) => pageErrors.push(error.message));
        await zoomPage.goto("/");
        await setDashboardLocale(zoomPage, "en");
        await setDashboardTheme(zoomPage, "en", theme);
        await setRealBrowserZoom(zoomPage, zoomWorker, scale);
        await expectLifecycleLanguage(
          zoomPage.locator(".lifecycle-dock-strip"),
          "en",
        );
        await assertLifecycleLaneGeometry(zoomPage, Math.round(1366 / scale));
        const strip = zoomPage.locator(".lifecycle-dock-strip");
        await strip.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
          element.scrollIntoView({ block: "center" });
        });
        await positionBelowStickyHeader(strip);
        const longestLabel = strip.getByText("Delivered to destination", {
          exact: true,
        });
        await expect(longestLabel).toBeVisible();
        await expect(longestLabel).toBeInViewport();
        expect(
          await longestLabel.evaluate((element) => {
            const label = element.getBoundingClientRect();
            const header = document.querySelector("header");
            const headerStyle = header
              ? window.getComputedStyle(header)
              : null;
            const headerBottom =
              headerStyle?.position === "sticky" ||
              headerStyle?.position === "fixed"
                ? Math.max(0, header?.getBoundingClientRect().bottom ?? 0)
                : 0;
            const viewportBottom =
              window.visualViewport?.height ?? window.innerHeight;
            return (
              label.top >= headerBottom - 1 &&
              label.bottom <= viewportBottom + 1
            );
          }),
          `Longest English lifecycle label should be unobscured at ${scale * 100}% browser zoom`,
        ).toBe(true);
        await captureBrowserViewport(
          zoomPage,
          `test-results/web-dashboard-06/after/dashboard-lifecycle-en-${theme}-1366x768-zoom-${Math.round(scale * 100)}-viewport-end.png`,
        );
        await setRealBrowserZoom(zoomPage, zoomWorker, 1);
      }
    }
  } finally {
    await zoomContext.close();
  }

  await page.setViewportSize({ height: 768, width: 1366 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await setDashboardLocale(page, "en");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const strip = page.locator(".lifecycle-dock-strip");
  await expectLifecycleLanguage(strip, "en");
  await assertLifecycleLaneGeometry(page, 1366);
  const firstLane = page.locator('[data-lane-code="UPLOADED"]');
  const restingBackground = await firstLane.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  await firstLane.hover();
  await expect
    .poll(() =>
      firstLane.evaluate(
        (element) => window.getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(restingBackground);
  await page.mouse.move(0, 0);
  await firstLane.focus();
  await expect(firstLane).toBeFocused();
  expect(
    await firstLane.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return (
        element.matches(":focus-visible") &&
        style.outlineStyle !== "none" &&
        Number.parseFloat(style.outlineWidth) >= 2
      );
    }),
  ).toBe(true);
  const firstLaneHref = await firstLane.getAttribute("href");
  await firstLane.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${firstLaneHref?.replace("?", "\\?")}`));

  expect(consoleErrors, "Dashboard browser console errors").toEqual([]);
  expect(pageErrors, "Dashboard uncaught page errors").toEqual([]);
});

async function assertAdminDashboard(page: Page): Promise<void> {
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText("Action queue");
  await expect(page.locator("body")).toContainText("Container lifecycle");
  await expect(page.locator("body")).toContainText("Inventory pressure");
  await expect(page.locator("body")).toContainText("Active load jobs");
  await expect(page.locator("body")).toContainText("Review queue");
  await expect(page.locator("body")).toContainText("Summary and wage queues");
  await expect(page.locator("body")).toContainText("Latest operational records");
  await expect(page.getByRole("link", { name: "Open admin users" }).first())
    .toBeVisible();
  await expect(page.locator("body")).not.toContainText("dashboard.workQueue");
  await expectNoForbiddenDashboardText(page, "ADMIN dashboard");
  await expectNoPageError(page);
}

async function assertOfficeDashboard(
  page: Page,
  request: APIRequestContext,
  user: E2ETestUser,
): Promise<void> {
  await loginWithCredentials(page, request, user);
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText("Inventory pressure");
  await expect(page.locator("body")).toContainText("Active load jobs");
  await expect(page.locator("body")).toContainText("Summary and wage queues");
  await expect(page.getByRole("link", { name: "Open inventory" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open load jobs" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open unloading summary" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open work hours" }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open unloading wage" }))
    .toHaveCount(0);
  await expectNoPageError(page);
}

async function assertWarehouseDashboard(
  page: Page,
  request: APIRequestContext,
  user: E2ETestUser,
): Promise<void> {
  await loginWithCredentials(page, request, user);
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText("Inventory pressure");
  await expect(page.locator("body")).toContainText("Active load jobs");
  await expect(page.getByRole("link", { name: "Open mobile scan" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open unloading summary" }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open work hours" }).first())
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open unloading wage" }).first())
    .toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Summary rows");
  await expectNoPageError(page);
}

async function assertHrDashboard(
  page: Page,
  request: APIRequestContext,
  user: E2ETestUser,
): Promise<void> {
  await loginWithCredentials(page, request, user);
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText(
    "Inventory pressure is unavailable for this account.",
  );
  await expect(page.locator("body")).toContainText(
    "Load job progress is unavailable for this account.",
  );
  await expect(page.locator("body")).toContainText(
    "Attendance imports needing parse",
  );
  await expect(page.getByRole("link", { name: "Open work hours" }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open unloading wage" }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open inventory" }))
    .toHaveCount(0);
  await expectNoPageError(page);
}

async function assertWarehouseManagerDashboard(
  page: Page,
  request: APIRequestContext,
  user: E2ETestUser,
): Promise<void> {
  await loginWithCredentials(page, request, user);
  await page.goto("/");
  await expectDashboardChrome(page, "Operations dashboard");
  await expect(page.locator("body")).toContainText(
    "Inventory pressure is unavailable for this account.",
  );
  await expect(page.locator("body")).toContainText(
    "Load job progress is unavailable for this account.",
  );
  await expect(page.locator("body")).toContainText("Summary and wage queues");
  await expect(page.getByRole("link", { name: "Open unloading wage" }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open unloading summary" }).first())
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open work hours" }))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open inventory" }))
    .toHaveCount(0);
  await expectNoPageError(page);
}

async function expectDashboardChrome(
  page: Page,
  heading: string,
): Promise<void> {
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: heading }),
  ).toBeVisible();
}

async function switchToChinese(page: Page): Promise<void> {
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
}

async function switchToEnglish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

async function expectNoForbiddenDashboardText(
  page: Page,
  context: string,
): Promise<void> {
  const text = await page.locator("body").innerText();
  for (const pattern of forbiddenBilingualPatterns) {
    expect(text, `${context} should not show ${pattern}`).not.toMatch(pattern);
  }
  expect(text, `${context} should not expose dashboard label keys`).not.toMatch(
    /dashboard\.(workQueue|lifecycle|exceptions)\./,
  );
}

async function hasPageLevelHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 4;
  });
}

async function assertLifecycleLaneGeometry(
  page: Page,
  viewportWidth: number,
): Promise<void> {
  const result = await page
    .getByTestId("lifecycle-dock-track")
    .evaluate((track) => {
      const strip = track.parentElement as HTMLElement;
      const rect = (element: Element) => {
        const bounds = element.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        };
      };
      const required = (lane: Element, testId: string) => {
        const element = lane.querySelector(`[data-testid="${testId}"]`);
        if (!element) throw new Error(`Missing ${testId}`);
        return element as HTMLElement;
      };
      const numericStyle = (element: Element) => {
        const style = window.getComputedStyle(element);
        return {
          fontFamily: style.fontFamily,
          fontVariantNumeric: style.fontVariantNumeric,
        };
      };
      const lanes = [...track.children].map((lane) => {
        const index = required(lane, "lifecycle-lane-index");
        const label = required(lane, "lifecycle-lane-label");
        const count = required(lane, "lifecycle-lane-count");
        const bar = required(lane, "lifecycle-lane-progress");
        const ratio = required(lane, "lifecycle-lane-ratio");
        const labelStyle = window.getComputedStyle(label);
        return {
          bar: rect(bar),
          bounds: rect(lane),
          count: rect(count),
          countStyle: numericStyle(count),
          indexStyle: numericStyle(index),
          label: rect(label),
          labelClipped:
            label.scrollWidth > label.clientWidth + 1 ||
            label.scrollHeight > label.clientHeight + 1,
          labelStyle: {
            fontFamily: labelStyle.fontFamily,
            fontSize: Number.parseFloat(labelStyle.fontSize),
            fontStretch: labelStyle.fontStretch,
            letterSpacing: labelStyle.letterSpacing,
            overflowX: labelStyle.overflowX,
            overflowY: labelStyle.overflowY,
            transform: labelStyle.transform,
          },
          laneCode: lane.getAttribute("data-lane-code"),
          ratio: rect(ratio),
          ratioStyle: numericStyle(ratio),
        };
      });
      return {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        lanes,
        scrollWidth: strip.scrollWidth,
        width: strip.clientWidth,
      };
    });
  expect(result.lanes).toHaveLength(7);
  expect(result.lanes.map((lane) => lane.laneCode)).toEqual(lifecycleLaneCodes);
  const first = result.lanes[0]!;
  for (const lane of result.lanes) {
    expect(Math.abs(lane.bounds!.top - first.bounds!.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(lane.bounds!.bottom - first.bounds!.bottom)).toBeLessThanOrEqual(1);
    for (const content of [lane.label, lane.count, lane.bar, lane.ratio]) {
      expect(content!.left).toBeGreaterThanOrEqual(lane.bounds!.left - 1);
      expect(content!.right).toBeLessThanOrEqual(lane.bounds!.right + 1);
      expect(content!.top).toBeGreaterThanOrEqual(lane.bounds!.top - 1);
      expect(content!.bottom).toBeLessThanOrEqual(lane.bounds!.bottom + 1);
    }
    expect(rectanglesOverlap(lane.label!, lane.count!)).toBe(false);
    expect(lane.labelClipped).toBe(false);
    expect(lane.labelStyle!.fontSize).toBeGreaterThanOrEqual(14);
    expect(lane.labelStyle!.fontFamily).toMatch(
      /system-ui|-apple-system|BlinkMacSystemFont|Segoe UI|Arial|Helvetica|sans-serif/i,
    );
    expect(lane.labelStyle!.fontFamily).not.toMatch(/condensed|narrow/i);
    expect(["normal", "100%", "100"]).toContain(lane.labelStyle!.fontStretch);
    expect(["normal", "0px"]).toContain(lane.labelStyle!.letterSpacing);
    expect(lane.labelStyle!.overflowX).not.toMatch(/hidden|clip/);
    expect(lane.labelStyle!.overflowY).not.toMatch(/hidden|clip/);
    expect(lane.labelStyle!.transform).toBe("none");
    for (const style of [
      lane.indexStyle,
      lane.countStyle,
      lane.ratioStyle,
    ]) {
      expect(style.fontFamily).toMatch(
        /SFMono-Regular|Consolas|Liberation Mono|monospace/i,
      );
      expect(style.fontVariantNumeric).toContain("tabular-nums");
    }
    expect(lane.bar!.top).toBeCloseTo(first.bar!.top, 0);
    expect(lane.ratio!.top).toBeCloseTo(first.ratio!.top, 0);
  }
  for (let index = 0; index < result.lanes.length - 1; index += 1) {
    const lane = result.lanes[index]!;
    const nextLane = result.lanes[index + 1]!;
    for (const left of [lane.label, lane.count, lane.bar, lane.ratio]) {
      for (const right of [
        nextLane.label,
        nextLane.count,
        nextLane.bar,
        nextLane.ratio,
      ]) {
        expect(rectanglesOverlap(left!, right!)).toBe(false);
      }
    }
  }
  expect(result.documentScrollWidth).toBeLessThanOrEqual(
    result.documentClientWidth + 4,
  );
  if (viewportWidth >= 1366) {
    expect(result.scrollWidth).toBeLessThanOrEqual(result.width + 1);
  } else {
    expect(result.scrollWidth).toBeGreaterThan(result.width);
  }
}

async function expectLifecycleLanguage(
  strip: Locator,
  locale: "en" | "zh-CN",
): Promise<void> {
  const oppositeLocale = locale === "en" ? "zh-CN" : "en";
  for (const label of lifecycleLabels[locale]) {
    await expect(strip.getByText(label, { exact: true })).toHaveCount(1);
  }
  for (const label of lifecycleLabels[oppositeLocale]) {
    await expect(strip.getByText(label, { exact: true })).toHaveCount(0);
  }
}

async function positionBelowStickyHeader(strip: Locator): Promise<void> {
  await strip.evaluate((element) => {
    const header = document.querySelector("header");
    const headerStyle = header ? window.getComputedStyle(header) : null;
    const headerBottom =
      headerStyle?.position === "sticky" || headerStyle?.position === "fixed"
        ? Math.max(0, header?.getBoundingClientRect().bottom ?? 0)
        : 0;
    const stripTop = element.getBoundingClientRect().top;
    window.scrollBy(0, stripTop - headerBottom - 8);
  });
}

async function getBrowserZoomWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
}

async function setRealBrowserZoom(
  page: Page,
  worker: Worker,
  zoomFactor: number,
): Promise<void> {
  const pageUrl = new URL(page.url()).href;
  await worker.evaluate(
    async ({ factor, url }) => {
      type TabsApi = {
        getZoom(tabId: number): Promise<number>;
        query(queryInfo: object): Promise<Array<{ id?: number; url?: string }>>;
        setZoom(tabId: number, factor: number): Promise<void>;
      };
      const tabsApi = (
        globalThis as unknown as { chrome: { tabs: TabsApi } }
      ).chrome.tabs;
      const tabs = await tabsApi.query({});
      const tabId = tabs.find((tab) => tab.url === url)?.id;
      if (tabId === undefined) throw new Error(`No browser tab found for ${url}`);
      await tabsApi.setZoom(tabId, factor);
      const appliedFactor = await tabsApi.getZoom(tabId);
      if (Math.abs(appliedFactor - factor) > 0.001) {
        throw new Error(`Expected browser zoom ${factor}, received ${appliedFactor}`);
      }
    },
    { factor: zoomFactor, url: pageUrl },
  );
  await expect
    .poll(() => page.evaluate(() => window.innerWidth))
    .toBe(Math.round(1366 / zoomFactor));
}

async function captureBrowserViewport(
  page: Page,
  screenshotPath: string,
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    const screenshot = await session.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    });
    await writeFile(path.resolve(screenshotPath), Buffer.from(screenshot.data, "base64"));
  } finally {
    await session.detach();
  }
}

function rectanglesOverlap(
  left: { bottom: number; left: number; right: number; top: number },
  right: { bottom: number; left: number; right: number; top: number },
): boolean {
  return !(
    left.right <= right.left ||
    right.right <= left.left ||
    left.bottom <= right.top ||
    right.bottom <= left.top
  );
}

interface DashboardDrilldownFixture {
  destinationCode: string;
  exceptionLineId: string;
  generatedFileId: string;
  lifecycleContainerId: string;
  loadJobId: string;
  matchAttendanceFilename: string;
  matchImportId: string;
  normalLineId: string;
  otherAttendanceFilename: string;
  otherContainerId: string;
  otherImportId: string;
  otherSettlementId: string;
  reviewSettlementId: string;
}

async function openDashboardDrilldown(
  page: Page,
  code: string,
): Promise<void> {
  await page.locator(`[data-drilldown-code="${code}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`code=${code}`));
}

function createDashboardDrilldownFixture(
  prefix: string,
): DashboardDrilldownFixture {
  const fixture: DashboardDrilldownFixture = {
    destinationCode: `${prefix}-DEST`,
    exceptionLineId: `${prefix}-line-exception`,
    generatedFileId: `${prefix}-generated`,
    lifecycleContainerId: `${prefix}-container-match`,
    loadJobId: `${prefix}-load-job`,
    matchAttendanceFilename: `${prefix}-attendance-match.xls`,
    matchImportId: `${prefix}-import-match`,
    normalLineId: `${prefix}-line-normal`,
    otherAttendanceFilename: `${prefix}-attendance-other.xls`,
    otherContainerId: `${prefix}-container-other`,
    otherImportId: `${prefix}-import-other`,
    otherSettlementId: `${prefix}-wage-other`,
    reviewSettlementId: `${prefix}-wage-review`,
  };
  runDashboardSql(
    String.raw`
BEGIN;
INSERT INTO import_files
  (id, original_filename, stored_path, file_sha256, format, import_status,
   parse_status, created_at, updated_at)
VALUES
  (:'match_import_id', :'prefix' || '-import-match.xlsx',
   'e2e/dashboard/' || :'prefix' || '/match.xlsx',
   :'prefix' || '-sha-import-match', 'UNKNOWN', 'UPLOADED', 'NOT_PARSED',
   NOW(), NOW()),
  (:'other_import_id', :'prefix' || '-import-other.xlsx',
   'e2e/dashboard/' || :'prefix' || '/other.xlsx',
   :'prefix' || '-sha-import-other', 'UNKNOWN', 'UPLOADED', 'PARSED',
   NOW(), NOW());

INSERT INTO containers
  (id, container_no, source_format, status, created_at, updated_at)
VALUES
  (:'match_container_id', :'prefix' || '-MATCH', 'UNKNOWN', 'PARSED', NOW(), NOW()),
  (:'other_container_id', :'prefix' || '-OTHER', 'UNKNOWN', 'LOADED', NOW(), NOW());

INSERT INTO container_destinations
  (id, container_id, destination_code, destination_type, package_type, cartons,
   volume, calculated_pallets, final_pallets, created_at, updated_at)
VALUES
  (:'prefix' || '-destination-match', :'match_container_id', :'destination_code',
   'WAREHOUSE', 'CARTON', 300, 30, 30, 30, NOW(), NOW()),
  (:'prefix' || '-destination-other', :'other_container_id', :'prefix' || '-OTHER-DEST',
   'WAREHOUSE', 'CARTON', 10, 1, 1, 1, NOW(), NOW());

INSERT INTO pallets
  (id, container_destination_id, pallet_no, pallet_id, qr_payload, status,
   created_at, updated_at)
SELECT :'prefix' || '-pallet-match-' || n,
       :'prefix' || '-destination-match', n,
       :'prefix' || '-PALLET-MATCH-' || n,
       'DASH07|PALLET|' || :'prefix' || '|MATCH|' || n,
       'LABEL_PRINTED', NOW(), NOW()
FROM generate_series(1, 30) AS n;
INSERT INTO pallets
  (id, container_destination_id, pallet_no, pallet_id, qr_payload, status,
   created_at, updated_at)
VALUES
  (:'prefix' || '-pallet-other-1', :'prefix' || '-destination-other', 1,
   :'prefix' || '-PALLET-OTHER-1', 'DASH07|PALLET|' || :'prefix' || '|OTHER|1',
   'LOADED', NOW(), NOW());

INSERT INTO container_lines
  (id, container_id, line_no, destination_code, cartons, volume, raw_json,
   created_at, updated_at)
VALUES
  (:'exception_line_id', :'match_container_id', 1, :'destination_code', 12, 0,
   '{}'::jsonb, NOW(), NOW()),
  (:'normal_line_id', :'other_container_id', 1, :'prefix' || '-OTHER-DEST', 12, 1,
   '{}'::jsonb, NOW(), NOW());

INSERT INTO load_jobs
  (id, job_no, truck_no, dock_no, destination_region, status,
   scheduled_departure_at, started_at, created_at, updated_at)
VALUES
  (:'load_job_id', :'prefix' || '-LOAD', :'prefix' || '-TRUCK', 'D07',
   :'destination_code', 'IN_PROGRESS', TIMESTAMPTZ '2000-01-01 00:00:00+00',
   NOW(), NOW(), NOW());
INSERT INTO load_job_lines
  (id, load_job_id, sequence, source_text, container_no, container_id,
   container_destination_id, destination_code, planned_pallets, external_transfer,
   created_at, updated_at)
VALUES
  (:'prefix' || '-load-line', :'load_job_id', 1, :'prefix' || '-MATCH-30P',
   :'prefix' || '-MATCH', :'match_container_id', :'prefix' || '-destination-match',
   :'destination_code', 30, false, NOW(), NOW());

INSERT INTO attendance_imports
  (id, original_filename, stored_path, file_sha256, import_status, parse_status,
   created_at, updated_at)
VALUES
  (:'prefix' || '-attendance-match', :'match_attendance_filename',
   'e2e/dashboard/' || :'prefix' || '/attendance-match.xls',
   :'prefix' || '-sha-attendance-match', 'UPLOADED', 'NOT_PARSED', NOW(), NOW()),
  (:'prefix' || '-attendance-other', :'other_attendance_filename',
   'e2e/dashboard/' || :'prefix' || '/attendance-other.xls',
   :'prefix' || '-sha-attendance-other', 'UPLOADED', 'ERROR', NOW(), NOW());

INSERT INTO unloading_wage_settlements
  (id, settlement_month, currency, status, total_amount, warning_count,
   error_count, created_at, updated_at)
VALUES
  (:'prefix' || '-wage-review', to_char(NOW(), 'YYYY-MM'), 'CAD',
   'NEEDS_REVIEW', 0, 1, 0, NOW(), NOW()),
  (:'prefix' || '-wage-other', to_char(NOW(), 'YYYY-MM'), 'CAD',
   'GENERATED', 0, 0, 0, NOW(), NOW());

INSERT INTO generated_files
  (id, container_id, file_type, storage_path, file_sha256, status,
   created_at, updated_at)
VALUES
  (:'generated_file_id', :'other_container_id', 'TASK_REPORT_HTML',
   'e2e/dashboard/' || :'prefix' || '/recent-task-report.html',
   :'prefix' || '-sha-generated', 'GENERATED', NOW(), NOW() + INTERVAL '1 minute');
COMMIT;
`,
    dashboardFixtureVariables(prefix, fixture),
  );
  return fixture;
}

function cleanupDashboardDrilldownFixture(prefix: string): void {
  runDashboardSql(
    String.raw`
BEGIN;
DELETE FROM correction_feedback WHERE id LIKE :'prefix_pattern';
DELETE FROM pallet_events WHERE id LIKE :'prefix_pattern'
  OR load_job_id IN (SELECT id FROM load_jobs WHERE id LIKE :'prefix_pattern')
  OR pallet_id IN (SELECT id FROM pallets WHERE id LIKE :'prefix_pattern');
DELETE FROM generated_files WHERE id LIKE :'prefix_pattern';
DELETE FROM load_job_lines WHERE id LIKE :'prefix_pattern';
UPDATE pallets SET load_job_id = NULL WHERE id LIKE :'prefix_pattern';
DELETE FROM load_jobs WHERE id LIKE :'prefix_pattern';
DELETE FROM pallets WHERE id LIKE :'prefix_pattern';
DELETE FROM container_lines WHERE id LIKE :'prefix_pattern';
DELETE FROM container_destinations WHERE id LIKE :'prefix_pattern';
DELETE FROM containers WHERE id LIKE :'prefix_pattern';
DELETE FROM import_files WHERE id LIKE :'prefix_pattern';
DELETE FROM wage_generated_files WHERE id LIKE :'prefix_pattern';
DELETE FROM unloading_wage_settlements WHERE id LIKE :'prefix_pattern';
DELETE FROM attendance_imports WHERE id LIKE :'prefix_pattern';
COMMIT;
`,
    ["-v", `prefix_pattern=${prefix}%`],
  );
}

function dashboardDrilldownFixtureCount(prefix: string): number {
  const output = runDashboardSql(
    String.raw`
COPY (
  SELECT
    (SELECT COUNT(*) FROM import_files WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM containers WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM load_jobs WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM attendance_imports WHERE id LIKE :'prefix_pattern') +
    (SELECT COUNT(*) FROM unloading_wage_settlements WHERE id LIKE :'prefix_pattern')
) TO STDOUT;
`,
    ["-v", `prefix_pattern=${prefix}%`],
  );
  return Number(output.trim());
}

function dashboardFixtureVariables(
  prefix: string,
  fixture: DashboardDrilldownFixture,
): string[] {
  return [
    "-v", `prefix=${prefix}`,
    "-v", `match_import_id=${fixture.matchImportId}`,
    "-v", `other_import_id=${fixture.otherImportId}`,
    "-v", `match_container_id=${fixture.lifecycleContainerId}`,
    "-v", `other_container_id=${fixture.otherContainerId}`,
    "-v", `destination_code=${fixture.destinationCode}`,
    "-v", `exception_line_id=${fixture.exceptionLineId}`,
    "-v", `normal_line_id=${fixture.normalLineId}`,
    "-v", `load_job_id=${fixture.loadJobId}`,
    "-v", `match_attendance_filename=${fixture.matchAttendanceFilename}`,
    "-v", `other_attendance_filename=${fixture.otherAttendanceFilename}`,
    "-v", `generated_file_id=${fixture.generatedFileId}`,
  ];
}

function runDashboardSql(sql: string, variables: string[]): string {
  const result = spawnSync(
    "psql",
    [
      "-h", requiredDashboardEnv("POSTGRES_HOST"),
      "-U", requiredDashboardEnv("POSTGRES_USER"),
      "-d", requiredDashboardEnv("POSTGRES_DB"),
      "-v", "ON_ERROR_STOP=1",
      ...variables,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PGPASSWORD: requiredDashboardEnv("POSTGRES_PASSWORD"),
      },
      input: sql,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function requiredDashboardEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for WEB-DASHBOARD-07.`);
  return value;
}

function uniqueSuffix(projectName: string): string {
  return `${Date.now().toString(36)}${projectName
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 3)}`.toUpperCase();
}

async function setDashboardLocale(
  page: Page,
  locale: "en" | "zh-CN",
): Promise<void> {
  if ((await page.locator("html").getAttribute("lang")) === locale) return;
  if (locale === "en") await switchToEnglish(page);
  else await switchToChinese(page);
}

async function setDashboardTheme(
  page: Page,
  locale: "en" | "zh-CN",
  theme: "light" | "dark",
): Promise<void> {
  const labels = {
    en: { dark: "Dark theme", light: "Light theme" },
    "zh-CN": { dark: "深色主题", light: "浅色主题" },
  } as const;
  await page.getByRole("button", { name: labels[locale][theme] }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}
