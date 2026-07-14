import { writeFile } from "node:fs/promises";
import path from "node:path";
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
    for (const theme of ["light", "dark"] as const) {
      for (const scale of [1.25, 2]) {
        await zoomContext.addCookies([
          {
            httpOnly: false,
            name: "bestar_auth_token",
            sameSite: "Lax",
            secure: false,
            url: new URL(baseURL).origin,
            value: adminToken,
          },
        ]);
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
