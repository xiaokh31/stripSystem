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

const OUTPUT_DIR = "test-results/web-ops-03";
const viewportMatrix = [
  { height: 844, width: 390 },
  { height: 1024, width: 768 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
  { height: 1440, width: 2560 },
] as const;

type Locale = "en" | "zh-CN";
type Theme = "dark" | "light";

interface InventoryFixture {
  containerId: string;
  containerNo: string;
  destinationCode: string;
  destinationId: string;
  storagePaths: string[];
}

interface PermissionActors {
  noInventory: E2ETestUser;
  noInventoryRoleId: string;
  readOnly: E2ETestUser;
  readOnlyRoleId: string;
}

test("dedicated inventory workspace performs audited destination depletion and refreshes open views", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(900_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const adminToken = await loginThroughApi(page, request);
  const suffix = uniqueSuffix(testInfo.project.name);
  let fixture: InventoryFixture | null = null;
  let actors: PermissionActors | null = null;
  let cleaned = false;

  try {
    fixture = await createInventoryFixture(request, adminToken, suffix);
    actors = await createPermissionActors(request, adminToken, suffix);
    await setPresentation(page.context(), "en", "light");
    await page.goto("/inventory");
    const inventoryNav = page.getByRole("link", { exact: true, name: "Inventory" });
    await expect(inventoryNav).toBeVisible();
    await expect(inventoryNav).toHaveAttribute("aria-current", "page");

    await page.goto(
      `/reports/inventory?containerNo=${fixture.containerNo}&destinationCode=${fixture.destinationCode}&status=LABEL_PRINTED`,
    );
    await expect(page).toHaveURL(
      new RegExp(
        `/inventory\\?containerNo=${fixture.containerNo}&destinationCode=${fixture.destinationCode}&status=LABEL_PRINTED`,
      ),
    );

    const filterForm = page.locator('form[action="/inventory"]');
    await filterForm.locator('input[name="containerNo"]').fill(fixture.containerNo);
    await filterForm.locator('input[name="destinationCode"]').fill("");
    await filterForm.locator('select[name="status"]').selectOption("");
    await filterForm.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(new RegExp(`containerNo=${fixture.containerNo}`));

    const selectContainer = page.getByRole("link", {
      name: `Select container ${fixture.containerNo}`,
    });
    await selectContainer.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`containerId=${fixture.containerId}`));
    await expect(
      page.getByRole("link", { name: `Select container ${fixture.containerNo}` }),
    ).toHaveAttribute("aria-current", "true");

    const selectedWorkspace = page.locator(
      '[data-selected-container-workspace="true"]',
    );
    await expect(selectedWorkspace).toContainText(fixture.containerNo);
    const destinationRow = selectedWorkspace.locator(
      `[data-container-destination-id="${fixture.destinationId}"]`,
    );
    await expect(destinationRow).toContainText(fixture.destinationId);
    await expect(destinationRow).toContainText(fixture.destinationCode);

    const selectedInventoryUrl = page.url();
    await page.getByRole("button", { name: "中文" }).click();
    await expect(page).toHaveURL(selectedInventoryUrl);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(
      page.getByRole("link", { name: `选择柜子 ${fixture.containerNo}` }),
    ).toHaveAttribute("aria-current", "true");
    await expect(page.locator('[data-selected-container-workspace="true"]')).toContainText(
      fixture.destinationId,
    );
    await page.getByRole("button", { name: "English" }).click();
    await expect(page).toHaveURL(selectedInventoryUrl);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    const before = await inventorySummary(request, adminToken, fixture.containerId);
    expect(before).toMatchObject({
      adjustedOutPallets: 0,
      loadedPallets: 0,
      remainingPallets: 3,
    });

    const dashboardPage = await page.context().newPage();
    const containerPage = await page.context().newPage();
    await dashboardPage.goto("/");
    await containerPage.goto(`/containers/${fixture.containerId}`);
    const dashboardRemaining = dashboardInventoryMetric(
      dashboardPage,
      "Remaining pallets",
    );
    const dashboardRemainingBefore = await metricNumber(dashboardRemaining);
    const containerInventory = sectionForHeading(
      containerPage,
      "Destination inventory",
    );
    await expect(containerInventory).toContainText(fixture.destinationCode);

    const adjustmentButton = destinationRow.getByRole("button", {
      name: "Manual inventory depletion",
    });
    await adjustmentButton.click();
    const dialog = page.getByRole("dialog", {
      name: `${fixture.containerNo} · ${fixture.destinationCode}`,
    });
    await expect(dialog.getByRole("button", { name: "Close manual inventory depletion" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(adjustmentButton).toBeFocused();

    await adjustmentButton.click();
    const activeDialog = page.getByRole("dialog");
    await activeDialog.getByLabel("Manual inventory depletion count").fill("1");
    await expect(
      activeDialog.getByLabel("Expected remaining inventory"),
    ).toHaveValue("2");
    await activeDialog.getByLabel("Confirm manual inventory depletion").check();
    await activeDialog
      .getByRole("button", { name: "Confirm manual inventory depletion" })
      .click();
    await expect(activeDialog).toContainText(
      "Select a reason for manual inventory depletion.",
    );
    await activeDialog
      .getByLabel("Manual inventory depletion reason")
      .selectOption("SCAN_MISSED");
    const auditNote = `WEB-OPS-03 ${suffix} exact destination depletion`;
    await activeDialog.getByLabel("Manual inventory depletion note").fill(auditNote);

    let adjustmentPosts = 0;
    const adjustmentPath =
      `/api/container-destinations/${fixture.destinationId}/inventory-adjustments`;
    page.on("request", (browserRequest) => {
      if (
        browserRequest.method() === "POST" &&
        new URL(browserRequest.url()).pathname === adjustmentPath
      ) {
        adjustmentPosts += 1;
      }
    });
    await activeDialog
      .getByRole("button", { name: "Confirm manual inventory depletion" })
      .click();
    await expect(activeDialog).toHaveCount(0);
    await expect(destinationRow).toContainText(auditNote);
    expect(adjustmentPosts).toBe(1);

    const after = await inventorySummary(request, adminToken, fixture.containerId);
    expect(after).toMatchObject({
      adjustedOutPallets: 1,
      loadedPallets: 0,
      remainingPallets: 2,
    });
    const historyResponse = await request.get(
      `/api/container-destinations/${fixture.destinationId}/inventory-adjustments`,
      { headers: authHeaders(adminToken) },
    );
    expect(historyResponse.status()).toBe(200);
    const history = (await historyResponse.json()) as {
      items: Array<{
        createdById: string | null;
        note: string | null;
        palletCount: number;
        pallets: Array<{ eventId: string | null; toStatus: string }>;
        reasonCode: string;
      }>;
    };
    expect(history.items[0]).toMatchObject({
      note: auditNote,
      palletCount: 1,
      reasonCode: "SCAN_MISSED",
    });
    expect(history.items[0]?.createdById).toBeTruthy();
    expect(history.items[0]?.pallets).toEqual([
      expect.objectContaining({ eventId: expect.any(String), toStatus: "ADJUSTED_OUT" }),
    ]);

    await expect
      .poll(() => metricNumber(dashboardRemaining))
      .toBe(dashboardRemainingBefore - 1);
    await expect(containerInventory).toContainText(auditNote);
    await expect(containerInventory).toContainText("2");

    await writeFile(
      path.resolve(OUTPUT_DIR, "inventory-mutation-evidence.json"),
      JSON.stringify(
        {
          adjustmentPosts,
          after,
          before,
          containerId: fixture.containerId,
          destinationId: fixture.destinationId,
          history: history.items[0],
        },
        null,
        2,
      ),
    );

    await assertResponsiveVisualMatrix(page, fixture);
    await verifyRealBrowserZoom(
      adminToken,
      `/inventory?containerNo=${fixture.containerNo}&containerId=${fixture.containerId}`,
      testInfo.outputPath("zoom-profile"),
    );

    await loginWithCredentials(page, request, actors.readOnly);
    await setPresentation(page.context(), "en", "light");
    await page.goto(
      `/inventory?containerNo=${fixture.containerNo}&containerId=${fixture.containerId}`,
    );
    await expect(page.getByRole("link", { exact: true, name: "Inventory" })).toBeVisible();
    await expect(
      page.getByText("Inventory read-only", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Manual inventory depletion" }),
    ).toHaveCount(0);

    await loginWithCredentials(page, request, actors.noInventory);
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventory access is required" })).toBeVisible();
    await expect(page.getByRole("link", { exact: true, name: "Inventory" })).toHaveCount(0);
    const forbidden = await request.post(
      `/api/container-destinations/${fixture.destinationId}/inventory-adjustments`,
      {
        data: { count: 1, reasonCode: "SCAN_MISSED" },
        headers: authHeaders(
          await loginWithCredentials(page, request, actors.noInventory),
        ),
      },
    );
    expect(forbidden.status()).toBe(403);

    await cleanupFixture(fixture, actors);
    cleaned = true;
    const removed = await request.get(
      `/api/containers/${fixture.containerId}/summary`,
      { headers: authHeaders(adminToken) },
    );
    expect(removed.status()).toBe(404);
    for (const storagePath of fixture.storagePaths) {
      await expectFileMissing(storagePath);
    }
    expect(errors, "Inventory workspace console/page errors").toEqual([]);
  } finally {
    if (!cleaned) {
      if (fixture && actors) {
        await cleanupFixture(fixture, actors);
      } else {
        await cleanupPartialFixture(suffix);
      }
    }
  }
});

async function createInventoryFixture(
  request: APIRequestContext,
  token: string,
  suffix: string,
): Promise<InventoryFixture> {
  const containerNo = `WEBOPS03-${suffix}`;
  const destinationCode = `YEG-WEBOPS03-${suffix}`;
  const response = await request.post("/api/containers/manual", {
    data: {
      company: "Bestar WEB-OPS-03 E2E",
      containerNo,
      correctionNote: `WEB-OPS-03 ${suffix} isolated fixture`,
      destinations: [
        {
          cartons: 30,
          destinationCode,
          destinationType: "WAREHOUSE",
          note: "Dedicated inventory workspace fixture",
          pallets: 3,
          volume: 3,
        },
      ],
      dockNo: "E2E",
      reason: "WEB-OPS-03 isolated browser fixture",
    },
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as {
    container: {
      destinations: Array<{ id: string }>;
      id: string;
    };
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
  expect(labels.pallets).toHaveLength(3);
  expect(labels.pallets.every((pallet) => pallet.palletId.includes(containerNo))).toBe(true);
  return {
    containerId: body.container.id,
    containerNo,
    destinationCode,
    destinationId: body.container.destinations[0]!.id,
    storagePaths: [labels.generatedFile.storagePath],
  };
}

async function createPermissionActors(
  request: APIRequestContext,
  adminToken: string,
  suffix: string,
): Promise<PermissionActors> {
  const readOnlyRoleCode = `E2E_WEB_OPS_03_READ_${suffix}`;
  const noInventoryRoleCode = `E2E_WEB_OPS_03_NONE_${suffix}`;
  const readOnlyRoleId = await createRole(
    request,
    adminToken,
    readOnlyRoleCode,
    ["containers.read", "inventory.read", "reports.read"],
  );
  const noInventoryRoleId = await createRole(
    request,
    adminToken,
    noInventoryRoleCode,
    ["containers.read"],
  );
  const readOnly = await ensureTestUser(request, adminToken, {
    email: `e2e-web-ops-03-read-${suffix}@bestarcca.com`,
    name: `WEB-OPS-03 Read ${suffix}`,
    password: "Bestar-E2E-WEB-OPS-03-Read-123!",
    roleCodes: [readOnlyRoleCode],
  });
  const noInventory = await ensureTestUser(request, adminToken, {
    email: `e2e-web-ops-03-none-${suffix}@bestarcca.com`,
    name: `WEB-OPS-03 None ${suffix}`,
    password: "Bestar-E2E-WEB-OPS-03-None-123!",
    roleCodes: [noInventoryRoleCode],
  });
  return {
    noInventory,
    noInventoryRoleId,
    readOnly,
    readOnlyRoleId,
  };
}

async function createRole(
  request: APIRequestContext,
  token: string,
  code: string,
  permissionCodes: string[],
): Promise<string> {
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

function dashboardInventoryMetric(page: Page, label: string) {
  return sectionForHeading(page, "Pallet pressure")
    .locator('a[href="/inventory"]')
    .filter({ hasText: label });
}

async function metricNumber(locator: ReturnType<typeof dashboardInventoryMetric>) {
  const text = await locator.textContent();
  const match = text?.match(/\d[\d,]*/);
  if (!match) throw new Error(`Inventory metric number was not found in ${text}`);
  return Number(match[0].replaceAll(",", ""));
}

function sectionForHeading(page: Page, name: string) {
  return page
    .getByRole("heading", { exact: true, level: 2, name })
    .locator("xpath=ancestor::section[1]");
}

async function assertResponsiveVisualMatrix(
  page: Page,
  fixture: InventoryFixture,
): Promise<void> {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await setPresentation(page.context(), locale, theme);
      for (const viewport of viewportMatrix) {
        await page.setViewportSize(viewport);
        await page.goto(
          `/inventory?containerNo=${fixture.containerNo}&containerId=${fixture.containerId}`,
        );
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(
          page.locator('[data-selected-container-workspace="true"]'),
        ).toContainText(fixture.containerNo);
        await assertNoOverflowOrClipping(page);
        await page.screenshot({
          fullPage: true,
          path: `${OUTPUT_DIR}/inventory-${locale}-${theme}-${viewport.width}x${viewport.height}.png`,
        });
      }
    }
  }
}

async function assertNoOverflowOrClipping(page: Page): Promise<void> {
  const diagnostics = await page.locator("main.office-main-content").evaluate(
    (main) => {
      const operationGrid = main.querySelector<HTMLElement>(
        ".inventory-operation-grid",
      );
      const operationGridStyle = operationGrid
        ? window.getComputedStyle(operationGrid)
        : null;

      return ({
      clipped: [...main.querySelectorAll<HTMLElement>("h1, h2, h3, button, a")]
        .filter((element) => element.offsetParent !== null)
        .filter((element) => {
          const style = window.getComputedStyle(element);
          return (
            (/hidden|clip/.test(style.overflowX) &&
              element.scrollWidth > element.clientWidth + 1) ||
            (/hidden|clip/.test(style.overflowY) &&
              element.scrollHeight > element.clientHeight + 1)
          );
        })
        .map((element) => element.textContent?.trim() ?? element.tagName),
      clientWidth: document.documentElement.clientWidth,
      layout: operationGrid
        ? {
            className: operationGrid.className,
            gridTemplateColumns: operationGridStyle?.gridTemplateColumns,
            innerWidth: window.innerWidth,
            mediaDesktop: window.matchMedia("(min-width: 1280px)").matches,
            rect: operationGrid.getBoundingClientRect().toJSON(),
          }
        : null,
      overflowing: [...main.querySelectorAll<HTMLElement>("*")]
        .filter((element) => element.offsetParent !== null)
        .filter(
          (element) =>
            element.getBoundingClientRect().right >
            document.documentElement.clientWidth + 1,
        )
        .slice(0, 20)
        .map((element) => ({
          className: element.className,
          right: Math.round(element.getBoundingClientRect().right),
          tag: element.tagName,
          text: element.textContent?.trim().slice(0, 80),
        })),
      scrollWidth: document.documentElement.scrollWidth,
      });
    },
  );
  expect(diagnostics.clipped).toEqual([]);
  expect(
    diagnostics.scrollWidth,
    JSON.stringify(
      { layout: diagnostics.layout, overflowing: diagnostics.overflowing },
      null,
      2,
    ),
  ).toBeLessThanOrEqual(diagnostics.clientWidth + 1);
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
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
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
    ]);
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    for (const locale of ["en", "zh-CN"] as const) {
      for (const theme of ["light", "dark"] as const) {
        await setPresentation(context, locale, theme);
        await zoomPage.goto(route);
        await setRealBrowserZoom(zoomPage, worker, 2, 1366);
        await assertNoOverflowOrClipping(zoomPage);
        await captureBrowserViewport(
          zoomPage,
          `${OUTPUT_DIR}/inventory-${locale}-${theme}-1366x768-zoom-200.png`,
        );
        await setRealBrowserZoom(zoomPage, worker, 1, 1366);
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
): Promise<void> {
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
        throw new Error(`Expected browser zoom ${targetFactor}, received ${applied}`);
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

async function cleanupFixture(
  fixture: InventoryFixture,
  actors: PermissionActors,
): Promise<void> {
  const sql = String.raw`
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
DELETE FROM users WHERE id IN (:'read_user_id', :'no_user_id');
DELETE FROM roles WHERE id IN (:'read_role_id', :'no_role_id');
COMMIT;
`;
  const result = spawnSync(
    "psql",
    [
      "-h",
      requiredEnv("POSTGRES_HOST"),
      "-U",
      requiredEnv("POSTGRES_USER"),
      "-d",
      requiredEnv("POSTGRES_DB"),
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `container_id=${fixture.containerId}`,
      "-v",
      `read_user_id=${actors.readOnly.id}`,
      "-v",
      `no_user_id=${actors.noInventory.id}`,
      "-v",
      `read_role_id=${actors.readOnlyRoleId}`,
      "-v",
      `no_role_id=${actors.noInventoryRoleId}`,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: requiredEnv("POSTGRES_PASSWORD") },
      input: sql,
    },
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

async function cleanupPartialFixture(suffix: string): Promise<void> {
  const containerNo = `WEBOPS03-${suffix}`;
  const readEmail = `e2e-web-ops-03-read-${suffix}@bestarcca.com`;
  const noEmail = `e2e-web-ops-03-none-${suffix}@bestarcca.com`;
  const readRoleCode = `E2E_WEB_OPS_03_READ_${suffix}`;
  const noRoleCode = `E2E_WEB_OPS_03_NONE_${suffix}`;
  const connectionArgs = [
    "-h",
    requiredEnv("POSTGRES_HOST"),
    "-U",
    requiredEnv("POSTGRES_USER"),
    "-d",
    requiredEnv("POSTGRES_DB"),
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    `container_no=${containerNo}`,
    "-v",
    `read_email=${readEmail}`,
    "-v",
    `no_email=${noEmail}`,
    "-v",
    `read_role_code=${readRoleCode}`,
    "-v",
    `no_role_code=${noRoleCode}`,
  ];
  const spawnOptions = {
    encoding: "utf8" as const,
    env: { ...process.env, PGPASSWORD: requiredEnv("POSTGRES_PASSWORD") },
  };
  const storageResult = spawnSync("psql", [...connectionArgs, "-At"], {
    ...spawnOptions,
    input: String.raw`
SELECT generated_files.storage_path
FROM generated_files
JOIN containers ON containers.id = generated_files.container_id
WHERE containers.container_no = :'container_no'
  AND generated_files.storage_path IS NOT NULL;
`,
  });
  expect(storageResult.status, storageResult.stderr).toBe(0);
  const storagePaths = storageResult.stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const cleanupResult = spawnSync("psql", connectionArgs, {
    ...spawnOptions,
    input: String.raw`
BEGIN;
DELETE FROM correction_feedback
 WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no')
    OR container_destination_id IN (
      SELECT destinations.id
      FROM container_destinations destinations
      JOIN containers ON containers.id = destinations.container_id
      WHERE containers.container_no = :'container_no'
    )
    OR pallet_id IN (
      SELECT pallets.id
      FROM pallets
      JOIN container_destinations destinations
        ON destinations.id = pallets.container_destination_id
      JOIN containers ON containers.id = destinations.container_id
      WHERE containers.container_no = :'container_no'
    );
DELETE FROM pallet_events
 WHERE pallet_id IN (
      SELECT pallets.id
      FROM pallets
      JOIN container_destinations destinations
        ON destinations.id = pallets.container_destination_id
      JOIN containers ON containers.id = destinations.container_id
      WHERE containers.container_no = :'container_no'
    )
    OR inventory_adjustment_id IN (
      SELECT adjustments.id
      FROM inventory_adjustments adjustments
      JOIN containers ON containers.id = adjustments.container_id
      WHERE containers.container_no = :'container_no'
    );
DELETE FROM inventory_adjustments
 WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no');
DELETE FROM generated_files
 WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no');
DELETE FROM pallets
 WHERE container_destination_id IN (
   SELECT destinations.id
   FROM container_destinations destinations
   JOIN containers ON containers.id = destinations.container_id
   WHERE containers.container_no = :'container_no'
 );
DELETE FROM container_lines
 WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no');
DELETE FROM container_destinations
 WHERE container_id IN (SELECT id FROM containers WHERE container_no = :'container_no');
DELETE FROM containers WHERE container_no = :'container_no';
DELETE FROM users WHERE email IN (:'read_email', :'no_email');
DELETE FROM roles WHERE code IN (:'read_role_code', :'no_role_code');
COMMIT;
`,
  });
  expect(cleanupResult.status, cleanupResult.stderr).toBe(0);
  for (const storagePath of storagePaths) {
    try {
      await unlink(storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function expectFileMissing(storagePath: string): Promise<void> {
  await expect(
    (async () => {
      try {
        await import("node:fs/promises").then(({ stat }) => stat(storagePath));
        return false;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT";
      }
    })(),
  ).resolves.toBe(true);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for WEB-OPS-03 cleanup.`);
  return value;
}

function uniqueSuffix(projectName: string): string {
  const projectDigit = projectName.includes("mobile") ? "2" : "1";
  return `${projectDigit}${Date.now().toString().slice(-9)}`;
}
