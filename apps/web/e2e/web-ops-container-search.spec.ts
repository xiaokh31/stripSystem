import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
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
  authHeaders,
  E2E_BASE_URL,
  loginThroughApi,
} from "./helpers";

const OUTPUT_DIR = "test-results/web-ops-06";
const viewports = [
  { height: 844, width: 390 },
  { height: 1024, width: 768 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
] as const;

type Locale = "en" | "zh-CN";
type Theme = "dark" | "light";

interface SearchFixture {
  base: string;
  contains: FixtureContainer;
  exact: FixtureContainer;
  prefixA: FixtureContainer;
  prefixB: FixtureContainer;
  slowOnly: FixtureContainer;
}

interface FixtureContainer {
  containerId: string;
  containerNo: string;
}

test("shared container combobox keeps stable identity, deterministic ranking, and localized accessible interaction", async ({
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
  const attemptedContainerNumbers: string[] = [];
  let fixture: SearchFixture | null = null;
  try {
    fixture = await createFixture(
      request,
      token,
      suffix,
      attemptedContainerNumbers,
    );
    await verifyApiRanking(request, token, fixture);
    await setPresentation(page.context(), "en", "light");

    await verifyContainerPage(page, fixture);
    await verifyInventoryPage(page, fixture);
    await captureVisualMatrix(page, fixture);
    await verifyRealBrowserZoom(
      token,
      fixture,
      testInfo.outputPath("zoom-profile"),
    );

    const expectedInjectedFailure = errors.filter((message) =>
      message.includes("status of 500 (Internal Server Error)"),
    );
    expect(
      expectedInjectedFailure,
      "the deliberately injected suggestion failure should be visible to Chromium",
    ).toHaveLength(1);
    expect(
      errors.filter((message) => !expectedInjectedFailure.includes(message)),
      "WEB-OPS-06 unexpected console/page errors",
    ).toEqual([]);
  } finally {
    if (attemptedContainerNumbers.length > 0) {
      cleanupByContainerNumbers(attemptedContainerNumbers);
    }
  }
});

async function verifyApiRanking(
  request: APIRequestContext,
  token: string,
  fixture: SearchFixture,
) {
  for (const endpoint of [
    "/api/containers/suggestions",
    "/api/inventory/container-suggestions",
  ]) {
    const response = await request.get(
      `${endpoint}?query=${encodeURIComponent(fixture.base.toLowerCase())}&limit=10`,
      { headers: authHeaders(token) },
    );
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items: FixtureContainer[] };
    expect(body.items).toEqual([
      fixture.exact,
      fixture.prefixA,
      fixture.prefixB,
      fixture.contains,
    ]);
    expect(body.items.every((item) => Object.keys(item).length === 2)).toBe(true);
  }
}

async function verifyContainerPage(page: Page, fixture: SearchFixture) {
  await page.goto("/containers");
  const input = page.getByRole("combobox", { name: "Search container index" });
  await verifyRace(page, input, "/api/containers/suggestions", fixture);
  await verifyDismissWhilePending(
    page,
    input,
    "/api/containers/suggestions",
    fixture,
  );

  await input.fill(`NO-MATCH-${fixture.base}`);
  await expect(page.getByText("No matching containers", { exact: true })).toBeVisible();

  await input.fill(fixture.base);
  const listbox = page.getByRole("listbox", { name: "Container suggestions" });
  await expect(listbox).toBeVisible();
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(input).toHaveAttribute("aria-controls", /listbox/);
  expect(await input.getAttribute("aria-controls")).toBe(
    await listbox.getAttribute("id"),
  );
  await input.press("ArrowDown");
  await expect(listbox.getByRole("option").first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(input).toHaveAttribute("aria-activedescendant", /option-0/);
  await input.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`/containers/${fixture.exact.containerId}$`),
  );

  await page.goto("/containers");
  const mouseInput = page.getByRole("combobox", {
    name: "Search container index",
  });
  await mouseInput.fill(fixture.prefixB.containerNo);
  await page
    .getByRole("option", { exact: true, name: fixture.prefixB.containerNo })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/containers/${fixture.prefixB.containerId}$`),
  );
}

async function verifyInventoryPage(page: Page, fixture: SearchFixture) {
  await page.goto("/inventory");
  const input = page.getByRole("combobox", { name: "Container No." });
  await verifyRace(
    page,
    input,
    "/api/inventory/container-suggestions",
    fixture,
  );

  await input.fill(`NO-MATCH-${fixture.base}`);
  await expect(page.getByText("No matching containers", { exact: true })).toBeVisible();

  await input.fill(fixture.base);
  await expect(
    page.getByRole("listbox", { name: "Container suggestions" }),
  ).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(
      `containerNo=${fixture.exact.containerNo}.*containerId=${fixture.exact.containerId}`,
    ),
  );
  await expect(
    page.locator('[data-selected-container-workspace="true"]'),
  ).toContainText(fixture.exact.containerNo);

  const selectedInput = page.getByRole("combobox", { name: "Container No." });
  await selectedInput.fill(`${fixture.exact.containerNo}X`);
  await expect(page).not.toHaveURL(/containerId=/);
  await expect(
    page.getByRole("heading", { name: "Select an exact container" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manual inventory depletion" }),
  ).toHaveCount(0);

  await selectedInput.fill(fixture.contains.containerNo);
  await page
    .getByRole("option", { exact: true, name: fixture.contains.containerNo })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `containerNo=${fixture.contains.containerNo}.*containerId=${fixture.contains.containerId}`,
    ),
  );

  await page.goto("/inventory");
  const recoverInput = page.getByRole("combobox", { name: "Container No." });
  let failOnce = true;
  await page.route("**/api/inventory/container-suggestions?**", async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({
        body: JSON.stringify({ code: "SUGGESTION_TEMPORARY_FAILURE" }),
        contentType: "application/json",
        status: 500,
      });
      return;
    }
    await route.continue();
  });
  await recoverInput.fill(fixture.base.slice(0, -1));
  await expect(
    page.getByText(
      "Container suggestions could not be loaded. Keep typing to try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await recoverInput.fill(fixture.base);
  await expect(
    page.getByRole("option", { exact: true, name: fixture.exact.containerNo }),
  ).toBeVisible();
  await page.unroute("**/api/inventory/container-suggestions?**");

  await recoverInput.press("Tab");
  await expect(recoverInput).toHaveAttribute("aria-expanded", "false");
}

async function verifyRace(
  page: Page,
  input: Locator,
  endpoint: string,
  fixture: SearchFixture,
) {
  const slowQuery = fixture.base.slice(0, -1);
  let slowRequestStarted = false;
  await page.route(`**${endpoint}?**`, async (route) => {
    const query = new URL(route.request().url()).searchParams.get("query");
    if (query === slowQuery) {
      slowRequestStarted = true;
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });

  await input.fill(slowQuery);
  await expect.poll(() => slowRequestStarted).toBe(true);
  await input.fill(fixture.base);
  await expect(
    page.getByRole("option", { exact: true, name: fixture.exact.containerNo }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { exact: true, name: fixture.slowOnly.containerNo }),
  ).toHaveCount(0);
  await page.waitForTimeout(900);
  await expect(
    page.getByRole("option", { exact: true, name: fixture.slowOnly.containerNo }),
  ).toHaveCount(0);
  await page.unroute(`**${endpoint}?**`);
}

async function verifyDismissWhilePending(
  page: Page,
  input: Locator,
  endpoint: string,
  fixture: SearchFixture,
) {
  let pendingRequestStarted = false;
  await page.route(`**${endpoint}?**`, async (route) => {
    pendingRequestStarted = true;
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ response });
  });

  for (const dismiss of ["Escape", "Tab", "outside"] as const) {
    pendingRequestStarted = false;
    await input.fill("");
    await input.fill(fixture.base);
    await expect.poll(() => pendingRequestStarted).toBe(true);
    if (dismiss === "outside") {
      await page.locator("h1").click();
    } else {
      await input.press(dismiss);
    }
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await page.waitForTimeout(800);
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("listbox")).toHaveCount(0);
  }

  await page.unroute(`**${endpoint}?**`);
}

async function captureVisualMatrix(page: Page, fixture: SearchFixture) {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await setPresentation(page.context(), locale, theme);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto("/containers");
        const containerInput = page.getByRole("combobox", {
          name: locale === "en" ? "Search container index" : "搜索柜号索引",
        });
        await containerInput.fill(fixture.base);
        await expect(page.getByRole("listbox")).toBeVisible();
        await assertNoOverflow(page);
        await page.screenshot({
          fullPage: true,
          path: `${OUTPUT_DIR}/containers-${locale}-${theme}-${viewport.width}x${viewport.height}.png`,
        });

        await page.goto(
          `/inventory?containerNo=${fixture.exact.containerNo}&containerId=${fixture.exact.containerId}`,
        );
        const inventoryInput = page.getByRole("combobox", {
          name: locale === "en" ? "Container No." : "柜号",
        });
        await inventoryInput.fill("");
        await inventoryInput.fill(fixture.base);
        await expect(page.getByRole("listbox")).toBeVisible();
        await assertNoOverflow(page);
        await page.screenshot({
          fullPage: true,
          path: `${OUTPUT_DIR}/inventory-${locale}-${theme}-${viewport.width}x${viewport.height}.png`,
        });
      }
    }
  }
}

async function assertNoOverflow(page: Page) {
  const result = await page.locator("main.office-main-content").evaluate((main) => ({
    clientWidth: document.documentElement.clientWidth,
    clipped: [...main.querySelectorAll<HTMLElement>("input, button, [role=option]")]
      .filter((element) => element.offsetParent !== null)
      .filter(
        (element) =>
          element.scrollWidth > element.clientWidth + 1 ||
          element.scrollHeight > element.clientHeight + 1,
      )
      .map((element) => element.textContent?.trim() || element.tagName),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(result.clipped).toEqual([]);
  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth + 1);
}

async function createFixture(
  request: APIRequestContext,
  token: string,
  suffix: string,
  attemptedContainerNumbers: string[],
): Promise<SearchFixture> {
  const base = `W06${suffix}`;
  const slowPrefix = base.slice(0, -1);
  const numbers = {
    exact: base,
    prefixA: `${base}A`,
    prefixB: `${base}B`,
    contains: `X${base}Z`,
    slowOnly: `${slowPrefix}OLD`,
  };
  const created = new Map<string, FixtureContainer>();
  for (const containerNo of [
    numbers.prefixB,
    numbers.contains,
    numbers.exact,
    numbers.slowOnly,
    numbers.prefixA,
  ]) {
    attemptedContainerNumbers.push(containerNo);
    const response = await request.post("/api/containers/manual", {
      data: {
        company: "Bestar WEB-OPS-06 E2E",
        containerNo,
        correctionNote: `WEB-OPS-06 ${suffix} isolated fixture`,
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
        reason: "WEB-OPS-06 isolated browser fixture",
      },
      headers: authHeaders(token),
    });
    expect(response.status()).toBe(201);
    const body = (await response.json()) as {
      container: { containerNo: string; id: string };
    };
    created.set(containerNo, {
      containerId: body.container.id,
      containerNo: body.container.containerNo,
    });
  }
  return {
    base,
    contains: created.get(numbers.contains)!,
    exact: created.get(numbers.exact)!,
    prefixA: created.get(numbers.prefixA)!,
    prefixB: created.get(numbers.prefixB)!,
    slowOnly: created.get(numbers.slowOnly)!,
  };
}

function cleanupByContainerNumbers(containerNumbers: string[]) {
  runCleanup(
    `ARRAY[${containerNumbers.map((_, index) => `:'container_${index}'`).join(",")}]::text[]`,
    containerNumbers.flatMap((containerNo, index) => [
      "-v",
      `container_${index}=${containerNo}`,
    ]),
  );
}

function runCleanup(containerNumberArraySql: string, variables: string[]) {
  const sql = String.raw`
BEGIN;
CREATE TEMP TABLE web_ops_06_cleanup_ids AS
SELECT id FROM containers WHERE container_no = ANY(${containerNumberArraySql});
DELETE FROM correction_feedback
 WHERE container_id IN (SELECT id FROM web_ops_06_cleanup_ids)
    OR container_destination_id IN (
      SELECT id FROM container_destinations
      WHERE container_id IN (SELECT id FROM web_ops_06_cleanup_ids)
    );
DELETE FROM pallets WHERE container_destination_id IN (
  SELECT id FROM container_destinations
  WHERE container_id IN (SELECT id FROM web_ops_06_cleanup_ids)
);
DELETE FROM container_lines WHERE container_id IN (SELECT id FROM web_ops_06_cleanup_ids);
DELETE FROM container_destinations WHERE container_id IN (SELECT id FROM web_ops_06_cleanup_ids);
DELETE FROM containers WHERE id IN (SELECT id FROM web_ops_06_cleanup_ids);
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
      ...variables,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: requiredEnv("POSTGRES_PASSWORD") },
      input: sql,
    },
  );
  expect(result.status, result.stderr).toBe(0);
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

async function verifyRealBrowserZoom(
  token: string,
  fixture: SearchFixture,
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
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
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
        for (const route of [
          "/containers",
          `/inventory?containerNo=${fixture.exact.containerNo}&containerId=${fixture.exact.containerId}`,
        ]) {
          await zoomPage.goto(route);
          const label = route === "/containers"
            ? locale === "en" ? "Search container index" : "搜索柜号索引"
            : locale === "en" ? "Container No." : "柜号";
          const input = zoomPage.getByRole("combobox", { name: label });
          if (route !== "/containers") await input.fill("");
          await input.fill(fixture.base);
          await expect(zoomPage.getByRole("listbox")).toBeVisible();
          await setRealBrowserZoom(zoomPage, worker, 2, 1366);
          await input.evaluate((element) => {
            element.scrollIntoView({ block: "start" });
            window.scrollBy(0, -150);
          });
          await expect(zoomPage.getByRole("listbox")).toBeVisible();
          await assertNoOverflow(zoomPage);
          await captureBrowserViewport(
            zoomPage,
            `${OUTPUT_DIR}/${route === "/containers" ? "containers" : "inventory"}-${locale}-${theme}-1366x768-zoom-200.png`,
          );
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
      const tabsApi = (globalThis as unknown as { chrome: { tabs: TabsApi } })
        .chrome.tabs;
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

function uniqueSuffix(projectName: string): string {
  return `${Date.now().toString(36)}${projectName.replace(/[^a-z0-9]/gi, "").slice(0, 3)}`.toUpperCase();
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for WEB-OPS-06 cleanup.`);
  return value;
}
