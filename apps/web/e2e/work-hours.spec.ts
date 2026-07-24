import {
  chromium,
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  authHeaders,
  configureBrowserActor,
  ensureTestUser,
  expectNoPageError,
  loginForAccessToken,
  loginThroughApi,
  loginWithCredentials,
  E2E_BASE_URL,
} from "./helpers";

const repoRoot = path.resolve(process.cwd(), "../..");
const sourceAttendanceFixturePath = path.join(
  repoRoot,
  "samples",
  "wage",
  "workAttendanceRecordForm_June.xls",
);
let attendanceFixturePath = sourceAttendanceFixturePath;
const invalidXlsxFixturePath = path.join(
  repoRoot,
  "samples",
  "unloading-plans",
  "BEAU5601716 UNLOADING PLAN.xlsx",
);
let attendanceFixtureSha256 =
  "4c3a5c0750e04f99cd614da033d54d948b5fd1b72e0ffec4f19a3d35c9f682b3";
const wageTemplatePath = path.join(
  repoRoot,
  "samples",
  "wage",
  "20260601-0630_wageRecords.xls",
);
const exitGateDirectory = "test-results/wage-hours-06";
const exitGateSourceDirectory = path.join(exitGateDirectory, "source");
const exitGateManifestPath = path.join(exitGateDirectory, "evidence-manifest.json");
const screenshotDirectory = path.join(exitGateDirectory, "browser");
const auditedDeletionScreenshotDirectory = screenshotDirectory;

test.beforeAll(async () => {
  const source = await readFile(sourceAttendanceFixturePath);
  const runId = randomUUID();
  const derivedDirectory = path.join(
    process.cwd(),
    "test-results",
    "work-hours-isolated",
    runId,
  );
  attendanceFixturePath = path.join(
    derivedDirectory,
    "workAttendanceRecordForm_June.xls",
  );
  const derived = Buffer.from(source);
  // Bytes 52-55 are the Compound File transaction signature. Changing only
  // this non-business header field gives each run a fresh SHA without altering
  // workbook cells, formatting, or the attendance rows under test.
  createHash("sha256").update(runId).digest().copy(derived, 52, 0, 4);
  await mkdir(derivedDirectory, { recursive: true });
  await writeFile(attendanceFixturePath, derived);
  attendanceFixtureSha256 = sha256(derived);
});

test("HR can review attendance import, parse rows, generate wage file, and use download links", async ({
  page,
  request,
}) => {
  const adminToken = await loginThroughApi(page, request);
  const hrManager = await ensureTestUser(request, adminToken, {
    email: "e2e-hr-manager@bestarcca.com",
    name: "E2E HR Manager",
    password: "Bestar-E2E-HR-123!",
    roleCodes: ["HR_MANAGER"],
  });
  const warehouseManager = await ensureTestUser(request, adminToken, {
    email: "e2e-work-hours-warehouse-manager@bestarcca.com",
    name: "E2E Work Hours Warehouse Manager",
    password: "Bestar-E2E-WM-123!",
    roleCodes: ["WAREHOUSE_MANAGER"],
  });
  const warehouseToken = await loginForAccessToken(request, warehouseManager);
  const blockedAttendanceResponse = await request.get(
    "/api/attendance-imports?limit=1&offset=0",
    { headers: authHeaders(warehouseToken) },
  );
  expect(blockedAttendanceResponse.status()).toBe(403);
  const fixtureBuffer = await readFile(attendanceFixturePath);
  const blockedUploadResponse = await request.post("/api/attendance-imports", {
    headers: authHeaders(warehouseToken),
    multipart: {
      file: {
        buffer: fixtureBuffer,
        mimeType: "application/vnd.ms-excel",
        name: "workAttendanceRecordForm_June.xls",
      },
    },
  });
  expect(blockedUploadResponse.status()).toBe(403);

  const token = await loginWithCredentials(page, request, hrManager);

  await page.goto("/work-hours");

  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Work Hours Settlement",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Work Hours" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(invalidXlsxFixturePath);
  await expect(
    page.getByText(
      "Attendance imports must use the legacy .xls time-clock workbook.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();

  await page.locator('input[type="file"]').setInputFiles(attendanceFixturePath);
  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/attendance-imports") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload .xls" }).click();
  const uploadResponse = await uploadResponsePromise;
  const attendanceImportId = await attendanceImportIdFromUpload(uploadResponse);

  if (uploadResponse.status() === 409) {
    await expect(
      page.getByText(
        "Duplicate attendance upload: this workbook already exists by SHA-256.",
      ),
    ).toBeVisible();
    await page.goto(
      `/work-hours?attendanceImportId=${encodeURIComponent(attendanceImportId)}`,
    );
  } else {
    await expect(page).toHaveURL(/attendanceImportId=/);
  }

  await expect(page.getByText(attendanceFixtureSha256).first()).toBeVisible();
  await expect(page.getByText("workAttendanceRecordForm_June.xls").first())
    .toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/attendance-imports/${attendanceImportId}/parse`) &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Parse" }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "Parsed employee-day rows" }))
    .toBeVisible();
  await expect(page.getByText(/390 row\(s\) from/)).toBeVisible();
  await expect(page.getByText("Review issues")).toBeVisible();
  await expect(page.getByText("ray").first()).toBeVisible();

  const filesBeforeGeneration = await expectGeneratedFilesHaveAuditMetadata(
    request,
    token,
    attendanceImportId,
  );
  expect(
    filesBeforeGeneration.filter((file) => file.fileType === "WAGE_RECORD_XLS"),
  ).toHaveLength(0);
  await expect(page.getByRole("heading", { name: "Wage record files" }))
    .toBeVisible();
  await expect(page.getByText("No wage record files yet.")).toBeVisible();
  await expectOfficeWageFileVisibility(
    page,
    attendanceImportId,
    filesBeforeGeneration,
    "en",
  );

  const duplicateUpload = await request.post("/api/attendance-imports", {
    headers: authHeaders(token),
    multipart: {
      file: {
        buffer: fixtureBuffer,
        mimeType: "application/vnd.ms-excel",
        name: "workAttendanceRecordForm_June-duplicate.xls",
      },
    },
  });
  expect(duplicateUpload.status()).toBe(409);
  expect(await attendanceImportIdFromUpload(duplicateUpload)).toBe(attendanceImportId);

  const blockedParseResponse = await request.post(
    `/api/attendance-imports/${attendanceImportId}/parse`,
    { headers: authHeaders(warehouseToken) },
  );
  expect(blockedParseResponse.status()).toBe(403);
  const blockedGenerateResponse = await request.post(
    `/api/attendance-imports/${attendanceImportId}/generate-wage-record`,
    { headers: authHeaders(warehouseToken) },
  );
  expect(blockedGenerateResponse.status()).toBe(403);

  const attendanceRows = await getAttendanceRows(request, token, attendanceImportId);
  const employeeGroups = realEmployeeGroups(attendanceRows);
  expect(employeeGroups).toHaveLength(13);
  const firstEmployee = employeeGroups[0];
  const lastEmployee = employeeGroups[employeeGroups.length - 1];
  const threePunchRow = attendanceRows.find(
    (row) => Array.isArray(row.punchTimes) && row.punchTimes.length === 3,
  );
  expect(threePunchRow, "real fixture must keep its three-punch row").toBeTruthy();
  const regularEvenRow = attendanceRows.find(
    (row) =>
      Array.isArray(row.punchTimes) &&
      row.punchTimes.length === 2 &&
      row.employeeName !== threePunchRow?.employeeName,
  );
  expect(regularEvenRow, "real fixture must expose a regular paired row").toBeTruthy();

  const employeeSwitchMutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") employeeSwitchMutations.push(request.url());
  });
  await reviewEmployeeMonth(page, attendanceImportId, firstEmployee, "en");
  await reviewEmployeeMonth(page, attendanceImportId, lastEmployee, "en");
  await reviewEmployeeMonth(
    page,
    attendanceImportId,
    employeeGroupForRow(employeeGroups, regularEvenRow!),
    "en",
  );
  await expectAttendanceRowMatchesApi(page, regularEvenRow!, "en");
  await reviewEmployeeMonth(
    page,
    attendanceImportId,
    employeeGroupForRow(employeeGroups, threePunchRow!),
    "en",
  );
  await expectAttendanceRowMatchesApi(page, threePunchRow!, "en");
  expect(employeeSwitchMutations, "employee switches must stay read-only").toEqual([]);

  const generateButton = page.getByRole("button", {
    name: "Generate wage record",
  });
  await expect(generateButton).toBeEnabled();
  const [generationResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(
            `/api/attendance-imports/${attendanceImportId}/generate-wage-record`,
          ) && response.request().method() === "POST",
    ),
    generateButton.click(),
  ]);
  expect(generationResponse.status()).toBe(201);

  await expect(page.getByText("Wage record", { exact: true }).first()).toBeVisible();
  const generatedFiles = await expectGeneratedFilesHaveAuditMetadata(
    request,
    token,
    attendanceImportId,
  );
  await expectOfficeWageFileVisibility(
    page,
    attendanceImportId,
    generatedFiles,
    "en",
  );
  await expect(page.getByText("SHA-256").first()).toBeVisible();
  await expect(page.getByText("MIME").first()).toBeVisible();
  await expect(
    page.getByText(
      /\/workspace\/storage|attendance_original_files|storage\/attendance/i,
    ),
  ).toHaveCount(0);

  const downloadLinks = page.getByRole("link", { name: "Download" });
  expect(await downloadLinks.count()).toBeGreaterThan(0);
  await expect(downloadLinks.first()).toHaveAttribute(
    "href",
    /\/work-hours\/[^/]+\/files\/[^/]+\/download/,
  );
  await expectBrowserWageDownloadMatchesAudit(
    page,
    attendanceImportId,
    generatedFiles,
  );

  await reviewEmployeeMonth(page, attendanceImportId, firstEmployee, "en");
  await expect(page.getByRole("link", { name: "Download" }).first()).toBeVisible();

  await expectNoPageError(page);
  const generationBody = await getLatestGeneratedFiles(
    request,
    token,
    attendanceImportId,
  );
  await saveBaselineExitGateEvidence({
    attendanceImportId,
    generationBody,
    rows: attendanceRows,
    rbacStatus: {
      warehouseGenerate: blockedGenerateResponse.status(),
      warehouseList: blockedAttendanceResponse.status(),
      warehouseParse: blockedParseResponse.status(),
      warehouseUpload: blockedUploadResponse.status(),
    },
    request,
    token,
  });
});

test("read-only attendance user can open work hours but cannot see mutation actions", async ({
  page,
  request,
}, testInfo) => {
  const adminToken = await loginThroughApi(page, request);
  const attendanceImportId = await ensureParsedAttendanceImport(
    request,
    adminToken,
  );
  const credentials = await createReadOnlyAttendanceUser(
    request,
    adminToken,
    testInfo.project.name,
  );

  await loginWithCredentials(page, request, credentials);
  await page.goto(
    `/work-hours?attendanceImportId=${encodeURIComponent(attendanceImportId)}`,
  );

  await expect(page.getByRole("heading", { name: "Work Hours Settlement" }))
    .toBeVisible();
  await expect(page.getByText("Attendance upload permission required."))
    .toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload .xls" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Parse" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate wage record" }))
    .toHaveCount(0);
  await expect(
    page.getByText("Attendance parse or wage generation permission required."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete row" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Delete attendance import/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Deletion history" })).toBeVisible();

  const readOnlyToken = await loginForAccessToken(request, credentials);
  const rows = await getAttendanceRows(request, readOnlyToken, attendanceImportId);
  const readOnlyDelete = await request.delete(
    `/api/attendance-imports/${attendanceImportId}/rows/${rows[0].id}`,
    {
      data: { reason: "Read-only deletion must remain forbidden" },
      headers: authHeaders(readOnlyToken),
    },
  );
  expect(readOnlyDelete.status()).toBe(403);
  const readOnlyImportDelete = await request.delete(
    `/api/attendance-imports/${attendanceImportId}`,
    {
      data: { reason: "Read-only whole import deletion must remain forbidden." },
      headers: authHeaders(readOnlyToken),
    },
  );
  expect(readOnlyImportDelete.status()).toBe(403);
  const readOnlyHistory = await request.get(
    `/api/attendance-imports/${attendanceImportId}/row-history?limit=1&offset=0`,
    { headers: authHeaders(readOnlyToken) },
  );
  expect(readOnlyHistory.status()).toBe(200);
  const readOnlyFiles = await expectGeneratedFilesHaveAuditMetadata(
    request,
    readOnlyToken,
    attendanceImportId,
  );
  await expectOfficeWageFileVisibility(
    page,
    attendanceImportId,
    readOnlyFiles,
    "en",
  );
  await updateExitGateManifest({
    rbac: {
      readOnlyDelete: readOnlyDelete.status(),
      readOnlyHistory: readOnlyHistory.status(),
      readOnlyImportDelete: readOnlyImportDelete.status(),
    },
  });
  const groups = realEmployeeGroups(rows);
  await reviewEmployeeMonth(page, attendanceImportId, groups[0], "en");
  await reviewEmployeeMonth(page, attendanceImportId, groups[groups.length - 1], "en");
  await expectNoPageError(page);
});

test("employee month review stays single-language and bounded across required viewports", async ({
  page,
  request,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const adminToken = await loginThroughApi(page, request);
  const attendanceImportId = await ensureParsedAttendanceImport(request, adminToken);
  const rows = await getAttendanceRows(request, adminToken, attendanceImportId);
  const groups = realEmployeeGroups(rows);
  const pairedRow = rows.find((row) => row.calculationMethod === "PAIRED_INTERVALS");
  expect(pairedRow).toBeTruthy();
  const selectedEmployee = employeeGroupForRow(groups, pairedRow!);
  const selectedHref = employeeMonthHref(attendanceImportId, selectedEmployee.identityKey);
  const browserErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      /hydration|missing translation|mismatch/i.test(message.text())
    ) {
      browserErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "failed";
    const isCancelledRscPrefetch =
      failure === "net::ERR_ABORTED" && new URL(request.url()).searchParams.has("_rsc");
    if (!isCancelledRscPrefetch) {
      failedRequests.push(`${request.method()} ${request.url()} ${failure}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });
  await mkdir(screenshotDirectory, { recursive: true });
  const generatedFiles = await expectGeneratedFilesHaveAuditMetadata(
    request,
    adminToken,
    attendanceImportId,
  );

  const presentations = [
    { height: 780, locale: "zh-CN" as const, width: 320 },
    { height: 844, locale: "en" as const, width: 390 },
    { height: 1024, locale: "zh-CN" as const, width: 768 },
    { height: 900, locale: "en" as const, width: 1366 },
    { height: 1080, locale: "zh-CN" as const, width: 1920 },
  ];

  for (const presentation of presentations) {
    await setLocale(page.context(), presentation.locale);
    await page.setViewportSize({
      height: presentation.height,
      width: presentation.width,
    });
    const response = await page.goto(selectedHref, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    const ssrHtml = await response!.text();
    const expectedSsrCopy =
      presentation.locale === "en" ? "Employee month index" : "员工月度索引";
    const forbiddenSsrCopy =
      presentation.locale === "en" ? "员工月度索引" : "Employee month index";
    expect(ssrHtml).toContain(expectedSsrCopy);
    expect(ssrHtml).not.toContain(forbiddenSsrCopy);
    expectSsrOmitsTechnicalFiles(ssrHtml, generatedFiles);
    await expect(page.locator("html")).toHaveAttribute("lang", presentation.locale);
    await expectLocalizedEmployeeReview(page, presentation.locale);
    await expectOfficeWageFileVisibility(
      page,
      attendanceImportId,
      generatedFiles,
      presentation.locale,
    );
    await expect(page.getByRole("region", {
      name: presentation.locale === "en" ? "Monthly attendance detail" : "月度考勤明细",
    }).locator("tbody tr")).toHaveCount(30);
    await expectNoPageOverflow(page, presentation.width);
    await page
      .getByRole("heading", {
        name: presentation.locale === "en" ? "Monthly attendance detail" : "月度考勤明细",
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${screenshotDirectory}/employee-month-${presentation.locale}-${presentation.width}x${presentation.height}.png`,
    });
  }

  await setLocale(page.context(), "en");
  await page.setViewportSize({ height: 900, width: 1366 });
  await page.goto(selectedHref, { waitUntil: "networkidle" });
  await page
    .getByLabel("Language")
    .getByRole("button", { name: "中文" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expectOfficeWageFileVisibility(
    page,
    attendanceImportId,
    generatedFiles,
    "zh-CN",
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expectOfficeWageFileVisibility(
    page,
    attendanceImportId,
    generatedFiles,
    "zh-CN",
  );
  await page
    .getByLabel("语言")
    .getByRole("button", { name: "English" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expectOfficeWageFileVisibility(
    page,
    attendanceImportId,
    generatedFiles,
    "en",
  );

  expect(browserErrors, "employee month browser errors").toEqual([]);
  expect(failedRequests, "employee month failed requests").toEqual([]);
});

test("employee month review passes real Chromium 200 percent zoom", async ({
  page,
  request,
}, testInfo) => {
  testInfo.setTimeout(180_000);
  const token = await loginThroughApi(page, request);
  const attendanceImportId = await ensureParsedAttendanceImport(request, token);
  const rows = await getAttendanceRows(request, token, attendanceImportId);
  const selectedEmployee = realEmployeeGroups(rows).at(-1)!;
  const generatedFiles = await expectGeneratedFilesHaveAuditMetadata(
    request,
    token,
    attendanceImportId,
  );
  await verifyRealBrowserZoom(
    token,
    employeeMonthHref(attendanceImportId, selectedEmployee.identityKey),
    testInfo.outputPath("wage-hours-03-zoom-profile"),
    { files: generatedFiles },
  );
});

test("HR deletion stays audited through refresh, reparse, generation, download, and bilingual history", async ({
  page,
  request,
}, testInfo) => {
  testInfo.setTimeout(300_000);
  const adminToken = await loginThroughApi(page, request);
  const attendanceImportId = await ensureParsedAttendanceImport(request, adminToken);
  const hrManager = await ensureTestUser(request, adminToken, {
    email: "e2e-hr-manager@bestarcca.com",
    name: "E2E HR Manager",
    password: "Bestar-E2E-HR-123!",
    roleCodes: ["HR_MANAGER"],
  });
  const hrToken = await loginWithCredentials(page, request, hrManager);
  const rows = await getAttendanceRows(request, hrToken, attendanceImportId);
  const target = rows.find(
    (row) => Array.isArray(row.punchTimes) && row.punchTimes.length >= 2,
  );
  expect(target).toBeTruthy();
  const targetEmployee = employeeGroupForRow(realEmployeeGroups(rows), target!);
  await page.goto(employeeMonthHref(attendanceImportId, targetEmployee.identityKey));

  const activeRow = page
    .getByRole("row")
    .filter({ hasText: target!.workDate })
    .filter({ has: page.getByRole("button", { name: "Delete row" }) });
  await activeRow.getByRole("button", { name: "Delete row" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Exclude attendance row from settlement?",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(target!.employeeName ?? "Unknown employee");
  await expect(dialog).toContainText(target!.workDate);
  await dialog.getByRole("button", { name: "Delete row" }).click();
  await expect(dialog.getByText("Deletion reason is required.")).toBeVisible();
  const reason = `E2E audited removal ${Date.now()}`;
  await dialog.getByLabel("Deletion reason").fill(reason);
  await expect(dialog.getByText("Deletion reason is required.")).toBeHidden();
  await mkdir(auditedDeletionScreenshotDirectory, { recursive: true });
  await page.screenshot({
    path: `${auditedDeletionScreenshotDirectory}/delete-dialog-en-desktop.png`,
  });
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/attendance-imports/${attendanceImportId}/rows/${target!.id}`) &&
      response.request().method() === "DELETE",
  );
  await dialog.getByRole("button", { name: "Delete row" }).click();
  expect((await deleteResponsePromise).status()).toBe(200);

  await expect(page.getByRole("heading", { name: "Deletion history" })).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByText("Superseded").first()).toBeVisible();
  await expect(page.getByText(/389 active rows · 1 deleted row/)).toBeVisible();

  const reparse = await request.post(
    `/api/attendance-imports/${attendanceImportId}/parse`,
    { headers: authHeaders(hrToken) },
  );
  expect(reparse.status()).toBe(201);
  const reparsedBody = (await reparse.json()) as {
    activeRowCount: number;
    deletedRowCount: number;
    rows: RealAttendanceRow[];
  };
  expect(reparsedBody.activeRowCount).toBe(389);
  expect(reparsedBody.deletedRowCount).toBe(1);
  expect(reparsedBody.rows.some((row) => row.id === target!.id)).toBe(false);

  const generated = await request.post(
    `/api/attendance-imports/${attendanceImportId}/generate-wage-record`,
    { headers: authHeaders(hrToken) },
  );
  expect(generated.status()).toBe(201);
  const generatedBody = (await generated.json()) as GenerateWageRecordBody;
  expect(generatedBody).toMatchObject({
    generatedFile: { status: "GENERATED", fileSha256: expect.any(String) },
  });
  await saveAfterDeleteExitGateEvidence({
    attendanceImportId,
    generatedBody,
    reason,
    request,
    target: target!,
    token: hrToken,
  });

  await setLocale(page.context(), "zh-CN");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "删除历史" })).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByText("已被取代").first()).toBeVisible();
  const filesAfterDelete = await expectGeneratedFilesHaveAuditMetadata(
    request,
    hrToken,
    attendanceImportId,
  );
  await expectOfficeWageFileVisibility(
    page,
    attendanceImportId,
    filesAfterDelete,
    "zh-CN",
  );
  expect(
    filesAfterDelete.filter((file) => file.fileType === "WAGE_RECORD_XLS"),
  ).toHaveLength(2);
  await expectNoPageOverflow(page, 390);
  await expectNoPageError(page);
  await page.getByRole("heading", { name: "删除历史" }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${auditedDeletionScreenshotDirectory}/history-zh-CN-390x844.png`,
  });

  await verifyRealBrowserZoom(
    hrToken,
    employeeMonthHref(attendanceImportId, targetEmployee.identityKey),
    testInfo.outputPath("wage-hours-04-zoom-profile"),
    {
      files: filesAfterDelete,
      historyReason: reason,
      screenshotPath: `${auditedDeletionScreenshotDirectory}/history-en-1366x768-zoom-200.png`,
    },
  );
});

test("whole attendance import deletion preserves evidence, falls back safely, and permits a new active same-SHA import", async ({
  page,
  request,
}, testInfo) => {
  testInfo.setTimeout(360_000);
  const evidenceDirectory = "test-results/wage-hours-07";
  const browserEvidenceDirectory = path.join(evidenceDirectory, "browser");
  const fixtureDirectory = testInfo.outputPath("wage-hours-07-fixture");
  const fixturePath = path.join(
    fixtureDirectory,
    "workAttendanceRecordForm_WAGE-HOURS-07.xls",
  );
  const source = await readFile(sourceAttendanceFixturePath);
  const fixture = Buffer.from(source);
  createHash("sha256")
    .update(`WAGE-HOURS-07:${randomUUID()}`)
    .digest()
    .copy(fixture, 52, 0, 4);
  await mkdir(fixtureDirectory, { recursive: true });
  await writeFile(fixturePath, fixture);
  const fixtureSha = sha256(fixture);
  const reason = `WAGE-HOURS-07 audited import removal ${Date.now()}`;
  const browserErrors: string[] = [];
  const failedRequests: string[] = [];
  const deleteRequests: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      /hydration|missing translation|mismatch/i.test(message.text())
    ) {
      browserErrors.push(message.text());
    }
  });
  page.on("request", (browserRequest) => {
    if (
      browserRequest.method() === "DELETE" &&
      /\/api\/attendance-imports\/[^/]+$/.test(
        new URL(browserRequest.url()).pathname,
      )
    ) {
      deleteRequests.push(browserRequest.url());
    }
  });
  page.on("requestfailed", (browserRequest) => {
    const failure = browserRequest.failure()?.errorText ?? "failed";
    const isCancelledRscPrefetch =
      failure === "net::ERR_ABORTED" &&
      new URL(browserRequest.url()).searchParams.has("_rsc");
    const isCancelledCompletedJobPoll =
      failure === "net::ERR_ABORTED" &&
      browserRequest.method() === "GET" &&
      /\/api\/queue\/jobs\/[^/]+$/.test(
        new URL(browserRequest.url()).pathname,
      );
    if (!isCancelledRscPrefetch && !isCancelledCompletedJobPoll) {
      failedRequests.push(
        `${browserRequest.method()} ${browserRequest.url()} ${failure}`,
      );
    }
  });

  const adminToken = await loginThroughApi(page, request);
  const hrManager = await ensureTestUser(request, adminToken, {
    email: "e2e-hr-manager@bestarcca.com",
    name: "E2E HR Manager",
    password: "Bestar-E2E-HR-123!",
    roleCodes: ["HR_MANAGER"],
  });
  const warehouseManager = await ensureTestUser(request, adminToken, {
    email: "e2e-work-hours-warehouse-manager@bestarcca.com",
    name: "E2E Work Hours Warehouse Manager",
    password: "Bestar-E2E-WM-123!",
    roleCodes: ["WAREHOUSE_MANAGER"],
  });
  const warehouseToken = await loginForAccessToken(request, warehouseManager);
  const hrToken = await loginWithCredentials(page, request, hrManager);
  await setPresentation(page.context(), "en", "light");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/work-hours", { waitUntil: "networkidle" });

  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/attendance-imports") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload .xls" }).click();
  const uploadResponse = await uploadResponsePromise;
  expect(uploadResponse.status()).toBe(201);
  const uploaded = (await uploadResponse.json()) as AttendanceImportUploadBody;
  expect(uploaded.fileSha256).toBe(fixtureSha);
  await expect(page).toHaveURL(
    new RegExp(`attendanceImportId=${uploaded.id}`),
  );

  const parseResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/attendance-imports/${uploaded.id}/parse`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Parse" }).click();
  expect((await parseResponsePromise).status()).toBe(201);
  const generateResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(
          `/api/attendance-imports/${uploaded.id}/generate-wage-record`,
        ) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate wage record" }).click();
  expect((await generateResponsePromise).status()).toBe(201);
  const filesBeforeDelete = await expectGeneratedFilesHaveAuditMetadata(
    request,
    hrToken,
    uploaded.id,
  );
  const originalBefore = await readFile(uploaded.storedPath);
  const generatedBefore = await Promise.all(
    filesBeforeDelete.map(async (file) => ({
      id: file.id,
      path: file.storagePath,
      sha256: sha256(await readFile(file.storagePath)),
    })),
  );

  const blockedDelete = await request.delete(
    `/api/attendance-imports/${uploaded.id}`,
    {
      data: { reason: "Warehouse manager cannot delete attendance imports." },
      headers: authHeaders(warehouseToken),
    },
  );
  expect(blockedDelete.status()).toBe(403);

  const deleteButton = page
    .getByRole("button", {
      name: `Delete attendance import ${uploaded.originalFilename}`,
    })
    .first();
  await deleteButton.click();
  const englishDialog = page.getByRole("dialog", {
    name: "Remove this attendance import from active settlement?",
  });
  await expect(englishDialog).toBeVisible();
  await expect(
    englishDialog.getByTestId("attendance-import-deletion-impact"),
  ).toContainText("390 active rows");
  await expect(englishDialog).toContainText(uploaded.originalFilename);
  await englishDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(englishDialog).toBeHidden();
  expect(deleteRequests).toEqual([]);

  await deleteButton.click();
  await englishDialog.getByRole("button", { name: "Delete import" }).click();
  await expect(
    englishDialog.getByText(
      "Enter at least 5 characters for the deletion reason.",
    ),
  ).toBeVisible();
  await englishDialog.getByLabel("Deletion reason").fill(reason);
  await mkdir(browserEvidenceDirectory, { recursive: true });
  await page.screenshot({
    path: `${browserEvidenceDirectory}/delete-dialog-en-light-1366x900.png`,
  });
  await englishDialog.getByRole("button", { name: "Cancel" }).click();

  await setPresentation(page.context(), "zh-CN", "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", {
      name: `删除考勤导入 ${uploaded.originalFilename}`,
    })
    .first()
    .click();
  const chineseDialog = page.getByRole("dialog", {
    name: "将此考勤导入移出当前结算？",
  });
  await expect(chineseDialog).toBeVisible();
  await chineseDialog.getByLabel("删除原因").fill(reason);
  await expectNoDocumentOverflow(page, 390);
  await page.screenshot({
    path: `${browserEvidenceDirectory}/delete-dialog-zh-dark-390x844.png`,
  });
  const deletionResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/api/attendance-imports/${uploaded.id}`) &&
      response.request().method() === "DELETE",
  );
  await chineseDialog.getByRole("button", { name: "删除导入" }).dblclick();
  const deletionResponse = await deletionResponsePromise;
  expect(deletionResponse.status()).toBe(200);
  expect(deleteRequests).toHaveLength(1);

  await expect(
    page.getByText("考勤导入已删除并记录审计历史。"),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("attendanceImportId")).not.toBe(
    uploaded.id,
  );
  expect(new URL(page.url()).searchParams.has("employeeKey")).toBe(false);
  const historyRegion = page.locator(
    'div[role="region"][aria-label="已删除的考勤导入"]',
  );
  await expect(historyRegion).toContainText(uploaded.originalFilename);
  await expect(historyRegion).toContainText(reason);
  await expect(historyRegion).toContainText("E2E HR Manager");
  await expect(historyRegion.getByRole("link", { name: /下载/ })).toHaveCount(0);
  await expect(historyRegion.getByRole("button", { name: /解析|生成|恢复/ }))
    .toHaveCount(0);
  await expectNoDocumentOverflow(page, 390);
  await historyRegion.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${browserEvidenceDirectory}/fallback-history-zh-dark-390x844.png`,
  });

  await page.reload({ waitUntil: "networkidle" });
  await expect(historyRegion).toContainText(reason);
  await page.goto(
    `/work-hours?attendanceImportId=${uploaded.id}&employeeKey=stale`,
    { waitUntil: "networkidle" },
  );
  await expect(
    page.getByText("该考勤导入已删除，现显示下一条有效导入。"),
  ).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();

  expect(await readFile(uploaded.storedPath)).toEqual(originalBefore);
  for (const file of generatedBefore) {
    expect(sha256(await readFile(file.path))).toBe(file.sha256);
  }
  const oldHistory = await request.get(
    "/api/attendance-imports/deletion-history?limit=100&offset=0",
    { headers: authHeaders(hrToken) },
  );
  expect(oldHistory.status()).toBe(200);
  const oldHistoryBody = (await oldHistory.json()) as {
    items: Array<{
      attendanceImportId: string;
      actor: { displayLabel: string };
      reason: string;
    }>;
  };
  expect(
    oldHistoryBody.items.find(
      (event) => event.attendanceImportId === uploaded.id,
    ),
  ).toMatchObject({
    actor: { displayLabel: "E2E HR Manager" },
    reason,
  });

  await setPresentation(page.context(), "en", "light");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/work-hours", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  const reuploadResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/attendance-imports") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload .xls" }).click();
  const reuploadResponse = await reuploadResponsePromise;
  expect(reuploadResponse.status()).toBe(201);
  const replacement =
    (await reuploadResponse.json()) as AttendanceImportUploadBody;
  expect(replacement.id).not.toBe(uploaded.id);
  expect(replacement.fileSha256).toBe(uploaded.fileSha256);
  await page.goto(
    `/work-hours?attendanceImportId=${encodeURIComponent(replacement.id)}`,
    { waitUntil: "networkidle" },
  );
  await expect(page).toHaveURL(
    new RegExp(`attendanceImportId=${replacement.id}`),
  );
  await expect(
    page.getByText(replacement.originalFilename, { exact: true }).first(),
  ).toBeVisible();
  const replacementParseResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/attendance-imports/${replacement.id}/parse`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Parse" }).click();
  expect((await replacementParseResponsePromise).status()).toBe(201);
  await expect(page.getByText(/390 row\(s\) from/)).toBeVisible();
  const replacementGenerationResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(
          `/api/attendance-imports/${replacement.id}/generate-wage-record`,
        ) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate wage record" }).click();
  expect((await replacementGenerationResponsePromise).status()).toBe(201);
  await expect(page.getByText("Wage record", { exact: true }).first())
    .toBeVisible();

  const adminDelete = await request.delete(
    `/api/attendance-imports/${replacement.id}`,
    {
      data: { reason: "Admin cleanup after same-SHA browser verification." },
      headers: authHeaders(adminToken),
    },
  );
  expect(adminDelete.status()).toBe(200);

  const concurrentFixture = Buffer.from(source);
  createHash("sha256")
    .update(`WAGE-HOURS-07-concurrent:${randomUUID()}`)
    .digest()
    .copy(concurrentFixture, 52, 0, 4);
  const concurrentUploads = await Promise.all([
    request.post("/api/attendance-imports", {
      headers: authHeaders(hrToken),
      multipart: {
        file: {
          buffer: concurrentFixture,
          mimeType: "application/vnd.ms-excel",
          name: "workAttendanceRecordForm_WAGE-HOURS-07-concurrent.xls",
        },
      },
    }),
    request.post("/api/attendance-imports", {
      headers: authHeaders(hrToken),
      multipart: {
        file: {
          buffer: concurrentFixture,
          mimeType: "application/vnd.ms-excel",
          name: "workAttendanceRecordForm_WAGE-HOURS-07-concurrent.xls",
        },
      },
    }),
  ]);
  expect(concurrentUploads.map((response) => response.status()).sort()).toEqual([
    201,
    409,
  ]);
  const concurrentWinner = concurrentUploads.find(
    (response) => response.status() === 201,
  )!;
  const concurrentWinnerId =
    await attendanceImportIdFromUpload(concurrentWinner);
  expect(
    await attendanceImportIdFromUpload(
      concurrentUploads.find((response) => response.status() === 409)!,
    ),
  ).toBe(concurrentWinnerId);
  const concurrentCleanup = await request.delete(
    `/api/attendance-imports/${concurrentWinnerId}`,
    {
      data: { reason: "Admin cleanup after concurrent active-SHA verification." },
      headers: authHeaders(adminToken),
    },
  );
  expect(concurrentCleanup.status()).toBe(200);

  await verifyImportDeletionHistoryRealBrowserZoom(
    hrToken,
    reason,
    testInfo.outputPath("wage-hours-07-zoom-profile"),
    `${browserEvidenceDirectory}/history-en-light-1366x768-zoom-200.png`,
  );

  const renamedActor = await request.patch(`/api/users/${hrManager.id}`, {
    data: { name: "E2E HR Manager Renamed" },
    headers: authHeaders(adminToken),
  });
  expect(renamedActor.status()).toBe(200);
  const disabledActor = await request.patch(
    `/api/users/${hrManager.id}/status`,
    {
      data: { isActive: false },
      headers: authHeaders(adminToken),
    },
  );
  expect(disabledActor.status()).toBe(200);
  const preservedActorHistory = await request.get(
    "/api/attendance-imports/deletion-history?limit=100&offset=0",
    { headers: authHeaders(adminToken) },
  );
  expect(preservedActorHistory.status()).toBe(200);
  const preservedActorHistoryBody =
    (await preservedActorHistory.json()) as typeof oldHistoryBody;
  expect(
    preservedActorHistoryBody.items.find(
      (event) => event.attendanceImportId === uploaded.id,
    ),
  ).toMatchObject({
    actor: { displayLabel: "E2E HR Manager" },
    reason,
  });
  expect(
    (
      await request.patch(`/api/users/${hrManager.id}`, {
        data: { name: "E2E HR Manager" },
        headers: authHeaders(adminToken),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.patch(`/api/users/${hrManager.id}/status`, {
        data: { isActive: true },
        headers: authHeaders(adminToken),
      })
    ).status(),
  ).toBe(200);

  expect(browserErrors, "whole import deletion browser errors").toEqual([]);
  expect(failedRequests, "whole import deletion failed requests").toEqual([]);
});

interface RealAttendanceRow {
  calculatedHours: string | null;
  calculationMethod: string;
  department: string | null;
  employeeId: string | null;
  employeeName: string | null;
  errors: unknown[];
  id: string;
  lunchHours: string;
  pairedGrossHours: string | null;
  punchTimes: unknown[];
  warnings: Array<{ code?: string }>;
  workIntervals: unknown;
  workDate: string;
}

interface GeneratedFileEvidence {
  fileSha256: string | null;
  fileSizeBytes: string | null;
  fileType: string;
  id: string;
  mimeType: string | null;
  status: string;
  storagePath: string;
}

interface GenerateWageRecordBody {
  errors: unknown[];
  generatedFile: GeneratedFileEvidence;
  taskReport: GeneratedFileEvidence | null;
  warnings: unknown[];
}

interface AttendanceImportUploadBody {
  fileSha256: string;
  id: string;
  originalFilename: string;
  storedPath: string;
}

async function saveBaselineExitGateEvidence(input: {
  attendanceImportId: string;
  generationBody: GenerateWageRecordBody;
  rows: RealAttendanceRow[];
  rbacStatus: Record<string, number>;
  request: APIRequestContext;
  token: string;
}): Promise<void> {
  const parseResultResponse = await input.request.get(
    `/api/attendance-imports/${input.attendanceImportId}/parse-result`,
    { headers: authHeaders(input.token) },
  );
  expect(parseResultResponse.status()).toBe(200);
  const parseResult = (await parseResultResponse.json()) as {
    activeRowCount: number;
    attendanceImport: {
      employeeCount: number;
      errorCount: number;
      fileSha256: string;
      parserVersion: string | null;
      storedPath: string;
      warningCount: number;
    };
    deletedRowCount: number;
    errors: unknown[];
  };
  expect(parseResult.activeRowCount).toBe(390);
  expect(parseResult.deletedRowCount).toBe(0);
  expect(parseResult.attendanceImport.employeeCount).toBe(13);
  expect(parseResult.attendanceImport.parserVersion).toBe("wage-attendance-v2");
  expect(parseResult.errors).toEqual([]);

  const generatedFile = input.generationBody.generatedFile;
  expect(generatedFile.fileType).toBe("WAGE_RECORD_XLS");
  expect(generatedFile.status).toBe("GENERATED");
  expect(generatedFile.mimeType).toBe("application/vnd.ms-excel");
  expect(generatedFile.fileSha256).toBeTruthy();
  expect(Number(generatedFile.fileSizeBytes)).toBeGreaterThan(0);
  expect(input.generationBody.errors).toEqual([]);

  const download = await input.request.get(
    `/api/attendance-imports/${input.attendanceImportId}/files/${generatedFile.id}/download`,
    { headers: authHeaders(input.token) },
  );
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("application/vnd.ms-excel");
  const downloadBuffer = await download.body();
  expect(sha256(downloadBuffer)).toBe(generatedFile.fileSha256);

  await mkdir(exitGateSourceDirectory, { recursive: true });
  await copyFile(
    parseResult.attendanceImport.storedPath,
    path.join(exitGateSourceDirectory, "attendance-original.xls"),
  );
  await copyFile(wageTemplatePath, path.join(exitGateSourceDirectory, "template.xls"));
  await copyFile(
    generatedFile.storagePath,
    path.join(exitGateSourceDirectory, "worker-generated-wage-record.xls"),
  );
  await writeFile(
    path.join(exitGateSourceDirectory, "api-downloaded-wage-record.xls"),
    downloadBuffer,
  );

  const storedOriginal = await readFile(parseResult.attendanceImport.storedPath);
  expect(sha256(storedOriginal)).toBe(attendanceFixtureSha256);
  const templateBuffer = await readFile(wageTemplatePath);
  const methodCounts = input.rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.calculationMethod] = (counts[row.calculationMethod] ?? 0) + 1;
    return counts;
  }, {});
  expect(methodCounts).toEqual({
    FIRST_LAST_FALLBACK: 26,
    NO_PUNCHES: 271,
    PAIRED_INTERVALS: 93,
  });
  expect(input.rows.every((row) => Array.isArray(row.workIntervals))).toBe(true);

  const manifest = {
    schemaVersion: 1,
    fixture: {
      employeeCount: parseResult.attendanceImport.employeeCount,
      errorCount: parseResult.attendanceImport.errorCount,
      filename: "workAttendanceRecordForm_June.xls",
      methodCounts,
      parserVersion: parseResult.attendanceImport.parserVersion,
      rowCount: parseResult.activeRowCount,
      sha256: parseResult.attendanceImport.fileSha256,
      storedOriginalPreserved: true,
      structuredIntervalsRoundTripped: true,
      warningCount: parseResult.attendanceImport.warningCount,
    },
    template: {
      filename: "20260601-0630_wageRecords.xls",
      sha256: sha256(templateBuffer),
    },
    baseline: {
      apiDownloadSha256: sha256(downloadBuffer),
      errors: input.generationBody.errors.length,
      fileId: generatedFile.id,
      fileSha256: generatedFile.fileSha256,
      fileSizeBytes: Number(generatedFile.fileSizeBytes),
      mimeType: generatedFile.mimeType,
      status: generatedFile.status,
      taskReportRecorded: input.generationBody.taskReport !== null,
      warnings: input.generationBody.warnings.length,
      workerFileSha256: sha256(await readFile(generatedFile.storagePath)),
    },
    duplicateSha: {
      existingImportIdMatched: true,
      status: 409,
    },
    rbac: input.rbacStatus,
  };
  await mkdir(exitGateDirectory, { recursive: true });
  await writeFile(
    exitGateManifestPath,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
}

async function saveAfterDeleteExitGateEvidence(input: {
  attendanceImportId: string;
  generatedBody: GenerateWageRecordBody;
  reason: string;
  request: APIRequestContext;
  target: RealAttendanceRow;
  token: string;
}): Promise<void> {
  const generatedFile = input.generatedBody.generatedFile;
  const download = await input.request.get(
    `/api/attendance-imports/${input.attendanceImportId}/files/${generatedFile.id}/download`,
    { headers: authHeaders(input.token) },
  );
  expect(download.status()).toBe(200);
  const downloadedBuffer = await download.body();
  expect(sha256(downloadedBuffer)).toBe(generatedFile.fileSha256);
  await mkdir(exitGateSourceDirectory, { recursive: true });
  await writeFile(
    path.join(exitGateSourceDirectory, "api-downloaded-after-delete.xls"),
    downloadedBuffer,
  );

  const historyResponse = await input.request.get(
    `/api/attendance-imports/${input.attendanceImportId}/row-history?limit=100&offset=0`,
    { headers: authHeaders(input.token) },
  );
  expect(historyResponse.status()).toBe(200);
  const history = (await historyResponse.json()) as {
    items: Array<{
      actor: { displayLabel: string; id: string | null };
      eventCode: string;
      reason: string;
      rowKey: string;
      rowSnapshot: Record<string, unknown>;
      workDate: string;
    }>;
    total: number;
  };
  expect(history.total).toBe(1);
  expect(history.items).toHaveLength(1);
  expect(history.items[0]).toMatchObject({
    eventCode: "DELETED",
    reason: input.reason,
    workDate: input.target.workDate,
  });
  expect(history.items[0].actor.id).toBeTruthy();
  expect(history.items[0].actor.displayLabel).toBeTruthy();
  expect(history.items[0].rowSnapshot).toMatchObject({
    calculatedHours: input.target.calculatedHours,
    calculationMethod: input.target.calculationMethod,
    punchTimes: input.target.punchTimes,
    workIntervals: input.target.workIntervals,
  });

  const filesResponse = await input.request.get(
    `/api/attendance-imports/${input.attendanceImportId}/files`,
    { headers: authHeaders(input.token) },
  );
  expect(filesResponse.status()).toBe(200);
  const files = (await filesResponse.json()) as {
    items: GeneratedFileEvidence[];
  };
  const manifest = await readExitGateManifest();
  const baselineFileId = (manifest.baseline as { fileId: string }).fileId;
  expect(files.items.find((item) => item.id === baselineFileId)?.status).toBe(
    "SUPERSEDED",
  );
  expect(files.items.find((item) => item.id === generatedFile.id)?.status).toBe(
    "GENERATED",
  );

  const originalCopy = await readFile(
    path.join(exitGateSourceDirectory, "attendance-original.xls"),
  );
  expect(sha256(originalCopy)).toBe(attendanceFixtureSha256);
  const generatedStat = await stat(generatedFile.storagePath);
  await updateExitGateManifest({
    afterDelete: {
      apiDownloadSha256: sha256(downloadedBuffer),
      errors: input.generatedBody.errors.length,
      fileId: generatedFile.id,
      fileSha256: generatedFile.fileSha256,
      fileSizeBytes: generatedStat.size,
      mimeType: generatedFile.mimeType,
      status: generatedFile.status,
      taskReportRecorded: input.generatedBody.taskReport !== null,
      warnings: input.generatedBody.warnings.length,
    },
    deletion: {
      activeRowCount: 389,
      actorRecordedFromJwt: true,
      deletedRowCount: 1,
      eventCode: history.items[0].eventCode,
      historyEventCount: history.total,
      immutableSnapshotVerified: true,
      reasonLength: input.reason.length,
      reparseDidNotRestoreRow: true,
      rowKeySha256: sha256(Buffer.from(history.items[0].rowKey, "utf8")),
      supersededBaselineFile: true,
      workDate: input.target.workDate,
    },
  });
}

async function getLatestGeneratedFiles(
  request: APIRequestContext,
  token: string,
  attendanceImportId: string,
): Promise<GenerateWageRecordBody> {
  const response = await request.get(
    `/api/attendance-imports/${attendanceImportId}/files`,
    { headers: authHeaders(token) },
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: GeneratedFileEvidence[] };
  const generatedFile = body.items.find(
    (item) => item.fileType === "WAGE_RECORD_XLS" && item.status === "GENERATED",
  );
  const taskReport = body.items.find(
    (item) => item.fileType === "TASK_REPORT_HTML" && item.status === "GENERATED",
  );
  expect(generatedFile).toBeTruthy();
  expect(taskReport).toBeTruthy();
  return {
    errors: [],
    generatedFile: generatedFile!,
    taskReport: taskReport!,
    warnings: [],
  };
}

async function readExitGateManifest(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(exitGateManifestPath, "utf8")) as Record<
    string,
    unknown
  >;
}

async function updateExitGateManifest(
  update: Record<string, Record<string, unknown>>,
): Promise<void> {
  const manifest = await readExitGateManifest();
  for (const [section, value] of Object.entries(update)) {
    manifest[section] = {
      ...((manifest[section] as Record<string, unknown> | undefined) ?? {}),
      ...value,
    };
  }
  await writeFile(
    exitGateManifestPath,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

interface RealEmployeeGroup {
  employeeId: string | null;
  employeeName: string;
  identityKey: string;
  rows: RealAttendanceRow[];
}

async function getAttendanceRows(
  request: APIRequestContext,
  token: string,
  attendanceImportId: string,
): Promise<RealAttendanceRow[]> {
  const response = await request.get(
    `/api/attendance-imports/${attendanceImportId}/parse-result`,
    { headers: authHeaders(token) },
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { rows: RealAttendanceRow[] };
  expect(body.rows).toHaveLength(390);
  return body.rows;
}

function realEmployeeGroups(rows: RealAttendanceRow[]): RealEmployeeGroup[] {
  const groups = new Map<string, RealEmployeeGroup>();
  for (const row of rows) {
    const identityKey = realEmployeeIdentityKey(row);
    const existing = groups.get(identityKey);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(identityKey, {
      employeeId: row.employeeId,
      employeeName: row.employeeName?.trim() || "Unknown employee",
      identityKey,
      rows: [row],
    });
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((left, right) =>
        left.workDate.localeCompare(right.workDate),
      ),
    }))
    .sort(
      (left, right) =>
        normalizeIdentity(left.employeeName).localeCompare(
          normalizeIdentity(right.employeeName),
        ) || left.identityKey.localeCompare(right.identityKey),
    );
}

function realEmployeeIdentityKey(
  row: Pick<RealAttendanceRow, "department" | "employeeId" | "employeeName">,
): string {
  const employeeId = normalizeIdentity(row.employeeId);
  return employeeId
    ? `id:${employeeId}`
    : `name:${normalizeIdentity(row.employeeName) || "unknown"}|department:${normalizeIdentity(row.department) || "unknown"}`;
}

function normalizeIdentity(value: string | null): string {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

function employeeGroupForRow(
  groups: RealEmployeeGroup[],
  row: RealAttendanceRow,
): RealEmployeeGroup {
  const group = groups.find(
    (candidate) => candidate.identityKey === realEmployeeIdentityKey(row),
  );
  expect(group, `employee group missing for ${row.id}`).toBeTruthy();
  return group!;
}

async function reviewEmployeeMonth(
  page: Page,
  attendanceImportId: string,
  employee: RealEmployeeGroup,
  locale: "en" | "zh-CN",
): Promise<void> {
  const ariaName =
    locale === "en"
      ? `Review employee ${employee.employeeName}`
      : `复核员工 ${employee.employeeName}`;
  await page.getByRole("link", { exact: true, name: ariaName }).click();
  await expect(page).toHaveURL(
    new URL(
      employeeMonthHref(attendanceImportId, employee.identityKey),
      E2E_BASE_URL,
    ).href,
  );
  await expect(
    page.getByRole("heading", { exact: true, name: employee.employeeName }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", {
        name: locale === "en" ? "Monthly attendance detail" : "月度考勤明细",
      })
      .locator("tbody tr"),
  ).toHaveCount(30);
}

async function expectAttendanceRowMatchesApi(
  page: Page,
  row: RealAttendanceRow,
  locale: "en" | "zh-CN",
): Promise<void> {
  const region = page.getByRole("region", {
    name: locale === "en" ? "Monthly attendance detail" : "月度考勤明细",
  });
  const tableRow = region.locator("tbody tr").filter({ hasText: row.workDate });
  await expect(tableRow).toHaveCount(1);
  const cells = tableRow.locator("td");
  await expect(cells.nth(1)).toHaveText(row.punchTimes.join(", "));
  await expect(cells.nth(2)).toContainText(
    calculationMethodText(row.calculationMethod, locale),
  );
  await expect(cells.nth(3)).toHaveText(formatApiHours(row.pairedGrossHours));
  await expect(cells.nth(4)).toHaveText(formatApiHours(row.lunchHours));
  await expect(cells.nth(5)).toHaveText(formatApiHours(row.calculatedHours));
  if (row.warnings.some((warning) => warning.code === "ODD_PUNCH_COUNT")) {
    await expect(cells.nth(6)).toContainText(
      locale === "en"
        ? "Odd punch count requires manual review before calculating hours."
        : "打卡次数为奇数，计算工时前需要人工复核。",
    );
  }
}

function calculationMethodText(
  method: string,
  locale: "en" | "zh-CN",
): string {
  const labels = {
    en: {
      FIRST_LAST_FALLBACK: "First and last punch fallback",
      LEGACY_UNKNOWN: "Legacy calculation method",
      NO_PUNCHES: "No punches",
      PAIRED_INTERVALS: "Paired punch intervals",
    },
    "zh-CN": {
      FIRST_LAST_FALLBACK: "首末打卡回退计算",
      LEGACY_UNKNOWN: "旧版计算方式",
      NO_PUNCHES: "无打卡记录",
      PAIRED_INTERVALS: "成对打卡区间",
    },
  } as const;
  return labels[locale][method as keyof (typeof labels)["en"]];
}

function formatApiHours(value: string | null): string {
  return value === null ? "-" : Number(value).toFixed(2);
}

function employeeMonthHref(
  attendanceImportId: string,
  identityKey: string,
): string {
  return `/work-hours?attendanceImportId=${encodeURIComponent(attendanceImportId)}&employeeKey=${encodeURIComponent(identityKey)}`;
}

async function setLocale(
  context: BrowserContext,
  locale: "en" | "zh-CN",
): Promise<void> {
  await context.addCookies([
    {
      name: "bestar_locale",
      sameSite: "Lax",
      url: new URL(E2E_BASE_URL).origin,
      value: locale,
    },
  ]);
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

async function expectLocalizedEmployeeReview(
  page: Page,
  locale: "en" | "zh-CN",
): Promise<void> {
  const expected =
    locale === "en"
      ? ["Employee month index", "Monthly attendance detail", "Paired punch intervals"]
      : ["员工月度索引", "月度考勤明细", "成对打卡区间"];
  const forbidden =
    locale === "en"
      ? ["员工月度索引", "月度考勤明细"]
      : ["Employee month index", "Monthly attendance detail"];
  for (const text of expected) {
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  }
  for (const text of forbidden) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
  for (const rawValue of [
    "NO_PUNCHES",
    "FIRST_LAST_FALLBACK",
    "PAIRED_INTERVALS",
    "wage-attendance-v2",
  ]) {
    await expect(page.getByText(rawValue, { exact: true })).toHaveCount(0);
  }
}

async function expectNoPageOverflow(page: Page, viewportWidth: number): Promise<void> {
  const geometry = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      '[role="region"][aria-labelledby="employee-month-detail-heading"]',
    );
    return {
      clientWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      scrollerClientWidth: scroller?.clientWidth ?? 0,
      scrollerScrollWidth: scroller?.scrollWidth ?? 0,
    };
  });
  expect(geometry.clientWidth).toBe(viewportWidth);
  expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.scrollerClientWidth).toBeGreaterThan(0);
  expect(geometry.scrollerScrollWidth).toBeGreaterThanOrEqual(
    geometry.scrollerClientWidth,
  );
}

async function expectNoDocumentOverflow(
  page: Page,
  viewportWidth: number,
): Promise<void> {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.clientWidth).toBe(viewportWidth);
  expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

async function verifyRealBrowserZoom(
  token: string,
  route: string,
  userDataDir: string,
  options?: {
    files?: GeneratedFileEvidence[];
    historyReason?: string;
    screenshotPath?: string;
  },
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
    await configureBrowserActor(context, token);
    await context.addCookies([
      {
        name: "bestar_locale",
        sameSite: "Lax",
        url: new URL(E2E_BASE_URL).origin,
        value: "en",
      },
    ]);
    const worker = await getBrowserZoomWorker(context);
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    const browserErrors: string[] = [];
    zoomPage.on("pageerror", (error) => browserErrors.push(error.message));
    zoomPage.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await zoomPage.goto(route, { waitUntil: "networkidle" });
    await setRealBrowserZoom(zoomPage, worker, 2, 1366);
    await expect(zoomPage.getByRole("heading", { name: "Monthly attendance detail" }))
      .toBeVisible();
    if (options?.files) {
      const attendanceImportId = new URL(zoomPage.url()).searchParams.get(
        "attendanceImportId",
      );
      expect(attendanceImportId).toBeTruthy();
      await expectOfficeWageFileVisibility(
        zoomPage,
        attendanceImportId!,
        options.files,
        "en",
      );
    }
    await expectNoPageOverflow(zoomPage, 683);
    const screenshotPath =
      options?.screenshotPath ??
      `${screenshotDirectory}/employee-month-en-1366x768-zoom-200.png`;
    if (options?.historyReason) {
      await expect(
        zoomPage.getByRole("heading", { name: "Deletion history" }),
      ).toBeVisible();
      await expect(zoomPage.getByText(options.historyReason)).toBeVisible();
      await zoomPage
        .getByRole("heading", { name: "Deletion history" })
        .scrollIntoViewIfNeeded();
    } else {
      await zoomPage
        .getByRole("heading", { name: "Monthly attendance detail" })
        .scrollIntoViewIfNeeded();
    }
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await captureBrowserViewport(
      zoomPage,
      screenshotPath,
    );
    expect(browserErrors, "200% zoom browser errors").toEqual([]);
  } finally {
    await context.close();
  }
}

async function verifyImportDeletionHistoryRealBrowserZoom(
  token: string,
  historyReason: string,
  userDataDir: string,
  screenshotPath: string,
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
    await configureBrowserActor(context, token);
    await setPresentation(context, "en", "light");
    const worker = await getBrowserZoomWorker(context);
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    const browserErrors: string[] = [];
    zoomPage.on("pageerror", (error) => browserErrors.push(error.message));
    zoomPage.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await zoomPage.goto("/work-hours", { waitUntil: "networkidle" });
    await setRealBrowserZoom(zoomPage, worker, 2, 1366);
    await expect(
      zoomPage.getByRole("heading", { name: "Deleted attendance imports" }),
    ).toBeVisible();
    await expect(zoomPage.getByText(historyReason)).toBeVisible();
    await expectNoDocumentOverflow(zoomPage, 683);
    await zoomPage.getByText(historyReason).scrollIntoViewIfNeeded();
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await captureBrowserViewport(zoomPage, screenshotPath);
    expect(browserErrors, "import history 200% zoom browser errors").toEqual([]);
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

async function attendanceImportIdFromUpload(response: {
  json: () => Promise<unknown>;
  status: () => number;
}): Promise<string> {
  const body = (await response.json()) as {
    details?: {
      existingImport?: { id?: string };
      existingImportId?: string;
    };
    id?: string;
  };
  const id =
    body.id ?? body.details?.existingImportId ?? body.details?.existingImport?.id;
  expect(
    id,
    `attendance import id missing from upload response ${response.status()}`,
  ).toBeTruthy();
  return id!;
}

async function ensureParsedAttendanceImport(
  request: APIRequestContext,
  token: string,
): Promise<string> {
  let id = await findAttendanceImportBySha(request, token);
  if (!id) {
    const buffer = await readFile(attendanceFixturePath);
    const response = await request.post("/api/attendance-imports", {
      headers: authHeaders(token),
      multipart: {
        file: {
          buffer,
          mimeType: "application/vnd.ms-excel",
          name: "workAttendanceRecordForm_June.xls",
        },
      },
    });
    expect([201, 409]).toContain(response.status());
    id = await attendanceImportIdFromUpload(response);
  }

  const parseResponse = await request.post(
    `/api/attendance-imports/${id}/parse`,
    {
      headers: authHeaders(token),
    },
  );
  expect(parseResponse.status()).toBe(201);
  return id;
}

async function findAttendanceImportBySha(
  request: APIRequestContext,
  token: string,
): Promise<string | null> {
  const response = await request.get(
    "/api/attendance-imports?limit=100&offset=0",
    {
      headers: authHeaders(token),
    },
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    items: Array<{ fileSha256: string; id: string }>;
  };
  return (
    body.items.find((item) => item.fileSha256 === attendanceFixtureSha256)?.id ??
    null
  );
}

async function expectGeneratedFilesHaveAuditMetadata(
  request: APIRequestContext,
  token: string,
  attendanceImportId: string,
): Promise<GeneratedFileEvidence[]> {
  const response = await request.get(
    `/api/attendance-imports/${attendanceImportId}/files`,
    { headers: authHeaders(token) },
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { items: GeneratedFileEvidence[] };
  for (const file of body.items) {
    expect(file.id).toBeTruthy();
    expect(file.fileSha256).toBeTruthy();
    expect(Number(file.fileSizeBytes)).toBeGreaterThan(0);
    expect(file.mimeType).toBeTruthy();
    expect(file.status).toBeTruthy();
    expect(file.storagePath).toBeTruthy();
  }
  for (const technicalType of [
    "ATTENDANCE_PARSED_JSON",
    "TASK_REPORT_HTML",
  ]) {
    expect(
      body.items.find((item) => item.fileType === technicalType),
      `API must retain ${technicalType}`,
    ).toBeTruthy();
  }
  for (const wageRecord of body.items.filter(
    (item) => item.fileType === "WAGE_RECORD_XLS",
  )) {
    expect(wageRecord.mimeType).toBe("application/vnd.ms-excel");
    expect(wageRecord.storagePath).toMatch(/\.xls$/);
  }
  return body.items;
}

async function expectOfficeWageFileVisibility(
  page: Page,
  attendanceImportId: string,
  files: GeneratedFileEvidence[],
  locale: "en" | "zh-CN",
): Promise<void> {
  const wageFiles = files.filter((file) => file.fileType === "WAGE_RECORD_XLS");
  const technicalFiles = files.filter(
    (file) => file.fileType !== "WAGE_RECORD_XLS",
  );
  const title = locale === "en" ? "Wage record files" : "工资表文件";
  const wageLabel = locale === "en" ? "Wage record" : "工资记录";

  await expect(page.getByRole("heading", { exact: true, name: title })).toBeVisible();
  await expect(page.locator('[data-testid="wage-record-file"]')).toHaveCount(
    wageFiles.length,
  );
  await expect(page.getByText(wageLabel, { exact: true })).toHaveCount(
    wageFiles.length,
  );
  for (const forbiddenText of [
    "Task report",
    "任务报告",
    "Parsed attendance data",
    "已解析考勤数据",
    "TASK_REPORT_HTML",
    "ATTENDANCE_PARSED_JSON",
  ]) {
    await expect(page.getByText(forbiddenText, { exact: true })).toHaveCount(0);
  }
  for (const file of technicalFiles) {
    await expect(
      page.locator(
        `a[href*="/work-hours/${attendanceImportId}/files/${file.id}/download"]`,
      ),
    ).toHaveCount(0);
  }
  const downloadableWageFiles = wageFiles.filter(
    (file) => file.status === "GENERATED",
  );
  await expect(
    page.locator(
      `a[href^="/work-hours/${attendanceImportId}/files/"][href$="/download"]`,
    ),
  ).toHaveCount(downloadableWageFiles.length);
}

function expectSsrOmitsTechnicalFiles(
  html: string,
  files: GeneratedFileEvidence[],
): void {
  for (const forbiddenText of [
    "Task report",
    "任务报告",
    "Parsed attendance data",
    "已解析考勤数据",
    "TASK_REPORT_HTML",
    "ATTENDANCE_PARSED_JSON",
  ]) {
    expect(html).not.toContain(forbiddenText);
  }
  for (const file of files.filter(
    (candidate) => candidate.fileType !== "WAGE_RECORD_XLS",
  )) {
    expect(html).not.toContain(`/files/${file.id}/download`);
  }
}

async function expectBrowserWageDownloadMatchesAudit(
  page: Page,
  attendanceImportId: string,
  files: GeneratedFileEvidence[],
): Promise<void> {
  const wageFile = files.find(
    (file) => file.fileType === "WAGE_RECORD_XLS" && file.status === "GENERATED",
  );
  expect(wageFile).toBeTruthy();
  const response = await page.context().request.get(
    `/work-hours/${attendanceImportId}/files/${wageFile!.id}/download`,
  );
  expect(response.status()).toBe(200);
  expect(sha256(await response.body())).toBe(wageFile!.fileSha256);
}

async function createReadOnlyAttendanceUser(
  request: APIRequestContext,
  token: string,
  projectName: string,
): Promise<{ email: string; password: string }> {
  const suffix = uniqueSuffix(projectName);
  const roleCode = `E2E_ATTENDANCE_READ_${suffix}`;
  const email = `e2e-attendance-read-${suffix}@bestarcca.com`;
  const password = "Bestar-E2E-HR-Read-123!";

  const roleResponse = await request.post("/api/roles", {
    data: {
      code: roleCode,
      description: "Playwright Work Hours read-only regression role",
      displayName: `E2E Attendance Read ${suffix}`,
    },
    headers: authHeaders(token),
  });
  expect(roleResponse.status()).toBe(201);
  const roleId = await roleIdFromCreateResponse(roleResponse);

  const permissionResponse = await request.patch(
    `/api/roles/${roleId}/permissions`,
    {
      data: { permissionCodes: ["attendance.read"] },
      headers: authHeaders(token),
    },
  );
  expect(permissionResponse.status()).toBe(200);

  const userResponse = await request.post("/api/users", {
    data: {
      email,
      name: `E2E Attendance Read ${suffix}`,
      password,
      roleCodes: [roleCode],
    },
    headers: authHeaders(token),
  });
  expect(userResponse.status()).toBe(201);
  return { email, password };
}

async function roleIdFromCreateResponse(response: {
  json: () => Promise<unknown>;
}): Promise<string> {
  const body = (await response.json()) as {
    id?: string;
    role?: { id?: string };
  };
  const roleId = body.role?.id ?? body.id;
  expect(roleId, "role id missing from create role response").toBeTruthy();
  return roleId!;
}

function uniqueSuffix(projectName: string): string {
  const projectDigit = projectName.includes("mobile") ? "2" : "1";
  return `${projectDigit}${Date.now().toString().slice(-6)}`;
}
