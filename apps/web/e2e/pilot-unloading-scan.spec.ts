import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import path from "node:path";
import { authHeaders, loginThroughApi } from "./helpers";
import {
  createDerivedRealWorkbook,
  uniquePolicyContainerNo,
} from "./real-workbook-fixture";
interface PalletListResponse {
  items: PalletResponse[];
}

interface PalletResponse {
  id: string;
  containerDestinationId: string;
  destinationCode: string;
  palletNo: number;
  qrPayload: string;
  status: string;
}

interface LoadJobResponse {
  id: string;
  loadNo: string | null;
  status: string;
}

test("pilot full-stack import, report, label, and scan flow", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);

  const accessToken = await loginThroughApi(page, request);
  const headers = authHeaders(accessToken);
  const containerNo = uniquePolicyContainerNo();
  const workbookPath = await createDerivedRealWorkbook(testInfo, containerNo);

  await page.goto("/imports/new");
  await expect(
    page.getByRole("heading", { name: "Upload unloading Excel files" }),
  ).toBeVisible();

  await page.locator("#import-files").setInputFiles(workbookPath);
  await expect(page.getByText(path.basename(workbookPath))).toBeVisible();
  await page.getByRole("button", { name: /^Upload \d+ file\(s\)$/ }).click();

  const importLink = page.locator('p:has-text("Import ID:") a[href^="/imports/"]');
  await expect(importLink).toBeVisible({ timeout: 45_000 });
  await importLink.click();
  await expect(page).toHaveURL(/\/imports\/(?!new(?:[/?#]|$))[^/?#]+$/);

  await expect(page.getByRole("heading", { name: path.basename(workbookPath) }))
    .toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Parse file" }).click();

  const containerLink = page.getByRole("link", {
    name: new RegExp(containerNo),
  }).first();
  await expect(containerLink).toBeVisible({ timeout: 75_000 });
  await containerLink.click();

  await expect(
    page.getByRole("heading", { exact: true, name: containerNo }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Generate Excel Report" }).click();
  await expect(page.getByText("Excel report generated.")).toBeVisible({
    timeout: 75_000,
  });
  await expect(page.getByText("Excel report").first()).toBeVisible();

  await page.getByRole("button", { name: "Generate Label PDF" }).click();
  await expect(page.getByText("Label PDF generated.")).toBeVisible({
    timeout: 75_000,
  });
  await expect(page.getByText("Label PDF").first()).toBeVisible();

  const containerId = lastPathSegment(page.url());
  const pallet = await firstGeneratedPallet(request, headers, containerId);
  const loadNo = `PILOT-${containerNo}`;
  const loadJob = await createStartedLoadJob(request, headers, {
    containerId,
    containerNo,
    loadNo,
    pallet,
  });

  await page.goto("/load-jobs");
  await expect(page.getByText(loadNo).first()).toBeVisible({ timeout: 20_000 });

  await page.goto(`/mobile/load-jobs/${loadJob.id}/scan`);
  await expect(
    page.getByRole("heading", { exact: true, name: loadNo }),
  ).toBeVisible({ timeout: 20_000 });

  const scanInput = page.getByLabel("Pallet QR scan");
  await scanInput.fill(pallet.qrPayload);
  await page.getByRole("button", { name: "Submit scan" }).click();

  await expect(page.getByText("Scan accepted")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText("Pallet loaded into the selected load job."),
  ).toBeVisible();
  await expect(page.getByText(pallet.qrPayload)).toHaveCount(0);

  await scanInput.fill(pallet.qrPayload);
  await page.getByRole("button", { name: "Submit scan" }).click();

  await expect(page.getByText("Duplicate scan")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText("This pallet was already scanned for the selected load job."),
  ).toBeVisible();

  const loadedPalletsResponse = await request.get(
    `/api/load-jobs/${encodeURIComponent(loadJob.id)}/loaded-pallets`,
    { headers },
  );
  await expectStatus(loadedPalletsResponse, 200);
  const loadedPallets = (await loadedPalletsResponse.json()) as {
    items: PalletResponse[];
  };
  expect(loadedPallets.items).toHaveLength(1);
  expect(loadedPallets.items[0]?.id).toBe(pallet.id);
});

async function firstGeneratedPallet(
  request: APIRequestContext,
  headers: Record<string, string>,
  containerId: string,
): Promise<PalletResponse> {
  const response = await request.get(
    `/api/pallets?containerId=${encodeURIComponent(containerId)}`,
    { headers },
  );
  await expectStatus(response, 200);
  const body = (await response.json()) as PalletListResponse;
  expect(body.items.length).toBeGreaterThan(0);

  return body.items
    .slice()
    .sort((left, right) => left.palletNo - right.palletNo)[0]!;
}

async function createStartedLoadJob(
  request: APIRequestContext,
  headers: Record<string, string>,
  input: {
    containerId: string;
    containerNo: string;
    loadNo: string;
    pallet: PalletResponse;
  },
): Promise<LoadJobResponse> {
  const createResponse = await request.post("/api/load-jobs", {
    data: {
      carrier: "Pilot smoke",
      containerId: input.containerId,
      destinationRegion: input.pallet.destinationCode,
      dockNo: "SMOKE-DOCK",
      lines: [
        {
          containerDestinationId: input.pallet.containerDestinationId,
          containerId: input.containerId,
          containerNo: input.containerNo,
          destinationCode: input.pallet.destinationCode,
          plannedPallets: 1,
          sourceText: `${input.containerNo}-1P`,
        },
      ],
      loadNo: input.loadNo,
      scheduledDepartureAt: new Date(Date.now() + 3_600_000).toISOString(),
      truckNo: "SMOKE-TRUCK",
    },
    headers,
  });
  await expectStatus(createResponse, 201);
  const created = (await createResponse.json()) as LoadJobResponse;

  const startResponse = await request.patch(
    `/api/load-jobs/${encodeURIComponent(created.id)}`,
    {
      data: {
        reason: "Playwright pilot smoke starts the load job for scanning.",
        startedAt: new Date().toISOString(),
        status: "IN_PROGRESS",
      },
      headers,
    },
  );
  await expectStatus(startResponse, 200);
  const started = (await startResponse.json()) as LoadJobResponse;
  expect(started.status).toBe("IN_PROGRESS");

  return started;
}

async function expectStatus(
  response: APIResponse,
  expectedStatus: number,
): Promise<void> {
  if (response.status() !== expectedStatus) {
    throw new Error(
      `Expected ${expectedStatus} from ${response.url()}, got ${response.status()}: ${await response.text()}`,
    );
  }
}

function lastPathSegment(url: string): string {
  const { pathname } = new URL(url);
  const value = pathname.split("/").filter(Boolean).pop();
  if (!value) {
    throw new Error(`Could not read path id from ${url}`);
  }
  return value;
}
