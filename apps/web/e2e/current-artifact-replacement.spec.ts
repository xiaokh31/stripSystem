import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import {
  authHeaders,
  configureBrowserActor,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_BASE_URL,
  loginForAccessToken,
  loginThroughApi,
} from "./helpers";
import {
  createDerivedRealWorkbook,
  uniquePolicyContainerNo,
} from "./real-workbook-fixture";

interface GeneratedFile {
  fileSha256: string | null;
  fileType: "EXCEL_REPORT" | "PALLET_LABEL_PDF";
  id: string;
  status: string;
}

interface AsyncJob {
  generatedFileId: string | null;
  id: string;
  result: unknown;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
}

test("report and label regeneration replace two current slots through nginx and BullMQ", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(600_000);
  const artifactDir = path.resolve(
    process.env.UNLOAD_REPORT_04_ARTIFACT_DIR ??
      testInfo.outputPath("unload-report-04"),
  );
  await mkdir(artifactDir, { recursive: true });
  const accessToken = await loginThroughApi(page, request);
  const headers = authHeaders(accessToken);
  const containerNo = uniquePolicyContainerNo();
  const workbookPath = await createDerivedRealWorkbook(testInfo, containerNo);
  const workbookBuffer = await readFile(workbookPath);
  let importId: string | null = null;

  try {
    const upload = await request.post("/api/imports", {
      headers,
      multipart: {
        file: {
          buffer: workbookBuffer,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          name: path.basename(workbookPath),
        },
      },
    });
    await expectStatus(upload, 201);
    importId = ((await upload.json()) as { id: string }).id;
    await writeFile(path.join(artifactDir, "import-id.txt"), `${importId}\n`);
    const parse = await request.post(`/api/imports/${importId}/parse`, {
      headers,
    });
    await expectStatus(parse, 201);
    const containerId = (
      (await parse.json()) as { containers: Array<{ id: string }> }
    ).containers[0]!.id;

    const firstReportJob = await submitAndWait(
      request,
      headers,
      containerId,
      "generate-report-job",
    );
    const firstFiles = await currentFiles(request, headers, containerId);
    expect(firstFiles).toHaveLength(1);
    const firstReport = currentFile(firstFiles, "EXCEL_REPORT");
    expect(firstReportJob.generatedFileId).toBe(firstReport.id);
    const firstReportDownload = await download(
      request,
      headers,
      containerId,
      firstReport,
    );

    const secondReportJob = await submitAndWait(
      request,
      headers,
      containerId,
      "generate-report-job",
    );
    const reportFiles = await currentFiles(request, headers, containerId);
    expect(reportFiles).toHaveLength(1);
    const secondReport = currentFile(reportFiles, "EXCEL_REPORT");
    expect(secondReport.id).not.toBe(firstReport.id);
    expect(secondReportJob.generatedFileId).toBe(secondReport.id);
    const secondReportDownload = await download(
      request,
      headers,
      containerId,
      secondReport,
    );
    expect(secondReportDownload.sha256).toBe(secondReport.fileSha256);
    const oldReportDownload = await request.get(
      `/api/containers/${containerId}/files/${firstReport.id}/download`,
      { headers },
    );
    await expectStatus(oldReportDownload, 400);
    expect((await oldReportDownload.json()).code).toBe(
      "GENERATED_FILE_SUPERSEDED",
    );

    const firstLabelJob = await submitAndWait(
      request,
      headers,
      containerId,
      "generate-labels-job",
    );
    const firstLabel = currentFile(
      await currentFiles(request, headers, containerId),
      "PALLET_LABEL_PDF",
    );
    expect(firstLabelJob.generatedFileId).toBe(firstLabel.id);
    const firstLabelDownload = await download(
      request,
      headers,
      containerId,
      firstLabel,
    );

    const secondLabelJob = await submitAndWait(
      request,
      headers,
      containerId,
      "generate-labels-job",
    );
    const finalFiles = await currentFiles(request, headers, containerId);
    expect(finalFiles).toHaveLength(2);
    const secondLabel = currentFile(finalFiles, "PALLET_LABEL_PDF");
    expect(secondLabel.id).not.toBe(firstLabel.id);
    expect(secondLabelJob.generatedFileId).toBe(secondLabel.id);
    const secondLabelDownload = await download(
      request,
      headers,
      containerId,
      secondLabel,
    );
    expect(secondLabelDownload.sha256).toBe(secondLabel.fileSha256);

    const concurrentReports = await Promise.all([
      request.post(`/api/containers/${containerId}/generate-report`, {
        headers,
      }),
      request.post(`/api/containers/${containerId}/generate-report`, {
        headers,
      }),
    ]);
    await Promise.all(
      concurrentReports.map((response) => expectStatus(response, 201)),
    );
    const concurrentReportRecords = await Promise.all(
      concurrentReports.map(
        async (response) =>
          ((await response.json()) as { generatedFile: GeneratedFile })
            .generatedFile,
      ),
    );
    const afterConcurrentReports = await currentFiles(
      request,
      headers,
      containerId,
    );
    expect(afterConcurrentReports).toHaveLength(2);
    const concurrentReportWinner = currentFile(
      afterConcurrentReports,
      "EXCEL_REPORT",
    );
    expect(
      concurrentReportRecords.map((record) => record.id),
    ).toContain(concurrentReportWinner.id);

    const concurrentLabels = await Promise.all([
      request.post(`/api/containers/${containerId}/generate-labels`, {
        headers,
      }),
      request.post(`/api/containers/${containerId}/generate-labels`, {
        headers,
      }),
    ]);
    await Promise.all(
      concurrentLabels.map((response) => expectStatus(response, 201)),
    );
    const concurrentLabelRecords = await Promise.all(
      concurrentLabels.map(
        async (response) =>
          ((await response.json()) as { generatedFile: GeneratedFile })
            .generatedFile,
      ),
    );
    const concurrentFinalFiles = await currentFiles(
      request,
      headers,
      containerId,
    );
    expect(concurrentFinalFiles).toHaveLength(2);
    const concurrentLabelWinner = currentFile(
      concurrentFinalFiles,
      "PALLET_LABEL_PDF",
    );
    expect(
      concurrentLabelRecords.map((record) => record.id),
    ).toContain(concurrentLabelWinner.id);

    await page.goto(
      `/containers/${containerId}?fileId=${firstReport.id}#generated-files`,
      {
        waitUntil: "networkidle",
      },
    );
    await expect(page.locator("[data-selected-file-replaced]")).toBeVisible();
    await expect(
      page.locator(
        `[data-generated-file-id="${concurrentReportWinner.id}"]`,
      ),
    ).toHaveAttribute("data-selected-record", "true");

    await page.goto(`/containers/${containerId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("[data-current-file-slot]")).toHaveCount(2);
    await expect(
      page.locator('[data-current-file-slot="EXCEL_REPORT"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-current-file-slot="PALLET_LABEL_PDF"]'),
    ).toHaveCount(1);
    await expect(page.locator("[data-generated-file-id]")).toHaveCount(2);

    await page.context().addCookies([
      browserCookie("bestar_locale", "en"),
      browserCookie("bestar_theme", "light"),
    ]);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    for (const [locale, theme] of [
      ["en", "light"],
      ["en", "dark"],
      ["zh-CN", "light"],
      ["zh-CN", "dark"],
    ] as const) {
      await page.context().addCookies([
        browserCookie("bestar_locale", locale),
        browserCookie("bestar_theme", theme),
      ]);
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("[data-current-file-slot]")).toHaveCount(2);
      expect(await hasPageOverflow(page)).toBe(false);
      await page.screenshot({
        fullPage: true,
        path: path.join(artifactDir, `${locale}-${theme}-desktop.png`),
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("[data-current-file-slot]")).toHaveCount(2);
      expect(await hasPageOverflow(page)).toBe(false);
      await page.screenshot({
        fullPage: true,
        path: path.join(artifactDir, `${locale}-${theme}-mobile.png`),
      });
    }
    await verifyRealBrowserZoom(
      accessToken,
      `/containers/${containerId}`,
      artifactDir,
      testInfo.outputPath("zoom-profile"),
    );

    await writeFile(
      path.join(artifactDir, "verification.json"),
      `${JSON.stringify(
        {
          containerId,
          importId,
          jobs: {
            firstLabel: firstLabelJob.id,
            firstReport: firstReportJob.id,
            secondLabel: secondLabelJob.id,
            secondReport: secondReportJob.id,
          },
          concurrentGenerationIds: {
            labels: concurrentLabelRecords.map((record) => record.id),
            reports: concurrentReportRecords.map((record) => record.id),
          },
          currentFileIds: concurrentFinalFiles.map((file) => file.id),
          oldFileIds: [firstReport.id, firstLabel.id],
          reportDownloadSha256: {
            first: firstReportDownload.sha256,
            second: secondReportDownload.sha256,
          },
          labelDownloadSha256: {
            first: firstLabelDownload.sha256,
            second: secondLabelDownload.sha256,
          },
          slotCount: 2,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } finally {
    if (importId) {
      const cleanupToken = await loginForAccessToken(request, {
        email: E2E_ADMIN_EMAIL,
        password: E2E_ADMIN_PASSWORD,
      });
      const cleanup = await request.delete(`/api/imports/${importId}`, {
        data: { reason: "UNLOAD_REPORT_04_E2E_CLEANUP" },
        headers: authHeaders(cleanupToken),
      });
      await expectStatus(cleanup, 200);
    }
  }
});

async function submitAndWait(
  request: APIRequestContext,
  headers: Record<string, string>,
  containerId: string,
  action: "generate-labels-job" | "generate-report-job",
): Promise<AsyncJob> {
  const response = await request.post(
    `/api/containers/${containerId}/${action}`,
    { headers },
  );
  await expectStatus(response, 201);
  const submitted = (await response.json()) as AsyncJob;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const current = await getJson<AsyncJob>(
      request,
      `/api/queue/jobs/${submitted.id}`,
      headers,
    );
    if (current.status === "succeeded") {
      return current;
    }
    if (["failed", "cancelled"].includes(current.status)) {
      throw new Error(`Async job ${current.id} ended as ${current.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Async job ${submitted.id} timed out`);
}

async function currentFiles(
  request: APIRequestContext,
  headers: Record<string, string>,
  containerId: string,
): Promise<GeneratedFile[]> {
  return (
    await getJson<{ items: GeneratedFile[] }>(
      request,
      `/api/containers/${containerId}/files`,
      headers,
    )
  ).items;
}

function currentFile(
  files: GeneratedFile[],
  fileType: GeneratedFile["fileType"],
): GeneratedFile {
  const file = files.find((candidate) => candidate.fileType === fileType);
  expect(file).toBeDefined();
  return file!;
}

async function download(
  request: APIRequestContext,
  headers: Record<string, string>,
  containerId: string,
  file: GeneratedFile,
): Promise<{ bytes: number; sha256: string }> {
  const response = await request.get(
    `/api/containers/${containerId}/files/${file.id}/download`,
    { headers },
  );
  await expectStatus(response, 200);
  const buffer = await response.body();
  return {
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

async function getJson<T>(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await request.get(url, { headers });
  await expectStatus(response, 200);
  return (await response.json()) as T;
}

async function expectStatus(
  response: APIResponse,
  expected: number,
): Promise<void> {
  if (response.status() !== expected) {
    throw new Error(
      `Expected ${expected} from ${response.url()}, got ${response.status()}: ${await response.text()}`,
    );
  }
}

function browserCookie(name: string, value: string) {
  return {
    httpOnly: false,
    name,
    sameSite: "Lax" as const,
    secure: false,
    url: E2E_BASE_URL,
    value,
  };
}

async function hasPageOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

async function verifyRealBrowserZoom(
  token: string,
  route: string,
  artifactDir: string,
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
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    for (const locale of ["en", "zh-CN"] as const) {
      for (const theme of ["light", "dark"] as const) {
        await context.addCookies([
          browserCookie("bestar_locale", locale),
          browserCookie("bestar_theme", theme),
        ]);
        await zoomPage.goto(route, { waitUntil: "networkidle" });
        await setRealBrowserZoom(zoomPage, worker, 2, 1366);
        await expect(
          zoomPage.locator("[data-current-file-slot]"),
        ).toHaveCount(2);
        expect(await hasPageOverflow(zoomPage)).toBe(false);
        await zoomPage.locator("#generated-files").scrollIntoViewIfNeeded();
        await captureBrowserViewport(
          zoomPage,
          path.join(artifactDir, `${locale}-${theme}-zoom-200.png`),
        );
        await setRealBrowserZoom(zoomPage, worker, 1, 1366);
      }
    }
  } finally {
    await context.close();
  }
}

async function getBrowserZoomWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"))
  );
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
      const tabId = (await tabsApi.query({})).find(
        (tab) => tab.url === url,
      )?.id;
      if (tabId === undefined) {
        throw new Error(`No browser tab found for ${url}`);
      }
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

async function captureBrowserViewport(
  page: Page,
  screenshotPath: string,
): Promise<void> {
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
