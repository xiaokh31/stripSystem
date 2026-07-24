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
  authHeaders,
  configureBrowserActor,
  E2E_BASE_URL,
  ensureTestUser,
  loginThroughApi,
  loginWithCredentials,
} from "./helpers";

const OUTPUT_DIR = "test-results/web-ops-02";
const completedAt = "2026-07-14T18:30:00.000Z";
const viewportMatrix = [
  { height: 844, width: 390 },
  { height: 1024, width: 768 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
  { height: 1440, width: 2560 },
] as const;

type Locale = "en" | "zh-CN";
type Theme = "dark" | "light";

const sectionHeadings = {
  en: {
    destination: "Destinations",
    files: "Reports and labels",
    inventory: "Destination inventory",
    status: "Container status update",
    wage: "Unloading wage information",
  },
  "zh-CN": {
    destination: "目的仓",
    files: "报告和面单",
    inventory: "目的仓库存",
    status: "柜子状态更新",
    wage: "拆柜工资信息",
  },
} as const;

test("container detail is destination-first for adjustable, read-only, and pruned inventory roles", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(600_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  const browserErrors: string[] = [];
  const hydrationWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
    if (/hydration|did not match|server rendered html/i.test(message.text())) {
      hydrationWarnings.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const adminToken = await loginThroughApi(page, request);
  const fixture = await createCompletedContainerFixture(
    request,
    adminToken,
    testInfo.project.name,
  );
  const actors = await createPermissionActors(
    request,
    adminToken,
    testInfo.project.name,
  );
  const route = `/containers/${fixture.containerId}`;

  await setPresentation(page.context(), "en", "light");
  await page.goto(route);
  await assertSectionOrder(page, "en", true);

  const wageSection = sectionForHeading(page, sectionHeadings.en.wage);
  const wageToggle = wageSection.getByRole("button", {
    name: "Expand unloading wage section",
  });
  await expect(wageToggle).toHaveAttribute("aria-expanded", "false");
  await wageToggle.click();
  await expect(
    wageSection.getByRole("button", {
      name: "Collapse unloading wage section",
    }),
  ).toHaveAttribute("aria-expanded", "true");
  const wageTag = wageSection.getByLabel("Wage tag");
  await wageTag.selectOption("US_TO_CANADA_TRANSFER");
  await wageSection
    .getByRole("button", { name: "Collapse unloading wage section" })
    .click();
  await wageSection
    .getByRole("button", { name: "Expand unloading wage section" })
    .click();
  await expect(wageTag).toHaveValue("US_TO_CANADA_TRANSFER");
  await expect(wageSection.locator("select").filter({ hasText: fixture.workerName }))
    .toBeVisible();

  let adjustmentRequests = 0;
  page.on("request", (browserRequest) => {
    if (
      browserRequest.method() === "POST" &&
      /\/api\/container-destinations\/[^/]+\/inventory-adjustments$/.test(
        new URL(browserRequest.url()).pathname,
      )
    ) {
      adjustmentRequests += 1;
    }
  });
  const inventorySection = sectionForHeading(page, sectionHeadings.en.inventory);
  await inventorySection
    .getByRole("button", { name: "Manual inventory depletion" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Manual inventory depletion count").fill("1");
  await dialog
    .getByLabel("Manual inventory depletion reason")
    .selectOption("SCAN_MISSED");
  await dialog
    .getByLabel("Manual inventory depletion note")
    .fill("WEB-OPS-02 isolated browser fixture adjustment");
  await dialog.getByLabel("Confirm manual inventory depletion").check();
  await dialog
    .getByRole("button", { name: "Confirm manual inventory depletion" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(inventorySection).toContainText(
    "WEB-OPS-02 isolated browser fixture adjustment",
  );
  expect(adjustmentRequests).toBe(1);

  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await setPresentation(page.context(), locale, theme);
      for (const viewport of viewportMatrix) {
        await page.setViewportSize(viewport);
        await page.goto(route);
        await assertSectionOrder(page, locale, true);
        await assertNoPageOverflowOrClippedControls(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.screenshot({
          fullPage: true,
          path: `${OUTPUT_DIR}/container-detail-${locale}-${theme}-${viewport.width}x${viewport.height}.png`,
        });
      }
    }
  }

  await setPresentation(page.context(), "zh-CN", "light");
  await page.setViewportSize({ height: 768, width: 1366 });
  await page.goto(route);
  await sectionForHeading(page, sectionHeadings["zh-CN"].wage)
    .getByRole("button", { name: "展开拆柜工资信息" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload();
  await assertSectionOrder(page, "zh-CN", true);
  await expect(page.locator("body")).not.toContainText("Unloading wage information");

  await loginWithCredentials(page, request, actors.inventoryReadOnly);
  await setPresentation(page.context(), "en", "light");
  await page.goto(route);
  await assertSectionOrder(page, "en", true);
  const readOnlyInventory = sectionForHeading(
    page,
    sectionHeadings.en.inventory,
  );
  await expect(readOnlyInventory).toContainText("Inventory read-only");
  await expect(
    readOnlyInventory.getByRole("button", { name: "Manual inventory depletion" }),
  ).toHaveCount(0);
  const readOnlyWage = sectionForHeading(page, sectionHeadings.en.wage);
  await readOnlyWage
    .getByRole("button", { name: "Expand unloading wage section" })
    .click();
  await expect(readOnlyWage).toContainText(fixture.workerName);
  await expect(readOnlyWage.getByRole("button", { name: "Save wage information" }))
    .toHaveCount(0);

  await loginWithCredentials(page, request, actors.noInventory);
  await page.goto(route);
  await assertSectionOrder(page, "en", false);
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 2,
      name: sectionHeadings.en.inventory,
    }),
  ).toHaveCount(0);

  await verifyRealBrowserZoom(adminToken, route, testInfo.outputPath("zoom-profile"));
  expect(browserErrors, "Container detail console/page errors").toEqual([]);
  expect(hydrationWarnings, "Container detail hydration warnings").toEqual([]);
});

async function assertSectionOrder(
  page: Page,
  locale: Locale,
  hasInventory: boolean,
): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  const names = sectionHeadings[locale];
  const expected: string[] = [names.status, names.destination, names.wage];
  if (hasInventory) expected.push(names.inventory);
  expected.push(names.files);
  const headings = expected.map((name) =>
    page.getByRole("heading", { exact: true, level: 2, name }),
  );
  for (const heading of headings) await expect(heading).toBeVisible();

  const positions = await Promise.all(
    headings.map((heading) => heading.evaluate((element) => ({
      top: element.getBoundingClientRect().top + window.scrollY,
      sourceIndex: [...document.querySelectorAll<HTMLElement>("h2")].indexOf(
        element as HTMLElement,
      ),
    }))),
  );
  expect(positions.map((item) => item.sourceIndex)).toEqual(
    [...positions].sort((left, right) => left.sourceIndex - right.sourceIndex)
      .map((item) => item.sourceIndex),
  );
  expect(positions.map((item) => item.top)).toEqual(
    [...positions].sort((left, right) => left.top - right.top)
      .map((item) => item.top),
  );
}

async function assertNoPageOverflowOrClippedControls(page: Page): Promise<void> {
  const diagnostics = await page.locator("main.office-main-content").evaluate(
    (main) => ({
      clipped: [...main.querySelectorAll("h1, h2, button")]
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .filter((element) => {
          const item = element as HTMLElement;
          const style = window.getComputedStyle(item);
          return (
            (/hidden|clip/.test(style.overflowX) &&
              item.scrollWidth > item.clientWidth + 1) ||
            (/hidden|clip/.test(style.overflowY) &&
              item.scrollHeight > item.clientHeight + 1)
          );
        })
        .map((element) => element.textContent?.trim() ?? element.tagName),
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }),
  );
  expect(diagnostics.clipped).toEqual([]);
  expect(diagnostics.documentScrollWidth).toBeLessThanOrEqual(
    diagnostics.documentClientWidth + 1,
  );
}

function sectionForHeading(page: Page, name: string) {
  return page
    .getByRole("heading", { exact: true, level: 2, name })
    .locator("xpath=ancestor::section[1]");
}

async function createCompletedContainerFixture(
  request: APIRequestContext,
  token: string,
  projectName: string,
): Promise<{ containerId: string; workerName: string }> {
  const suffix = uniqueSuffix(projectName);
  const containerResponse = await request.post("/api/containers/manual", {
    data: {
      company: "Bestar WEB-OPS-02 E2E",
      containerNo: `WEBOPS02-${suffix}-LONG-CONTAINER-REFERENCE`,
      correctionNote: "WEB-OPS-02 isolated browser fixture",
      destinations: [
        {
          cartons: 36,
          destinationCode:
            "YEG2-WEB-OPS-02-LONG-DESTINATION-REFERENCE-FOR-RESPONSIVE-CHECK",
          destinationType: "WAREHOUSE",
          note: "WEB-OPS-02 destination-first fixture",
          pallets: 3,
          volume: 3.75,
        },
      ],
      dockNo: "E2E",
      reason: "WEB-OPS-02 browser section-order verification",
    },
    headers: authHeaders(token),
  });
  expect(containerResponse.status()).toBe(201);
  const containerBody = (await containerResponse.json()) as {
    container: { id: string };
  };
  const containerId = containerBody.container.id;
  const workerName = `WEB-OPS-02 Worker ${suffix}`;
  const workerResponse = await request.post("/api/unloading-wage/workers", {
    data: {
      displayName: workerName,
      note: "WEB-OPS-02 isolated worker",
      workerCode: `WOPS02-${suffix}`,
    },
    headers: authHeaders(token),
  });
  expect(workerResponse.status()).toBe(201);
  const worker = (await workerResponse.json()) as { id: string };

  const wageResponse = await request.patch(
    `/api/containers/${containerId}/unloading-wage`,
    {
      data: {
        classification: "OCEAN_CONTAINER",
        reason: "WEB-OPS-02 completed wage fixture",
      },
      headers: authHeaders(token),
    },
  );
  expect(wageResponse.status()).toBe(200);
  const unloaderResponse = await request.put(
    `/api/containers/${containerId}/unloaders`,
    {
      data: {
        reason: "WEB-OPS-02 worker selector fixture",
        unloaders: [{ unloadingWorkerId: worker.id }],
      },
      headers: authHeaders(token),
    },
  );
  expect(unloaderResponse.status()).toBe(200);
  const labelsResponse = await request.post(
    `/api/containers/${containerId}/generate-labels`,
    { headers: authHeaders(token) },
  );
  expect(labelsResponse.status()).toBe(201);
  const completionResponse = await request.post(
    `/api/containers/${containerId}/complete-unloading`,
    {
      data: {
        completedAt,
        note: "WEB-OPS-02 completed section fixture",
        reason: "WEB-OPS-02 auto-collapse verification",
      },
      headers: authHeaders(token),
    },
  );
  expect(completionResponse.status()).toBe(201);
  return { containerId, workerName };
}

async function createPermissionActors(
  request: APIRequestContext,
  adminToken: string,
  projectName: string,
) {
  const suffix = uniqueSuffix(projectName);
  const inventoryReadRoleCode = `E2E_WEB_OPS_02_READ_${suffix}`;
  const noInventoryRoleCode = `E2E_WEB_OPS_02_NO_INV_${suffix}`;
  const roleResponse = await request.post("/api/roles", {
    data: {
      code: inventoryReadRoleCode,
      description: "WEB-OPS-02 container and inventory read-only browser role",
      displayName: `WEB-OPS-02 Inventory Read ${suffix}`,
    },
    headers: authHeaders(adminToken),
  });
  expect(roleResponse.status()).toBe(201);
  const roleBody = (await roleResponse.json()) as {
    id?: string;
    role?: { id?: string };
  };
  const roleId = roleBody.role?.id ?? roleBody.id;
  expect(roleId).toBeTruthy();
  const permissionResponse = await request.patch(
    `/api/roles/${roleId}/permissions`,
    {
      data: {
        permissionCodes: ["containers.read", "inventory.read", "reports.read"],
      },
      headers: authHeaders(adminToken),
    },
  );
  expect(permissionResponse.status()).toBe(200);
  const noInventoryRoleResponse = await request.post("/api/roles", {
    data: {
      code: noInventoryRoleCode,
      description: "WEB-OPS-02 container read without inventory browser role",
      displayName: `WEB-OPS-02 No Inventory ${suffix}`,
    },
    headers: authHeaders(adminToken),
  });
  expect(noInventoryRoleResponse.status()).toBe(201);
  const noInventoryRoleBody = (await noInventoryRoleResponse.json()) as {
    id?: string;
    role?: { id?: string };
  };
  const noInventoryRoleId =
    noInventoryRoleBody.role?.id ?? noInventoryRoleBody.id;
  expect(noInventoryRoleId).toBeTruthy();
  const noInventoryPermissionResponse = await request.patch(
    `/api/roles/${noInventoryRoleId}/permissions`,
    {
      data: { permissionCodes: ["containers.read", "reports.read"] },
      headers: authHeaders(adminToken),
    },
  );
  expect(noInventoryPermissionResponse.status()).toBe(200);
  const inventoryReadOnly = await ensureTestUser(request, adminToken, {
    email: `e2e-web-ops-02-read-${suffix}@bestarcca.com`,
    name: `WEB-OPS-02 Inventory Read ${suffix}`,
    password: "Bestar-E2E-WEB-OPS-02-Read-123!",
    roleCodes: [inventoryReadRoleCode],
  });
  const noInventory = await ensureTestUser(request, adminToken, {
    email: `e2e-web-ops-02-no-inventory-${suffix}@bestarcca.com`,
    name: `WEB-OPS-02 No Inventory ${suffix}`,
    password: "Bestar-E2E-WEB-OPS-02-No-Inventory-123!",
    roleCodes: [noInventoryRoleCode],
  });
  return { inventoryReadOnly, noInventory };
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
  route: string,
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
    await configureBrowserActor(context, token);
    const page = context.pages()[0] ?? (await context.newPage());
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const locale of ["en", "zh-CN"] as const) {
      for (const theme of ["light", "dark"] as const) {
        await setPresentation(context, locale, theme);
        await page.goto(route);
        await setRealBrowserZoom(page, worker, 2, 1366);
        await assertSectionOrder(page, locale, true);
        await assertNoPageOverflowOrClippedControls(page);
        await captureBrowserViewport(
          page,
          `${OUTPUT_DIR}/container-detail-${locale}-${theme}-1366x768-zoom-200.png`,
        );
        await setRealBrowserZoom(page, worker, 1, 1366);
      }
    }
    expect(errors, "200% zoom page errors").toEqual([]);
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
  factor: number,
  physicalWidth: number,
): Promise<void> {
  const pageUrl = new URL(page.url()).href;
  await worker.evaluate(
    async ({ factor: targetFactor, url }) => {
      type TabsApi = {
        getZoom(tabId: number): Promise<number>;
        query(queryInfo: object): Promise<Array<{ id?: number; url?: string }>>;
        setZoom(tabId: number, factor: number): Promise<void>;
      };
      const tabsApi = (
        globalThis as unknown as { chrome: { tabs: TabsApi } }
      ).chrome.tabs;
      const tabId = (await tabsApi.query({})).find((tab) => tab.url === url)?.id;
      if (tabId === undefined) throw new Error(`No browser tab found for ${url}`);
      await tabsApi.setZoom(tabId, targetFactor);
      const appliedFactor = await tabsApi.getZoom(tabId);
      if (Math.abs(appliedFactor - targetFactor) > 0.001) {
        throw new Error(
          `Expected browser zoom ${targetFactor}, received ${appliedFactor}`,
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

function uniqueSuffix(projectName: string): string {
  const projectDigit = projectName.includes("mobile") ? "2" : "1";
  return `${projectDigit}${Date.now().toString().slice(-8)}`;
}
