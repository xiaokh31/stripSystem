import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { E2E_BASE_URL, loginThroughApi } from "./helpers";

const OUTPUT_DIR = "test-results/web-brand-02";

test("anonymous login keeps one responsive corporate identity", async ({
  page,
}) => {
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });

  await setPresentation(page.context(), "en", "light");
  await page.setViewportSize({ height: 768, width: 1366 });
  await page.goto("/login");
  await assertSingleVisibleBrand(page, "wordmark-on-dark.png", 228, 50);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Check API health" }))
    .toBeVisible();
  await assertNoDocumentOverflow(page);
  await page.screenshot({
    path: `${OUTPUT_DIR}/anonymous-login-en-light-1366x768.png`,
  });

  await setPresentation(page.context(), "zh-CN", "dark");
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/login");
  await assertSingleVisibleBrand(page, "wordmark-on-dark.png", 228, 50);
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeVisible();
  await assertNoDocumentOverflow(page);
  await page.screenshot({
    path: `${OUTPUT_DIR}/anonymous-login-zh-CN-dark-390x844.png`,
  });

  await page.setViewportSize({ height: 720, width: 320 });
  await page.reload();
  await assertSingleVisibleBrand(page, "compact-mark.png", 64, 64);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await assertNoDocumentOverflow(page);
  await page.screenshot({
    path: `${OUTPUT_DIR}/anonymous-login-zh-CN-dark-320x720-compact.png`,
  });
});

test("authenticated shell places the wordmark in rail or responsive top shell", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const token = await loginThroughApi(page, request);
  await setPresentation(page.context(), "en", "light");
  await page.setViewportSize({ height: 768, width: 1366 });
  await page.goto("/");
  await expect(page.locator('[data-shell-brand="desktop-rail"]')).toBeVisible();
  await expect(page.locator('[data-shell-brand="top"]')).toBeHidden();
  await assertSingleVisibleBrand(page, "wordmark-on-dark.png", 228, 50);
  await expect(
    page
      .locator('[data-shell-brand="desktop-rail"]')
      .getByText("Manifest Control Room", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" }))
    .toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await assertNoDocumentOverflow(page);
  await page.screenshot({
    path: `${OUTPUT_DIR}/authenticated-dashboard-en-light-1366x768-rail.png`,
  });

  await setPresentation(page.context(), "zh-CN", "dark");
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");
  await expect(page.locator('[data-shell-brand="desktop-rail"]')).toBeHidden();
  await expect(page.locator('[data-shell-brand="top"]')).toBeVisible();
  await assertSingleVisibleBrand(page, "wordmark-on-dark.png", 228, 50);
  await expect(
    page
      .locator('[data-shell-brand="top"]')
      .getByText("清单作业控制室", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
  await assertNoDocumentOverflow(page);
  await page.screenshot({
    path: `${OUTPUT_DIR}/authenticated-dashboard-zh-CN-dark-390x844-top.png`,
  });

  await page.setViewportSize({ height: 720, width: 320 });
  await page.reload();
  await assertSingleVisibleBrand(page, "compact-mark.png", 64, 64);
  await assertNoDocumentOverflow(page);
  await page.screenshot({
    path: `${OUTPUT_DIR}/authenticated-dashboard-zh-CN-dark-320x720-compact.png`,
  });

  await verifyDesktopZoom(token, testInfo.outputPath("brand-zoom-profile"));
  expect(pageErrors, "Shell page errors").toEqual([]);
});

async function assertSingleVisibleBrand(
  page: Page,
  expectedAsset: string,
  expectedWidth: number,
  expectedHeight: number,
): Promise<void> {
  const visibleBrands = page.locator('[data-shell-brand]:visible');
  await expect(visibleBrands).toHaveCount(1);
  const logo = visibleBrands.getByRole("img", { name: "Bestar Service CCA" });
  await expect(logo).toHaveCount(1);
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((image) => (image as HTMLImageElement).currentSrc))
    .toContain(expectedAsset);
  const box = await logo.boundingBox();
  expect(box?.width).toBeCloseTo(expectedWidth, 0);
  expect(box?.height).toBeCloseTo(expectedHeight, 0);
  expect(
    await logo.evaluate((image) => {
      const element = image as HTMLImageElement;
      return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
    }),
  ).toBe(true);
}

async function assertNoDocumentOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

async function setPresentation(
  context: BrowserContext,
  locale: "en" | "zh-CN",
  theme: "dark" | "light",
): Promise<void> {
  const url = new URL(E2E_BASE_URL).origin;
  await context.addCookies([
    { name: "bestar_locale", sameSite: "Lax", url, value: locale },
    { name: "bestar_theme", sameSite: "Lax", url, value: theme },
  ]);
}

async function verifyDesktopZoom(token: string, userDataDir: string): Promise<void> {
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
    const page = context.pages()[0] ?? (await context.newPage());
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await setRealBrowserZoom(page, worker, 2, 1366);
    await assertSingleVisibleBrand(page, "wordmark-on-dark.png", 228, 50);
    await assertNoDocumentOverflow(page);
    await captureBrowserViewport(
      page,
      `${OUTPUT_DIR}/authenticated-dashboard-en-light-1366x768-zoom-200.png`,
    );
    expect(errors, "200% zoom Shell page errors").toEqual([]);
  } finally {
    await context.close();
  }
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
