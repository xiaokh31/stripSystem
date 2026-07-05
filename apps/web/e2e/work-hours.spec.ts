import {
  expect,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  authHeaders,
  ensureTestUser,
  expectNoPageError,
  loginForAccessToken,
  loginThroughApi,
  loginWithCredentials,
} from "./helpers";

const repoRoot = path.resolve(process.cwd(), "../..");
const attendanceFixturePath = path.join(
  repoRoot,
  "samples",
  "wage",
  "workAttendanceRecordForm_June.xls",
);
const invalidXlsxFixturePath = path.join(
  repoRoot,
  "samples",
  "unloading-plans",
  "BEAU5601716 UNLOADING PLAN.xlsx",
);
const attendanceFixtureSha256 =
  "4c3a5c0750e04f99cd614da033d54d948b5fd1b72e0ffec4f19a3d35c9f682b3";

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
  await expect(page.getByText("0.50").first()).toBeVisible();

  const generateButton = page.getByRole("button", {
    name: "Generate wage record",
  });
  await expect(generateButton).toBeEnabled();
  await Promise.all([
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

  await expect(page.getByText("WAGE_RECORD_XLS").first()).toBeVisible();
  await expect(page.getByText("TASK_REPORT_HTML").first()).toBeVisible();
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

  await expectNoPageError(page);
  await expectGeneratedFilesHaveAuditMetadata(
    request,
    token,
    attendanceImportId,
  );
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
  await expectNoPageError(page);
});

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
): Promise<void> {
  const response = await request.get(
    `/api/attendance-imports/${attendanceImportId}/files`,
    { headers: authHeaders(token) },
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    items: Array<{
      fileSha256: string | null;
      fileSizeBytes: string | null;
      fileType: string;
      mimeType: string | null;
      storagePath: string | null;
    }>;
  };
  const wageRecord = body.items.find(
    (item) => item.fileType === "WAGE_RECORD_XLS",
  );
  expect(wageRecord).toBeTruthy();
  expect(wageRecord?.fileSha256).toBeTruthy();
  expect(Number(wageRecord?.fileSizeBytes)).toBeGreaterThan(0);
  expect(wageRecord?.mimeType).toBe("application/vnd.ms-excel");
  expect(wageRecord?.storagePath).toMatch(/\.xls$/);
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
