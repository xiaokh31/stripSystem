import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Worker,
} from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  configureBrowserActor,
  E2E_BASE_URL,
  loginThroughApi,
} from "./helpers";

const expectedUnloadingFilename = "卸柜清单_(中文).xlsx";
const expectedAttendanceFilename = "1_(7月)员工刷卡记录表.xls";
const runId = process.env.FILE_UPLOAD_01_RUN_ID ?? "local-repro";
const repoRoot = path.resolve(process.cwd(), "../..");
const runtimeDirectory = path.join(
  process.cwd(),
  "test-results",
  "file-upload-01",
  "runtime",
  runId,
);
const unloadingFixturePath = path.join(
  runtimeDirectory,
  expectedUnloadingFilename,
);
const attendanceFixturePath = path.join(
  runtimeDirectory,
  expectedAttendanceFilename,
);

test.beforeAll(async () => {
  const [unloadingSource, attendanceSource] = await Promise.all([
    readFile(
      path.join(
        repoRoot,
        "samples",
        "unloading-plans",
        "CAAU8011090 UNLOADING PLAN.xlsx",
      ),
    ),
    readFile(
      path.join(
        repoRoot,
        "samples",
        "attendance_test",
        "1_(7æ)åå·¥å·å¡è®°å½è¡¨.xls",
      ),
    ),
  ]);
  await mkdir(runtimeDirectory, { recursive: true });
  await Promise.all([
    writeFile(unloadingFixturePath, unloadingSource),
    writeFile(attendanceFixturePath, attendanceSource),
  ]);
});

test.afterAll(async () => {
  await rm(runtimeDirectory, { force: true, recursive: true });
});

test("UTF-8 filenames survive browser FormData, nginx, API persistence, response, and DOM", async ({
  page,
  request,
}) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console:${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`pageerror:${error.message}`));
  const token = await loginThroughApi(page, request);

  await page.goto("/imports/new");
  await page.locator('input[type="file"]').setInputFiles(unloadingFixturePath);
  await expect(page.getByText(expectedUnloadingFilename, { exact: true }))
    .toBeVisible();
  const unloadingUpload = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/imports") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Upload 1 file|Upload 1 files/ }).click();
  const unloadingResponse = await unloadingUpload;
  expect(unloadingResponse.status()).toBe(201);
  const unloading = (await unloadingResponse.json()) as {
    id: string;
    originalFilename: string;
    filenameReviewCode: string | null;
  };
  expect(unloading).not.toHaveProperty('storedPath');
  expect(unloading.filenameReviewCode).toBeNull();
  expect(escapedCodePoints(unloading.originalFilename)).toBe(
    escapedCodePoints(expectedUnloadingFilename),
  );
  await expect(page.getByText(expectedUnloadingFilename, { exact: true }))
    .toHaveCount(2);

  const unloadingDetail = await page.request.get(`/api/imports/${unloading.id}`);
  expect(unloadingDetail.status()).toBe(200);
  expect(
    escapedCodePoints(
      ((await unloadingDetail.json()) as { originalFilename: string })
        .originalFilename,
    ),
  ).toBe(escapedCodePoints(expectedUnloadingFilename));

  await page.goto('/imports');
  const unloadingRow = page.locator(`tr[data-record-id="${unloading.id}"]`);
  await expect(unloadingRow.getByText(expectedUnloadingFilename, { exact: true }))
    .toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(expectedUnloadingFilename);
    await dialog.dismiss();
  });
  await unloadingRow.getByRole('button', { name: 'Delete' }).click();
  await page.goto(`/imports/${unloading.id}`);
  await expect(page.getByRole('heading', { name: expectedUnloadingFilename }))
    .toBeVisible();

  await page.goto("/work-hours");
  await page
    .getByLabel("Choose attendance file")
    .setInputFiles(attendanceFixturePath);
  await expect(page.getByText(expectedAttendanceFilename, { exact: true }))
    .toBeVisible();
  const attendanceUpload = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/attendance-imports") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload .xls" }).click();
  const attendanceResponse = await attendanceUpload;
  expect(attendanceResponse.status()).toBe(201);
  const attendanceImport = (await attendanceResponse.json()) as {
    id: string;
    originalFilename: string;
    filenameReviewCode: string | null;
  };
  expect(attendanceImport).not.toHaveProperty('storedPath');
  expect(attendanceImport.filenameReviewCode).toBeNull();
  expect(escapedCodePoints(attendanceImport.originalFilename)).toBe(
    escapedCodePoints(expectedAttendanceFilename),
  );
  await expect(page.getByText(expectedAttendanceFilename, { exact: true }).first())
    .toBeVisible();

  const attendanceDetail = await page.request.get(
    `/api/attendance-imports/${attendanceImport.id}`,
  );
  expect(attendanceDetail.status()).toBe(200);
  expect(
    escapedCodePoints(
      ((await attendanceDetail.json()) as { originalFilename: string })
        .originalFilename,
    ),
  ).toBe(escapedCodePoints(expectedAttendanceFilename));

  await page.goto(
    `/work-hours?attendanceImportId=${encodeURIComponent(attendanceImport.id)}`,
  );
  await expect(page.getByText(expectedAttendanceFilename, { exact: true }).first())
    .toBeVisible();
  await page.reload();
  await expect(page.getByText(expectedAttendanceFilename, { exact: true }).first())
    .toBeVisible();

  await page.getByRole('button', { name: '中文' }).click();
  await expect(page.getByText(expectedAttendanceFilename, { exact: true }).first())
    .toBeVisible();
  await expect(page.getByRole('heading', { name: '工时结算' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByText(expectedAttendanceFilename, { exact: true }).first())
    .toBeVisible();

  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoPageOverflow(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await assertNoPageOverflow(page);

  const deleteAttendanceButton = page
    .getByRole('button', {
      name: `Delete attendance import ${expectedAttendanceFilename}`,
    })
    .first();
  await deleteAttendanceButton.click();
  const deleteDialog = page.getByRole('dialog');
  await expect(
    deleteDialog.getByText(expectedAttendanceFilename, { exact: true }),
  ).toBeVisible();
  await deleteDialog.getByRole('textbox').fill('FILE-UPLOAD-01 audit history check.');
  await deleteDialog.getByRole('button', { name: 'Delete import' }).click();
  await expect(page.getByText('Deleted attendance imports')).toBeVisible();
  await expect(page.getByText(expectedAttendanceFilename, { exact: true }).last())
    .toBeVisible();
  const deletionHistory = await page.request.get(
    '/api/attendance-imports/deletion-history?limit=25&offset=0',
  );
  expect(deletionHistory.status()).toBe(200);
  const deletionItems = ((await deletionHistory.json()) as {
    items: Array<{ attendanceImportId: string; originalFilename: string }>;
  }).items;
  expect(
    deletionItems.find((item) => item.attendanceImportId === attendanceImport.id)
      ?.originalFilename,
  ).toBe(expectedAttendanceFilename);
  await verifyRealBrowserZoom(token, expectedAttendanceFilename);
  expect(browserErrors).toEqual([]);

  if (process.env.E2E_FORCE_FAILURE === "1") {
    throw new Error("FILE_UPLOAD_01_INTENTIONAL_CLEANUP_PROBE");
  }
});

function escapedCodePoints(value: string): string {
  return [...value]
    .map((character) => {
      const point = character.codePointAt(0)!;
      return point <= 0x7f
        ? character
        : `\\u{${point.toString(16).toUpperCase()}}`;
    })
    .join("");
}

async function assertNoPageOverflow(page: import('@playwright/test').Page) {
  expect(
    await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

async function verifyRealBrowserZoom(
  token: string,
  expectedFilename: string,
): Promise<void> {
  const extensionPath = path.join(
    process.cwd(),
    'e2e/fixtures/browser-zoom-extension',
  );
  const context = await chromium.launchPersistentContext(
    path.join(runtimeDirectory, 'zoom-profile'),
    {
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      baseURL: E2E_BASE_URL,
      channel: 'chromium',
      headless: true,
      viewport: { height: 768, width: 1366 },
    },
  );
  try {
    await configureBrowserActor(context, token);
    await context.addCookies([
      {
        name: 'bestar_locale',
        sameSite: 'Lax',
        url: new URL(E2E_BASE_URL).origin,
        value: 'en',
      },
      {
        name: 'bestar_theme',
        sameSite: 'Lax',
        url: new URL(E2E_BASE_URL).origin,
        value: 'dark',
      },
    ]);
    const worker = await getBrowserZoomWorker(context);
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    const errors: string[] = [];
    zoomPage.on('pageerror', (error) => errors.push(error.message));
    zoomPage.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await zoomPage.goto('/work-hours', { waitUntil: 'networkidle' });
    await setRealBrowserZoom(zoomPage, worker, 2, 1366);
    await expect(zoomPage.getByText(expectedFilename, { exact: true }).last())
      .toBeVisible();
    await assertNoPageOverflow(zoomPage);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

async function getBrowserZoomWorker(
  context: BrowserContext,
): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

async function setRealBrowserZoom(
  page: import('@playwright/test').Page,
  worker: Worker,
  factor: number,
  physicalWidth: number,
): Promise<void> {
  const pageUrl = new URL(page.url()).href;
  await worker.evaluate(
    async ({ factor: requestedFactor, url }) => {
      type TabsApi = {
        getZoom(tabId: number): Promise<number>;
        query(queryInfo: object): Promise<Array<{ id?: number; url?: string }>>;
        setZoom(tabId: number, zoomFactor: number): Promise<void>;
      };
      const tabsApi = (globalThis as unknown as { chrome: { tabs: TabsApi } })
        .chrome.tabs;
      const tabId = (await tabsApi.query({})).find((tab) => tab.url === url)?.id;
      if (tabId === undefined) throw new Error('BROWSER_ZOOM_TAB_NOT_FOUND');
      await tabsApi.setZoom(tabId, requestedFactor);
      const appliedFactor = await tabsApi.getZoom(tabId);
      if (Math.abs(appliedFactor - requestedFactor) > 0.001) {
        throw new Error('BROWSER_ZOOM_FACTOR_MISMATCH');
      }
    },
    { factor, url: pageUrl },
  );
  await expect
    .poll(() => page.evaluate(() => window.innerWidth))
    .toBe(Math.round(physicalWidth / factor));
}
