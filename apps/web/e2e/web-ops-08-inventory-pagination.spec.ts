import { spawnSync } from "node:child_process";
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
import { authHeaders, E2E_BASE_URL, loginThroughApi } from "./helpers";

const OUTPUT_DIR = "test-results/web-ops-08";
const viewports = [
  { height: 844, width: 390 },
  { height: 1024, width: 768 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
  { height: 1440, width: 2560 },
] as const;
type Locale = "en" | "zh-CN";
type Theme = "dark" | "light";

interface PaginationFixture {
  containerIds: string[];
  destinationIds: string[];
  longContainerId: string;
  prefix: string;
  shortContainerId: string;
  shortContainerNo: string;
  shortDestinationId: string;
}

test("inventory summary paginates, sorts, preserves selection and adapts without stretch", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(900_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  const token = await loginThroughApi(page, request);
  const fixture = createFixture(uniqueSuffix(testInfo.project.name));
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await setPresentation(page.context(), "en", "light");
    await page.setViewportSize({ height: 900, width: 1366 });
    await page.goto(inventoryUrl(fixture));

    const summary = page.locator('[data-inventory-container-summary="true"]');
    await expect(summary).toContainText("24 containers");
    await expect(summary).toContainText("Page 1 of 3");
    await expect(summary.locator("tbody tr")).toHaveCount(10);
    const globalBefore = await globalMetrics(page);
    const destinationBefore = await destinationSummaryText(page);

    await summary
      .getByRole("link", { name: `Select container ${fixture.shortContainerNo}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`containerId=${fixture.shortContainerId}`));
    await expect(
      page.locator('[data-selected-container-workspace="true"]'),
    ).toContainText(fixture.shortContainerNo);

    await summary.getByRole("link", { name: "Next page" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(
      new RegExp(`containerId=${fixture.shortContainerId}`),
    );
    await expect(page.getByText("This selected container is outside the current page.")).toBeVisible();
    expect(await globalMetrics(page)).toEqual(globalBefore);
    expect(await destinationSummaryText(page)).toBe(destinationBefore);

    for (const [pageSize, expectedRows, totalPages] of [
      [5, 5, 5],
      [10, 10, 3],
      [20, 20, 2],
      [50, 24, 1],
    ] as const) {
      await summary.getByLabel("Items per page").selectOption(String(pageSize));
      await summary.getByRole("button", { name: "Apply page size" }).click();
      await expect(page).toHaveURL(new RegExp(`pageSize=${pageSize}`));
      await expect(page).toHaveURL(/page=1/);
      await expect(summary.locator("tbody tr")).toHaveCount(expectedRows);
      await expect(summary).toContainText(`Page 1 of ${totalPages}`);
      await expect(page).toHaveURL(
        new RegExp(`containerId=${fixture.shortContainerId}`),
      );
    }

    await summary.getByLabel("Items per page").selectOption("10");
    await summary.getByRole("button", { name: "Apply page size" }).click();
    await summary.getByLabel("Sort field").selectOption("containerNo");
    await summary.getByRole("button", { name: "Apply sort" }).click();
    await expect(page).toHaveURL(/sortBy=containerNo/);
    await expect(page).toHaveURL(/page=1/);
    await expect(summary.locator("tbody tr").first()).toContainText(
      `${fixture.prefix}-24`,
    );
    await summary.getByRole("link", { name: "Sort ascending" }).click();
    await expect(page).toHaveURL(/sortDirection=asc/);
    await expect(summary.locator("tbody tr").first()).toContainText(
      `${fixture.prefix}-01`,
    );

    await page.goto(inventoryUrl(fixture).replace("page=1", "page=999"));
    await expect(page).toHaveURL(/page=3/, { timeout: 15_000 });
    await expect(summary.locator("tbody tr")).toHaveCount(4);

    await page.goto(inventoryUrl(fixture));
    const containerInput = page.getByLabel("Container No.");
    await containerInput.fill(fixture.shortContainerNo);
    const exactOption = page.getByRole("option", {
      name: fixture.shortContainerNo,
    });
    await expect(exactOption).toBeVisible();
    await exactOption.click();
    await expect(page).toHaveURL(
      new RegExp(`containerId=${fixture.shortContainerId}`),
    );
    await expect(summary).toContainText("1 container");

    const geometry = await verifyAdaptiveGeometry(page, fixture);
    await writeFile(
      path.resolve(OUTPUT_DIR, "adaptive-geometry.json"),
      JSON.stringify(geometry, null, 2),
    );

    await page.goto(
      `${inventoryUrl(fixture).replace("page=1", "page=2")}&containerId=${fixture.shortContainerId}`,
    );
    await expect(page.getByText("This selected container is outside the current page.")).toBeVisible();
    const before = await selectedSummary(request, token, fixture.shortContainerId);
    const workspace = page.locator('[data-selected-container-workspace="true"]');
    const adjust = workspace.getByRole("button", {
      name: "Manual inventory depletion",
    });
    await adjust.click();
    const dialog = page.getByRole("dialog");
    const draftNote = `WEB-OPS-08 ${fixture.prefix} draft preserved`;
    await dialog.getByLabel("Manual inventory depletion count").fill("1");
    await dialog.getByLabel("Manual inventory depletion reason").selectOption("SCAN_MISSED");
    await dialog.getByLabel("Manual inventory depletion note").fill(draftNote);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("bestar:inventory-synchronized")),
    );
    await expect(dialog.getByLabel("Manual inventory depletion note")).toHaveValue(
      draftNote,
    );
    await dialog.getByLabel("Confirm manual inventory depletion").check();
    const urlBeforeMutation = page.url();
    await dialog
      .getByRole("button", { name: "Confirm manual inventory depletion" })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(urlBeforeMutation);
    const after = await selectedSummary(request, token, fixture.shortContainerId);
    expect(after).toMatchObject({
      adjustedOutPallets: before.adjustedOutPallets + 1,
      loadedPallets: before.loadedPallets,
      remainingPallets: before.remainingPallets - 1,
    });
    const history = await request.get(
      `/api/container-destinations/${fixture.shortDestinationId}/inventory-adjustments`,
      { headers: authHeaders(token) },
    );
    expect(history.status()).toBe(200);
    const historyBody = (await history.json()) as {
      items: Array<{ note: string; palletCount: number; reasonCode: string }>;
    };
    expect(historyBody.items[0]).toMatchObject({
      note: draftNote,
      palletCount: 1,
      reasonCode: "SCAN_MISSED",
    });

    await captureVisualMatrix(page, fixture);
    await captureZoomMatrix(
      token,
      `${inventoryUrl(fixture)}&containerId=${fixture.shortContainerId}`,
      testInfo.outputPath("zoom-profile"),
    );
    await writeFile(
      path.resolve(OUTPUT_DIR, "pagination-adjustment-evidence.json"),
      JSON.stringify(
        {
          after,
          before,
          containerCount: fixture.containerIds.length,
          history: historyBody.items[0],
          pageSizes: [5, 10, 20, 50],
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
  } finally {
    cleanupFixture(fixture.prefix);
  }

  expect(fixtureCount(fixture.prefix)).toBe(0);
});

function createFixture(suffix: string): PaginationFixture {
  const prefix = `WEBOPS08-${suffix}`;
  cleanupFixture(prefix);
  const sql = String.raw`
BEGIN;
INSERT INTO containers (id, container_no, source_format, status, created_at, updated_at)
SELECT :'prefix' || '-c-' || n,
       :'prefix' || '-' || LPAD(n::text, 2, '0'),
       'UNKNOWN',
       CASE WHEN n % 3 = 0 THEN 'PARSED'::"ContainerStatus"
            WHEN n % 3 = 1 THEN 'CORRECTED'::"ContainerStatus"
            ELSE 'LABELS_GENERATED'::"ContainerStatus" END,
       TIMESTAMPTZ '2026-07-15 12:00:00+00' + n * INTERVAL '1 minute',
       TIMESTAMPTZ '2026-07-15 12:00:00+00' + n * INTERVAL '1 minute'
  FROM generate_series(1, 24) AS n;
INSERT INTO container_destinations
  (id, container_id, destination_code, destination_type, package_type, cartons, volume,
   calculated_pallets, final_pallets, created_at, updated_at)
SELECT :'prefix' || '-d-' || c.n || '-' || d.n,
       :'prefix' || '-c-' || c.n,
       'YEG08-' || d.n,
       'WAREHOUSE', 'CARTON', 20, 2, 2, 2, NOW(), NOW()
  FROM generate_series(1, 24) AS c(n)
  CROSS JOIN LATERAL generate_series(1, CASE WHEN c.n = 24 THEN 6 ELSE 1 END) AS d(n);
INSERT INTO pallets
  (id, container_destination_id, pallet_no, pallet_id, qr_payload, status, created_at, updated_at)
SELECT :'prefix' || '-p-' || c.n || '-' || d.n || '-' || p.n,
       :'prefix' || '-d-' || c.n || '-' || d.n,
       p.n,
       :'prefix' || '-PALLET-' || c.n || '-' || d.n || '-' || p.n,
       'SSP1|PALLET|' || :'prefix' || '|' || c.n || '|' || d.n || '|' || p.n,
       'LABEL_PRINTED', NOW(), NOW()
  FROM generate_series(1, 24) AS c(n)
  CROSS JOIN LATERAL generate_series(1, CASE WHEN c.n = 24 THEN 6 ELSE 1 END) AS d(n)
  CROSS JOIN generate_series(1, 2) AS p(n);
COMMIT;
`;
  runPsql(sql, [`prefix=${prefix}`]);
  return {
    containerIds: Array.from({ length: 24 }, (_, index) => `${prefix}-c-${index + 1}`),
    destinationIds: Array.from({ length: 29 }, (_, index) => `${prefix}-d-${index + 1}`),
    longContainerId: `${prefix}-c-24`,
    prefix,
    shortContainerId: `${prefix}-c-23`,
    shortContainerNo: `${prefix}-23`,
    shortDestinationId: `${prefix}-d-23-1`,
  };
}

function cleanupFixture(prefix: string): void {
  const sql = String.raw`
BEGIN;
DELETE FROM correction_feedback WHERE container_id IN (SELECT id FROM containers WHERE container_no LIKE :'prefix' || '%')
  OR container_destination_id IN (SELECT id FROM container_destinations WHERE container_id IN (SELECT id FROM containers WHERE container_no LIKE :'prefix' || '%'))
  OR pallet_id IN (SELECT p.id FROM pallets p JOIN container_destinations d ON d.id = p.container_destination_id JOIN containers c ON c.id = d.container_id WHERE c.container_no LIKE :'prefix' || '%');
DELETE FROM pallet_events WHERE pallet_id IN (SELECT p.id FROM pallets p JOIN container_destinations d ON d.id = p.container_destination_id JOIN containers c ON c.id = d.container_id WHERE c.container_no LIKE :'prefix' || '%')
  OR inventory_adjustment_id IN (SELECT id FROM inventory_adjustments WHERE container_id IN (SELECT id FROM containers WHERE container_no LIKE :'prefix' || '%'));
DELETE FROM inventory_adjustments WHERE container_id IN (SELECT id FROM containers WHERE container_no LIKE :'prefix' || '%');
DELETE FROM generated_files WHERE container_id IN (SELECT id FROM containers WHERE container_no LIKE :'prefix' || '%');
DELETE FROM pallets WHERE container_destination_id IN (SELECT d.id FROM container_destinations d JOIN containers c ON c.id = d.container_id WHERE c.container_no LIKE :'prefix' || '%');
DELETE FROM container_lines WHERE container_id IN (SELECT id FROM containers WHERE container_no LIKE :'prefix' || '%');
DELETE FROM container_destinations WHERE container_id IN (SELECT id FROM containers WHERE container_no LIKE :'prefix' || '%');
DELETE FROM containers WHERE container_no LIKE :'prefix' || '%';
COMMIT;
`;
  runPsql(sql, [`prefix=${prefix}`]);
}

async function verifyAdaptiveGeometry(page: Page, fixture: PaginationFixture) {
  await page.setViewportSize({ height: 900, width: 1366 });
  await page.goto(
    `${inventoryUrl(fixture)}&containerId=${fixture.shortContainerId}`,
  );
  const short = await page.evaluate(() => {
    const rect = (selector: string) =>
      document.querySelector<HTMLElement>(selector)!.getBoundingClientRect().toJSON();
    const grid = rect(".inventory-operation-grid");
    const left = rect('[data-inventory-container-summary="true"]');
    const right = rect('[data-selected-container-workspace="true"]');
    const destination = rect('[data-inventory-destination-summary="true"]');
    return {
      destinationGap: destination.top - grid.bottom,
      grid,
      left,
      right,
    };
  });
  expect(short.right.height).toBeLessThan(short.left.height);
  expect(short.destinationGap).toBeGreaterThanOrEqual(8);
  expect(short.destinationGap).toBeLessThanOrEqual(32);

  await page.goto(
    `${inventoryUrl(fixture)}&containerId=${fixture.longContainerId}`,
  );
  const bounded = page.locator('[data-bounded-inventory-workspace="true"]');
  await expect(bounded).toBeVisible();
  await expect(bounded).toHaveAttribute("tabindex", "0");
  const long = await bounded.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(long.scrollHeight).toBeGreaterThan(long.clientHeight);

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(
    `${inventoryUrl(fixture)}&containerId=${fixture.shortContainerId}`,
  );
  const mobile = await page.evaluate(() => {
    const left = document.querySelector<HTMLElement>(
      '[data-inventory-container-summary="true"]',
    )!.getBoundingClientRect();
    const right = document.querySelector<HTMLElement>(
      '[data-selected-container-workspace="true"]',
    )!.getBoundingClientRect();
    const destination = document.querySelector<HTMLElement>(
      '[data-inventory-destination-summary="true"]',
    )!.getBoundingClientRect();
    return {
      destinationTop: destination.top,
      leftTop: left.top,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rightTop: right.top,
    };
  });
  expect(mobile.leftTop).toBeLessThan(mobile.rightTop);
  expect(mobile.rightTop).toBeLessThan(mobile.destinationTop);
  expect(mobile.overflow).toBeLessThanOrEqual(1);
  return { long, mobile, short };
}

async function captureVisualMatrix(page: Page, fixture: PaginationFixture) {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await setPresentation(page.context(), locale, theme);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto(
          `${inventoryUrl(fixture)}&containerId=${fixture.shortContainerId}`,
        );
        await assertNoPageOverflow(page);
        await page.screenshot({
          fullPage: true,
          path: `${OUTPUT_DIR}/inventory-${locale}-${theme}-${viewport.width}x${viewport.height}.png`,
        });
      }
    }
  }
}

async function captureZoomMatrix(token: string, route: string, userDataDir: string) {
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
        for (const factor of [1.25, 2]) {
          await zoomPage.goto(route);
          await setRealBrowserZoom(zoomPage, worker, factor);
          await assertNoPageOverflow(zoomPage);
          await captureViewport(
            zoomPage,
            `${OUTPUT_DIR}/inventory-${locale}-${theme}-zoom-${factor * 100}.png`,
          );
        }
        await setRealBrowserZoom(zoomPage, worker, 1);
      }
    }
  } finally {
    await context.close();
  }
}

async function setRealBrowserZoom(page: Page, worker: Worker, factor: number) {
  const url = page.url();
  await worker.evaluate(
    async ({ factor: target, url: pageUrl }) => {
      type TabsApi = {
        query(queryInfo: object): Promise<Array<{ id?: number; url?: string }>>;
        setZoom(tabId: number, factor: number): Promise<void>;
      };
      const tabs = (
        globalThis as unknown as { chrome: { tabs: TabsApi } }
      ).chrome.tabs;
      const tabId = (await tabs.query({})).find((tab: { id?: number; url?: string }) => tab.url === pageUrl)?.id;
      if (tabId === undefined) throw new Error(`Zoom tab not found for ${pageUrl}`);
      await tabs.setZoom(tabId, target);
    },
    { factor, url },
  );
  await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBeGreaterThan(0);
}

async function captureViewport(page: Page, screenshotPath: string) {
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

async function assertNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function globalMetrics(page: Page) {
  return page.locator('[data-inventory-global-metrics="true"]').innerText();
}

async function destinationSummaryText(page: Page) {
  return page.locator('[data-inventory-destination-summary="true"]').innerText();
}

async function selectedSummary(
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

function inventoryUrl(fixture: PaginationFixture) {
  return `/inventory?containerNo=${fixture.prefix}&page=1&pageSize=10&sortBy=createdAt&sortDirection=desc`;
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

function fixtureCount(prefix: string): number {
  return Number(
    runPsql(
      `SELECT COUNT(*) FROM containers WHERE container_no LIKE :'prefix' || '%';`,
      [`prefix=${prefix}`],
      true,
    ),
  );
}

function runPsql(sql: string, variables: string[], scalar = false): string {
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
      ...(scalar ? ["-tA"] : []),
      ...variables.flatMap((variable) => ["-v", variable]),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: requiredEnv("POSTGRES_PASSWORD") },
      input: sql,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for inventory E2E.`);
  return value;
}

function uniqueSuffix(projectName: string): string {
  return `${projectName.replace(/[^a-z0-9]/gi, "").toUpperCase()}-${Date.now()
    .toString(36)
    .toUpperCase()}`;
}
