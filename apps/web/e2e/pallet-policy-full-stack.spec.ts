import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import {
  authHeaders,
  E2E_BASE_URL,
  expectNoPageError,
  loginThroughApi,
} from "./helpers";
import {
  createDerivedRealWorkbook,
  uniquePolicyContainerNo,
} from "./real-workbook-fixture";

const execFileAsync = promisify(execFile);
const DEFAULT_SETTINGS = {
  palletLengthM: "1.0",
  palletWidthM: "1.2",
  qrTargetSizeMm: "25",
} as const;

interface PalletPolicy {
  lowHeightCapacityCbm: string;
  otherDestinationCapacityCbm: string;
  palletLengthM: string;
  palletWidthM: string;
  policyVersion: string;
  settingsRevision: string;
}

interface Destination {
  calculatedPallets: number;
  destinationCode: string;
  finalPallets: number;
  id: string;
  manualPallets: number | null;
  note: string | null;
  packageType: string | null;
  palletPolicySnapshot: unknown;
  palletRuleCode: string | null;
  totalCartons: number;
  totalVolumeCbm: string;
  warnings: unknown;
}

interface ContainerDetail {
  destinations: Destination[];
  id: string;
  rawJson: unknown;
  status: string;
}

interface GeneratedFile {
  fileSha256: string | null;
  fileType: string;
  id: string;
  status: string;
  storagePath: string;
}

interface Pallet {
  containerDestinationId: string;
  destinationCode: string;
  id: string;
  palletId: string;
  palletNo: number;
  qrPayload: string;
  status: string;
}

interface InventorySummary {
  activeTotalPallets: number;
  containerId: string;
  loadedPallets: number;
  remainingPallets: number;
}

interface OperationalSetting {
  key: string;
  updatedById: string | null;
  value: string;
}

test("pallet policy survives settings, real import, correction, artifacts, inventory, and duplicate scan", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(900_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const accessToken = await loginThroughApi(page, request);
  const headers = authHeaders(accessToken);
  const historicalContainerNo = uniquePolicyContainerNo();
  const currentContainerNo = uniquePolicyContainerNo();
  const historicalWorkbookPath = await createDerivedRealWorkbook(
    testInfo,
    historicalContainerNo,
  );
  const currentWorkbookPath = await createDerivedRealWorkbook(
    testInfo,
    currentContainerNo,
  );

  try {
    const defaultPolicy = await restoreDefaultSettings(request, headers);
    expect(defaultPolicy).toMatchObject({
      lowHeightCapacityCbm: "2.04",
      otherDestinationCapacityCbm: "2.64",
      palletLengthM: "1.0",
      palletWidthM: "1.2",
    });

    await expectOperationalSetting(request, headers, "qrTargetSizeMm", "25");

    const { containerId: historicalContainerId, importId: historicalImportId } =
      await importRealWorkbookThroughBrowser(
        page,
        historicalWorkbookPath,
        historicalContainerNo,
      );
    const parsedResponse = await getJson<{
      containers: Array<{ id: string; rawJson: unknown }>;
    }>(request, `/api/imports/${historicalImportId}/parse-result`, headers);
    expect(parsedResponse.containers[0]?.id).toBe(historicalContainerId);
    expect(JSON.stringify(parsedResponse.containers[0]?.rawJson)).toContain(
      "Private Address",
    );
    expect(JSON.stringify(parsedResponse.containers[0]?.rawJson)).toContain(
      "PUROLATOR",
    );

    const historicalContainer = await containerDetail(
      request,
      headers,
      historicalContainerId,
    );
    expect(historicalContainer.destinations).toHaveLength(9);
    expect(destination(historicalContainer, "YYC4").palletRuleCode).toBe(
      "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7",
    );
    expect(destination(historicalContainer, "YEG1").palletRuleCode).toBe(
      "YEG1_FOOTPRINT_HEIGHT_PLUS_4",
    );
    expect(destination(historicalContainer, "YEG2").finalPallets).toBe(7);
    expect(destination(historicalContainer, "YVR4").palletRuleCode).toBe(
      "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2",
    );
    expect(
      historicalContainer.destinations.some((item) =>
        item.destinationCode.startsWith("Private Address"),
      ),
    ).toBe(true);
    expect(
      historicalContainer.destinations.some(
        (item) => item.destinationCode === "贵司卡尔加里仓",
      ),
    ).toBe(true);
    for (const item of historicalContainer.destinations) {
      expect(snapshot(item).settingsRevision).toBe(defaultPolicy.settingsRevision);
      expect(snapshot(item).palletLengthM).toBe("1.0");
      expect(snapshot(item).palletWidthM).toBe("1.2");
    }

    await generateArtifactsThroughBrowser(page);
    const historicalFiles = await generatedFiles(
      request,
      headers,
      historicalContainerId,
    );
    const historicalPallets = await pallets(request, headers, historicalContainerId);
    expect(historicalPallets).toHaveLength(totalFinalPallets(historicalContainer));
    assertUniquePalletIdentity(historicalPallets);
    const historicalSnapshots = historicalContainer.destinations.map((item) => ({
      id: item.id,
      snapshot: item.palletPolicySnapshot,
    }));

    await completeUnloadingThroughBrowser(page);
    const historicalCount = totalFinalPallets(historicalContainer);
    expect(
      await inventoryForContainer(request, headers, historicalContainerNo),
    ).toMatchObject({
      activeTotalPallets: historicalCount,
      loadedPallets: 0,
      remainingPallets: historicalCount,
    });
    const historicalPalletToScan = historicalPallets[0]!;
    const historicalLoadJob = await createStartedLoadJob(request, headers, {
      containerId: historicalContainerId,
      containerNo: historicalContainerNo,
      pallet: historicalPalletToScan,
    });
    await scanPalletThroughBrowser(page, historicalLoadJob.id, historicalPalletToScan);
    const historicalInventoryAfterScan = await inventoryForContainer(
      request,
      headers,
      historicalContainerNo,
    );
    expect(historicalInventoryAfterScan).toMatchObject({
      activeTotalPallets: historicalCount,
      loadedPallets: 1,
      remainingPallets: historicalCount - 1,
    });
    const historicalPalletsAfterScan = await pallets(
      request,
      headers,
      historicalContainerId,
    );
    const historicalLoaded = await loadedPallets(
      request,
      headers,
      historicalLoadJob.id,
    );
    expect(historicalLoaded).toHaveLength(1);
    expect(historicalLoaded[0]?.id).toBe(historicalPalletToScan.id);

    await page.goto("/settings");
    await page.getByTestId("pallet-length-input").fill("1.0");
    await page.getByTestId("pallet-width-input").fill("1.1");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/Operational settings saved/)).toBeVisible();
    await expect(page.getByTestId("pallet-low-height-capacity")).toHaveText(
      "1.87 CBM",
    );
    await expect(page.getByTestId("pallet-other-height-capacity")).toHaveText(
      "2.42 CBM",
    );
    const customPolicy = await palletPolicy(request, headers);
    expect(customPolicy.settingsRevision).not.toBe(defaultPolicy.settingsRevision);
    expect(
      await operationalSetting(request, headers, "palletWidthM"),
    ).toMatchObject({
      updatedById: expect.any(String),
      value: "1.1",
    });

    const afterSettings = await containerDetail(request, headers, historicalContainerId);
    expect(
      afterSettings.destinations.map((item) => ({
        id: item.id,
        snapshot: item.palletPolicySnapshot,
      })),
    ).toEqual(historicalSnapshots);
    expect(await generatedFiles(request, headers, historicalContainerId)).toEqual(
      historicalFiles,
    );
    expect(await pallets(request, headers, historicalContainerId)).toEqual(
      historicalPalletsAfterScan,
    );
    expect(
      await inventoryForContainer(request, headers, historicalContainerNo),
    ).toEqual(historicalInventoryAfterScan);
    expect(
      await loadedPallets(request, headers, historicalLoadJob.id),
    ).toEqual(historicalLoaded);

    const { containerId } = await importRealWorkbookThroughBrowser(
      page,
      currentWorkbookPath,
      currentContainerNo,
    );
    const imported = await containerDetail(request, headers, containerId);
    expect(imported.destinations).toHaveLength(9);
    for (const item of imported.destinations) {
      expect(snapshot(item).settingsRevision).toBe(customPolicy.settingsRevision);
      expect(snapshot(item).palletLengthM).toBe("1.0");
      expect(snapshot(item).palletWidthM).toBe("1.1");
    }

    await capturePolicyScreenshots(page, containerId);
    await assertLocaleSwitchRefresh(page, containerId);

    await setBrowserPreference(page, "en", "light");
    await page.setViewportSize({ height: 900, width: 1366 });
    await page.goto(`/containers/${containerId}`);
    await page.getByLabel("Actual cartons for YYC4").fill("219");
    await page.getByLabel("Actual CBM for YYC4").fill("4.2");
    await page.getByLabel("Actual pallets for YYC4").fill("4");
    await page.getByLabel("Actual note for YYC4").fill("E2E verified actual unloading note");
    await page.getByLabel("Audit note for YYC4").fill(
      "UNLOAD-PALLET-10 audited correction",
    );
    const yyc4Row = page.locator("tbody tr").filter({
      has: page.getByLabel("Actual cartons for YYC4"),
    });
    await yyc4Row.getByRole("button", { name: "Save actual" }).click();
    await expect(yyc4Row.getByText(/Saved \d+ correction record/)).toBeVisible({
      timeout: 30_000,
    });

    const corrected = await containerDetail(request, headers, containerId);
    const correctedYyc4 = destination(corrected, "YYC4");
    expect(correctedYyc4).toMatchObject({
      calculatedPallets: 3,
      finalPallets: 4,
      manualPallets: 4,
      note: "E2E verified actual unloading note",
      totalCartons: 219,
      totalVolumeCbm: "4.2",
    });
    expect(snapshot(correctedYyc4)).toMatchObject({
      capacityCbm: "1.87",
      finalPallets: 4,
      palletLengthM: "1.0",
      palletWidthM: "1.1",
      settingsRevision: customPolicy.settingsRevision,
    });
    expect(
      corrected.destinations
        .filter((item) => item.id !== correctedYyc4.id)
        .map((item) => snapshot(item).settingsRevision),
    ).toEqual(
      expect.arrayContaining(
        Array(corrected.destinations.length - 1).fill(customPolicy.settingsRevision),
      ),
    );
    const correctionHistory = await getJson<{
      items: Array<{ fieldName: string; note: string | null }>;
    }>(request, `/api/corrections?containerId=${containerId}&limit=100`, headers);
    expect(correctionHistory.items.map((item) => item.fieldName)).toEqual(
      expect.arrayContaining([
        "cartons",
        "volume",
        "note",
        "manualPallets",
        "finalPallets",
        "palletPolicySnapshot",
      ]),
    );

    const derivedCases = await createDerivedPolicyCases(
      request,
      headers,
      containerId,
      customPolicy,
    );
    expect(derivedCases.map((item) => item.palletRuleCode)).toEqual(
      expect.arrayContaining([
        "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7",
        "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2",
        "WOODEN_CRATE_PIECE_COUNT",
        "OVERSIZE_PIECE_COUNT",
      ]),
    );

    await setBrowserPreference(page, "zh-CN", "dark");
    await page.goto(`/containers/${containerId}`);
    await page.getByRole("button", { name: "生成 Excel 拆柜报告" }).click();
    await expect(page.getByText("Excel 报告已生成，文件历史已刷新。")).toBeVisible({
      timeout: 90_000,
    });
    await page.getByRole("button", { name: "生成托盘面单 PDF" }).click();
    await expect(page.getByText("标签 PDF 已生成，文件历史已刷新。")).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText("Excel report generated. File history refreshed.")).toHaveCount(0);
    await expect(page.getByText("Label PDF generated. File history refreshed.")).toHaveCount(0);

    const finalContainer = await containerDetail(request, headers, containerId);
    const finalCount = totalFinalPallets(finalContainer);
    const finalPallets = await pallets(request, headers, containerId);
    expect(finalPallets).toHaveLength(finalCount);
    assertUniquePalletIdentity(finalPallets);
    const currentFiles = (await generatedFiles(request, headers, containerId)).filter(
      (file) => file.status === "GENERATED",
    );
    const reportFile = currentFile(currentFiles, "EXCEL_REPORT");
    const labelFile = currentFile(currentFiles, "PALLET_LABEL_PDF");
    expect(reportFile.storagePath).toContain("/storage/reports/");
    expect(labelFile.storagePath).toContain("/storage/labels/");
    expect(reportFile.fileSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(labelFile.fileSha256).toMatch(/^[a-f0-9]{64}$/);

    await setBrowserPreference(page, "en", "light");
    await page.goto(`/containers/${containerId}`);
    const reportDownload = await downloadGeneratedFile(
      page,
      containerId,
      reportFile.id,
      testInfo.outputPath("unloading-report.xlsx"),
    );
    const labelDownload = await downloadGeneratedFile(
      page,
      containerId,
      labelFile.id,
      testInfo.outputPath("pallet-labels.pdf"),
    );
    expect(await sha256(reportDownload)).toBe(reportFile.fileSha256);
    expect(await sha256(labelDownload)).toBe(labelFile.fileSha256);
    const reportInspection = await inspectExcelReport(reportDownload);
    expect(reportInspection.palletTotal).toBe(finalCount);
    expect(reportInspection.sheetCount).toBeGreaterThan(1);
    expect(reportInspection.palletizingStandardsRuns).toBeGreaterThan(1);
    const labelInspection = await inspectLabelPdf(labelDownload);
    expect(labelInspection.pageCount).toBe(finalCount);
    expect(labelInspection.widthPoints).toBeCloseTo(mmPoints(150), 2);
    expect(labelInspection.heightPoints).toBeCloseTo(mmPoints(100), 2);

    await completeUnloadingThroughBrowser(page);
    const beforeScan = await inventoryForContainer(request, headers, currentContainerNo);
    expect(beforeScan).toMatchObject({
      activeTotalPallets: finalCount,
      loadedPallets: 0,
      remainingPallets: finalCount,
    });
    const palletToScan = finalPallets[0]!;
    const loadJob = await createStartedLoadJob(request, headers, {
      containerId,
      containerNo: currentContainerNo,
      pallet: palletToScan,
    });
    await page.goto(`/mobile/load-jobs/${loadJob.id}/scan`);
    const scanInput = page.getByLabel("Pallet QR scan");
    await scanInput.fill(palletToScan.qrPayload);
    await page.getByRole("button", { name: "Submit scan" }).click();
    await expect(page.getByText("Scan accepted")).toBeVisible({ timeout: 20_000 });
    const afterFirstScan = await inventoryForContainer(
      request,
      headers,
      currentContainerNo,
    );
    expect(afterFirstScan).toMatchObject({
      activeTotalPallets: finalCount,
      loadedPallets: 1,
      remainingPallets: finalCount - 1,
    });

    await scanInput.fill(palletToScan.qrPayload);
    await page.getByRole("button", { name: "Submit scan" }).click();
    await expect(page.getByText("Duplicate scan")).toBeVisible({ timeout: 20_000 });
    expect(await inventoryForContainer(request, headers, currentContainerNo)).toEqual(
      afterFirstScan,
    );
    const loaded = await loadedPallets(request, headers, loadJob.id);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe(palletToScan.id);

    await page.goto(`/reports/inventory?containerNo=${currentContainerNo}`);
    const inventoryRow = page
      .locator("tbody tr")
      .filter({ hasText: currentContainerNo });
    await expect(inventoryRow).toContainText(String(finalCount));
    await expect(inventoryRow).toContainText(String(finalCount - 1));
    await expectNoPageError(page);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    const restored = await restoreDefaultSettings(request, headers);
    expect(restored).toMatchObject({
      lowHeightCapacityCbm: "2.04",
      otherDestinationCapacityCbm: "2.64",
      palletLengthM: "1.0",
      palletWidthM: "1.2",
    });
    await expectOperationalSetting(request, headers, "qrTargetSizeMm", "25");
  }
});

async function importRealWorkbookThroughBrowser(
  page: Page,
  workbookPath: string,
  containerNo: string,
): Promise<{ containerId: string; importId: string }> {
  await page.goto("/imports/new");
  await page.locator("#import-files").setInputFiles(workbookPath);
  await page.getByRole("button", { name: /^Upload \d+ file\(s\)$/ }).click();
  const importLink = page.locator('p:has-text("Import ID:") a[href^="/imports/"]');
  await expect(importLink).toBeVisible({ timeout: 45_000 });
  await importLink.click();
  await expect(page).toHaveURL(/\/imports\/(?!new(?:[/?#]|$))[^/?#]+$/);
  const importId = lastPathSegment(page.url());
  await page.getByRole("button", { name: "Parse file" }).click();
  const containerLink = page.getByRole("link", { name: new RegExp(containerNo) }).first();
  await expect(containerLink).toBeVisible({ timeout: 90_000 });
  await containerLink.click();
  await expect(page.getByRole("heading", { exact: true, name: containerNo })).toBeVisible();
  return { containerId: lastPathSegment(page.url()), importId };
}

async function generateArtifactsThroughBrowser(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Generate Excel Report" }).click();
  await expect(page.getByText("Excel report generated. File history refreshed.")).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: "Generate Label PDF" }).click();
  await expect(page.getByText("Label PDF generated. File history refreshed.")).toBeVisible({
    timeout: 90_000,
  });
}

async function capturePolicyScreenshots(page: Page, containerId: string): Promise<void> {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      await setBrowserPreference(page, locale, theme);
      for (const viewport of [
        { height: 844, width: 390 },
        { height: 1024, width: 768 },
        { height: 768, width: 1366 },
        { height: 1080, width: 1920 },
      ]) {
        await page.setViewportSize(viewport);
        for (const target of [
          { name: "settings", path: "/settings" },
          { name: "container-detail", path: `/containers/${containerId}` },
        ]) {
          await page.goto(target.path, { waitUntil: "domcontentloaded" });
          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          if (target.name === "settings") {
            await expect(
              page.getByRole("heading", {
                name: locale === "zh-CN" ? "托盘计算" : "Pallet calculation",
              }),
            ).toBeVisible();
            await expect(page.getByTestId("pallet-length-input")).toBeVisible();
          } else {
            await expect(
              page.getByText(locale === "zh-CN" ? "柜子详情" : "Container detail", {
                exact: true,
              }),
            ).toBeVisible();
            await expect(page.getByLabel(/package type/i)).toHaveCount(0);
            await expect(page.locator("body")).not.toContainText(
              "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7",
            );
          }
          await assertPageAndComponentGeometry(page, viewport.width);
          await page.screenshot({
            fullPage: true,
            path: `test-results/unload-pallet-10-${target.name}-${locale}-${theme}-${viewport.width}x${viewport.height}.png`,
          });
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await assertPageAndComponentGeometry(page, viewport.width);
          await expectNoPageError(page);
        }
      }
    }
  }
}

async function assertLocaleSwitchRefresh(page: Page, containerId: string): Promise<void> {
  await setBrowserPreference(page, "en", "light");
  await page.goto(`/containers/${containerId}`);
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByText("柜子详情", { exact: true })).toBeVisible();
  await expect(page.getByText("Container detail", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

async function assertPageAndComponentGeometry(
  page: Page,
  viewportWidth: number,
): Promise<void> {
  const result = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll("main > section"));
    const scrollContainers = Array.from(document.querySelectorAll("main .overflow-x-auto"));
    const fits = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1;
    };
    return {
      pageOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
      scrollContainersFit: scrollContainers.every(fits),
      sectionsFit: sections.every(fits),
    };
  });
  expect(result.pageOverflow, `${viewportWidth}px page overflow`).toBe(false);
  expect(result.sectionsFit, `${viewportWidth}px section clipping`).toBe(true);
  expect(result.scrollContainersFit, `${viewportWidth}px table wrapper clipping`).toBe(true);
}

async function createDerivedPolicyCases(
  request: APIRequestContext,
  headers: Record<string, string>,
  containerId: string,
  policy: PalletPolicy,
): Promise<Destination[]> {
  const inputs = [
    { cartons: 10, destinationCode: "YYC6", packageType: "CARTON", volume: 1.87 },
    { cartons: 10, destinationCode: "UPS", packageType: "CARTON", volume: 5.4 },
    { cartons: 10, destinationCode: "PUROLATOR", packageType: "CARTON", volume: 2.43 },
    { cartons: 10, destinationCode: "GOODCANG", packageType: "CARTON", volume: 2.42 },
    {
      cartons: 10,
      destinationCode: "Commercial Address / E2E-COMMERCIAL",
      packageType: "CARTON",
      volume: 3.61,
    },
    { cartons: 10, destinationCode: "E2E UNMATCHED OTHER", packageType: "CARTON", volume: 1 },
    { cartons: 7, destinationCode: "E2E WOODEN", packageType: "WOODEN_CRATE", volume: 9 },
    { cartons: 2, destinationCode: "E2E OVERSIZE", packageType: "CARTON", volume: 5.6 },
    { cartons: 10, destinationCode: "E2E MIXED", packageType: "CARTON", volume: 1 },
    { cartons: 3, destinationCode: "E2E MIXED", packageType: "WOODEN_CRATE", volume: 9 },
  ] as const;
  const created: Destination[] = [];
  for (const input of inputs) {
    const response = await request.post(`/api/containers/${containerId}/destinations`, {
      data: {
        ...input,
        correctionNote: "UNLOAD-PALLET-10 real-structure derived boundary fixture",
        note: "E2E boundary record; not production fixture evidence",
      },
      headers,
    });
    await expectStatus(response, 201);
    const body = (await response.json()) as { containerDestination: Destination };
    expect(snapshot(body.containerDestination).settingsRevision).toBe(
      policy.settingsRevision,
    );
    created.push(body.containerDestination);
  }
  expect(created.find((item) => item.destinationCode === "YYC6")?.finalPallets).toBe(1);
  expect(created.find((item) => item.destinationCode === "UPS")?.finalPallets).toBe(3);
  expect(created.find((item) => item.destinationCode === "GOODCANG")?.finalPallets).toBe(1);
  expect(
    created.find((item) => item.destinationCode === "E2E WOODEN")?.finalPallets,
  ).toBe(7);
  expect(
    created.find((item) => item.destinationCode === "E2E OVERSIZE")?.finalPallets,
  ).toBe(2);
  expect(
    snapshot(created.find((item) => item.destinationCode === "E2E UNMATCHED OTHER")!)
      .warningCodes,
  ).toContain("NEED_CONFIRM_DESTINATION_TYPE");
  return created;
}

async function completeUnloadingThroughBrowser(page: Page): Promise<void> {
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Container status update" }),
  });
  await section.locator("select").selectOption("UNLOADED");
  await section.getByLabel("Audit note").fill("UNLOAD-PALLET-10 unloading completion");
  await section.getByRole("button", { name: "Save status" }).click();
  await expect(section.getByText("Container status saved.")).toBeVisible({
    timeout: 30_000,
  });
}

async function scanPalletThroughBrowser(
  page: Page,
  loadJobId: string,
  pallet: Pallet,
): Promise<void> {
  await page.goto(`/mobile/load-jobs/${loadJobId}/scan`);
  await page.getByLabel("Pallet QR scan").fill(pallet.qrPayload);
  await page.getByRole("button", { name: "Submit scan" }).click();
  await expect(page.getByText("Scan accepted")).toBeVisible({ timeout: 20_000 });
}

async function createStartedLoadJob(
  request: APIRequestContext,
  headers: Record<string, string>,
  input: { containerId: string; containerNo: string; pallet: Pallet },
): Promise<{ id: string }> {
  const loadNo = `POLICY-${input.containerNo}`;
  const created = await request.post("/api/load-jobs", {
    data: {
      carrier: "UNLOAD-PALLET-10 E2E",
      containerId: input.containerId,
      destinationRegion: input.pallet.destinationCode,
      dockNo: "E2E-DOCK",
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
      loadNo,
      scheduledDepartureAt: new Date(Date.now() + 3_600_000).toISOString(),
      truckNo: "E2E-TRUCK",
    },
    headers,
  });
  await expectStatus(created, 201);
  const body = (await created.json()) as { id: string };
  const started = await request.patch(`/api/load-jobs/${body.id}`, {
    data: {
      reason: "UNLOAD-PALLET-10 starts load job",
      startedAt: new Date().toISOString(),
      status: "IN_PROGRESS",
    },
    headers,
  });
  await expectStatus(started, 200);
  return body;
}

async function downloadGeneratedFile(
  page: Page,
  containerId: string,
  fileId: string,
  outputPath: string,
): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page
    .locator(`a[href="/containers/${containerId}/files/${fileId}/download"]`)
    .first()
    .click();
  const download = await downloadPromise;
  await download.saveAs(outputPath);
  return outputPath;
}

async function inspectExcelReport(filePath: string): Promise<{
  palletTotal: number;
  palletizingStandardsRuns: number;
  sheetCount: number;
}> {
  const { stdout } = await execFileAsync("python3", [
    "-c",
    [
      "from xml.etree import ElementTree as ET",
      "from zipfile import ZipFile",
      "import json, re, sys",
      "ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}",
      "total = 0",
      "runs = 0",
      "with ZipFile(sys.argv[1]) as archive:",
      "    sheets = sorted(name for name in archive.namelist() if re.fullmatch(r'xl/worksheets/sheet[0-9]+\\.xml', name))",
      "    for index, name in enumerate(sheets):",
      "        root = ET.fromstring(archive.read(name))",
      "        for cell in root.findall('.//m:c', ns):",
      "            ref = cell.attrib.get('r', '')",
      "            if re.fullmatch(r'O(?:[4-9]|1[0-9])', ref):",
      "                value = cell.find('m:v', ns)",
      "                if value is not None and value.text:",
      "                    total += int(float(value.text))",
      "            if index == 0 and ref == 'C21':",
      "                runs = len(cell.findall('.//m:r', ns))",
      "print(json.dumps({'palletTotal': total, 'palletizingStandardsRuns': runs, 'sheetCount': len(sheets)}))",
    ].join("\n"),
    filePath,
  ]);
  return JSON.parse(stdout) as {
    palletTotal: number;
    palletizingStandardsRuns: number;
    sheetCount: number;
  };
}

async function inspectLabelPdf(filePath: string): Promise<{
  heightPoints: number;
  pageCount: number;
  widthPoints: number;
}> {
  const text = (await readFile(filePath)).toString("latin1");
  const mediaBox = text.match(
    /\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/,
  );
  if (!mediaBox) {
    throw new Error("Generated label PDF does not contain a MediaBox.");
  }
  return {
    heightPoints: Number(mediaBox[2]),
    pageCount: [...text.matchAll(/\/Type\s*\/Page\b/g)].length,
    widthPoints: Number(mediaBox[1]),
  };
}

async function restoreDefaultSettings(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<PalletPolicy> {
  const response = await request.patch("/api/settings/operational", {
    data: { values: DEFAULT_SETTINGS },
    headers,
  });
  await expectStatus(response, 200);
  const body = (await response.json()) as { palletPolicy: PalletPolicy };
  return body.palletPolicy;
}

async function palletPolicy(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<PalletPolicy> {
  return getJson<PalletPolicy>(request, "/api/settings/pallet-policy", headers);
}

async function containerDetail(
  request: APIRequestContext,
  headers: Record<string, string>,
  containerId: string,
): Promise<ContainerDetail> {
  return getJson<ContainerDetail>(request, `/api/containers/${containerId}`, headers);
}

async function generatedFiles(
  request: APIRequestContext,
  headers: Record<string, string>,
  containerId: string,
): Promise<GeneratedFile[]> {
  const body = await getJson<{ items: GeneratedFile[] }>(
    request,
    `/api/containers/${containerId}/files`,
    headers,
  );
  return body.items;
}

async function pallets(
  request: APIRequestContext,
  headers: Record<string, string>,
  containerId: string,
): Promise<Pallet[]> {
  const body = await getJson<{ items: Pallet[] }>(
    request,
    `/api/pallets?containerId=${containerId}`,
    headers,
  );
  return body.items;
}

async function loadedPallets(
  request: APIRequestContext,
  headers: Record<string, string>,
  loadJobId: string,
): Promise<Pallet[]> {
  const body = await getJson<{ items: Pallet[] }>(
    request,
    `/api/load-jobs/${loadJobId}/loaded-pallets`,
    headers,
  );
  return body.items;
}

async function operationalSetting(
  request: APIRequestContext,
  headers: Record<string, string>,
  key: string,
): Promise<OperationalSetting> {
  const body = await getJson<{ fields: OperationalSetting[] }>(
    request,
    "/api/settings/operational",
    headers,
  );
  const field = body.fields.find((item) => item.key === key);
  if (!field) {
    throw new Error(`Operational setting ${key} was not found.`);
  }
  return field;
}

async function expectOperationalSetting(
  request: APIRequestContext,
  headers: Record<string, string>,
  key: string,
  value: string,
): Promise<void> {
  expect(await operationalSetting(request, headers, key)).toMatchObject({ value });
}

async function inventoryForContainer(
  request: APIRequestContext,
  headers: Record<string, string>,
  containerNo: string,
): Promise<InventorySummary> {
  const body = await getJson<{ items: InventorySummary[] }>(
    request,
    `/api/reports/container-summary?containerNo=${containerNo}`,
    headers,
  );
  expect(body.items).toHaveLength(1);
  return body.items[0]!;
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

async function expectStatus(response: APIResponse, expected: number): Promise<void> {
  if (response.status() !== expected) {
    throw new Error(
      `Expected ${expected} from ${response.url()}, got ${response.status()}: ${await response.text()}`,
    );
  }
}

async function setBrowserPreference(
  page: Page,
  locale: "en" | "zh-CN",
  theme: "dark" | "light",
): Promise<void> {
  await page.context().addCookies([
    browserCookie("bestar_locale", locale),
    browserCookie("bestar_theme", theme),
  ]);
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

function destination(container: ContainerDetail, code: string): Destination {
  const item = container.destinations.find((candidate) => candidate.destinationCode === code);
  if (!item) {
    throw new Error(`Destination ${code} was not found.`);
  }
  return item;
}

function snapshot(item: Destination): Record<string, unknown> {
  if (!item.palletPolicySnapshot || typeof item.palletPolicySnapshot !== "object") {
    throw new Error(`Destination ${item.destinationCode} has no policy snapshot.`);
  }
  return item.palletPolicySnapshot as Record<string, unknown>;
}

function totalFinalPallets(container: ContainerDetail): number {
  return container.destinations.reduce((total, item) => total + item.finalPallets, 0);
}

function assertUniquePalletIdentity(items: Pallet[]): void {
  expect(new Set(items.map((item) => item.palletId)).size).toBe(items.length);
  expect(new Set(items.map((item) => item.qrPayload)).size).toBe(items.length);
  for (const item of items) {
    expect(item.qrPayload).toContain(`|${item.palletId}`);
  }
}

function currentFile(items: GeneratedFile[], fileType: string): GeneratedFile {
  const item = items.find((candidate) => candidate.fileType === fileType);
  if (!item) {
    throw new Error(`Generated ${fileType} was not found.`);
  }
  return item;
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function mmPoints(value: number): number {
  return value * (72 / 25.4);
}

function lastPathSegment(url: string): string {
  const value = new URL(url).pathname.split("/").filter(Boolean).pop();
  if (!value) {
    throw new Error(`Could not read id from ${url}`);
  }
  return value;
}
