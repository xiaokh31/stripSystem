import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  authHeaders,
  ensureTestUser,
  expectNoPageError,
  loginForAccessToken,
  loginThroughApi,
  loginWithCredentials,
  type E2ETestUser,
} from "./helpers";

const settlementMonth = "2026-06";
const completedAt = "2026-06-18T20:30:00.000Z";

test("warehouse manager can review and regenerate monthly unloading wage settlement", async ({
  page,
  request,
}, testInfo) => {
  const adminToken = await loginThroughApi(page, request);
  const actors = await ensureUnloadingWageActors(request, adminToken);
  const hrToken = await loginForAccessToken(request, actors.hrManager);
  const blockedWorkerDirectoryResponse = await request.get(
    "/api/unloading-wage/workers",
    { headers: authHeaders(hrToken) },
  );
  expect(blockedWorkerDirectoryResponse.status()).toBe(403);

  const token = await loginWithCredentials(
    page,
    request,
    actors.warehouseManager,
  );
  await expectWorkerDirectoryIncludes(request, token, [
    actors.workerA,
    actors.workerB,
  ]);
  const fixture = await seedCompletedTransferWageUnit(
    request,
    {
      adminToken,
      warehouseToken: token,
      workerA: actors.workerA,
      workerB: actors.workerB,
    },
    testInfo,
  );

  await page.goto(`/containers/${fixture.containerId}`);
  await expect(page.getByRole("heading", { name: fixture.containerNoA }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "保存拆柜人" })).toBeVisible();
  await expect(
    page.locator("select").filter({ hasText: fixture.workerA }).first(),
  ).toBeVisible();
  await expect(
    page.locator("select").filter({ hasText: fixture.workerB }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Legacy worker:/)).toHaveCount(0);

  const blockedSettlementResponse = await request.post(
    "/api/unloading-wage-settlements",
    {
      data: { settlementMonth },
      headers: authHeaders(hrToken),
    },
  );
  expect(blockedSettlementResponse.status()).toBe(403);

  await createSettlement(request, token, settlementMonth);

  await page.goto(`/unloading-wage?settlementMonth=${settlementMonth}`);

  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Warehouse Unloading Wage Settlement",
    }),
  ).toBeVisible();
  await expect(page.locator('input[name="settlementMonth"]')).toHaveValue(
    settlementMonth,
  );
  await expect(page.getByText("Completed unloading source records")).toBeVisible();
  await expect(page.getByText(fixture.trailerNumber).first()).toBeVisible();
  await expect(page.getByText(fixture.containerNoA).first()).toBeVisible();
  await expect(page.getByText(fixture.containerNoB).first()).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/unloading-wage-settlements") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Generate settlement" }).click(),
  ]);

  await expect(page).toHaveURL(/settlementId=/);
  await expect(page.getByText("Settlement review warning")).toBeVisible();
  await expect(page.getByText(/superseded by regeneration/)).toBeVisible();
  await expect(page.getByRole("heading", { name: `Settlement ${settlementMonth}` }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Worker summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monthly detail" })).toBeVisible();

  await expect(page.getByText(fixture.workerA).first()).toBeVisible();
  await expect(page.getByText(fixture.workerB).first()).toBeVisible();
  await expect(page.getByText("CAD 180.00").first()).toBeVisible();
  await expect(page.getByText(fixture.trailerNumber).first()).toBeVisible();
  await expect(page.getByText(fixture.containerNoA).first()).toBeVisible();
  await expect(page.getByText(fixture.containerNoB).first()).toBeVisible();
  await expect(page.getByText("CAD 360.00").first()).toBeVisible();
  await expect(page.getByText("Equal split").first()).toBeVisible();

  const downloads = page.getByRole("link", { name: "Download" });
  await expect(downloads).toHaveCount(2);
  await expect(downloads.first()).toHaveAttribute(
    "href",
    /\/unloading-wage\/settlements\/[^/]+\/files\/[^/]+\/download/,
  );
  await expectNoPageError(page);
});

async function seedCompletedTransferWageUnit(
  request: APIRequestContext,
  actors: {
    adminToken: string;
    warehouseToken: string;
    workerA: E2ETestUser;
    workerB: E2ETestUser;
  },
  testInfo: { project: { name: string } },
): Promise<{
  containerId: string;
  containerNoA: string;
  containerNoB: string;
  trailerNumber: string;
  workerA: string;
  workerB: string;
}> {
  const suffix = uniqueSuffix(testInfo.project.name);
  const containerNoA = `ZCSU${suffix}A`;
  const containerNoB = `TGBU${suffix}B`;
  const trailerNumber = `TR-E2E-${suffix}`;
  const containerA = await createManualContainer(
    request,
    actors.adminToken,
    containerNoA,
  );
  await createManualContainer(request, actors.adminToken, containerNoB);

  await expectOk(
    request.patch(`/api/containers/${containerA.id}/unloading-wage-associations`, {
      data: {
        associatedContainerNos: [containerNoB],
        reason: "Playwright unloading wage smoke association",
        trailerNumber,
      },
      headers: authHeaders(actors.warehouseToken),
    }),
  );

  const duplicateUnloaderResponse = await request.put(
    `/api/containers/${containerA.id}/unloaders`,
    {
      data: {
        reason: "Playwright duplicate unloader guard",
        unloaders: [
          { workerUserId: actors.workerA.id },
          { workerUserId: actors.workerA.id },
        ],
      },
      headers: authHeaders(actors.warehouseToken),
    },
  );
  expect(duplicateUnloaderResponse.status()).toBe(400);
  const duplicateBody = (await duplicateUnloaderResponse.json()) as {
    code?: string;
  };
  expect(duplicateBody.code).toBe("DUPLICATE_UNLOADER_ASSIGNMENT");

  await expectOk(
    request.put(`/api/containers/${containerA.id}/unloaders`, {
      data: {
        reason: "Playwright unloading wage smoke unloaders",
        unloaders: [
          { workerUserId: actors.workerA.id },
          { workerUserId: actors.workerB.id },
        ],
      },
      headers: authHeaders(actors.warehouseToken),
    }),
  );
  await expectOk(
    request.post(`/api/containers/${containerA.id}/complete-unloading`, {
      data: {
        completedAt,
        note: "Playwright smoke completed unloading",
        reason: "Playwright unloading wage smoke completion",
      },
      headers: authHeaders(actors.warehouseToken),
    }),
    201,
  );

  return {
    containerId: containerA.id,
    containerNoA,
    containerNoB,
    trailerNumber,
    workerA: actors.workerA.name,
    workerB: actors.workerB.name,
  };
}

async function ensureUnloadingWageActors(
  request: APIRequestContext,
  adminToken: string,
): Promise<{
  hrManager: E2ETestUser;
  warehouseManager: E2ETestUser;
  workerA: E2ETestUser;
  workerB: E2ETestUser;
}> {
  const [hrManager, warehouseManager, workerA, workerB] = await Promise.all([
    ensureTestUser(request, adminToken, {
      email: "e2e-unloading-hr-manager@bestarcca.com",
      name: "E2E Unloading HR Manager",
      password: "Bestar-E2E-HR-123!",
      roleCodes: ["HR_MANAGER"],
    }),
    ensureTestUser(request, adminToken, {
      email: "e2e-warehouse-manager@bestarcca.com",
      name: "E2E Warehouse Manager",
      password: "Bestar-E2E-WM-123!",
      roleCodes: ["WAREHOUSE_MANAGER"],
    }),
    ensureTestUser(request, adminToken, {
      email: "e2e-unloader-a@bestarcca.com",
      name: "E2E Unloader A",
      password: "Bestar-E2E-WA-123!",
      roleCodes: ["WAREHOUSE"],
    }),
    ensureTestUser(request, adminToken, {
      email: "e2e-unloader-b@bestarcca.com",
      name: "E2E Unloader B",
      password: "Bestar-E2E-WB-123!",
      roleCodes: ["WAREHOUSE"],
    }),
  ]);
  return { hrManager, warehouseManager, workerA, workerB };
}

async function expectWorkerDirectoryIncludes(
  request: APIRequestContext,
  token: string,
  users: E2ETestUser[],
): Promise<void> {
  const response = await expectOk(
    request.get("/api/unloading-wage/workers", {
      headers: authHeaders(token),
    }),
  );
  const body = (await response.json()) as {
    items: Array<{ id: string; workerName: string }>;
  };
  const workerIds = new Set(body.items.map((item) => item.id));
  for (const user of users) {
    expect(workerIds.has(user.id), `${user.email} missing from worker directory`)
      .toBe(true);
  }
}

async function createManualContainer(
  request: APIRequestContext,
  token: string,
  containerNo: string,
): Promise<{ id: string }> {
  const response = await expectOk(
    request.post("/api/containers/manual", {
      data: {
        company: "Bestar E2E",
        containerNo,
        correctionNote: "Playwright unloading wage smoke fixture",
        destinations: [
          {
            cartons: 12,
            destinationCode: "YEG1",
            destinationType: "WAREHOUSE",
            note: "Playwright smoke destination",
            pallets: 1,
            volume: 1.25,
          },
        ],
        dockNo: "E2E",
        reason: "Playwright unloading wage smoke fixture",
      },
      headers: authHeaders(token),
    }),
    201,
  );
  const body = (await response.json()) as { container: { id: string } };
  return body.container;
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
