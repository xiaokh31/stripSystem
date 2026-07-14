import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import {
  E2E_BASE_URL,
  authHeaders,
  loginThroughApi,
} from "./helpers";

const OUTPUT_DIR = "test-results/web-ops-01";
const viewportMatrix = [
  { height: 844, width: 390 },
  { height: 1024, width: 768 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
  { height: 1440, width: 2560 },
  { height: 1800, width: 2880 },
] as const;

const officeRoutes = [
  "/",
  "/imports",
  "/imports/new",
  "/containers",
  "/reports",
  "/reports/inventory",
  "/load-jobs",
  "/load-jobs/history",
  "/work-hours",
  "/unloading-wage",
  "/unloading-summary",
  "/settings",
  "/admin/users",
  "/admin/roles",
  "/__web_ops_missing__",
] as const;

const criticalPages = [
  {
    en: "Operations dashboard",
    screenshot: "dashboard",
    zh: "运营中控台",
    path: "/",
  },
  {
    en: "Container detail",
    screenshot: "container-detail",
    zh: "柜子详情",
    path: "CONTAINER_DETAIL",
  },
  {
    en: "Pallet inventory by container and destination",
    screenshot: "inventory",
    zh: "按柜子和目的仓查看托盘库存",
    path: "/reports/inventory",
  },
  {
    en: "Warehouse reports",
    screenshot: "reports",
    zh: "仓库报告",
    path: "/reports",
  },
  {
    en: "Work Hours Settlement",
    screenshot: "work-hours",
    zh: "工时结算",
    path: "/work-hours",
  },
  {
    en: "Warehouse Unloading Wage Settlement",
    screenshot: "unloading-wage",
    zh: "仓库卸柜工资结算",
    path: "/unloading-wage",
  },
  {
    en: "Operational settings",
    screenshot: "settings",
    zh: "运营设置",
    path: "/settings",
  },
] as const;

type Locale = "en" | "zh-CN";
type Theme = "dark" | "light";
type CriticalPage = (typeof criticalPages)[number];

interface CriticalPagePresentation {
  criticalPage: CriticalPage;
  locale: Locale;
  route: string;
  theme: Theme;
}

interface WorkspaceGeometry {
  documentClientWidth: number;
  documentScrollWidth: number;
  main: {
    clientWidth: number;
    left: number;
    maxWidth: string;
    paddingLeft: string;
    paddingRight: string;
    right: number;
    scrollWidth: number;
    width: number;
  };
  nav: { left: number; right: number; width: number } | null;
  route: string;
  viewportHeight: number;
  viewportWidth: number;
}

test("authenticated office pages use the shared 2048px workspace without overflow", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(480_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const token = await loginThroughApi(page, request);
  const container = await createContainerFixture(request, token);
  await setPresentation(page.context(), "en", "light");
  const geometryRecords: WorkspaceGeometry[] = [];

  for (const viewport of viewportMatrix) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Operations dashboard" }))
      .toBeVisible();
    geometryRecords.push(await assertWorkspaceGeometry(page, "/"));
    await page.screenshot({
      path: `${OUTPUT_DIR}/dashboard-en-light-${viewport.width}x${viewport.height}.png`,
    });
  }

  await page.setViewportSize({ height: 1800, width: 2880 });
  for (const route of [
    ...officeRoutes,
    `/containers/${container.id}`,
    `/containers/${container.id}/corrections`,
  ]) {
    await page.goto(route);
    geometryRecords.push(await assertWorkspaceGeometry(page, route));
  }

  for (const viewport of [
    { height: 844, width: 390 },
    { height: 1024, width: 768 },
    { height: 768, width: 1366 },
    { height: 1080, width: 1920 },
  ]) {
    await page.setViewportSize(viewport);
    for (const criticalPage of criticalPages) {
      const route = resolveRoute(criticalPage.path, container.id);
      await page.goto(route);
      await expectLocalizedPage(page, criticalPage.en, criticalPage.zh, "en");
      geometryRecords.push(await assertWorkspaceGeometry(page, route));
      await assertHeadingsAndActionsAreNotClipped(page);
    }
  }

  await page.setViewportSize({ height: 1800, width: 2880 });
  await forEachCriticalPagePresentation(
    page,
    container.id,
    async ({ criticalPage, locale, route, theme }) => {
      geometryRecords.push(await assertWorkspaceGeometry(page, route));
      if (locale === "en" && theme === "light") {
        await page.screenshot({
          fullPage: true,
          path: `${OUTPUT_DIR}/${criticalPage.screenshot}-${locale}-${theme}-2880x1800-full.png`,
        });
      }
      if (route === "/") {
        await page.screenshot({
          path: `${OUTPUT_DIR}/dashboard-${locale}-${theme}-2880x1800.png`,
        });
      }
    }
  );

  await writeFile(
    path.resolve(OUTPUT_DIR, "workspace-geometry.json"),
    `${JSON.stringify(geometryRecords, null, 2)}\n`,
  );

  await verifyRealBrowserZoom(
    token,
    container.id,
    testInfo.outputPath("zoom-profile"),
  );
  await verifyCompactRoutes(page, token);
  expect(pageErrors, "Office layout page errors").toEqual([]);
});

async function assertWorkspaceGeometry(
  page: Page,
  route: string,
): Promise<WorkspaceGeometry> {
  const main = page.locator("main.office-main-content").first();
  await expect(main).toBeVisible();
  const geometry = await main.evaluate((element, currentRoute) => {
    const mainRect = element.getBoundingClientRect();
    const mainStyle = window.getComputedStyle(element);
    const navElement = document.querySelector("aside");
    const navStyle = navElement ? window.getComputedStyle(navElement) : null;
    const navRect =
      navElement && navStyle?.display !== "none"
        ? navElement.getBoundingClientRect()
        : null;
    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      main: {
        clientWidth: element.clientWidth,
        left: mainRect.left,
        maxWidth: mainStyle.maxWidth,
        paddingLeft: mainStyle.paddingLeft,
        paddingRight: mainStyle.paddingRight,
        right: mainRect.right,
        scrollWidth: element.scrollWidth,
        width: mainRect.width,
      },
      nav: navRect
        ? { left: navRect.left, right: navRect.right, width: navRect.width }
        : null,
      route: currentRoute,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  }, route);

  expect(geometry.main.maxWidth).toBe("2048px");
  const overflowDiagnostics =
    geometry.documentScrollWidth > geometry.documentClientWidth + 1
      ? await collectOverflowDiagnostics(page)
      : [];
  expect(
    geometry.documentScrollWidth,
    `Page overflow diagnostics: ${JSON.stringify(overflowDiagnostics)}`,
  ).toBeLessThanOrEqual(
    geometry.documentClientWidth + 1,
  );
  expect(geometry.main.scrollWidth).toBeLessThanOrEqual(
    geometry.main.clientWidth + 1,
  );
  expect(geometry.main.width).toBeLessThanOrEqual(2048.5);

  const railWidth = geometry.documentClientWidth >= 1024 ? 256 : 0;
  const expectedWidth = Math.min(
    2048,
    geometry.documentClientWidth - railWidth,
  );
  expect(geometry.main.width).toBeCloseTo(expectedWidth, 0);
  expect(geometry.main.left + geometry.main.right).toBeCloseTo(
    railWidth + geometry.documentClientWidth,
    0,
  );

  if (railWidth > 0) {
    expect(geometry.nav?.width).toBeCloseTo(256, 0);
    expect(geometry.nav?.left).toBeCloseTo(0, 0);
    expect(geometry.nav?.right).toBeCloseTo(256, 0);
  } else {
    expect(geometry.nav).toBeNull();
  }

  if (geometry.documentClientWidth >= 2560) {
    expect(geometry.main.width).toBeGreaterThan(1920);
  }

  return geometry;
}

async function collectOverflowDiagnostics(page: Page): Promise<object[]> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > viewportWidth + 1 || rect.left < -1;
      })
      .filter((element) => {
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== document.body) {
          const style = window.getComputedStyle(ancestor);
          if (
            /auto|scroll|hidden|clip/.test(style.overflowX) &&
            ancestor.scrollWidth > ancestor.clientWidth + 1
          ) {
            return false;
          }
          ancestor = ancestor.parentElement;
        }
        return true;
      })
      .slice(0, 20)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const item = element as HTMLElement;
        const style = window.getComputedStyle(item);
        const parent = item.parentElement;
        return {
          className: item.className,
          clientWidth: item.clientWidth,
          left: rect.left,
          maxWidth: style.maxWidth,
          minWidth: style.minWidth,
          parentClassName: parent?.className,
          parentClientWidth: parent?.clientWidth,
          right: rect.right,
          scrollWidth: item.scrollWidth,
          tagName: item.tagName,
        };
      });
  });
}

async function assertHeadingsAndActionsAreNotClipped(page: Page): Promise<void> {
  const clipped = await page.locator("main.office-main-content").evaluate((main) =>
    [...main.querySelectorAll("h1, h2, button")]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .filter((element) => {
        const item = element as HTMLElement;
        const style = window.getComputedStyle(item);
        const clipsX = /hidden|clip/.test(style.overflowX);
        const clipsY = /hidden|clip/.test(style.overflowY);
        return (
          (clipsX && item.scrollWidth > item.clientWidth + 1) ||
          (clipsY && item.scrollHeight > item.clientHeight + 1)
        );
      })
      .map((element) => element.textContent?.trim() ?? element.tagName),
  );
  expect(clipped, "Visible office headings and actions must not be clipped").toEqual([]);
}

async function expectLocalizedPage(
  page: Page,
  english: string,
  chinese: string,
  locale: Locale,
): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    /^(?:dark|light)$/,
  );
  const expected = locale === "en" ? english : chinese;
  const forbidden = locale === "en" ? chinese : english;
  await expect(page.getByText(expected, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(forbidden, { exact: true })).toHaveCount(0);
}

async function setPresentation(
  context: BrowserContext,
  locale: Locale,
  theme: Theme,
): Promise<void> {
  const url = new URL(E2E_BASE_URL).origin;
  await context.addCookies([
    { name: "bestar_locale", sameSite: "Lax", url, value: locale },
    { name: "bestar_theme", sameSite: "Lax", url, value: theme },
  ]);
}

async function verifyRealBrowserZoom(
  token: string,
  containerId: string,
  userDataDir: string,
): Promise<void> {
  const extensionPath = path.join(
    process.cwd(),
    "e2e/fixtures/browser-zoom-extension",
  );
  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    baseURL: E2E_BASE_URL,
    channel: "chromium",
    headless: true,
    viewport: { height: 768, width: 1366 },
  });

  try {
    const worker = await getBrowserZoomWorker(context);
    const url = new URL(E2E_BASE_URL).origin;
    await context.addCookies([
      {
        httpOnly: false,
        name: "bestar_auth_token",
        sameSite: "Lax",
        secure: false,
        url,
        value: token,
      },
      { name: "bestar_locale", sameSite: "Lax", url, value: "en" },
      { name: "bestar_theme", sameSite: "Lax", url, value: "light" },
    ]);
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    const errors: string[] = [];
    zoomPage.on("pageerror", (error) => errors.push(error.message));
    await zoomPage.goto("/");
    await setRealBrowserZoom(zoomPage, worker, 2, 1366);

    await forEachCriticalPagePresentation(
      zoomPage,
      containerId,
      async ({ locale, route, theme }) => {
        await assertWorkspaceGeometry(
          zoomPage,
          `${route}?zoom=200&locale=${locale}&theme=${theme}`,
        );
        if (route === "/") {
          await captureBrowserViewport(
            zoomPage,
            `${OUTPUT_DIR}/dashboard-${locale}-${theme}-1366x768-zoom-200.png`,
          );
        }
      },
    );
    expect(errors, "200% zoom page errors").toEqual([]);
  } finally {
    await context.close();
  }
}

async function forEachCriticalPagePresentation(
  page: Page,
  containerId: string,
  visit: (presentation: CriticalPagePresentation) => Promise<void>,
): Promise<void> {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await setPresentation(page.context(), locale, theme);
      for (const criticalPage of criticalPages) {
        const route = resolveRoute(criticalPage.path, containerId);
        await page.goto(route);
        await expectLocalizedPage(
          page,
          criticalPage.en,
          criticalPage.zh,
          locale,
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await assertHeadingsAndActionsAreNotClipped(page);
        await visit({ criticalPage, locale, route, theme });
      }
    }
  }
}

async function verifyCompactRoutes(page: Page, token: string): Promise<void> {
  await page.context().clearCookies({ name: "bestar_auth_token" });
  await setPresentation(page.context(), "en", "light");
  await page.setViewportSize({ height: 1440, width: 2560 });

  await page.goto("/login");
  const loginMain = page.locator("main");
  await expect(loginMain).toBeVisible();
  await expect(loginMain).not.toHaveClass(/office-main-content/);
  expect((await loginMain.boundingBox())?.width).toBeLessThanOrEqual(1280.5);
  await page.screenshot({ path: `${OUTPUT_DIR}/login-compact-2560x1440.png` });

  await page.context().addCookies([
    {
      httpOnly: false,
      name: "bestar_auth_token",
      sameSite: "Lax",
      secure: false,
      url: new URL(E2E_BASE_URL).origin,
      value: token,
    },
  ]);
  await page.goto("/mobile/load-jobs");
  await expect(page).toHaveURL(/\/mobile\/load-jobs$/);
  const mobileMain = page.locator("main");
  await expect(mobileMain).toBeVisible();
  await expect(mobileMain).not.toHaveClass(/office-main-content/);
  expect((await mobileMain.boundingBox())?.width).toBeLessThanOrEqual(896.5);
  await page.screenshot({
    path: `${OUTPUT_DIR}/mobile-load-jobs-compact-2560x1440.png`,
  });
}

async function createContainerFixture(
  request: APIRequestContext,
  token: string,
): Promise<{ id: string }> {
  const suffix = Date.now().toString(36).toUpperCase().slice(-8);
  const response = await request.post("/api/containers/manual", {
    data: {
      company: "Bestar WEB-OPS-01 E2E",
      containerNo: `WOPS${suffix}`,
      correctionNote: "WEB-OPS-01 responsive workspace fixture",
      destinations: [
        {
          cartons: 24,
          destinationCode: "YEG2",
          destinationType: "WAREHOUSE",
          note: "WEB-OPS-01 layout fixture",
          pallets: 2,
          volume: 2.5,
        },
      ],
      dockNo: "E2E",
      reason: "WEB-OPS-01 browser layout verification",
    },
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { container: { id: string } };
  return body.container;
}

function resolveRoute(pathname: string, containerId: string): string {
  return pathname === "CONTAINER_DETAIL"
    ? `/containers/${containerId}`
    : pathname;
}

async function getBrowserZoomWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
}

async function setRealBrowserZoom(
  page: Page,
  worker: Worker,
  zoomFactor: number,
  physicalWidth: number,
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
    .toBe(Math.round(physicalWidth / zoomFactor));
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
    await writeFile(
      path.resolve(screenshotPath),
      Buffer.from(screenshot.data, "base64"),
    );
  } finally {
    await session.detach();
  }
}
