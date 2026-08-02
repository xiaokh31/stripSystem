import {
  chromium,
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  authHeaders,
  configureBrowserActor,
  E2E_BASE_URL,
  loginThroughApi,
} from "./helpers";

const expectedFilename = "1_(7月)员工刷卡记录表.xls";
const expectedSourceSha =
  "63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597";
const runId = process.env.WAGE_HOURS_08_RUN_ID ?? "local-repro";
const repoRoot = path.resolve(process.cwd(), "../..");
const evidenceDirectory = path.join(
  process.cwd(),
  "test-results",
  "wage-hours-08",
  "runtime",
  runId,
);
const fixturePath = path.join(evidenceDirectory, expectedFilename);
const downloadedWorkbookPath = path.join(
  evidenceDirectory,
  "api-downloaded-wage-record.xls",
);
const uiDownloadedWorkbookPath = path.join(
  evidenceDirectory,
  "ui-proxy-downloaded-wage-record.xls",
);
const evidencePath = path.join(evidenceDirectory, "repro-evidence.json");

test.beforeAll(async () => {
  const sampleDirectory = path.join(repoRoot, "samples", "attendance_test");
  const sampleNames = (await readdir(sampleDirectory)).filter((name) =>
    name.toLowerCase().endsWith(".xls"),
  );
  expect(sampleNames).toHaveLength(1);
  const source = await readFile(path.join(sampleDirectory, sampleNames[0]!));
  expect(sha256(source)).toBe(expectedSourceSha);
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(fixturePath, source);
});

test("real July attendance completes UI async generation with an effective downloadable workbook", async ({
  page,
  request,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push("console-error");
  });
  page.on("pageerror", () => browserErrors.push("page-error"));
  page.on("requestfailed", (request) => {
    recordUnexpectedRequestFailure(request.failure()?.errorText, browserErrors);
  });
  const token = await loginThroughApi(page, request);

  await page.goto("/work-hours");
  await page.getByLabel("Choose attendance file").setInputFiles(fixturePath);
  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/attendance-imports") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload .xls" }).click();
  const uploadResponse = await uploadResponsePromise;
  expect(uploadResponse.status()).toBe(201);
  const attendanceImport = (await uploadResponse.json()) as {
    id: string;
    fileSha256: string;
  };
  expect(attendanceImport.fileSha256).toBe(expectedSourceSha);

  const parseSubmitPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(
        `/api/attendance-imports/${attendanceImport.id}/parse-job`,
      ) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Parse" }).click();
  const parseSubmit = await parseSubmitPromise;
  expect(parseSubmit.status()).toBe(201);
  const parseJobId = ((await parseSubmit.json()) as { id: string }).id;
  const parseJob = await waitForJob(request, token, parseJobId);
  expect(parseJob.status).toBe("succeeded");

  const parseResultResponse = await request.get(
    `/api/attendance-imports/${attendanceImport.id}/parse-result`,
    { headers: authHeaders(token) },
  );
  expect(parseResultResponse.status()).toBe(200);
  const parseResult = (await parseResultResponse.json()) as {
    activeRowCount: number;
    attendanceImport: {
      dataRevision: number;
      errorCount: number;
      parseStatus: string;
      periodEnd: string;
      periodStart: string;
    };
  };
  expect(parseResult.attendanceImport.parseStatus).toMatch(/PARSED|WARNING/);
  expect(parseResult.attendanceImport.errorCount).toBe(0);
  expect(parseResult.activeRowCount).toBeGreaterThan(0);
  expect(parseResult.attendanceImport.periodStart).toBe("2026-07-01");
  expect(parseResult.attendanceImport.periodEnd).toBe("2026-07-31");

  await page.reload();
  const generationSubmitPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(
        `/api/attendance-imports/${attendanceImport.id}/generate-wage-record-job`,
      ) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate wage record" }).click();
  const generationSubmit = await generationSubmitPromise;
  expect(generationSubmit.status()).toBe(201);
  const generationJobId = ((await generationSubmit.json()) as { id: string }).id;
  const generationJob = await waitForJob(request, token, generationJobId);

  const wageFileCard = page.getByTestId("wage-record-file").first();
  await expect(wageFileCard).toBeVisible({ timeout: 30_000 });
  const uiDownloadPromise = page.waitForEvent("download");
  await wageFileCard.getByRole("link", { name: "Download" }).click();
  const uiDownload = await uiDownloadPromise;
  expect(uiDownload.suggestedFilename()).toContain("2026-07-01");
  expect(uiDownload.suggestedFilename()).toContain("2026-07-31");
  await uiDownload.saveAs(uiDownloadedWorkbookPath);
  const uiDownloadSha = sha256(await readFile(uiDownloadedWorkbookPath));

  await verifyResponsivePresentations(page);
  await verifyRealBrowserZoom(
    token,
    `/work-hours?attendanceImportId=${encodeURIComponent(attendanceImport.id)}`,
    path.join(evidenceDirectory, "zoom-profile"),
  );

  const filesResponse = await request.get(
    `/api/attendance-imports/${attendanceImport.id}/files`,
    { headers: authHeaders(token) },
  );
  expect(filesResponse.status()).toBe(200);
  const files = (await filesResponse.json()) as {
    items: Array<{
      fileSha256: string | null;
      fileSizeBytes: string | null;
      fileType: string;
      id: string;
      status: string;
    }>;
  };
  const generatedFile = files.items.find(
    (file) => file.fileType === "WAGE_RECORD_XLS" && file.status === "GENERATED",
  );
  const warningCodes = issueCodes(generationJob.result, "warnings");
  const errorCodes = issueCodes(generationJob.result, "errors");

  let downloadSha: string | null = null;
  let downloadFilenamePeriodVerified = false;
  if (generatedFile) {
    const download = await request.get(
      `/api/attendance-imports/${attendanceImport.id}/files/${generatedFile.id}/download`,
      { headers: authHeaders(token) },
    );
    expect(download.status()).toBe(200);
    const contentDisposition = download.headers()["content-disposition"] ?? "";
    downloadFilenamePeriodVerified =
      contentDisposition.includes("2026-07-01") &&
      contentDisposition.includes("2026-07-31");
    expect(downloadFilenamePeriodVerified).toBe(true);
    const bytes = await download.body();
    downloadSha = sha256(bytes);
    await writeFile(downloadedWorkbookPath, bytes);
  }

  const syncResponse = await request.post(
    `/api/attendance-imports/${attendanceImport.id}/generate-wage-record`,
    { headers: authHeaders(token) },
  );
  const syncBody = (await syncResponse.json()) as Record<string, unknown>;
  await writeFile(
    evidencePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceSha256: expectedSourceSha,
        periodStart: parseResult.attendanceImport.periodStart,
        periodEnd: parseResult.attendanceImport.periodEnd,
        activeRowCount: parseResult.activeRowCount,
        dataRevision: parseResult.attendanceImport.dataRevision,
        parseJob: { id: parseJobId, status: parseJob.status },
        generationJob: {
          id: generationJobId,
          status: generationJob.status,
          warningCodeCounts: codeCounts(warningCodes),
          errorCodeCounts: codeCounts(errorCodes),
          generatedFileRef: generationJob.wageGeneratedFileId !== null,
        },
        generatedFile: generatedFile
          ? {
              id: generatedFile.id,
              status: generatedFile.status,
              sha256: generatedFile.fileSha256,
              sizeBytes: generatedFile.fileSizeBytes,
            downloadSha256: downloadSha,
            uiProxyDownloadSha256: uiDownloadSha,
            downloadFilenamePeriodVerified,
            }
          : null,
        synchronousDiagnostic: {
          status: syncResponse.status(),
          code: stringValue(syncBody.code),
          hasGeneratedFile: Boolean(objectValue(syncBody.generatedFile)),
          warningCodeCounts: codeCounts(issueCodes(syncBody, "warnings")),
          errorCodeCounts: codeCounts(issueCodes(syncBody, "errors")),
        },
        browserErrors,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  expect(generationJob.status).toBe("succeeded");
  expect(generationJob.wageGeneratedFileId).toBeTruthy();
  expect(errorCodes).toEqual([]);
  expect(warningCodes).not.toContain("WAGE_TEMPLATE_DATE_ROWS_NOT_FOUND");
  expect(generatedFile).toBeTruthy();
  expect(downloadSha).toBe(generatedFile?.fileSha256);
  expect(uiDownloadSha).toBe(generatedFile?.fileSha256);
  expect(downloadFilenamePeriodVerified).toBe(true);
  expect(browserErrors).toEqual([]);

  if (process.env.WAGE_HOURS_08_FORCE_FAILURE === "1") {
    throw new Error("WAGE_HOURS_08_INTENTIONAL_CLEANUP_PROBE");
  }
});

interface JobResponse {
  id: string;
  result: unknown;
  status: "cancelled" | "failed" | "queued" | "running" | "succeeded";
  wageGeneratedFileId: string | null;
}

async function waitForJob(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<JobResponse> {
  let job: JobResponse | null = null;
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/queue/jobs/${id}`, {
          headers: authHeaders(token),
        });
        expect(response.status()).toBe(200);
        job = (await response.json()) as JobResponse;
        return job.status;
      },
      { timeout: 150_000 },
    )
    .toMatch(/succeeded|failed|cancelled/);
  return job!;
}

function issueCodes(value: unknown, key: string): string[] {
  const root = objectValue(value);
  const issues = root?.[key];
  if (!Array.isArray(issues)) return [];
  return issues
    .map((issue) => stringValue(objectValue(issue)?.code))
    .filter((code): code is string => Boolean(code));
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function codeCounts(codes: string[]): Record<string, number> {
  return codes.reduce<Record<string, number>>((counts, code) => {
    counts[code] = (counts[code] ?? 0) + 1;
    return counts;
  }, {});
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function verifyResponsivePresentations(page: Page): Promise<void> {
  const matrix = [
    { height: 844, locale: "zh-CN" as const, theme: "dark" as const, width: 390 },
    { height: 900, locale: "en" as const, theme: "light" as const, width: 1366 },
    { height: 1080, locale: "zh-CN" as const, theme: "light" as const, width: 1920 },
  ];
  for (const presentation of matrix) {
    await setPresentation(
      page.context(),
      presentation.locale,
      presentation.theme,
    );
    await page.setViewportSize({
      height: presentation.height,
      width: presentation.width,
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", presentation.locale);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      presentation.theme,
    );
    await expect(
      page.getByRole("heading", {
        name: presentation.locale === "en" ? "Wage record files" : "工资表文件",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: presentation.locale === "en" ? "Download" : "下载",
      }).first(),
    ).toBeVisible();
    await expectNoDocumentOverflow(page, presentation.width);
  }
}

async function setPresentation(
  context: BrowserContext,
  locale: "en" | "zh-CN",
  theme: "dark" | "light",
): Promise<void> {
  await context.addCookies([
    {
      name: "bestar_locale",
      sameSite: "Lax",
      url: new URL(E2E_BASE_URL).origin,
      value: locale,
    },
    {
      name: "bestar_theme",
      sameSite: "Lax",
      url: new URL(E2E_BASE_URL).origin,
      value: theme,
    },
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
  const errors: string[] = [];
  try {
    await configureBrowserActor(context, token);
    await setPresentation(context, "en", "light");
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    zoomPage.on("console", (message) => {
      if (message.type() === "error") errors.push("console-error");
    });
    zoomPage.on("pageerror", () => errors.push("page-error"));
    zoomPage.on("requestfailed", (request) => {
      recordUnexpectedRequestFailure(request.failure()?.errorText, errors);
    });
    await zoomPage.goto(route, { waitUntil: "networkidle" });
    await setRealBrowserZoom(zoomPage, worker, 2, 1366);
    await expect(
      zoomPage.getByRole("heading", { name: "Wage record files" }),
    ).toBeVisible();
    await expect(
      zoomPage.getByRole("link", { name: "Download" }).first(),
    ).toBeVisible();
    await expectNoDocumentOverflow(zoomPage, 683);
    expect(errors).toEqual([]);
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
    async ({ factor: requestedFactor, url }) => {
      type TabsApi = {
        getZoom(tabId: number): Promise<number>;
        query(queryInfo: object): Promise<Array<{ id?: number; url?: string }>>;
        setZoom(tabId: number, zoomFactor: number): Promise<void>;
      };
      const tabsApi = (globalThis as unknown as { chrome: { tabs: TabsApi } })
        .chrome.tabs;
      const tabId = (await tabsApi.query({})).find((tab) => tab.url === url)?.id;
      if (tabId === undefined) throw new Error(`No browser tab found for ${url}`);
      await tabsApi.setZoom(tabId, requestedFactor);
      const appliedFactor = await tabsApi.getZoom(tabId);
      if (Math.abs(appliedFactor - requestedFactor) > 0.001) {
        throw new Error(
          `Expected browser zoom ${requestedFactor}, received ${appliedFactor}`,
        );
      }
    },
    { factor, url: pageUrl },
  );
  await expect
    .poll(() => page.evaluate(() => window.innerWidth))
    .toBe(Math.round(physicalWidth / factor));
}

async function expectNoDocumentOverflow(
  page: Page,
  viewportWidth: number,
): Promise<void> {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.clientWidth).toBe(viewportWidth);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

function recordUnexpectedRequestFailure(
  errorText: string | undefined,
  errors: string[],
): void {
  if (errorText !== "net::ERR_ABORTED") errors.push("request-failed");
}
