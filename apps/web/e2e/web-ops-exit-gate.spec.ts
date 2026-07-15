import { spawnSync } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
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
  authHeaders,
  E2E_BASE_URL,
  ensureTestUser,
  loginThroughApi,
  loginWithCredentials,
  type E2ETestUser,
} from "./helpers";

const OUTPUT_DIR = "test-results/web-ops-05";
const CLOCK = 'time[data-operational-clock="true"]';
const viewports = [
  { height: 844, width: 390 },
  { height: 1024, width: 768 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
  { height: 1440, width: 2560 },
  { height: 1800, width: 2880 },
] as const;

type Locale = "en" | "zh-CN";
type Theme = "dark" | "light";
type RoleName = "admin" | "no-inventory" | "office" | "read-only";

interface ExitFixture {
  containerId: string;
  containerNo: string;
  destinationCode: string;
  destinationId: string;
  palletIds: string[];
  storagePaths: string[];
}

interface ExitActors {
  noInventory: E2ETestUser;
  noInventoryRoleId: string;
  office: E2ETestUser;
  readOnly: E2ETestUser;
  readOnlyRoleId: string;
}

interface GeometryRecord {
  documentClientWidth: number;
  documentScrollWidth: number;
  locale: Locale;
  mainLeft: number;
  mainRight: number;
  mainWidth: number;
  navWidth: number | null;
  role: RoleName;
  route: string;
  theme: Theme;
  viewport: { height: number; width: number };
  zoom: number;
}

const routeCopies = {
  dashboard: { en: "Operations dashboard", "zh-CN": "运营中控台" },
  container: { en: "Container detail", "zh-CN": "柜子详情" },
  inventory: { en: "Inventory workspace", "zh-CN": "库存工作区" },
  reports: { en: "Warehouse reports", "zh-CN": "仓库报告" },
  settings: { en: "Operational settings", "zh-CN": "运营设置" },
} as const;

const sectionCopies = {
  en: {
    destination: "Destinations",
    inventory: "Destination inventory",
    wage: "Unloading wage information",
  },
  "zh-CN": {
    destination: "目的仓",
    inventory: "目的仓库存",
    wage: "拆柜工资信息",
  },
} as const;

test("WEB-OPS requirements remain compatible across i18n, visual, role, and inventory gates", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(1_800_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  const browserErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      /hydration|did not match|missing translation|server rendered html/i.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  const adminToken = await loginThroughApi(page, request);
  const suffix = uniqueSuffix(testInfo.project.name);
  let fixture: ExitFixture | null = null;
  let actors: ExitActors | null = null;
  let cleaned = false;

  try {
    fixture = await createFixture(request, adminToken, suffix);
    actors = await createActors(request, adminToken, suffix);
    const geometry: GeometryRecord[] = [];

    await verifyClockIsolation(page);
    await verifyAdminVisualMatrix(page, fixture, geometry);
    await verifyRealBrowserZoom(
      adminToken,
      fixture,
      geometry,
      testInfo.outputPath("zoom-profile"),
    );
    await verifyRoleMatrix(page, request, actors, fixture);
    const mutationEvidence = await verifyInventoryMutationAndConcurrency(
      page,
      request,
      actors.office,
      fixture,
    );

    await writeFile(
      path.resolve(OUTPUT_DIR, "geometry-evidence.json"),
      `${JSON.stringify(geometry, null, 2)}\n`,
    );
    await writeFile(
      path.resolve(OUTPUT_DIR, "inventory-mutation-evidence.json"),
      `${JSON.stringify(mutationEvidence, null, 2)}\n`,
    );
    await writeFile(
      path.resolve(OUTPUT_DIR, "browser-diagnostics.json"),
      `${JSON.stringify({ browserErrors, serverErrors }, null, 2)}\n`,
    );

    const wideRecords = geometry.filter(
      (record) =>
        record.role === "admin" &&
        record.zoom === 100 &&
        [2560, 2880].includes(record.viewport.width),
    );
    expect(wideRecords.length).toBeGreaterThan(0);
    for (const record of wideRecords) {
      expect(record.mainWidth).toBeGreaterThan(1920);
      expect(record.mainWidth).toBeLessThanOrEqual(2048.5);
    }
    expect(browserErrors, "console/page/hydration/missing-translation errors").toEqual(
      [],
    );
    expect(serverErrors, "unexpected 5xx browser responses").toEqual([]);

    await cleanupFixture(fixture, actors);
    cleaned = true;
    await expectFixtureRemoved(fixture, actors);
  } finally {
    if (!cleaned) await cleanupPartialFixture(suffix);
  }
});

async function verifyClockIsolation(page: Page): Promise<void> {
  await setPresentation(page.context(), "en", "light");
  await page.setViewportSize({ height: 900, width: 1366 });
  await page.goto("/", { waitUntil: "networkidle" });
  const clock = page.locator(CLOCK);
  await expect(clock).toHaveCount(1);
  await expect(clock).toHaveAttribute("data-clock-running", "true");
  await expect(clock).not.toHaveAttribute("aria-live", /.+/);
  const values = [await clock.getAttribute("datetime")];
  const clockRequests: string[] = [];
  const listener = (request: { url(): string }) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/")) clockRequests.push(pathname);
  };
  page.on("request", listener);
  for (let index = 0; index < 2; index += 1) {
    await expect
      .poll(() => clock.getAttribute("datetime"), { timeout: 4_000 })
      .not.toBe(values.at(-1));
    values.push(await clock.getAttribute("datetime"));
  }
  page.off("request", listener);
  expect(new Set(values).size).toBe(3);
  expect(clockRequests, "clock ticks must not issue business requests").toEqual([]);

  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.getByRole("link", { exact: true, name: "Reports" }).click();
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator(CLOCK)).toHaveCount(1);
  await expect(page.getByText("运营时间", { exact: true })).toBeVisible();
  await expect(page.getByText("Operational time", { exact: true })).toHaveCount(0);
}

async function verifyAdminVisualMatrix(
  page: Page,
  fixture: ExitFixture,
  geometry: GeometryRecord[],
): Promise<void> {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await setPresentation(page.context(), locale, theme);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        const routes = routeMatrix(fixture);
        for (const route of routes) {
          await page.goto(route.path, { waitUntil: "networkidle" });
          if (route.legacy) {
            await expect(page).toHaveURL(
              new RegExp(
                `/inventory\\?containerNo=${fixture.containerNo}.*containerId=${fixture.containerId}`,
              ),
            );
          }
          await expectLocalizedRoute(page, route.copy, locale);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await assertNoOverflowClippingOrRawUi(page, locale);
          if (route.name === "container") {
            await assertContainerSectionOrder(page, locale);
          }
          if (route.name === "inventory" || route.legacy) {
            await assertInventorySelection(page, fixture, locale);
          }
          geometry.push(
            await collectGeometry(
              page,
              route.name,
              locale,
              theme,
              "admin",
              viewport,
              100,
            ),
          );

          const stem = screenshotStem(
            route.name,
            locale,
            theme,
            viewport.width,
            viewport.height,
            100,
            "admin",
          );
          await page.screenshot({
            fullPage: true,
            path: `${OUTPUT_DIR}/${stem}-full.png`,
          });
          if (viewport.width >= 2560) {
            await captureMainOverlay(page, `${OUTPUT_DIR}/${stem}-main-overlay.png`);
          }
          if (viewport.width >= 2560 && route.name === "container") {
            await page
              .locator("main.office-main-content")
              .screenshot({ path: `${OUTPUT_DIR}/${stem}-sections-crop.png` });
          }
          if (viewport.width >= 2560 && route.name === "inventory") {
            await page
              .locator('[data-selected-container-workspace="true"]')
              .screenshot({ path: `${OUTPUT_DIR}/${stem}-selection-crop.png` });
          }
        }
      }
    }
  }
}

async function verifyRoleMatrix(
  page: Page,
  request: APIRequestContext,
  actors: ExitActors,
  fixture: ExitFixture,
): Promise<void> {
  const route = inventoryRoute(fixture);
  const cases = [
    {
      actor: actors.office,
      role: "office" as const,
      verify: async () => {
        const button = page.getByRole("button", {
          name: "Manual inventory depletion",
        });
        await expect(button).toBeVisible();
        await button.click();
        await expect(
          page.getByRole("button", { name: "Close manual inventory depletion" }),
        ).toBeFocused();
        await page.screenshot({
          fullPage: true,
          path: `${OUTPUT_DIR}/${screenshotStem("inventory-dialog", "en", "light", 1366, 768, 100, "office")}-full.png`,
        });
        await page.keyboard.press("Escape");
        await expect(button).toBeFocused();
      },
    },
    {
      actor: actors.readOnly,
      role: "read-only" as const,
      verify: async () => {
        await expect(
          page.getByText("Inventory read-only", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Manual inventory depletion" }),
        ).toHaveCount(0);
      },
    },
    {
      actor: actors.noInventory,
      role: "no-inventory" as const,
      verify: async () => {
        await expect(
          page.getByRole("heading", { name: "Inventory access is required" }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { exact: true, name: "Inventory" }),
        ).toHaveCount(0);
      },
    },
  ];

  for (const roleCase of cases) {
    await loginWithCredentials(page, request, roleCase.actor);
    await setPresentation(page.context(), "en", "light");
    await page.setViewportSize({ height: 768, width: 1366 });
    await page.goto(route);
    await roleCase.verify();
    await assertNoOverflowClippingOrRawUi(page, "en");
    await page.screenshot({
      fullPage: true,
      path: `${OUTPUT_DIR}/${screenshotStem("inventory", "en", "light", 1366, 768, 100, roleCase.role)}-full.png`,
    });
  }
}

async function verifyInventoryMutationAndConcurrency(
  page: Page,
  request: APIRequestContext,
  office: E2ETestUser,
  fixture: ExitFixture,
) {
  const officeToken = await loginWithCredentials(page, request, office);
  await setPresentation(page.context(), "en", "light");
  await page.setViewportSize({ height: 768, width: 1366 });
  const dashboardPage = await page.context().newPage();
  const containerPage = await page.context().newPage();
  await dashboardPage.goto("/");
  await containerPage.goto(`/containers/${fixture.containerId}`);
  await page.goto(inventoryRoute(fixture));

  const before = await inventorySummary(request, officeToken, fixture.containerId);
  const dashboardBefore = await dashboardRemaining(dashboardPage);
  const button = page.getByRole("button", { name: "Manual inventory depletion" });
  await button.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Manual inventory depletion count").fill("1");
  await dialog
    .getByLabel("Manual inventory depletion reason")
    .selectOption("SCAN_MISSED");
  const note = `WEB-OPS-05 ${fixture.containerNo} audited UI depletion`;
  await dialog.getByLabel("Manual inventory depletion note").fill(note);
  await dialog.getByLabel("Confirm manual inventory depletion").check();
  await dialog
    .getByRole("button", { name: "Confirm manual inventory depletion" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(note, { exact: true })).toBeVisible();

  const afterUi = await inventorySummary(request, officeToken, fixture.containerId);
  expect(afterUi.loadedPallets).toBe(before.loadedPallets);
  expect(afterUi.adjustedOutPallets).toBe(before.adjustedOutPallets + 1);
  expect(afterUi.remainingPallets).toBe(before.remainingPallets - 1);
  await expect.poll(() => dashboardRemaining(dashboardPage)).toBe(dashboardBefore - 1);
  await expect(
    sectionForHeading(containerPage, "Destination inventory"),
  ).toContainText(note);

  const historyAfterUi = await adjustmentHistory(
    request,
    officeToken,
    fixture.destinationId,
  );
  expect(historyAfterUi.items[0]).toMatchObject({
    note,
    palletCount: 1,
    reasonCode: "SCAN_MISSED",
  });
  expect(historyAfterUi.items[0]?.createdById).toBe(office.id);
  expect(historyAfterUi.items[0]?.pallets[0]).toMatchObject({
    eventId: expect.any(String),
    toStatus: "ADJUSTED_OUT",
  });

  const concurrentPalletId = fixture.palletIds.find(
    (palletId) => palletId !== historyAfterUi.items[0]?.pallets[0]?.palletId,
  );
  expect(concurrentPalletId).toBeTruthy();
  const concurrentResponses = await Promise.all([
    createAdjustment(request, officeToken, fixture.destinationId, concurrentPalletId!),
    createAdjustment(request, officeToken, fixture.destinationId, concurrentPalletId!),
  ]);
  expect(concurrentResponses.map((response) => response.status()).sort()).toEqual([
    201,
    409,
  ]);
  const rejected = concurrentResponses.find((response) => response.status() === 409)!;
  expect(await rejected.json()).toMatchObject({
    code: "INVENTORY_ADJUSTMENT_PALLET_NOT_ELIGIBLE",
  });

  const afterConcurrent = await inventorySummary(
    request,
    officeToken,
    fixture.containerId,
  );
  expect(afterConcurrent.loadedPallets).toBe(before.loadedPallets);
  expect(afterConcurrent.adjustedOutPallets).toBe(before.adjustedOutPallets + 2);
  expect(afterConcurrent.remainingPallets).toBe(before.remainingPallets - 2);
  const finalHistory = await adjustmentHistory(
    request,
    officeToken,
    fixture.destinationId,
  );
  expect(finalHistory.items).toHaveLength(2);
  expect(
    finalHistory.items.flatMap((item) => item.pallets).map((pallet) => pallet.eventId),
  ).toEqual([expect.any(String), expect.any(String)]);

  await dashboardPage.close();
  await containerPage.close();
  return {
    afterConcurrent,
    afterUi,
    before,
    concurrentPalletId,
    concurrentStatuses: concurrentResponses.map((response) => response.status()),
    history: finalHistory.items,
    note,
  };
}

async function createAdjustment(
  request: APIRequestContext,
  token: string,
  destinationId: string,
  palletId: string,
) {
  return request.post(
    `/api/container-destinations/${destinationId}/inventory-adjustments`,
    {
      data: {
        note: "WEB-OPS-05 concurrent duplicate guard",
        palletIds: [palletId],
        reasonCode: "DATA_CLEANUP",
      },
      headers: authHeaders(token),
    },
  );
}

function routeMatrix(fixture: ExitFixture) {
  return [
    { copy: routeCopies.dashboard, legacy: false, name: "dashboard", path: "/" },
    {
      copy: routeCopies.container,
      legacy: false,
      name: "container",
      path: `/containers/${fixture.containerId}`,
    },
    {
      copy: routeCopies.inventory,
      legacy: false,
      name: "inventory",
      path: inventoryRoute(fixture),
    },
    {
      copy: routeCopies.inventory,
      legacy: true,
      name: "legacy-inventory",
      path: `/reports/inventory?containerNo=${fixture.containerNo}&containerId=${fixture.containerId}`,
    },
    { copy: routeCopies.reports, legacy: false, name: "reports", path: "/reports" },
    { copy: routeCopies.settings, legacy: false, name: "settings", path: "/settings" },
  ] as const;
}

async function expectLocalizedRoute(
  page: Page,
  copy: { en: string; "zh-CN": string },
  locale: Locale,
): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.getByText(copy[locale], { exact: true }).first()).toBeVisible();
  await expect(page.getByText(copy[locale === "en" ? "zh-CN" : "en"], { exact: true }))
    .toHaveCount(0);
}

async function assertContainerSectionOrder(page: Page, locale: Locale) {
  const copy = sectionCopies[locale];
  const headings = [copy.destination, copy.wage, copy.inventory].map((name) =>
    page.getByRole("heading", { exact: true, level: 2, name }),
  );
  for (const heading of headings) await expect(heading).toBeVisible();
  const positions = await Promise.all(
    headings.map((heading) =>
      heading.evaluate((element) => ({
        sourceIndex: [...document.querySelectorAll<HTMLElement>("h2")].indexOf(
          element as HTMLElement,
        ),
        top: element.getBoundingClientRect().top + window.scrollY,
      })),
    ),
  );
  expect(positions.map((item) => item.sourceIndex)).toEqual(
    [...positions].sort((left, right) => left.sourceIndex - right.sourceIndex)
      .map((item) => item.sourceIndex),
  );
  expect(positions.map((item) => item.top)).toEqual(
    [...positions].sort((left, right) => left.top - right.top).map((item) => item.top),
  );
}

async function assertInventorySelection(
  page: Page,
  fixture: ExitFixture,
  locale: Locale,
) {
  const inventoryName = locale === "en" ? "Inventory" : "库存";
  await expect(
    page.getByRole("link", { exact: true, name: inventoryName }),
  ).toHaveAttribute("aria-current", "page");
  const selected = page.locator('[data-selected-container-workspace="true"]');
  await expect(selected).toContainText(fixture.containerNo);
  await expect(selected).toContainText(fixture.destinationCode);
  await expect(
    selected.locator(`[data-container-destination-id="${fixture.destinationId}"]`),
  ).toBeVisible();
}

async function assertNoOverflowClippingOrRawUi(page: Page, locale: Locale) {
  const diagnostics = await page.locator("body").evaluate((body) => {
    const visible = [...body.querySelectorAll<HTMLElement>("main *")].filter(
      (element) => element.offsetParent !== null,
    );
    return {
      clientWidth: document.documentElement.clientWidth,
      clipped: visible
        .filter((element) => {
          const style = window.getComputedStyle(element);
          return (
            (/hidden|clip/.test(style.overflowX) &&
              element.scrollWidth > element.clientWidth + 1) ||
            (/hidden|clip/.test(style.overflowY) &&
              element.scrollHeight > element.clientHeight + 1)
          );
        })
        .filter((element) => /^(A|BUTTON|H1|H2|H3|LABEL|P|TH)$/.test(element.tagName))
        .slice(0, 20)
        .map((element) => element.textContent?.trim().slice(0, 100)),
      rawUi: visible
        .map((element) => element.childElementCount === 0 ? element.textContent?.trim() ?? "" : "")
        .filter((text) =>
          /^(ADJUSTED_OUT|LABEL_PRINTED|SCAN_MISSED|inventory\.(adjust|read))$/.test(text),
        ),
      scrollWidth: document.documentElement.scrollWidth,
      text: (body as HTMLElement).innerText,
    };
  });
  expect(diagnostics.scrollWidth).toBeLessThanOrEqual(diagnostics.clientWidth + 1);
  expect(diagnostics.clipped).toEqual([]);
  expect(diagnostics.rawUi).toEqual([]);
  if (locale === "en") {
    expect(diagnostics.text).not.toMatch(/运营中控台|库存工作区|目的仓库存|仓库报告|运营设置/);
  } else {
    expect(diagnostics.text).not.toMatch(
      /Operations dashboard|Inventory workspace|Destination inventory|Warehouse reports|Operational settings/,
    );
  }
}

async function collectGeometry(
  page: Page,
  route: string,
  locale: Locale,
  theme: Theme,
  role: RoleName,
  viewport: { height: number; width: number },
  zoom: number,
): Promise<GeometryRecord> {
  return page.locator("main.office-main-content").first().evaluate(
    (main, input) => {
      const mainRect = main.getBoundingClientRect();
      const aside = document.querySelector<HTMLElement>("aside");
      const asideRect = aside?.offsetParent === null ? null : aside?.getBoundingClientRect();
      return {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        locale: input.locale,
        mainLeft: mainRect.left,
        mainRight: mainRect.right,
        mainWidth: mainRect.width,
        navWidth: asideRect?.width ?? null,
        role: input.role,
        route: input.route,
        theme: input.theme,
        viewport: input.viewport,
        zoom: input.zoom,
      };
    },
    { locale, role, route, theme, viewport, zoom },
  );
}

async function captureMainOverlay(page: Page, screenshotPath: string) {
  const main = page.locator("main.office-main-content").first();
  await main.evaluate((element) => {
    element.setAttribute("data-web-ops-main-overlay", "true");
    element.style.outline = "4px solid #ff2d55";
    element.style.outlineOffset = "-4px";
  });
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await main.evaluate((element) => {
    element.removeAttribute("data-web-ops-main-overlay");
    element.style.removeProperty("outline");
    element.style.removeProperty("outline-offset");
  });
}

async function verifyRealBrowserZoom(
  token: string,
  fixture: ExitFixture,
  geometry: GeometryRecord[],
  userDataDir: string,
) {
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
    const worker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await context.addCookies([
      {
        httpOnly: false,
        name: "bestar_auth_token",
        sameSite: "Lax",
        secure: false,
        url: new URL(E2E_BASE_URL).origin,
        value: token,
      },
    ]);
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    for (const locale of ["en", "zh-CN"] as const) {
      for (const theme of ["light", "dark"] as const) {
        await setPresentation(context, locale, theme);
        for (const route of routeMatrix(fixture).filter((item) =>
          ["container", "dashboard", "inventory"].includes(item.name),
        )) {
          await zoomPage.goto(route.path, { waitUntil: "networkidle" });
          for (const zoom of [1.25, 2] as const) {
            await setRealBrowserZoom(zoomPage, worker, zoom, 1366);
            await assertNoOverflowClippingOrRawUi(zoomPage, locale);
            geometry.push(
              await collectGeometry(
                zoomPage,
                route.name,
                locale,
                theme,
                "admin",
                { height: 768, width: 1366 },
                zoom * 100,
              ),
            );
            await captureBrowserViewport(
              zoomPage,
              `${OUTPUT_DIR}/${screenshotStem(route.name, locale, theme, 1366, 768, zoom * 100, "admin")}-viewport.png`,
            );
          }
          await setRealBrowserZoom(zoomPage, worker, 1, 1366);
        }
      }
    }
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
      const tabsApi = (globalThis as unknown as { chrome: { tabs: TabsApi } }).chrome.tabs;
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

async function captureBrowserViewport(page: Page, screenshotPath: string) {
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

async function setPresentation(
  context: BrowserContext,
  locale: Locale,
  theme: Theme,
) {
  const url = new URL(E2E_BASE_URL).origin;
  await context.addCookies([
    { name: "bestar_locale", sameSite: "Lax", url, value: locale },
    { name: "bestar_theme", sameSite: "Lax", url, value: theme },
  ]);
}

function inventoryRoute(fixture: ExitFixture) {
  return `/inventory?containerNo=${fixture.containerNo}&containerId=${fixture.containerId}`;
}

function screenshotStem(
  route: string,
  locale: Locale,
  theme: Theme,
  width: number,
  height: number,
  zoom: number,
  role: RoleName,
) {
  return `${route}-${locale}-${theme}-${width}x${height}-zoom-${zoom}-role-${role}`;
}

function sectionForHeading(page: Page, name: string) {
  return page
    .getByRole("heading", { exact: true, level: 2, name })
    .locator("xpath=ancestor::section[1]");
}

async function inventorySummary(
  request: APIRequestContext,
  token: string,
  containerId: string,
) {
  const response = await request.get(`/api/containers/${containerId}/summary`, {
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    adjustedOutPallets: number;
    loadedPallets: number;
    remainingPallets: number;
  };
}

async function adjustmentHistory(
  request: APIRequestContext,
  token: string,
  destinationId: string,
) {
  const response = await request.get(
    `/api/container-destinations/${destinationId}/inventory-adjustments`,
    { headers: authHeaders(token) },
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    items: Array<{
      createdById: string | null;
      note: string | null;
      palletCount: number;
      pallets: Array<{
        eventId: string | null;
        palletId: string;
        toStatus: string;
      }>;
      reasonCode: string;
    }>;
  };
}

async function dashboardRemaining(page: Page) {
  const link = sectionForHeading(page, "Pallet pressure")
    .locator('a[href="/inventory"]')
    .filter({ hasText: "Remaining pallets" });
  const text = await link.textContent();
  const match = text?.match(/\d[\d,]*/);
  if (!match) throw new Error(`Dashboard remaining pallet count missing: ${text}`);
  return Number(match[0].replaceAll(",", ""));
}

async function createFixture(
  request: APIRequestContext,
  token: string,
  suffix: string,
): Promise<ExitFixture> {
  const containerNo = `WEBOPS05-${suffix}`;
  const destinationCode = `YEG-WEBOPS05-${suffix}`;
  const response = await request.post("/api/containers/manual", {
    data: {
      company: "Bestar WEB-OPS-05 E2E",
      containerNo,
      correctionNote: `WEB-OPS-05 ${suffix} isolated fixture`,
      destinations: [
        {
          cartons: 50,
          destinationCode,
          destinationType: "WAREHOUSE",
          note: "WEB-OPS-05 visual and inventory fixture",
          pallets: 5,
          volume: 5,
        },
      ],
      dockNo: "E2E",
      reason: "WEB-OPS-05 isolated browser fixture",
    },
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as {
    container: { destinations: Array<{ id: string }>; id: string };
  };
  const labelsResponse = await request.post(
    `/api/containers/${body.container.id}/generate-labels`,
    { headers: authHeaders(token) },
  );
  expect(labelsResponse.status()).toBe(201);
  const labels = (await labelsResponse.json()) as {
    generatedFile: { storagePath: string };
    pallets: Array<{ palletId: string }>;
  };
  expect(labels.pallets).toHaveLength(5);
  return {
    containerId: body.container.id,
    containerNo,
    destinationCode,
    destinationId: body.container.destinations[0]!.id,
    palletIds: labels.pallets.map((pallet) => pallet.palletId),
    storagePaths: [labels.generatedFile.storagePath],
  };
}

async function createActors(
  request: APIRequestContext,
  token: string,
  suffix: string,
): Promise<ExitActors> {
  const readOnlyRoleCode = `E2E_WEB_OPS_05_READ_${suffix}`;
  const noInventoryRoleCode = `E2E_WEB_OPS_05_NONE_${suffix}`;
  const readOnlyRoleId = await createRole(request, token, readOnlyRoleCode, [
    "containers.read",
    "inventory.read",
    "reports.read",
    "settings.read",
  ]);
  const noInventoryRoleId = await createRole(request, token, noInventoryRoleCode, [
    "containers.read",
    "settings.read",
  ]);
  const office = await ensureTestUser(request, token, {
    email: `e2e-web-ops-05-office-${suffix}@bestarcca.com`,
    name: `WEB-OPS-05 Office ${suffix}`,
    password: "Bestar-E2E-WEB-OPS-05-Office-123!",
    roleCodes: ["OFFICE"],
  });
  const readOnly = await ensureTestUser(request, token, {
    email: `e2e-web-ops-05-read-${suffix}@bestarcca.com`,
    name: `WEB-OPS-05 Read ${suffix}`,
    password: "Bestar-E2E-WEB-OPS-05-Read-123!",
    roleCodes: [readOnlyRoleCode],
  });
  const noInventory = await ensureTestUser(request, token, {
    email: `e2e-web-ops-05-none-${suffix}@bestarcca.com`,
    name: `WEB-OPS-05 None ${suffix}`,
    password: "Bestar-E2E-WEB-OPS-05-None-123!",
    roleCodes: [noInventoryRoleCode],
  });
  return { noInventory, noInventoryRoleId, office, readOnly, readOnlyRoleId };
}

async function createRole(
  request: APIRequestContext,
  token: string,
  code: string,
  permissionCodes: string[],
) {
  const response = await request.post("/api/roles", {
    data: { code, description: `${code} isolated role`, displayName: code },
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { id?: string; role?: { id?: string } };
  const id = body.role?.id ?? body.id;
  expect(id).toBeTruthy();
  const permissions = await request.patch(`/api/roles/${id}/permissions`, {
    data: { permissionCodes },
    headers: authHeaders(token),
  });
  expect(permissions.status()).toBe(200);
  return id!;
}

async function cleanupFixture(fixture: ExitFixture, actors: ExitActors) {
  const result = runPsql(
    [
      `container_id=${fixture.containerId}`,
      `office_user_id=${actors.office.id}`,
      `read_user_id=${actors.readOnly.id}`,
      `no_user_id=${actors.noInventory.id}`,
      `read_role_id=${actors.readOnlyRoleId}`,
      `no_role_id=${actors.noInventoryRoleId}`,
    ],
    String.raw`
BEGIN;
DELETE FROM correction_feedback
 WHERE container_id = :'container_id'
    OR container_destination_id IN (
      SELECT id FROM container_destinations WHERE container_id = :'container_id'
    )
    OR pallet_id IN (
      SELECT p.id FROM pallets p
      JOIN container_destinations d ON d.id = p.container_destination_id
      WHERE d.container_id = :'container_id'
    );
DELETE FROM pallet_events
 WHERE pallet_id IN (
      SELECT p.id FROM pallets p
      JOIN container_destinations d ON d.id = p.container_destination_id
      WHERE d.container_id = :'container_id'
    )
    OR inventory_adjustment_id IN (
      SELECT id FROM inventory_adjustments WHERE container_id = :'container_id'
    );
DELETE FROM inventory_adjustments WHERE container_id = :'container_id';
DELETE FROM generated_files WHERE container_id = :'container_id';
DELETE FROM pallets WHERE container_destination_id IN (
  SELECT id FROM container_destinations WHERE container_id = :'container_id'
);
DELETE FROM container_lines WHERE container_id = :'container_id';
DELETE FROM container_destinations WHERE container_id = :'container_id';
DELETE FROM containers WHERE id = :'container_id';
DELETE FROM users WHERE id IN (:'office_user_id', :'read_user_id', :'no_user_id');
DELETE FROM roles WHERE id IN (:'read_role_id', :'no_role_id');
COMMIT;
`,
  );
  expect(result.status, result.stderr).toBe(0);
  for (const storagePath of fixture.storagePaths) {
    try {
      await unlink(storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function cleanupPartialFixture(suffix: string) {
  const containerNo = `WEBOPS05-${suffix}`;
  const storageResult = runPsql(
    [`container_no=${containerNo}`],
    String.raw`
SELECT generated_files.storage_path
FROM generated_files
JOIN containers ON containers.id = generated_files.container_id
WHERE containers.container_no = :'container_no'
  AND generated_files.storage_path IS NOT NULL;
`,
    true,
  );
  expect(storageResult.status, storageResult.stderr).toBe(0);
  const storagePaths = storageResult.stdout.split("\n").map((item) => item.trim()).filter(Boolean);
  const cleanup = runPsql(
    [
      `container_no=${containerNo}`,
      `office_email=e2e-web-ops-05-office-${suffix}@bestarcca.com`,
      `read_email=e2e-web-ops-05-read-${suffix}@bestarcca.com`,
      `no_email=e2e-web-ops-05-none-${suffix}@bestarcca.com`,
      `read_role_code=E2E_WEB_OPS_05_READ_${suffix}`,
      `no_role_code=E2E_WEB_OPS_05_NONE_${suffix}`,
    ],
    String.raw`
BEGIN;
DELETE FROM correction_feedback WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no')
  OR container_destination_id IN (SELECT d.id FROM container_destinations d JOIN containers c ON c.id = d.container_id WHERE c.container_no = :'container_no')
  OR pallet_id IN (SELECT p.id FROM pallets p JOIN container_destinations d ON d.id = p.container_destination_id JOIN containers c ON c.id = d.container_id WHERE c.container_no = :'container_no');
DELETE FROM pallet_events WHERE pallet_id IN (SELECT p.id FROM pallets p JOIN container_destinations d ON d.id = p.container_destination_id JOIN containers c ON c.id = d.container_id WHERE c.container_no = :'container_no')
  OR inventory_adjustment_id IN (SELECT a.id FROM inventory_adjustments a JOIN containers c ON c.id = a.container_id WHERE c.container_no = :'container_no');
DELETE FROM inventory_adjustments WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no');
DELETE FROM generated_files WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no');
DELETE FROM pallets WHERE container_destination_id IN (SELECT d.id FROM container_destinations d JOIN containers c ON c.id = d.container_id WHERE c.container_no = :'container_no');
DELETE FROM container_lines WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no');
DELETE FROM container_destinations WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no');
DELETE FROM containers WHERE container_no = :'container_no';
DELETE FROM users WHERE email IN (:'office_email', :'read_email', :'no_email');
DELETE FROM roles WHERE code IN (:'read_role_code', :'no_role_code');
COMMIT;
`,
  );
  expect(cleanup.status, cleanup.stderr).toBe(0);
  for (const storagePath of storagePaths) {
    try {
      await unlink(storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function expectFixtureRemoved(fixture: ExitFixture, actors: ExitActors) {
  const result = runPsql(
    [
      `container_no=${fixture.containerNo}`,
      `office_email=${actors.office.email}`,
      `read_email=${actors.readOnly.email}`,
      `no_email=${actors.noInventory.email}`,
    ],
    String.raw`
SELECT
  (SELECT COUNT(*) FROM containers WHERE container_no = :'container_no') +
  (SELECT COUNT(*) FROM users WHERE email IN (:'office_email', :'read_email', :'no_email'));
`,
    true,
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe("0");
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
  if (!value) throw new Error(`${name} is required for WEB-OPS-05 E2E cleanup.`);
  return value;
}

function uniqueSuffix(projectName: string) {
  const projectDigit = projectName.includes("mobile") ? "2" : "1";
  return `${projectDigit}${Date.now().toString().slice(-9)}`;
}
