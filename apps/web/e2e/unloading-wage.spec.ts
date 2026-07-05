import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { expectNoPageError, loginThroughApi } from "./helpers";

const settlementMonth = "2026-06";
const completedAt = "2026-06-18T20:30:00.000Z";

test("warehouse manager can review and regenerate monthly unloading wage settlement", async ({
  page,
  request,
}, testInfo) => {
  const token = await loginThroughApi(page, request);
  const fixture = await seedCompletedTransferWageUnit(request, token, testInfo);

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
  token: string,
  testInfo: { project: { name: string } },
): Promise<{
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
  const workerA = `E2E Worker A ${suffix}`;
  const workerB = `E2E Worker B ${suffix}`;
  const containerA = await createManualContainer(request, token, containerNoA);
  await createManualContainer(request, token, containerNoB);

  await expectOk(
    request.patch(`/api/containers/${containerA.id}/unloading-wage-associations`, {
      data: {
        associatedContainerNos: [containerNoB],
        reason: "Playwright unloading wage smoke association",
        trailerNumber,
      },
      headers: authHeaders(token),
    }),
  );
  await expectOk(
    request.put(`/api/containers/${containerA.id}/unloaders`, {
      data: {
        reason: "Playwright unloading wage smoke unloaders",
        unloaders: [{ workerName: workerA }, { workerName: workerB }],
      },
      headers: authHeaders(token),
    }),
  );
  await expectOk(
    request.post(`/api/containers/${containerA.id}/complete-unloading`, {
      data: {
        completedAt,
        note: "Playwright smoke completed unloading",
        reason: "Playwright unloading wage smoke completion",
      },
      headers: authHeaders(token),
    }),
    201,
  );

  return { containerNoA, containerNoB, trailerNumber, workerA, workerB };
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

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function uniqueSuffix(projectName: string): string {
  const projectDigit = projectName.includes("mobile") ? "2" : "1";
  return `${projectDigit}${Date.now().toString().slice(-6)}`;
}
