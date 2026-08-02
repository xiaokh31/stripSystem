import { readFile } from "node:fs/promises";
import {
  chromium,
  expect,
  request,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";

const publicUrl = required("PUBLIC_DEPLOY_04_PUBLIC_URL");
const lanUrl = required("PUBLIC_DEPLOY_04_LAN_URL");
const email = required("E2E_ADMIN_EMAIL");
const password = required("E2E_ADMIN_PASSWORD");

test("public HTTPS and LAN HTTP keep isolated browser sessions and fail closed cross-origin", async ({ browser }, testInfo) => {
  test.skip(
    process.env.PUBLIC_DEPLOY_04_OUTAGE === "true" ||
      process.env.PUBLIC_DEPLOY_04_PUBLIC_ONLY === "true",
    "normal dual-ingress phase only",
  );
  test.setTimeout(120_000);
  const publicContext = await browser.newContext({
    baseURL: publicUrl,
    ignoreHTTPSErrors: true,
    viewport: { height: 768, width: 1366 },
  });
  const lanContext = await browser.newContext({
    baseURL: lanUrl,
    viewport: { height: 844, width: 390 },
  });
  try {
    const publicCookies = await login(publicContext, publicUrl);
    expectCookiePolicy(publicCookies, true);
    await setPresentation(publicContext, publicUrl, "en", "light");
    await expectUnauthenticated(lanContext, lanUrl);

    const publicRefreshBefore = cookieValue(publicCookies, "bestar_refresh");
    const refreshedPublic = await refresh(publicContext, publicUrl);
    expect(cookieValue(refreshedPublic, "bestar_refresh")).not.toBe(publicRefreshBefore);

    const lanCookies = await login(lanContext, lanUrl);
    expectCookiePolicy(lanCookies, false);
    await setPresentation(lanContext, lanUrl, "zh-CN", "dark");
    expect(cookieValue(lanCookies, "bestar_refresh")).not.toBe(
      cookieValue(refreshedPublic, "bestar_refresh"),
    );
    await refresh(lanContext, lanUrl);

    for (const [context, url, locale, theme, heading] of [
      [publicContext, publicUrl, "en", "light", "Operations dashboard"],
      [lanContext, lanUrl, "zh-CN", "dark", "运营中控台"],
    ] as const) {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${url}/`, { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
      await page.close();
    }

    await verifyPublicBrowserZoom(testInfo.outputPath("zoom-profile"));

    const negative = await request.newContext({ ignoreHTTPSErrors: true });
    try {
      const crossPublic = await negative.post(`${publicUrl}/api/auth/login`, {
        data: { email, password },
        headers: { Origin: lanUrl },
      });
      expect(crossPublic.status()).toBe(403);
      expect(await crossPublic.json()).toMatchObject({ code: "CSRF_ORIGIN_REJECTED" });
      const wrongHost = await negative.post(`${lanUrl}/api/auth/login`, {
        data: { email, password },
        headers: { Host: "wrong.bestar.internal", Origin: lanUrl },
      });
      expect(wrongHost.status()).toBe(403);
      expect(await wrongHost.json()).toMatchObject({ code: "LAN_BROWSER_INGRESS_MISMATCH" });
    } finally {
      await negative.dispose();
    }

    await logout(publicContext, publicUrl);
    expect((await lanContext.request.get(`${lanUrl}/api/auth/me`)).status()).toBe(200);
    await logout(lanContext, lanUrl);
  } finally {
    await publicContext.close();
    await lanContext.close();
  }
});

test("LAN login, generation, and download continue while the public edge is unavailable", async ({ browser }) => {
  test.skip(
    process.env.PUBLIC_DEPLOY_04_OUTAGE !== "true" ||
      process.env.PUBLIC_DEPLOY_04_PUBLIC_ONLY === "true",
    "outage phase only",
  );
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: lanUrl });
  let importId: string | null = null;
  try {
    await login(context, lanUrl);
    const publicProbe = await request.newContext({ ignoreHTTPSErrors: true, timeout: 2_000 });
    try {
      await expect(publicProbe.get(`${publicUrl}/api/health`)).rejects.toThrow();
    } finally {
      await publicProbe.dispose();
    }

    const fixture = await readFile("/workspace/samples/unloading-plans/Unloading Plan CSNU8877228.xlsx");
    const uniqueFixture = Buffer.concat([fixture, Buffer.from(`PUBLIC-DEPLOY-04-${Date.now()}`)]);
    const csrf = cookieValue(await context.cookies(), "bestar_csrf");
    const mutationHeaders = { Origin: lanUrl, "X-CSRF-Token": csrf };
    const uploaded = await context.request.post(`${lanUrl}/api/imports`, {
      headers: mutationHeaders,
      multipart: {
        file: {
          buffer: uniqueFixture,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          name: "public-deploy-04-outage.xlsx",
        },
      },
    });
    expect(uploaded.status()).toBe(201);
    importId = ((await uploaded.json()) as { id: string }).id;

    const parsed = await context.request.post(`${lanUrl}/api/imports/${importId}/parse`, {
      headers: mutationHeaders,
    });
    expect(parsed.status()).toBe(201);
    const containerId = ((await parsed.json()) as { containers: Array<{ id: string }> }).containers[0].id;
    const generated = await context.request.post(`${lanUrl}/api/containers/${containerId}/generate-report`, {
      headers: mutationHeaders,
    });
    expect(generated.status()).toBe(201);
    const fileId = ((await generated.json()) as { generatedFile: { id: string } }).generatedFile.id;
    const download = await context.request.get(
      `${lanUrl}/api/containers/${containerId}/files/${fileId}/download`,
    );
    expect(download.status()).toBe(200);
    expect((await download.body()).byteLength).toBeGreaterThan(1_000);

    const page = await context.newPage();
    await page.goto(`${lanUrl}/`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
  } finally {
    if (importId) {
      const csrf = cookieValue(await context.cookies(), "bestar_csrf");
      await context.request.delete(`${lanUrl}/api/imports/${importId}`, {
        data: { reason: "PUBLIC-DEPLOY-04 synthetic outage cleanup" },
        headers: { Origin: lanUrl, "X-CSRF-Token": csrf },
      });
    }
    await context.close();
  }
});

test("public login remains healthy while the LAN host listener is unpublished", async ({ browser }) => {
  test.skip(process.env.PUBLIC_DEPLOY_04_PUBLIC_ONLY !== "true", "LAN-disabled phase only");
  test.setTimeout(120_000);
  const context = await browser.newContext({
    baseURL: publicUrl,
    ignoreHTTPSErrors: true,
    viewport: { height: 768, width: 1366 },
  });
  try {
    expectCookiePolicy(await login(context, publicUrl), true);
    await refresh(context, publicUrl);
    const page = await context.newPage();
    await page.goto(`${publicUrl}/`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
    await logout(context, publicUrl);
  } finally {
    await context.close();
  }
});

async function login(context: BrowserContext, origin: string) {
  const response = await context.request.post(`${origin}/api/auth/login`, {
    data: { email, password },
    headers: { Origin: origin },
  });
  expect(response.status()).toBe(201);
  return context.cookies();
}

async function refresh(context: BrowserContext, origin: string) {
  const csrf = cookieValue(await context.cookies(), "bestar_csrf");
  const response = await context.request.post(`${origin}/api/auth/browser/refresh`, {
    headers: { Origin: origin, "X-CSRF-Token": csrf },
  });
  expect(response.status()).toBe(201);
  return context.cookies();
}

async function logout(context: BrowserContext, origin: string) {
  const csrf = cookieValue(await context.cookies(), "bestar_csrf");
  const response = await context.request.post(`${origin}/api/auth/browser/logout`, {
    headers: { Origin: origin, "X-CSRF-Token": csrf },
  });
  expect(response.status()).toBe(201);
}

async function expectUnauthenticated(context: BrowserContext, origin: string) {
  expect((await context.request.get(`${origin}/api/auth/me`)).status()).toBe(401);
}

function expectCookiePolicy(cookies: Awaited<ReturnType<BrowserContext["cookies"]>>, secure: boolean) {
  for (const name of ["bestar_access", "bestar_refresh", "bestar_csrf", "bestar_session"]) {
    expect(cookies.find((cookie) => cookie.name === name)).toMatchObject({ sameSite: "Lax", secure });
  }
  expect(cookies.find((cookie) => cookie.name === "bestar_access")?.httpOnly).toBe(true);
  expect(cookies.find((cookie) => cookie.name === "bestar_refresh")?.httpOnly).toBe(true);
  expect(cookies.find((cookie) => cookie.name === "bestar_csrf")?.httpOnly).toBe(false);
  expect(cookies.every((cookie) => !cookie.domain.startsWith("."))).toBe(true);
}

async function setPresentation(
  context: BrowserContext,
  origin: string,
  locale: "en" | "zh-CN",
  theme: "dark" | "light",
) {
  await context.addCookies([
    { name: "bestar_locale", sameSite: "Lax", url: origin, value: locale },
    { name: "bestar_theme", sameSite: "Lax", url: origin, value: theme },
  ]);
}

async function verifyPublicBrowserZoom(userDataDir: string) {
  const extensionPath = `${process.cwd()}/e2e/fixtures/browser-zoom-extension`;
  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    baseURL: publicUrl,
    channel: "chromium",
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { height: 768, width: 1366 },
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await login(context, publicUrl);
    await setPresentation(context, publicUrl, "en", "light");
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${publicUrl}/`, { waitUntil: "networkidle" });
    await setRealBrowserZoom(page, worker, 2, 1366);
    await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await setRealBrowserZoom(page, worker, 1, 1366);
    await logout(context, publicUrl);
  } finally {
    await context.close();
  }
}

async function setRealBrowserZoom(
  page: Page,
  worker: Worker,
  factor: number,
  physicalWidth: number,
) {
  const pageUrl = new URL(page.url()).href;
  await worker.evaluate(
    async ({ factor: targetFactor, url }) => {
      type TabsApi = {
        getZoom(tabId: number): Promise<number>;
        query(queryInfo: object): Promise<Array<{ id?: number; url?: string }>>;
        setZoom(tabId: number, factor: number): Promise<void>;
      };
      const tabsApi = (globalThis as unknown as { chrome: { tabs: TabsApi } })
        .chrome.tabs;
      const tabId = (await tabsApi.query({})).find((tab) => tab.url === url)?.id;
      if (tabId === undefined) throw new Error(`No browser tab found for ${url}`);
      await tabsApi.setZoom(tabId, targetFactor);
      const applied = await tabsApi.getZoom(tabId);
      if (Math.abs(applied - targetFactor) > 0.001) {
        throw new Error(
          `Expected browser zoom ${targetFactor}, received ${applied}`,
        );
      }
    },
    { factor, url: pageUrl },
  );
  await expect
    .poll(() => page.evaluate(() => window.innerWidth))
    .toBe(Math.round(physicalWidth / factor));
}

function cookieValue(cookies: Awaited<ReturnType<BrowserContext["cookies"]>>, name: string): string {
  const value = cookies.find((cookie) => cookie.name === name)?.value;
  expect(value).toBeTruthy();
  return value!;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
