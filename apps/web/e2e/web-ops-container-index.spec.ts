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

const OUTPUT_DIR = "test-results/web-ops-07";

interface FixtureItem {
  containerId: string;
  containerNo: string;
  createdAt: string;
}

interface ContainerIndexFixture {
  adjusted: FixtureItem;
  base: string;
  cancelled: FixtureItem;
  empty: FixtureItem;
  labels: FixtureItem;
  loaded: FixtureItem;
}

test("container index exposes persisted time, all-container scope, six stable orders, and durable localized URL state", async ({
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

  const token = await loginThroughApi(page, request);
  const suffix = uniqueSuffix(testInfo.project.name);
  const fixtureBase = `W07${suffix}`;
  let fixture: ContainerIndexFixture | undefined;

  try {
    fixture = await createFixture(request, token, suffix);
    const expected = expectedOrders(fixture);
    await verifyApiContract(request, token, fixture, expected);
    await setPresentation(page.context(), "en", "light");
    await verifySixPageOrders(page, fixture, expected);
    await verifyDurableStateAndSearchReturn(page, fixture);
    await verifyLocalesThemesAndResponsiveLayout(page, fixture);
    await verifyRealBrowserZoom(
      token,
      fixture,
      testInfo.outputPath("zoom-profile"),
    );
    expect(errors, "WEB-OPS-07 console/page errors").toEqual([]);
  } finally {
    cleanupFixture(fixture?.base ?? fixtureBase);
  }
});

async function verifyApiContract(
  request: APIRequestContext,
  token: string,
  fixture: ContainerIndexFixture,
  expected: ReturnType<typeof expectedOrders>,
) {
  for (const [key, expectedNumbers] of Object.entries(expected)) {
    const [sort, direction] = key.split("-");
    const response = await request.get(
      `/api/containers?containerNo=${fixture.base}&sort=${sort}&direction=${direction}`,
      { headers: authHeaders(token) },
    );
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      items: Array<{
        activeTotalPallets: number;
        adjustedOutPallets: number;
        cancelledPallets: number;
        containerId: string;
        containerNo: string;
        createdAt: string;
        loadedPallets: number;
        remainingPallets: number;
        status: string;
        totalPallets: number;
      }>;
    };
    expect(body.items.map((item) => item.containerNo)).toEqual(expectedNumbers);
    expect(body.items.every((item) => item.createdAt.endsWith("Z"))).toBe(true);
    if (key === "createdAt-desc") {
      expect(body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            activeTotalPallets: 0,
            containerId: fixture.empty.containerId,
            status: "IMPORTED",
            totalPallets: 0,
          }),
          expect.objectContaining({
            adjustedOutPallets: 1,
            containerId: fixture.adjusted.containerId,
            status: "CORRECTED",
          }),
          expect.objectContaining({
            cancelledPallets: 1,
            containerId: fixture.cancelled.containerId,
            status: "PARSED",
          }),
          expect.objectContaining({
            containerId: fixture.loaded.containerId,
            loadedPallets: 1,
            status: "LOADED",
          }),
        ]),
      );
    }
  }
}

async function verifySixPageOrders(
  page: Page,
  fixture: ContainerIndexFixture,
  expected: ReturnType<typeof expectedOrders>,
) {
  for (const [key, expectedNumbers] of Object.entries(expected)) {
    const [sort, direction] = key.split("-");
    await page.goto(
      `/containers?containerNo=${fixture.base}&sort=${sort}&direction=${direction}`,
    );
    await expect(page.locator("tbody tr")).toHaveCount(expectedNumbers.length);
    expect(await visibleContainerNumbers(page)).toEqual(expectedNumbers);
    await expect(page.locator(`th[aria-sort="${direction === "asc" ? "ascending" : "descending"}"]`)).toHaveCount(1);
  }

  await page.goto(`/containers?containerNo=${fixture.base}`);
  expect(await visibleContainerNumbers(page)).toEqual(expected["createdAt-desc"]);
  await expect(page.getByLabel("Sort field")).toHaveValue("createdAt");
  await expect(page.getByRole("link", { name: "Sort descending" })).toHaveAttribute(
    "aria-current",
    "true",
  );
}

async function verifyDurableStateAndSearchReturn(
  page: Page,
  fixture: ContainerIndexFixture,
) {
  const stableUrl = `/containers?containerNo=${fixture.base}&sort=status&direction=desc`;
  await page.goto(stableUrl);
  const firstOrder = await visibleContainerNumbers(page);
  await page.reload();
  await expect(page).toHaveURL(new RegExp("sort=status.*direction=desc"));
  expect(await visibleContainerNumbers(page)).toEqual(firstOrder);

  await page.getByRole("link", { name: "Refresh" }).click();
  await expect(page).toHaveURL(new RegExp("sort=status.*direction=desc"));
  expect(await visibleContainerNumbers(page)).toEqual(firstOrder);

  const input = page.getByRole("combobox", { name: "Search container index" });
  await input.fill(fixture.loaded.containerNo);
  await page
    .getByRole("option", { exact: true, name: fixture.loaded.containerNo })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/containers/${fixture.loaded.containerId}$`),
  );
  await page.goBack();
  await expect(page).toHaveURL(new RegExp("sort=status.*direction=desc"));
  expect(await visibleContainerNumbers(page)).toEqual(firstOrder);

  await page.goto(
    `/containers?containerNo=${fixture.base}&sort=translated-status&direction=sideways`,
  );
  await expect(page.getByLabel("Sort field")).toHaveValue("createdAt");
  await expect(page.getByRole("link", { name: "Sort descending" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect(await visibleContainerNumbers(page)).toEqual(
    expectedOrders(fixture)["createdAt-desc"],
  );
}

async function verifyLocalesThemesAndResponsiveLayout(
  page: Page,
  fixture: ContainerIndexFixture,
) {
  const route = `/containers?containerNo=${fixture.base}&sort=status&direction=asc`;
  await page.goto(route);
  const englishDate = await page.locator("tbody time").first().textContent();
  await expect(page.locator("tbody time").first()).toHaveAttribute(
    "datetime",
    /2026-0[1-5]-01T08:00:00.000Z/,
  );

  await page.getByRole("button", { name: "中文" }).click();
  await expect(page).toHaveURL(new RegExp("sort=status.*direction=asc"));
  await expect(page.getByRole("heading", { exact: true, name: "柜子" })).toBeVisible();
  const chineseDate = await page.locator("tbody time").first().textContent();
  expect(chineseDate).not.toBe(englishDate);
  await expect(page.locator("main tbody").first()).not.toContainText(
    "LABELS_GENERATED",
  );

  await page.getByRole("button", { name: "深色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page).toHaveURL(new RegExp("sort=status.*direction=asc"));

  for (const [width, height] of [
    [390, 844],
    [1366, 768],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ height, width });
    await page.goto(route);
    await assertOnlyTableScrolls(page);
    await page.screenshot({
      fullPage: true,
      path: `${OUTPUT_DIR}/containers-zh-CN-dark-${width}x${height}.png`,
    });
  }

  await setPresentation(page.context(), "en", "light");
  await page.setViewportSize({ height: 768, width: 1366 });
  await page.goto(route);
  await expect(
    page.getByRole("table").getByText("Created time", { exact: true }),
  ).toBeVisible();
  await assertOnlyTableScrolls(page);
  await page.screenshot({
    fullPage: true,
    path: `${OUTPUT_DIR}/containers-en-light-1366x768.png`,
  });
}

async function createFixture(
  request: APIRequestContext,
  token: string,
  suffix: string,
): Promise<ContainerIndexFixture> {
  const base = `W07${suffix}`;
  const definitions = [
    ["labels", `${base}A2`],
    ["loaded", `${base}a10`],
    ["adjusted", `${base}B1`],
    ["cancelled", `${base}C1`],
    ["empty", `${base}Z9`],
  ] as const;
  const created = new Map<string, FixtureItem>();

  for (const [key, containerNo] of definitions) {
    const response = await request.post("/api/containers/manual", {
      data: {
        company: "Bestar WEB-OPS-07 E2E",
        containerNo,
        correctionNote: `WEB-OPS-07 ${suffix} isolated fixture`,
        destinations: [
          {
            cartons: 1,
            destinationCode: "YEG1",
            destinationType: "WAREHOUSE",
            pallets: 1,
            volume: 1,
          },
        ],
        dockNo: "E2E",
        reason: "WEB-OPS-07 isolated browser fixture",
      },
      headers: authHeaders(token),
    });
    expect(response.status()).toBe(201);
    const body = (await response.json()) as {
      container: { containerNo: string; id: string };
    };
    created.set(key, {
      containerId: body.container.id,
      containerNo: body.container.containerNo,
      createdAt: "",
    });
  }

  for (const key of ["labels", "loaded", "adjusted", "cancelled"] as const) {
    const item = created.get(key)!;
    const response = await request.patch(`/api/containers/${item.containerId}`, {
      data: {
        correctionNote: "Create one persisted pallet for isolated sorting fixture",
        reason: "WEB-OPS-07 isolated browser fixture",
        status: "UNLOADED",
      },
      headers: authHeaders(token),
    });
    expect(response.status()).toBe(200);
  }

  applyFixtureState(base);
  await scanLoadedFixture(request, token, created.get("loaded")!);
  const fixture = Object.fromEntries(created) as unknown as Omit<
    ContainerIndexFixture,
    "base"
  >;
  return { ...fixture, base };
}

function applyFixtureState(base: string) {
  runSql(
    String.raw`
UPDATE containers
SET created_at = CASE
  WHEN container_no = :'labels' THEN TIMESTAMPTZ '2026-01-01 08:00:00+00'
  WHEN container_no = :'loaded' THEN TIMESTAMPTZ '2026-02-01 08:00:00+00'
  WHEN container_no = :'adjusted' THEN TIMESTAMPTZ '2026-03-01 08:00:00+00'
  WHEN container_no = :'cancelled' THEN TIMESTAMPTZ '2026-04-01 08:00:00+00'
  WHEN container_no = :'empty' THEN TIMESTAMPTZ '2026-05-01 08:00:00+00'
END,
status = CASE
  WHEN container_no = :'labels' THEN 'LABELS_GENERATED'::"ContainerStatus"
  WHEN container_no = :'loaded' THEN 'UNLOADED'::"ContainerStatus"
  WHEN container_no = :'adjusted' THEN 'CORRECTED'::"ContainerStatus"
  WHEN container_no = :'cancelled' THEN 'PARSED'::"ContainerStatus"
  WHEN container_no = :'empty' THEN 'IMPORTED'::"ContainerStatus"
END
WHERE container_no LIKE :'base_pattern';

UPDATE pallets AS p
SET status = CASE
  WHEN c.container_no = :'adjusted' THEN 'ADJUSTED_OUT'::"PalletStatus"
  WHEN c.container_no = :'cancelled' THEN 'CANCELLED'::"PalletStatus"
  ELSE 'PLANNED'::"PalletStatus"
END,
loaded_at = NULL,
load_job_id = NULL
FROM container_destinations AS d
JOIN containers AS c ON c.id = d.container_id
WHERE p.container_destination_id = d.id
  AND c.container_no LIKE :'base_pattern';
`,
    fixtureVariables(base),
  );
}

async function scanLoadedFixture(
  request: APIRequestContext,
  token: string,
  container: FixtureItem,
) {
  const headers = authHeaders(token);
  const palletResponse = await request.get(
    `/api/pallets?containerId=${encodeURIComponent(container.containerId)}`,
    { headers },
  );
  expect(palletResponse.status()).toBe(200);
  const palletBody = (await palletResponse.json()) as {
    items: Array<{
      containerDestinationId: string;
      destinationCode: string;
      qrPayload: string;
    }>;
  };
  expect(palletBody.items).toHaveLength(1);
  const pallet = palletBody.items[0]!;

  const createResponse = await request.post("/api/load-jobs", {
    data: {
      carrier: "WEB-OPS-07 E2E",
      containerId: container.containerId,
      destinationRegion: pallet.destinationCode,
      dockNo: "E2E",
      lines: [
        {
          containerDestinationId: pallet.containerDestinationId,
          containerId: container.containerId,
          containerNo: container.containerNo,
          destinationCode: pallet.destinationCode,
          plannedPallets: 1,
          sourceText: `${container.containerNo}-1P`,
        },
      ],
      loadNo: `WEB-OPS-07-${container.containerNo}`,
      scheduledDepartureAt: new Date(Date.now() + 3_600_000).toISOString(),
      truckNo: "WEB-OPS-07",
    },
    headers,
  });
  expect(createResponse.status()).toBe(201);
  const loadJob = (await createResponse.json()) as { id: string };

  const startResponse = await request.patch(`/api/load-jobs/${loadJob.id}`, {
    data: {
      reason: "WEB-OPS-07 starts an auditable scan fixture",
      startedAt: new Date().toISOString(),
      status: "IN_PROGRESS",
    },
    headers,
  });
  expect(startResponse.status()).toBe(200);

  const scanResponse = await request.post(`/api/load-jobs/${loadJob.id}/scan`, {
    data: {
      deviceId: "web-ops-07-playwright",
      qrPayload: pallet.qrPayload,
    },
    headers,
  });
  expect(scanResponse.status()).toBe(201);

  const scanEventCount = runSql(
    String.raw`
COPY (
  SELECT COUNT(*)
  FROM pallet_events AS event
  JOIN pallets AS pallet ON pallet.id = event.pallet_id
  JOIN container_destinations AS destination
    ON destination.id = pallet.container_destination_id
  JOIN containers AS fixture_container
    ON fixture_container.id = destination.container_id
  WHERE fixture_container.container_no = :'container_no'
    AND event.event_type::text = 'LOADED'
    AND event.to_status::text = 'LOADED'
) TO STDOUT;
`,
    ["-v", `container_no=${container.containerNo}`],
  );
  expect(scanEventCount.trim()).toBe("1");
}

function cleanupFixture(base: string) {
  runSql(
    String.raw`
BEGIN;
CREATE TEMP TABLE web_ops_07_cleanup_ids AS
SELECT id FROM containers WHERE container_no LIKE :'base_pattern';
DELETE FROM pallet_events WHERE pallet_id IN (
  SELECT p.id FROM pallets p
  JOIN container_destinations d ON d.id = p.container_destination_id
  WHERE d.container_id IN (SELECT id FROM web_ops_07_cleanup_ids)
);
DELETE FROM correction_feedback
 WHERE container_id IN (SELECT id FROM web_ops_07_cleanup_ids)
    OR container_destination_id IN (
      SELECT id FROM container_destinations
      WHERE container_id IN (SELECT id FROM web_ops_07_cleanup_ids)
    );
DELETE FROM load_jobs WHERE container_id IN (SELECT id FROM web_ops_07_cleanup_ids);
DELETE FROM pallets WHERE container_destination_id IN (
  SELECT id FROM container_destinations
  WHERE container_id IN (SELECT id FROM web_ops_07_cleanup_ids)
);
DELETE FROM container_lines WHERE container_id IN (SELECT id FROM web_ops_07_cleanup_ids);
DELETE FROM container_destinations WHERE container_id IN (SELECT id FROM web_ops_07_cleanup_ids);
DELETE FROM containers WHERE id IN (SELECT id FROM web_ops_07_cleanup_ids);
COMMIT;
`,
    ["-v", `base_pattern=${base}%`],
  );
}

function fixtureVariables(base: string): string[] {
  return [
    "-v", `base_pattern=${base}%`,
    "-v", `labels=${base}A2`,
    "-v", `loaded=${base}a10`,
    "-v", `adjusted=${base}B1`,
    "-v", `cancelled=${base}C1`,
    "-v", `empty=${base}Z9`,
  ];
}

function runSql(sql: string, variables: string[]): string {
  const result = spawnSync(
    "psql",
    [
      "-h", requiredEnv("POSTGRES_HOST"),
      "-U", requiredEnv("POSTGRES_USER"),
      "-d", requiredEnv("POSTGRES_DB"),
      "-v", "ON_ERROR_STOP=1",
      ...variables,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: requiredEnv("POSTGRES_PASSWORD") },
      input: sql,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function expectedOrders(fixture: ContainerIndexFixture) {
  const { adjusted, cancelled, empty, labels, loaded } = fixture;
  return {
    "createdAt-asc": [labels, loaded, adjusted, cancelled, empty].map(number),
    "createdAt-desc": [empty, cancelled, adjusted, loaded, labels].map(number),
    "containerNo-asc": [labels, loaded, adjusted, cancelled, empty].map(number),
    "containerNo-desc": [empty, cancelled, adjusted, loaded, labels].map(number),
    "status-asc": [empty, cancelled, adjusted, labels, loaded].map(number),
    "status-desc": [loaded, labels, adjusted, cancelled, empty].map(number),
  };
}

function number(item: FixtureItem): string {
  return item.containerNo;
}

async function visibleContainerNumbers(page: Page): Promise<string[]> {
  return page.locator("tbody tr td:first-child").allTextContents();
}

async function assertOnlyTableScrolls(page: Page) {
  const result = await page.evaluate(() => {
    const table = document.querySelector("table");
    const scroller = table?.parentElement;
    const visibleControls = [
      ...document.querySelectorAll<HTMLElement>(
        "main.office-main-content input, main.office-main-content select, main.office-main-content button, main.office-main-content a",
      ),
    ].filter((element) => element.offsetParent !== null);
    return {
      clippedControls: visibleControls
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1,
        )
        .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim()),
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      tableClientWidth: scroller?.clientWidth ?? 0,
      tableScrollWidth: scroller?.scrollWidth ?? 0,
    };
  });
  expect(result.clippedControls).toEqual([]);
  expect(result.documentScrollWidth).toBeLessThanOrEqual(result.documentClientWidth + 1);
  expect(result.tableScrollWidth).toBeGreaterThanOrEqual(result.tableClientWidth);
}

async function setPresentation(
  context: BrowserContext,
  locale: "en" | "zh-CN",
  theme: "dark" | "light",
) {
  const url = new URL(E2E_BASE_URL).origin;
  await context.addCookies([
    { name: "bestar_locale", sameSite: "Lax", url, value: locale },
    { name: "bestar_theme", sameSite: "Lax", url, value: theme },
  ]);
}

async function verifyRealBrowserZoom(
  token: string,
  fixture: ContainerIndexFixture,
  userDataDir: string,
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
    await setPresentation(context, "en", "light");
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    await zoomPage.goto(
      `/containers?containerNo=${fixture.base}&sort=createdAt&direction=desc`,
    );
    await setRealBrowserZoom(zoomPage, worker, 2, 1366);
    await assertOnlyTableScrolls(zoomPage);
    await captureBrowserViewport(
      zoomPage,
      `${OUTPUT_DIR}/containers-en-light-1366x768-zoom-200.png`,
    );
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
        throw new Error(`Expected browser zoom ${targetFactor}, received ${applied}`);
      }
    },
    { factor, url: pageUrl },
  );
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(Math.round(physicalWidth / factor));
}

async function captureBrowserViewport(page: Page, screenshotPath: string) {
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

function uniqueSuffix(projectName: string): string {
  return `${Date.now().toString(36)}${projectName.replace(/[^a-z0-9]/gi, "").slice(0, 3)}`.toUpperCase();
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for WEB-OPS-07 E2E.`);
  return value;
}
