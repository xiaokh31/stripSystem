import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  authHeaders,
  expectNoPageError,
  loginThroughApi,
} from "./helpers";

const repoRoot = path.resolve(process.cwd(), "../..");
const attendanceFixturePath = path.join(
  repoRoot,
  "samples",
  "wage",
  "workAttendanceRecordForm_June.xls",
);
const settlementMonth = "2026-06";
const completedAt = "2026-06-18T20:30:00.000Z";

const forbiddenBilingualStatusPatterns = [
  /已拆完\s*\(UNLOADED\)/,
  /已送库\s*\(LOADED\)/,
  /Unloaded\s*\/\s*已拆完/,
  /Delivered to destination\s*\/\s*已送库/,
] as const;

const forbiddenEnglishChineseStatusPatterns = [
  /已拆完/,
  /装车中/,
  /已送库/,
  /已装车/,
  /已装托盘/,
  /完成装车/,
  /已生成/,
  /已完成/,
  /需复核/,
  /待同步/,
  /上传中/,
] as const;

const forbiddenChineseEnglishStatusPatterns = [
  /\bUnloaded\b/,
  /Loading in progress/,
  /Delivered to destination/,
  /\bLoaded pallets\b/,
  /\bComplete loading\b/,
  /\bGenerated\b/,
  /\bCompleted\b/,
  /Needs review/,
  /\bUploaded\b/,
  /\bParsed\b/,
  /\bFailed\b/,
  /\bPending\b/,
  /\bUploading\b/,
] as const;

test("core pages switch locale, persist refresh, and keep status labels single-language", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const adminToken = await loginThroughApi(page, request);
  const fixture = await prepareLocaleFixture(request, adminToken, testInfo);
  const pages: LocalePageCheck[] = [
    { enText: "Bestar warehouse office", path: "/", zhText: "Bestar 仓库办公室" },
    { enText: "Imports", path: "/imports", zhText: "导入" },
    {
      enText: fixture.loadedContainerNo,
      path: "/containers",
      requiredEnglish: ["Unloaded", "Loading in progress", "Delivered to destination"],
      requiredChinese: ["已拆完", "装车中", "已送库"],
      zhText: fixture.loadedContainerNo,
    },
    {
      enText: fixture.loadedContainerNo,
      path: `/containers/${fixture.loadedContainerId}`,
      requiredEnglish: ["Delivered to destination"],
      requiredChinese: ["已送库"],
      zhText: fixture.loadedContainerNo,
    },
    {
      enText: "Inventory report",
      path: "/reports/inventory",
      requiredEnglish: ["Delivered to destination"],
      requiredChinese: ["已送库"],
      zhText: "库存报告",
    },
    {
      enText: "Work Hours Settlement",
      path: `/work-hours?attendanceImportId=${encodeURIComponent(
        fixture.attendanceImportId,
      )}`,
      requiredEnglish: ["Uploaded", "Parsed", "Generated"],
      requiredChinese: ["已上传", "已解析", "已生成"],
      zhText: "工时结算",
    },
    {
      enText: "Warehouse Unloading Wage Settlement",
      path: `/unloading-wage?settlementMonth=${settlementMonth}`,
      requiredEnglish: ["Generated", "Completed"],
      requiredChinese: ["已生成", "已完成"],
      zhText: "仓库卸柜工资结算",
    },
    {
      enText: "Monthly Unloading Data Summary",
      path: `/unloading-summary?month=${settlementMonth}`,
      requiredEnglish: ["Unloaded", "Loading in progress", "Delivered to destination"],
      requiredChinese: ["已拆完", "装车中", "已送库"],
      zhText: "月度拆柜数据汇总",
    },
    {
      enText: "Load jobs",
      path: "/load-jobs",
      requiredEnglish: ["In progress"],
      requiredChinese: ["进行中"],
      zhText: "装车任务",
    },
    {
      enText: "Select open load job",
      path: "/mobile/load-jobs",
      requiredEnglish: ["In progress"],
      requiredChinese: ["进行中"],
      zhText: "选择打开的装车任务",
    },
    {
      enText: "Complete loading",
      path: `/mobile/load-jobs/${fixture.mobileLoadJobId}/scan`,
      requiredEnglish: ["Loaded pallet", "Complete loading"],
      requiredChinese: ["已装托盘", "完成装车"],
      zhText: "完成装车",
    },
    { enText: "User management", path: "/admin/users", zhText: "用户管理" },
    { enText: "Operational settings", path: "/settings", zhText: "运营设置" },
  ];

  for (const item of pages) {
    await expectLocaleSwitch(page, item);
  }
});

interface LocalePageCheck {
  enText: string;
  path: string;
  requiredEnglish?: string[];
  requiredChinese?: string[];
  zhText: string;
}

interface LocaleFixture {
  attendanceImportId: string;
  loadedContainerId: string;
  loadedContainerNo: string;
  mobileLoadJobId: string;
}

async function expectLocaleSwitch(
  page: Page,
  check: LocalePageCheck,
): Promise<void> {
  await page.goto(check.path);
  await switchToEnglish(page);
  await expect(page.getByText(check.enText).first()).toBeVisible();
  for (const text of check.requiredEnglish ?? []) {
    await expect(page.getByText(text).first()).toBeVisible();
  }
  await expectNoForbiddenVisibleText(
    page,
    [...forbiddenBilingualStatusPatterns, ...forbiddenEnglishChineseStatusPatterns],
    `English ${check.path}`,
  );
  await expectNoPageError(page);

  await switchToChinese(page);
  await expect(page.getByText(check.zhText).first()).toBeVisible();
  for (const text of check.requiredChinese ?? []) {
    await expect(page.getByText(text).first()).toBeVisible();
  }
  await expectNoForbiddenVisibleText(
    page,
    [...forbiddenBilingualStatusPatterns, ...forbiddenChineseEnglishStatusPatterns],
    `Chinese ${check.path}`,
  );
  await expectNoPageError(page);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByText(check.zhText).first()).toBeVisible();
  await expectNoForbiddenVisibleText(
    page,
    [...forbiddenBilingualStatusPatterns, ...forbiddenChineseEnglishStatusPatterns],
    `Chinese refresh ${check.path}`,
  );

  await switchToEnglish(page);
  await expect(page.getByText(check.enText).first()).toBeVisible();
  await expectNoForbiddenVisibleText(
    page,
    [...forbiddenBilingualStatusPatterns, ...forbiddenEnglishChineseStatusPatterns],
    `English restore ${check.path}`,
  );
}

async function switchToChinese(page: Page): Promise<void> {
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
}

async function switchToEnglish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

async function expectNoForbiddenVisibleText(
  page: Page,
  patterns: readonly RegExp[],
  context: string,
): Promise<void> {
  const text = await page.locator("body").innerText();
  for (const pattern of patterns) {
    expect(text, `${context} should not show ${pattern}`).not.toMatch(pattern);
  }
}

async function prepareLocaleFixture(
  request: APIRequestContext,
  adminToken: string,
  testInfo: { project: { name: string } },
): Promise<LocaleFixture> {
  const suffix = uniqueSuffix(testInfo.project.name);
  const worker = await createTemporaryUnloader(request, adminToken, suffix);
  await createCompletedContainer(
    request,
    adminToken,
    `LQAU${suffix}U`,
    worker.id,
  );
  const inProgress = await createScannedContainer(
    request,
    adminToken,
    `LQBU${suffix}P`,
    {
      palletCount: 2,
      scanCount: 1,
      suffix,
    },
  );
  const loaded = await createScannedContainer(
    request,
    adminToken,
    `LQCU${suffix}L`,
    {
      palletCount: 1,
      scanCount: 1,
      suffix,
    },
  );

  await createSettlement(request, adminToken, settlementMonth);
  const attendanceImportId = await ensureGeneratedAttendanceImport(
    request,
    adminToken,
  );

  return {
    attendanceImportId,
    loadedContainerId: loaded.containerId,
    loadedContainerNo: loaded.containerNo,
    mobileLoadJobId: inProgress.loadJobId,
  };
}

async function createCompletedContainer(
  request: APIRequestContext,
  token: string,
  containerNo: string,
  workerId: string,
): Promise<{ containerId: string; containerNo: string }> {
  const container = await createManualContainer(request, token, containerNo, 1);
  await saveOceanPayUnit(request, token, container.id);
  await expectOk(
    request.put(`/api/containers/${container.id}/unloaders`, {
      data: {
        reason: "Playwright locale switch unloading worker",
        unloaders: [{ unloadingWorkerId: workerId }],
      },
      headers: authHeaders(token),
    }),
  );
  await completeUnloading(request, token, container.id);
  return { containerId: container.id, containerNo };
}

async function createScannedContainer(
  request: APIRequestContext,
  token: string,
  containerNo: string,
  input: { palletCount: number; scanCount: number; suffix: string },
): Promise<{ containerId: string; containerNo: string; loadJobId: string }> {
  const container = await createManualContainer(
    request,
    token,
    containerNo,
    input.palletCount,
  );
  await saveOceanPayUnit(request, token, container.id);
  const labels = await generateLabels(request, token, container.id);
  await completeUnloading(request, token, container.id);
  const loadJob = await createLoadJob(
    request,
    token,
    containerNo,
    input.scanCount,
    input.suffix,
  );
  await expectOk(
    request.patch(`/api/load-jobs/${loadJob.id}`, {
      data: { status: "IN_PROGRESS" },
      headers: authHeaders(token),
    }),
  );

  for (const pallet of labels.pallets.slice(0, input.scanCount)) {
    await expectOk(
      request.post(`/api/load-jobs/${loadJob.id}/scan`, {
        data: {
          deviceId: "playwright-locale-switch",
          qrPayload: pallet.qrPayload,
        },
        headers: authHeaders(token),
      }),
      201,
    );
  }

  return { containerId: container.id, containerNo, loadJobId: loadJob.id };
}

async function createManualContainer(
  request: APIRequestContext,
  token: string,
  containerNo: string,
  pallets: number,
): Promise<{ id: string }> {
  const response = await expectOk(
    request.post("/api/containers/manual", {
      data: {
        company: "Bestar Locale E2E",
        containerNo,
        correctionNote: "Playwright locale switch fixture",
        destinations: [
          {
            cartons: pallets * 12,
            destinationCode: "YEG2",
            destinationType: "WAREHOUSE",
            note: "Playwright locale switch destination",
            pallets,
            volume: 1.25,
          },
        ],
        dockNo: "E2E",
        reason: "Playwright locale switch fixture",
      },
      headers: authHeaders(token),
    }),
    201,
  );
  const body = (await response.json()) as { container: { id: string } };
  return body.container;
}

async function createTemporaryUnloader(
  request: APIRequestContext,
  token: string,
  suffix: string,
): Promise<{ id: string }> {
  const response = await expectOk(
    request.post("/api/unloading-wage/workers", {
      data: {
        displayName: `Locale Switch Worker ${suffix}`,
        note: "Playwright locale switch worker",
        workerCode: `LSW-${suffix}`,
      },
      headers: authHeaders(token),
    }),
    201,
  );
  return (await response.json()) as { id: string };
}

async function saveOceanPayUnit(
  request: APIRequestContext,
  token: string,
  containerId: string,
): Promise<void> {
  await expectOk(
    request.patch(`/api/containers/${containerId}/unloading-wage`, {
      data: {
        classification: "OCEAN_CONTAINER",
        reason: "Playwright locale switch wage unit",
      },
      headers: authHeaders(token),
    }),
  );
}

async function completeUnloading(
  request: APIRequestContext,
  token: string,
  containerId: string,
): Promise<void> {
  await expectOk(
    request.post(`/api/containers/${containerId}/complete-unloading`, {
      data: {
        completedAt,
        note: "Playwright locale switch completion",
        reason: "Playwright locale switch completion",
      },
      headers: authHeaders(token),
    }),
    201,
  );
}

async function generateLabels(
  request: APIRequestContext,
  token: string,
  containerId: string,
): Promise<{ pallets: Array<{ qrPayload: string }> }> {
  const response = await expectOk(
    request.post(`/api/containers/${containerId}/generate-labels`, {
      headers: authHeaders(token),
    }),
    201,
  );
  return (await response.json()) as { pallets: Array<{ qrPayload: string }> };
}

async function createLoadJob(
  request: APIRequestContext,
  token: string,
  containerNo: string,
  plannedPallets: number,
  suffix: string,
): Promise<{ id: string }> {
  const response = await expectOk(
    request.post("/api/load-jobs", {
      data: {
        destinationRegion: "YEG2",
        dockNo: "LS",
        lines: [
          {
            containerNo,
            destinationCode: "YEG2",
            plannedPallets,
            sourceText: `${containerNo}-${plannedPallets}P`,
          },
        ],
        loadNo: `LOC-${suffix}-${containerNo.slice(-1)}`,
        scheduledDepartureAt: "2026-06-18T22:00:00.000Z",
        truckNo: `TR-${suffix}`,
      },
      headers: authHeaders(token),
    }),
    201,
  );
  return (await response.json()) as { id: string };
}

async function createSettlement(
  request: APIRequestContext,
  token: string,
  month: string,
): Promise<void> {
  await expectOk(
    request.post("/api/unloading-wage-settlements", {
      data: { settlementMonth: month },
      headers: authHeaders(token),
    }),
    201,
  );
}

async function ensureGeneratedAttendanceImport(
  request: APIRequestContext,
  token: string,
): Promise<string> {
  const fileBuffer = await readFile(attendanceFixturePath);
  const uploadResponse = await request.post("/api/attendance-imports", {
    headers: authHeaders(token),
    multipart: {
      file: {
        buffer: fileBuffer,
        mimeType: "application/vnd.ms-excel",
        name: "workAttendanceRecordForm_June.xls",
      },
    },
  });
  expect([201, 409]).toContain(uploadResponse.status());
  const uploadBody = (await uploadResponse.json()) as {
    details?: {
      existingImport?: { id?: string };
      existingImportId?: string;
    };
    id?: string;
  };
  const id =
    uploadBody.id ??
    uploadBody.details?.existingImportId ??
    uploadBody.details?.existingImport?.id;
  expect(id).toBeTruthy();

  await expectOk(
    request.post(`/api/attendance-imports/${id}/parse`, {
      headers: authHeaders(token),
    }),
    201,
  );
  await expectOk(
    request.post(`/api/attendance-imports/${id}/generate-wage-record`, {
      headers: authHeaders(token),
    }),
    201,
  );

  return id!;
}

async function expectOk(
  responsePromise: Promise<APIResponse>,
  status = 200,
): Promise<APIResponse> {
  const response = await responsePromise;
  expect(response.status()).toBe(status);
  return response;
}

function uniqueSuffix(projectName: string): string {
  const projectDigit = projectName.includes("mobile") ? "2" : "1";
  return `${projectDigit}${Date.now().toString().slice(-6)}`;
}
