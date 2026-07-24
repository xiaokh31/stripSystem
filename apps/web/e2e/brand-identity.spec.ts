import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Worker,
} from "@playwright/test";
import {
  configureBrowserActor,
  E2E_BASE_URL,
  ensureTestUser,
  loginThroughApi,
  loginWithCredentials,
} from "./helpers";

const OUTPUT_DIR = "test-results/web-brand-03";
type Locale = "en" | "zh-CN";
type Theme = "dark" | "light" | "system";

interface VisualCase {
  actor: "admin" | "anonymous" | "multi-role";
  colorScheme?: "dark" | "light";
  locale: Locale;
  name: string;
  route: "/" | "/login" | "/settings";
  theme: Theme;
  viewport: { height: number; width: number };
}

interface GeometryEvidence {
  actor: VisualCase["actor"];
  asset: string;
  brandHeight: number;
  brandWidth: number;
  documentClientWidth: number;
  documentScrollWidth: number;
  locale: Locale;
  name: string;
  naturalHeight: number;
  naturalWidth: number;
  route: VisualCase["route"];
  theme: Theme;
  viewport: { height: number; width: number };
  zoom: number;
}

const expectedLinks = [
  { pathname: "/favicon.ico", rel: "icon", sizes: "16x16" },
  {
    pathname: "/images/logos/favicon-16.ico",
    rel: "icon",
    sizes: "16x16",
  },
  {
    pathname: "/images/logos/favicon-32.ico",
    rel: "icon",
    sizes: "32x32",
  },
  {
    pathname: "/images/logos/favicon.ico",
    rel: "shortcut icon",
    sizes: "16x16",
  },
  {
    pathname: "/images/logos/apple-touch-icon.png",
    rel: "apple-touch-icon",
    sizes: "180x180",
  },
] as const;

test("corporate browser identity metadata and files are served through nginx", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Bestar Warehouse Office");

  const links = await page.locator("head link[rel]").evaluateAll((elements) =>
    elements.map((element) => {
      const link = element as HTMLLinkElement;
      const url = new URL(link.href);
      return {
        pathname: url.pathname,
        rel: link.rel,
        sizes: link.sizes.value || undefined,
      };
    }),
  );

  for (const expectedLink of expectedLinks) {
    expect(links).toContainEqual(expectedLink);
  }

  const responseBodies = new Map<string, Buffer>();
  for (const { pathname } of expectedLinks) {
    const response = await request.get(pathname);
    expect(response.status(), `${pathname} status`).toBe(200);
    const contentType = response.headers()["content-type"] ?? "";
    if (pathname.endsWith(".png")) {
      expect(contentType, `${pathname} content type`).toMatch(/^image\/png\b/);
    } else {
      expect(contentType, `${pathname} content type`).toMatch(
        /^image\/(?:x-icon|vnd\.microsoft\.icon)\b/,
      );
    }
    const body = await response.body();
    expect(body.byteLength, `${pathname} body length`).toBeGreaterThan(0);
    responseBodies.set(pathname, body);
  }

  expect(responseBodies.get("/favicon.ico")).toEqual(
    responseBodies.get("/images/logos/favicon.ico"),
  );

  const origin = new URL(page.url()).origin;
  await page.context().addCookies([
    {
      name: "bestar_locale",
      sameSite: "Lax",
      url: origin,
      value: "zh-CN",
    },
  ]);
  await page.reload();
  await expect(page).toHaveTitle("Bestar 仓库办公室");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    /^(?:dark|light|system)$/,
  );
});

test("removed starter branding is not shipped", async ({ request }) => {
  for (const pathname of [
    "/file.svg",
    "/globe.svg",
    "/next.svg",
    "/vercel.svg",
    "/window.svg",
  ]) {
    expect((await request.get(pathname)).status(), pathname).toBe(404);
  }
});

test("WEB-BRAND-03 closes responsive, locale, theme, accessibility, request, and performance gates", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(900_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  await installBrandObservers(page);

  const browserErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const imageRequests: string[] = [];
  attachDiagnostics(page, browserErrors, pageErrors, failedRequests, imageRequests);

  const adminToken = await loginThroughApi(page, request);
  const suffix = `${Date.now()}`.slice(-10);
  const multiRoleEmail = `e2e-web-brand-03-long-identity-${suffix}@bestarcca.com`;
  let multiRoleToken = "";
  const screenshots: string[] = [];
  const geometry: GeometryEvidence[] = [];

  try {
    const multiRoleUser = await ensureTestUser(request, adminToken, {
      email: multiRoleEmail,
      name: multiRoleEmail,
      password: "Bestar-E2E-WEB-BRAND-03-Long-Identity-123!",
      roleCodes: ["OFFICE", "WAREHOUSE", "HR_MANAGER", "WAREHOUSE_MANAGER"],
    });
    multiRoleToken = await loginWithCredentials(page, request, multiRoleUser);

    const cases: VisualCase[] = [
      {
        actor: "anonymous",
        locale: "en",
        name: "anonymous-login-en-light-320x568",
        route: "/login",
        theme: "light",
        viewport: { height: 568, width: 320 },
      },
      {
        actor: "anonymous",
        locale: "zh-CN",
        name: "anonymous-login-zh-CN-dark-390x844",
        route: "/login",
        theme: "dark",
        viewport: { height: 844, width: 390 },
      },
      {
        actor: "anonymous",
        colorScheme: "dark",
        locale: "en",
        name: "anonymous-login-en-system-dark-768x1024",
        route: "/login",
        theme: "system",
        viewport: { height: 1024, width: 768 },
      },
      {
        actor: "admin",
        locale: "en",
        name: "admin-dashboard-en-light-1366x768",
        route: "/",
        theme: "light",
        viewport: { height: 768, width: 1366 },
      },
      {
        actor: "admin",
        locale: "zh-CN",
        name: "admin-dashboard-zh-CN-dark-1920x1080",
        route: "/",
        theme: "dark",
        viewport: { height: 1080, width: 1920 },
      },
      {
        actor: "admin",
        locale: "en",
        name: "admin-settings-en-dark-2560x1440",
        route: "/settings",
        theme: "dark",
        viewport: { height: 1440, width: 2560 },
      },
      {
        actor: "multi-role",
        locale: "zh-CN",
        name: "multi-role-settings-zh-CN-light-768x1024",
        route: "/settings",
        theme: "light",
        viewport: { height: 1024, width: 768 },
      },
      {
        actor: "multi-role",
        colorScheme: "light",
        locale: "en",
        name: "multi-role-dashboard-en-system-light-390x844",
        route: "/",
        theme: "system",
        viewport: { height: 844, width: 390 },
      },
    ];

    for (const visualCase of cases) {
      await configureCase(
        page.context(),
        visualCase,
        visualCase.actor === "admin"
          ? adminToken
          : visualCase.actor === "multi-role"
            ? multiRoleToken
            : null,
      );
      await page.setViewportSize(visualCase.viewport);
      await page.emulateMedia({ colorScheme: visualCase.colorScheme ?? "light" });
      await assertLocalizedSsr(page, visualCase);
      await page.goto(visualCase.route);
      await assertVisualCase(page, visualCase, 1, geometry);
      if (visualCase.name.includes("2560")) {
        await page.getByRole("button", { name: "Follow system theme" }).focus();
      }
      const screenshotPath = path.resolve(OUTPUT_DIR, `${visualCase.name}.png`);
      await page.screenshot({ path: screenshotPath });
      screenshots.push(screenshotPath);
    }

    await assertLocaleThemeNavigationDoesNotSwapLogo(page, adminToken, imageRequests);
    await assertOperationalClockDoesNotRerenderBrand(page, adminToken);

    const zoomEvidence = await verifyBrowserZoomMatrix(
      adminToken,
      multiRoleToken,
      testInfo.outputPath("brand-zoom-profile"),
      browserErrors,
      pageErrors,
      failedRequests,
      imageRequests,
    );
    screenshots.push(...zoomEvidence.screenshots);
    geometry.push(...zoomEvidence.geometry);

    const baseOrigin = new URL(E2E_BASE_URL).origin;
    const externalImages = imageRequests.filter(
      (url) => new URL(url).origin !== baseOrigin,
    );
    expect(externalImages, "external image requests").toEqual([]);
    expect(
      imageRequests.filter((url) =>
        /(?:file|globe|next|vercel|window)\.svg/i.test(url),
      ),
      "starter asset requests",
    ).toEqual([]);
    expect(
      imageRequests.filter((url) =>
        /wordmark-on-light\.png/i.test(decodeURIComponent(url)),
      ),
      "fixed dark Shell must not request the light-surface wordmark",
    ).toEqual([]);
    expect(
      imageRequests.some((url) =>
        /wordmark-dimensional\.png/i.test(decodeURIComponent(url)),
      ),
      "fixed dark Shell must load the approved transparent alpha mask",
    ).toBe(true);
    expect(browserErrors, "console/hydration/missing-translation errors").toEqual([]);
    expect(pageErrors, "page errors").toEqual([]);
    expect(failedRequests, "broken requests").toEqual([]);
    expect(screenshots).toHaveLength(10);

    const evidencePath = path.resolve(OUTPUT_DIR, "brand-exit-evidence.json");
    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          browserErrors,
          externalImageRequests: externalImages,
          failedRequests,
          geometry,
          imageRequests: [...new Set(imageRequests.map(normalizeRequestPath))].sort(),
          pageErrors,
          screenshots,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    cleanupDisposableUser(multiRoleEmail);
    expect(countUsers(multiRoleEmail)).toBe("0");
  }
});

async function assertVisualCase(
  page: Page,
  visualCase: VisualCase,
  zoom: number,
  geometry: GeometryEvidence[],
) {
  await expect(page.locator("html")).toHaveAttribute("lang", visualCase.locale);
  await expect(page.locator("html")).toHaveAttribute("data-theme", visualCase.theme);
  await expect(page.locator('[data-shell-brand]:visible')).toHaveCount(1);
  const logo = page.locator('[data-shell-brand]:visible').getByRole("img", {
    name: "Bestar Service CCA",
  });
  await expect(logo).toHaveCount(1);
  await expect(logo).toBeVisible();
  await expect(logo.locator("xpath=ancestor::a | ancestor::button")).toHaveCount(0);
  await expect(page.getByText("Bestar Service CCA", { exact: true })).toHaveCount(0);

  const expectedCompact = visualCase.viewport.width / zoom < 360;
  const expectedAsset = expectedCompact ? "compact-mark.png" : "wordmark-on-dark.png";
  await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).currentSrc))
    .toContain(expectedAsset);

  const metrics = await logo.evaluate((image) => {
    const element = image as HTMLImageElement;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      asset: new URL(element.currentSrc).pathname,
      complete: element.complete,
      height: box.height,
      maskImage: style.maskImage || style.getPropertyValue("-webkit-mask-image"),
      naturalHeight: element.naturalHeight,
      naturalWidth: element.naturalWidth,
      width: box.width,
    };
  });
  expect(metrics.complete).toBe(true);
  expect(metrics.naturalWidth).toBeGreaterThan(0);
  expect(metrics.naturalHeight).toBeGreaterThan(0);
  if (expectedCompact) {
    expect(metrics.naturalWidth).toBe(64);
    expect(metrics.naturalHeight).toBe(64);
    expect(metrics.width).toBeLessThanOrEqual(metrics.naturalWidth);
    expect(metrics.height).toBeLessThanOrEqual(metrics.naturalHeight);
    expect(metrics.maskImage).toBe("none");
  } else {
    expect(metrics.maskImage).toContain("wordmark-dimensional.png");
  }
  expect(metrics.width).toBeCloseTo(expectedCompact ? 64 : 228, 0);
  expect(metrics.height).toBeCloseTo(expectedCompact ? 64 : 50, 0);
  expect(metrics.width / metrics.height).toBeCloseTo(
    expectedCompact ? 1 : 228 / 50,
    2,
  );

  const placement = page.locator('[data-shell-brand]:visible');
  const actions = page.locator('[data-shell-actions="true"]:visible');
  await expect(actions).toHaveCount(1);
  expect(await elementsIntersect(placement, actions), "brand/actions overlap").toBe(false);
  const navigation = page.locator("nav:visible");
  if ((await navigation.count()) > 0) {
    expect(await elementsIntersect(placement, navigation.first()), "brand/navigation overlap")
      .toBe(false);
  }

  const documentGeometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(documentGeometry.scrollWidth).toBeLessThanOrEqual(documentGeometry.clientWidth + 1);
  expect(
    await page.locator("img:visible").evaluateAll((images) =>
      images.every((image) => {
        const element = image as HTMLImageElement;
        return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
      }),
    ),
    "all rendered images must decode",
  ).toBe(true);

  const firstBox = await logo.boundingBox();
  await page.waitForTimeout(1_100);
  const secondBox = await logo.boundingBox();
  expect(secondBox).toEqual(firstBox);
  expect(await page.evaluate(() => globalThis.__brandLayoutShiftValue ?? 0)).toBe(0);
  expect(await page.evaluate(() => globalThis.__brandWrongLocaleFrames ?? [])).toEqual([]);

  await assertShellLanguage(page, visualCase.locale);
  if (visualCase.actor === "multi-role") {
    const user = page.locator('[data-shell-user-cluster="authenticated"]');
    await expect(user).toHaveAttribute("data-shell-user-cluster", "authenticated");
    await expect(user.locator("p[title]")).toHaveAttribute("title", /e2e-web-brand-03-long-identity/);
    await expect(user.locator("span")).toHaveCount(4);
    expect(await elementsIntersect(placement, user), "brand/long-user cluster overlap").toBe(false);
  }

  geometry.push({
    actor: visualCase.actor,
    asset: metrics.asset,
    brandHeight: metrics.height,
    brandWidth: metrics.width,
    documentClientWidth: documentGeometry.clientWidth,
    documentScrollWidth: documentGeometry.scrollWidth,
    locale: visualCase.locale,
    name: visualCase.name,
    naturalHeight: metrics.naturalHeight,
    naturalWidth: metrics.naturalWidth,
    route: visualCase.route,
    theme: visualCase.theme,
    viewport: visualCase.viewport,
    zoom,
  });
}

async function assertLocalizedSsr(page: Page, visualCase: VisualCase) {
  const response = await page.context().request.get(visualCase.route);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain(`lang="${visualCase.locale}"`);
  const copy = routeCopy(visualCase.route, visualCase.locale);
  const opposite = routeCopy(
    visualCase.route,
    visualCase.locale === "en" ? "zh-CN" : "en",
  );
  expect(html).toContain(copy);
  expect(html).not.toContain(`>${opposite}<`);
}

function routeCopy(route: VisualCase["route"], locale: Locale) {
  if (route === "/login") return locale === "en" ? "Authentication" : "认证";
  if (route === "/settings") return locale === "en" ? "Operational settings" : "运营设置";
  return locale === "en" ? "Operations dashboard" : "运营中控台";
}

async function assertShellLanguage(page: Page, locale: Locale) {
  const shell = page.locator("header, aside");
  const shellText = (await shell.allTextContents()).join(" ");
  if (locale === "en") {
    expect(shellText).not.toContain("清单作业控制室");
    expect(shellText).not.toContain("当前用户");
    expect(shellText).not.toContain("退出登录");
  } else {
    expect(shellText).not.toContain("Manifest Control Room");
    expect(shellText).not.toContain("Current user");
    expect(shellText).not.toContain("Sign out");
  }
  expect(shellText).not.toMatch(/i18n\.|dashboard\.|theme\./);
}

async function assertLocaleThemeNavigationDoesNotSwapLogo(
  page: Page,
  token: string,
  imageRequests: string[],
) {
  const visualCase: VisualCase = {
    actor: "admin",
    locale: "en",
    name: "interaction",
    route: "/",
    theme: "light",
    viewport: { height: 768, width: 1366 },
  };
  await configureCase(page.context(), visualCase, token);
  await page.setViewportSize(visualCase.viewport);
  await page.goto("/");
  const logo = page.locator('[data-shell-brand]:visible img');
  const initialSource = await logo.evaluate((image) => (image as HTMLImageElement).currentSrc);
  const requestCount = brandAssetRequestCount(imageRequests);
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.getByRole("button", { name: "深色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { exact: true, name: "设置" }).click();
  await expect(page).toHaveURL("/settings");
  await expect(page.locator('[data-shell-brand]:visible img')).toHaveAttribute(
    "alt",
    "Bestar Service CCA",
  );
  expect(await page.locator('[data-shell-brand]:visible img').evaluate(
    (image) => (image as HTMLImageElement).currentSrc,
  )).toBe(initialSource);
  expect(brandAssetRequestCount(imageRequests)).toBe(requestCount);
}

async function assertOperationalClockDoesNotRerenderBrand(page: Page, token: string) {
  const visualCase: VisualCase = {
    actor: "admin",
    locale: "en",
    name: "clock",
    route: "/",
    theme: "light",
    viewport: { height: 768, width: 1366 },
  };
  await configureCase(page.context(), visualCase, token);
  await page.setViewportSize(visualCase.viewport);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const header = document.querySelector("header");
    const logo = document.querySelector('[data-shell-brand]:not([style*="display: none"]) img') as HTMLImageElement | null;
    const clock = document.querySelector('time[data-operational-clock="true"]');
    if (!header || !logo || !clock) throw new Error("Shell performance probes unavailable");
    const beforeSource = logo.currentSrc;
    const beforeRender = Number(clock.getAttribute("data-clock-render-count") ?? "0");
    let nonClockMutations = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (!target?.closest('[data-operational-clock="true"]')) nonClockMutations += 1;
      }
    });
    observer.observe(header, { attributes: true, characterData: true, childList: true, subtree: true });
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    observer.disconnect();
    return {
      afterRender: Number(clock.getAttribute("data-clock-render-count") ?? "0"),
      beforeRender,
      beforeSource,
      currentSource: logo.currentSrc,
      nonClockMutations,
    };
  });
  expect(result.afterRender).toBeGreaterThan(result.beforeRender);
  expect(result.nonClockMutations).toBe(0);
  expect(result.currentSource).toBe(result.beforeSource);
}

async function verifyBrowserZoomMatrix(
  adminToken: string,
  multiRoleToken: string,
  userDataDir: string,
  browserErrors: string[],
  pageErrors: string[],
  failedRequests: string[],
  imageRequests: string[],
) {
  const extensionPath = path.join(process.cwd(), "e2e/fixtures/browser-zoom-extension");
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
  const geometry: GeometryEvidence[] = [];
  const screenshots: string[] = [];
  try {
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    await installBrandObservers(zoomPage);
    attachDiagnostics(zoomPage, browserErrors, pageErrors, failedRequests, imageRequests);
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const cases = [
      {
        actor: "admin" as const,
        colorScheme: "dark" as const,
        locale: "zh-CN" as const,
        name: "admin-dashboard-zh-CN-system-dark-1366x768-zoom-125",
        route: "/" as const,
        theme: "system" as const,
        token: adminToken,
        zoom: 1.25,
      },
      {
        actor: "multi-role" as const,
        colorScheme: "light" as const,
        locale: "en" as const,
        name: "multi-role-settings-en-light-1366x768-zoom-200",
        route: "/settings" as const,
        theme: "light" as const,
        token: multiRoleToken,
        zoom: 2,
      },
    ];
    for (const zoomCase of cases) {
      const visualCase: VisualCase = {
        ...zoomCase,
        viewport: { height: 768, width: 1366 },
      };
      await configureCase(context, visualCase, zoomCase.token);
      await zoomPage.emulateMedia({ colorScheme: zoomCase.colorScheme });
      await zoomPage.goto(zoomCase.route);
      await setRealBrowserZoom(zoomPage, worker, zoomCase.zoom, 1366);
      await assertVisualCase(zoomPage, visualCase, zoomCase.zoom, geometry);
      const screenshotPath = path.resolve(OUTPUT_DIR, `${zoomCase.name}.png`);
      await captureBrowserViewport(zoomPage, screenshotPath);
      screenshots.push(screenshotPath);
      await setRealBrowserZoom(zoomPage, worker, 1, 1366);
    }
  } finally {
    await context.close();
  }
  return { geometry, screenshots };
}

async function configureCase(
  context: BrowserContext,
  visualCase: VisualCase,
  token: string | null,
) {
  const url = new URL(E2E_BASE_URL).origin;
  await configureBrowserActor(context, token);
  const cookies: Array<Parameters<BrowserContext["addCookies"]>[0][number]> = [
    { name: "bestar_locale", sameSite: "Lax" as const, url, value: visualCase.locale },
    { name: "bestar_theme", sameSite: "Lax" as const, url, value: visualCase.theme },
  ];
  await context.addCookies(cookies);
}

async function installBrandObservers(page: Page) {
  await page.addInitScript(() => {
    globalThis.__brandLayoutShiftValue = 0;
    globalThis.__brandWrongLocaleFrames = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEntry[]) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            sources?: Array<{ node?: Node }>;
            value?: number;
          };
          if (
            !shift.hadRecentInput &&
            shift.sources?.some(({ node }) =>
              node instanceof Element && Boolean(node.closest("[data-shell-brand]")),
            )
          ) {
            globalThis.__brandLayoutShiftValue += shift.value ?? 0;
          }
        }
      }).observe({ buffered: true, type: "layout-shift" });
    } catch {
      // Chromium supports LayoutShift; a missing API is surfaced by the geometry gate.
    }
    let frames = 0;
    const sample = () => {
      const locale = document.documentElement.lang;
      const text = document.body?.innerText ?? "";
      if (locale === "en" && /清单作业控制室|当前用户|退出登录/.test(text)) {
        globalThis.__brandWrongLocaleFrames.push(`en:${frames}`);
      }
      if (locale === "zh-CN" && /Manifest Control Room|Current user|Sign out/.test(text)) {
        globalThis.__brandWrongLocaleFrames.push(`zh-CN:${frames}`);
      }
      frames += 1;
      if (frames < 12) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

function attachDiagnostics(
  page: Page,
  browserErrors: string[],
  pageErrors: string[],
  failedRequests: string[],
  imageRequests: string[],
) {
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      /hydration|did not match|missing translation|server rendered html/i.test(message.text())
    ) {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (
      request.resourceType() === "image" ||
      /(?:favicon|apple-touch-icon|images\/logos)/i.test(request.url())
    ) {
      failedRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`,
      );
    }
  });
  page.on("request", (request) => {
    if (request.resourceType() === "image") imageRequests.push(request.url());
  });
}

async function elementsIntersect(left: Locator, right: Locator) {
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
  if (!leftBox || !rightBox) return false;
  return !(
    leftBox.x + leftBox.width <= rightBox.x + 0.5 ||
    rightBox.x + rightBox.width <= leftBox.x + 0.5 ||
    leftBox.y + leftBox.height <= rightBox.y + 0.5 ||
    rightBox.y + rightBox.height <= leftBox.y + 0.5
  );
}

function brandAssetRequestCount(requests: string[]) {
  return requests.filter((url) => /images\/logos\/(?:wordmark|compact-mark)/i.test(decodeURIComponent(url))).length;
}

function normalizeRequestPath(url: string) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

async function setRealBrowserZoom(
  page: Page,
  worker: Worker,
  zoomFactor: number,
  physicalWidth: number,
) {
  const pageUrl = new URL(page.url()).href;
  const appliedFactor = await worker.evaluate(
    async ({ factor, url }) => {
      type TabsApi = {
        getZoom(tabId: number): Promise<number>;
        query(queryInfo: object): Promise<Array<{ id?: number; url?: string }>>;
        setZoom(tabId: number, factor: number): Promise<void>;
      };
      const tabsApi = (globalThis as unknown as { chrome: { tabs: TabsApi } }).chrome.tabs;
      const tabId = (await tabsApi.query({})).find((tab) => tab.url === url)?.id;
      if (tabId === undefined) throw new Error(`No browser tab found for ${url}`);
      await tabsApi.setZoom(tabId, factor);
      return tabsApi.getZoom(tabId);
    },
    { factor: zoomFactor, url: pageUrl },
  );
  expect(appliedFactor).toBeCloseTo(zoomFactor, 3);
  await expect.poll(() => page.evaluate(() => window.innerWidth))
    .toBe(Math.round(physicalWidth / zoomFactor));
}

async function captureBrowserViewport(page: Page, screenshotPath: string) {
  const session = await page.context().newCDPSession(page);
  try {
    const screenshot = await session.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  } finally {
    await session.detach();
  }
}

function cleanupDisposableUser(email: string) {
  const result = runPsql([`email=${email}`], "DELETE FROM users WHERE email = :'email';");
  expect(result.status, result.stderr).toBe(0);
}

function countUsers(email: string) {
  const result = runPsql(
    [`email=${email}`],
    "SELECT COUNT(*) FROM users WHERE email = :'email';",
    true,
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function runPsql(variables: string[], input: string, tuplesOnly = false) {
  const args = [
    "-h",
    requiredEnv("POSTGRES_HOST"),
    "-U",
    requiredEnv("POSTGRES_USER"),
    "-d",
    requiredEnv("POSTGRES_DB"),
    "-v",
    "ON_ERROR_STOP=1",
  ];
  if (tuplesOnly) args.push("-At");
  for (const variable of variables) args.push("-v", variable);
  return spawnSync("psql", args, {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: requiredEnv("POSTGRES_PASSWORD") },
    input,
  });
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for WEB-BRAND-03 E2E cleanup.`);
  return value;
}

declare global {
  // Chromium-only exit-gate probes installed before application scripts run.
  var __brandLayoutShiftValue: number;
  var __brandWrongLocaleFrames: string[];
}
