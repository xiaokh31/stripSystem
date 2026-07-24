import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { authHeaders, configureBrowserActor, E2E_BASE_URL, loginThroughApi } from "./helpers";

const OUTPUT_DIR = "test-results/parser-profile-06";

test("staged review stays bilingual and responsive while accept, correct, and reject remain explicit", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  const token = await loginThroughApi(page, request);
  const meResponse = await request.get("/api/auth/me", {
    headers: authHeaders(token),
  });
  expect(meResponse.status()).toBe(200);
  const actor = (await meResponse.json()) as { id: string };
  const fixture = seedReviewFixture(actor.id);
  const browserErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(
        `${response.status()} ${new URL(response.url()).pathname}`,
      );
    }
  });

  try {
    await setPresentation(page.context(), "en", "light");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/imports/${fixture.acceptImportId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(
      page.getByRole("heading", { name: "Review-required parse" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Profile review" }),
    ).toBeVisible();
    await expect(
      page.getByText("PARSER-PROFILE-06 browser fixture · version 1", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "The matched approved profile requires an office review before its result becomes official.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Required anchor matched", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("PARSER_PROFILE_REVIEW_REQUIRED", { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByText("Awaiting review", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("1/3", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Required structural anchor matched"),
    ).toBeVisible();
    await expect(page.getByText("YEG1", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Volume is zero while cartons are present."),
    ).toBeVisible();
    await expect(page.getByText("/workspace/storage/private.xlsx")).toHaveCount(
      0,
    );
    await assertReviewGeometry(page);
    await page.screenshot({
      fullPage: true,
      path: `${OUTPUT_DIR}/review-en-light-1440x1000.png`,
    });

    await setPresentation(page.context(), "zh-CN", "dark");
    await page.setViewportSize({ width: 412, height: 915 });
    const zhResponse = await page.reload({ waitUntil: "networkidle" });
    const zhSsrHtml = await zhResponse?.text();
    expect(zhSsrHtml).toContain("待复核解析");
    expect(zhSsrHtml).not.toContain("Review-required parse");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("heading", { name: "待复核解析" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "模板复核" })).toBeVisible();
    await expect(page.getByText("Profile review")).toHaveCount(0);
    await expect(page.getByText("等待复核", { exact: true })).toBeVisible();
    await expect(page.getByText("Review-required parse")).toHaveCount(0);
    await assertReviewGeometry(page);
    await page.screenshot({
      fullPage: true,
      path: `${OUTPUT_DIR}/review-zh-dark-412x915.png`,
    });

    await captureRealBrowserZoom(
      token,
      fixture.acceptImportId,
      testInfo.outputPath("browser-zoom-review"),
    );

    await setPresentation(page.context(), "en", "light");
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.reload({ waitUntil: "networkidle" });

    await page
      .getByRole("button", { name: "Accept without parser changes" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Accept this staged parse?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(
      page.getByText("Accepted without changes", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("2/3", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open accepted container" }),
    ).toBeVisible();

    await page.goto(`/imports/${fixture.correctImportId}`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "Correct parser fields" }).click();
    await expect(
      page.getByRole("button", { name: "Add corrected row" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove corrected source row 7" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Delivery / grouping" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Reference" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "PO number" }),
    ).toBeVisible();
    await page.locator('input[value="YEG1"]').fill("YYC4");
    await page
      .getByRole("button", { name: "Review and submit correction" })
      .click();
    await expect(
      page.getByText(/material changes reset the streak to 0\/3/i),
    ).toBeVisible();
    await page
      .locator("#parser-review-reason")
      .fill("Source row belongs to YYC4");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(
      page.getByText("Corrected and accepted", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("0/3", { exact: true })).toBeVisible();
    await expect(page.getByText("Destination · Source row 7")).toBeVisible();

    await page.goto(`/imports/${fixture.rejectImportId}`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "Reject profile match" }).click();
    await page
      .locator("#parser-review-reason")
      .fill("Workbook layout does not match");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(
      page.getByText("Profile match rejected", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("0/3", { exact: true })).toBeVisible();

    const profileResponse = await page.goto(
      `/parser-profiles/${fixture.profileVersionId}`,
      { waitUntil: "networkidle" },
    );
    const profileSsrHtml = await profileResponse?.text();
    expect(profileSsrHtml).toContain("Trust evidence timeline");
    expect(profileSsrHtml).not.toContain("信任证据时间线");
    await expect(
      page.getByRole("heading", { name: "Trust evidence timeline" }),
    ).toBeVisible();
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Material correction", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    for (const shortSha of fixture.shortShas) {
      await expect(page.getByText(shortSha, { exact: true })).toBeVisible();
    }
    await page.screenshot({
      fullPage: true,
      path: `${OUTPUT_DIR}/profile-evidence-timeline-en-light.png`,
    });

    await setPresentation(page.context(), "zh-CN", "dark");
    const zhTimelineResponse = await page.reload({ waitUntil: "networkidle" });
    const zhTimelineSsrHtml = await zhTimelineResponse?.text();
    expect(zhTimelineSsrHtml).toContain("信任证据时间线");
    expect(zhTimelineSsrHtml).not.toContain("Trust evidence timeline");
    await expect(
      page.getByRole("heading", { name: "信任证据时间线" }),
    ).toBeVisible();

    expect(browserErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
  } finally {
    cleanupReviewFixture(
      fixture.profileVersionId,
      fixture.familyId,
      fixture.importIds,
    );
  }
});

async function setPresentation(
  context: BrowserContext,
  locale: "en" | "zh-CN",
  theme: "dark" | "light",
) {
  await context.addCookies([
    {
      name: "bestar_locale",
      sameSite: "Lax",
      url: E2E_BASE_URL,
      value: locale,
    },
    { name: "bestar_theme", sameSite: "Lax", url: E2E_BASE_URL, value: theme },
  ]);
}

async function assertReviewGeometry(page: Page) {
  const geometry = await page
    .locator('[data-parser-profile-review="true"]')
    .evaluate((panel) => ({
      clippedActions: [...panel.querySelectorAll<HTMLElement>("button, a")]
        .filter((element) => element.offsetParent !== null)
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1,
        )
        .map((element) => element.textContent?.trim()),
      panelRight: Math.round(panel.getBoundingClientRect().right),
      viewportWidth: document.documentElement.clientWidth,
    }));
  expect(geometry.clippedActions).toEqual([]);
  expect(geometry.panelRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  const selectionGeometry = await page
    .locator('[data-parser-selection="true"]')
    .evaluate((panel) => ({
      clippedContent: [
        ...panel.querySelectorAll<HTMLElement>("a, dd, li, span"),
      ]
        .filter((element) => element.offsetParent !== null)
        .filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.getBoundingClientRect().right >
              document.documentElement.clientWidth + 1,
        )
        .map((element) => element.textContent?.trim()),
      panelRight: Math.round(panel.getBoundingClientRect().right),
      viewportWidth: document.documentElement.clientWidth,
    }));
  expect(selectionGeometry.clippedContent).toEqual([]);
  expect(selectionGeometry.panelRight).toBeLessThanOrEqual(
    selectionGeometry.viewportWidth + 1,
  );
}

async function captureRealBrowserZoom(
  token: string,
  importId: string,
  userDataDir: string,
) {
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
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await configureBrowserActor(context, token);
    await context.addCookies([
      {
        name: "bestar_locale",
        sameSite: "Lax",
        url: new URL(E2E_BASE_URL).origin,
        value: "en",
      },
      {
        name: "bestar_theme",
        sameSite: "Lax",
        url: new URL(E2E_BASE_URL).origin,
        value: "light",
      },
    ]);
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    await zoomPage.goto(`/imports/${importId}`, { waitUntil: "networkidle" });
    await setRealBrowserZoom(zoomPage, worker, 2, 1366);
    await expect(
      zoomPage.getByRole("heading", { name: "Review-required parse" }),
    ).toBeVisible();
    await expect(
      zoomPage.getByRole("button", { name: "Accept without parser changes" }),
    ).toBeVisible();
    const dimensions = await zoomPage.evaluate(() => {
      window.scrollTo(10_000, window.scrollY);
      const maxPageScrollX = window.scrollX;
      window.scrollTo(0, window.scrollY);
      const panel = document.querySelector<HTMLElement>(
        '[data-parser-profile-review="true"]',
      );
      return {
        innerWidth: window.innerWidth,
        maxPageScrollX,
        panelRight: panel
          ? Math.round(panel.getBoundingClientRect().right)
          : null,
      };
    });
    expect(dimensions.innerWidth).toBe(683);
    expect(dimensions.maxPageScrollX).toBe(0);
    expect(dimensions.panelRight ?? 0).toBeLessThanOrEqual(
      dimensions.innerWidth + 1,
    );
    await zoomPage.screenshot({
      fullPage: true,
      path: path.resolve(
        OUTPUT_DIR,
        "review-en-light-1366x768-real-browser-zoom-200.png",
      ),
    });
    await zoomPage
      .getByRole("button", { name: "Reject profile match" })
      .click();
    const dialog = zoomPage.getByRole("dialog");
    await dialog
      .locator("#parser-review-reason")
      .fill(
        "The structural fingerprint matched, but the customer supplied an unusually long destination and reference convention that must be reviewed before this layout can be accepted as evidence.",
      );
    const dialogGeometry = await dialog.evaluate((element) => ({
      clientWidth: document.documentElement.clientWidth,
      dialogRight: Math.round(element.getBoundingClientRect().right),
      overflowingControls: [
        ...element.querySelectorAll<HTMLElement>("button, textarea"),
      ]
        .filter(
          (control) =>
            control.getBoundingClientRect().right >
            document.documentElement.clientWidth + 1,
        )
        .map((control) => control.tagName),
    }));
    expect(dialogGeometry.dialogRight).toBeLessThanOrEqual(
      dialogGeometry.clientWidth + 1,
    );
    expect(dialogGeometry.overflowingControls).toEqual([]);
    await zoomPage.evaluate(() => window.scrollTo(0, 0));
    await expect(dialog).toBeVisible();
    await captureBrowserViewport(
      zoomPage,
      path.resolve(
        OUTPUT_DIR,
        "review-reject-dialog-long-reason-real-browser-zoom-200.png",
      ),
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await setRealBrowserZoom(zoomPage, worker, 1, 1366);
  } finally {
    await context.close();
  }
}

async function setRealBrowserZoom(
  page: Page,
  worker: Worker,
  factor: number,
  physicalWidth: number,
) {
  const pageUrl = new URL(page.url()).href;
  await worker.evaluate(
    async ({ factor: targetFactor, url }) => {
      type TabsApi = {
        getZoom(tabId: number): Promise<number>;
        query(queryInfo: object): Promise<Array<{ id?: number; url?: string }>>;
        setZoom(tabId: number, factor: number): Promise<void>;
      };
      const tabsApi = (globalThis as unknown as { chrome: { tabs: TabsApi } })
        .chrome.tabs;
      const tabId = (await tabsApi.query({})).find(
        (tab) => tab.url === url,
      )?.id;
      if (tabId === undefined)
        throw new Error(`No browser tab found for ${url}`);
      await tabsApi.setZoom(tabId, targetFactor);
      const applied = await tabsApi.getZoom(tabId);
      if (Math.abs(applied - targetFactor) > 0.001) {
        throw new Error(
          `Expected browser zoom ${targetFactor}, received ${applied}`,
        );
      }
    },
    { factor, url: pageUrl },
  );
  await expect
    .poll(() => page.evaluate(() => window.innerWidth))
    .toBe(Math.round(physicalWidth / factor));
}

async function captureBrowserViewport(page: Page, screenshotPath: string) {
  const session = await page.context().newCDPSession(page);
  try {
    const screenshot = await session.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  } finally {
    await session.detach();
  }
}

interface ReviewFixture {
  acceptImportId: string;
  correctImportId: string;
  familyId: string;
  importIds: string[];
  profileVersionId: string;
  rejectImportId: string;
  shortShas: string[];
}

function seedReviewFixture(actorId: string): ReviewFixture {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const familyId = `pp06-web-family-${suffix}`;
  const profileVersionId = `pp06-web-profile-${suffix}`;
  const imports = ["accept", "correct", "reject"].map((decision, index) => ({
    containerNo: `PW${String.fromCharCode(65 + index)}A123456${index + 1}`,
    decision,
    id: `pp06-web-import-${decision}-${suffix}`,
    reviewId: `pp06-web-review-${decision}-${suffix}`,
    sha: createHash("sha256").update(`${decision}-${suffix}`).digest("hex"),
  }));
  const policy = {
    policyVersion: "pallet-footprint-v1",
    settingsRevision: `pp06-web-${suffix}`,
    palletLengthM: "1.0",
    palletWidthM: "1.2",
    lowHeightM: "1.7",
    otherHeightM: "2.2",
    lowHeightCapacityCbm: "2.04",
    otherDestinationCapacityCbm: "2.64",
    yeg1ExtraPallets: 4,
    lowHeightDestinationCodes: ["YYC4", "YYC6", "YEG1", "YEG2"],
    otherDestinationAliases: ["YVR2", "UPS", "PUROLATOR", "PRIVATE"],
    destinationAliasVersion: "destination-aliases-v1",
  };
  const rows = imports.map((item, index) => {
    const line = {
      rowNumber: 7,
      included: true,
      destinationCode: "YEG1",
      cartons: 10 + index,
      volumeCbm: "0.000",
      packageType: "CARTON",
      deliveryMethod: null,
      waybillNo: `PP06-WAYBILL-${index + 1}`,
      referenceNo: null,
      poNumber: null,
    };
    const staged = {
      containerNo: item.containerNo,
      company: "PARSER-PROFILE-06 browser fixture",
      formatType: "UNLOADING_PLAN_CN",
      parserVersion: "parser-profile-engine-v1",
      lines: [line],
      palletPolicy: policy,
      pinned: {
        importFileSha256: item.sha,
        profileVersionId,
        fingerprintHash: `fingerprint-${suffix}`,
      },
    };
    const destinations = [
      {
        destinationCode: "YEG1",
        destinationType: null,
        packageType: "CARTON",
        cartons: 10 + index,
        volumeCbm: "0.000",
        calculatedPallets: 4,
        finalPallets: 4,
        palletRuleCode: "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7",
        calculationBasisCbm: "2.04",
        roundingMode: "CEIL_PLUS_FIXED_EXTRA",
        palletPolicySnapshot: policy,
        warnings: [{ code: "ZERO_VOLUME_WITH_CARTONS" }],
      },
    ];
    return `
INSERT INTO import_files (
  id, original_filename, stored_path, file_sha256, mime_type, file_size_bytes,
  format, import_status, parse_status, parser_version, warning_count,
  error_count, raw_metadata, imported_by_id, created_at, updated_at
) VALUES (
  ${sql(item.id)}, ${sql(`pp06-${item.decision}.xlsx`)},
  ${sql(`/workspace/storage/private-${item.decision}.xlsx`)}, ${sql(item.sha)},
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024,
  'UNLOADING_PLAN_CN', 'UPLOADED', 'REVIEW_REQUIRED',
  'parser-profile-engine-v1', 1, 0, ${json({
    parseSelection: {
      contractVersion: "parser-selection-v1",
      source: "PROFILE_REVIEW",
      reasonCode: "PARSER_PROFILE_REVIEW_REQUIRED",
      outcome: "REVIEW_REQUIRED",
      candidateCount: 1,
      durationMs: 118,
      autoCommitted: false,
      profile: {
        id: profileVersionId,
        familyId,
        stableName: `pp06-web-${suffix}`,
        customerLabel: "PARSER-PROFILE-06 browser fixture",
        version: 1,
        lifecycle: "ACTIVE",
        trustState: "REVIEW_REQUIRED",
      },
      fingerprintHash: `fingerprint-${suffix}`,
      matchReasons: [
        {
          code: "FINGERPRINT_ANCHOR_MATCHED",
          matched: true,
          params: { cell: "A6" },
        },
      ],
      matcherVersion: "workbook-fingerprint-v1",
      mappingVersion: "parser-profile-mapping-v1",
      workerVersion: "parser-profile-engine-v1",
      parserVersion: "parser-profile-engine-v1",
      blockingWarningCodes: [],
    },
  })}, ${sql(actorId)}, NOW(), NOW()
);
INSERT INTO parser_profile_reviews (
  id, import_file_id, profile_version_id, source_file_sha256, status, revision,
  fingerprint_hash, matcher_version, mapping_version, worker_version,
  parser_version, match_evidence, source_preview, staged_result,
  destination_summary, report_preview, warnings, errors, provenance,
  created_at, updated_at
) VALUES (
  ${sql(item.reviewId)}, ${sql(item.id)}, ${sql(profileVersionId)}, ${sql(item.sha)},
  'PENDING', 0, ${sql(`fingerprint-${suffix}`)}, 'workbook-fingerprint-v1',
  'parser-profile-mapping-v1', 'parser-profile-engine-v1',
  'parser-profile-engine-v1',
  ${json({ reasons: [{ code: "FINGERPRINT_ANCHOR_MATCHED", matched: true, params: { cell: "A6" } }] })},
  ${json({
    sheets: [
      {
        name: "PP06Review",
        index: 0,
        maxRow: 7,
        maxColumn: 6,
        sampleCells: [
          { cell: "A6", row: 6, column: 1, value: "运单号" },
          { cell: "C7", row: 7, column: 3, value: "YEG1" },
        ],
      },
    ],
  })},
  ${json(staged)}, ${json(destinations)},
  ${json({ containerNo: item.containerNo, destinationCount: 1, totalCartons: 10 + index, totalVolumeCbm: "0.000", totalPallets: 4 })},
  ${json([{ code: "ZERO_VOLUME_WITH_CARTONS" }])}, '[]'::jsonb,
  ${json({ destinationCode: { sourceCell: "C7" }, cartons: { sourceCell: "D7" }, volumeCbm: { sourceCell: "F7" } })},
  NOW(), NOW()
);`;
  });
  runSql(`
BEGIN;
INSERT INTO parser_profile_families (
  id, stable_name, customer_label, created_by_id, created_at, updated_at
) VALUES (
  ${sql(familyId)}, ${sql(`pp06-web-${suffix}`)},
  'PARSER-PROFILE-06 browser fixture', ${sql(actorId)}, NOW(), NOW()
);
INSERT INTO parser_profile_versions (
  id, family_id, version, lifecycle, trust_state, mapping_definition,
  fingerprint_definition, matcher_version, mapping_version, created_by_id,
  approved_by_id, approved_at, approval_reason, lifecycle_reason,
  lifecycle_revision, trust_streak, created_at, updated_at
) VALUES (
  ${sql(profileVersionId)}, ${sql(familyId)}, 1, 'ACTIVE', 'REVIEW_REQUIRED',
  '{}'::jsonb, '{}'::jsonb, 'workbook-fingerprint-v1',
  'parser-profile-mapping-v1', ${sql(actorId)}, ${sql(actorId)}, NOW(),
  'PARSER-PROFILE-06 browser fixture', 'PARSER-PROFILE-06 browser fixture',
  0, 1, NOW(), NOW()
);
${rows.join("\n")}
COMMIT;
`);
  return {
    acceptImportId: imports[0].id,
    correctImportId: imports[1].id,
    familyId,
    importIds: imports.map((item) => item.id),
    profileVersionId,
    rejectImportId: imports[2].id,
    shortShas: imports.map((item) => item.sha.slice(0, 12)),
  };
}

function cleanupReviewFixture(
  profileVersionId: string,
  familyId: string,
  importIds: string[],
) {
  runSql(`
BEGIN;
DELETE FROM parser_profile_audit_events WHERE profile_version_id = ${sql(profileVersionId)};
DELETE FROM parser_profile_evidence WHERE profile_version_id = ${sql(profileVersionId)};
DELETE FROM parser_profile_reviews WHERE profile_version_id = ${sql(profileVersionId)};
DELETE FROM container_lines WHERE container_id IN (
  SELECT id FROM containers WHERE parser_profile_version_id = ${sql(profileVersionId)}
);
DELETE FROM container_destinations WHERE container_id IN (
  SELECT id FROM containers WHERE parser_profile_version_id = ${sql(profileVersionId)}
);
DELETE FROM containers WHERE parser_profile_version_id = ${sql(profileVersionId)};
DELETE FROM import_files WHERE id IN (${importIds.map(sql).join(", ")});
DELETE FROM parser_profile_versions WHERE id = ${sql(profileVersionId)};
DELETE FROM parser_profile_families WHERE id = ${sql(familyId)};
COMMIT;
`);
}

function runSql(input: string) {
  const result = spawnSync(
    "psql",
    [
      "-h",
      requiredEnv("POSTGRES_HOST"),
      "-U",
      requiredEnv("POSTGRES_USER"),
      "-d",
      requiredEnv("POSTGRES_DB"),
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: requiredEnv("POSTGRES_PASSWORD") },
      input,
    },
  );
  expect(result.status, result.stderr).toBe(0);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for parser review E2E.`);
  return value;
}

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function json(value: unknown): string {
  return `${sql(JSON.stringify(value))}::jsonb`;
}
