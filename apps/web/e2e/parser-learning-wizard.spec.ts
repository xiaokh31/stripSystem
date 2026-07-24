import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  chromium,
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Worker,
} from "@playwright/test";
import {
  authHeaders,
  configureBrowserActor,
  E2E_BASE_URL,
  ensureTestUser,
  loginForAccessToken,
  loginThroughApi,
  loginWithCredentials,
  type E2ETestUser,
} from "./helpers";
import {
  createDerivedUnsupportedWorkbook,
  uniquePolicyContainerNo,
} from "./real-workbook-fixture";

const OUTPUT_DIR = "test-results/parser-profile-04";
const GOVERNANCE_OUTPUT_DIR = "test-results/parser-profile-05";
const SYNTHETIC_PASSWORD = "Bestar-E2E-Parser-Learning-123!";
const actorInputs = {
  office: {
    email: "e2e-parser-learning-office@bestarcca.com",
    name: "E2E Parser Learning Office",
    password: SYNTHETIC_PASSWORD,
    roleCodes: ["OFFICE"],
  },
  warehouse: {
    email: "e2e-parser-learning-warehouse@bestarcca.com",
    name: "E2E Parser Learning Warehouse",
    password: SYNTHETIC_PASSWORD,
    roleCodes: ["WAREHOUSE"],
  },
  hrManager: {
    email: "e2e-parser-learning-hr@bestarcca.com",
    name: "E2E Parser Learning HR Manager",
    password: SYNTHETIC_PASSWORD,
    roleCodes: ["HR_MANAGER"],
  },
} as const;

test("real failed import can be mapped, resumed, linked, replayed, and submitted as a draft", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(1_800_000);
  page.setDefaultTimeout(15_000);
  await mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  await mkdir(path.resolve(GOVERNANCE_OUTPUT_DIR), { recursive: true });
  const browserErrors: string[] = [];
  const expectedConflictConsole: string[] = [];
  const serverErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Failed to load resource:.*409 \(Conflict\)/i.test(message.text())
    ) {
      expectedConflictConsole.push(message.text());
      return;
    }
    if (
      message.type() === "error" ||
      /hydration|did not match|missing translation|server rendered html/i.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  const containerNo = uniquePolicyContainerNo();
  try {
    const adminToken = await loginThroughApi(page, request);
    const actors = await prepareActors(request, adminToken);
    const workbookPath = await createDerivedUnsupportedWorkbook(
      testInfo,
      containerNo,
    );
    const importId = await createFailedImport(
      request,
      adminToken,
      workbookPath,
    );

  await assertMutationRbac(request, importId, actors);
  await setPresentation(page, "en", "light");
  await page.goto(`/imports/${importId}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Build parser template" })).toBeVisible();

  const officeToken = await loginWithCredentials(page, request, actors.office);
  const inspectResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/parser-learning-cases/") &&
      response.url().endsWith("/inspect") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Build parser template" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/imports/${importId}/parser-learning$`),
  );
  const inspectResponse = await inspectResponsePromise;
  expect(inspectResponse.status()).toBe(201);
  const inspection = (await inspectResponse.json()) as {
    caseId: string;
    inspection: { limits: Record<string, number>; sheets: unknown[] };
    source: Record<string, unknown>;
  };
  expect(inspection.source).not.toHaveProperty("storedPath");
  expect(inspection.inspection.sheets.length).toBeGreaterThan(0);
  expect(inspection.inspection.limits).toBeTruthy();
  const caseId = inspection.caseId;

  await expect(page.getByRole("heading", { name: "Build a parser template" })).toBeVisible();
  await configureFirstRowMapping(page);
  const destinationTransform = page.getByRole("combobox", {
    name: "Destination — Value handling",
  });
  await destinationTransform.selectOption("lookup");
  await page.getByRole("button", { name: "Run result preview" }).click();
  const lookupSource = page.getByRole("textbox", { name: "Source value" }).first();
  await expect(lookupSource).toBeFocused();
  await expect(lookupSource).toHaveAttribute("aria-invalid", "true");
  await expect(lookupSource).toHaveAttribute(
    "aria-describedby",
    "transform-destinationCode-error",
  );
  await expect(page.locator("#transform-destinationCode-error")).toBeVisible();
  await destinationTransform.selectOption("trim");
  const locateSource = page
    .locator('section[aria-labelledby="mapping-heading"]')
    .getByRole("button", { name: /Locate source/ })
    .first();
  await expect(locateSource).toBeVisible();
  await locateSource.click();
  await expect(
    page.locator(
      'section[aria-labelledby="structure-heading"] button[id^="source-"][aria-pressed="true"]',
    ),
  ).toBeVisible();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const initialCase = await getJson<LearningCase>(
    request,
    `/api/parser-learning-cases/${caseId}`,
    authHeaders(await loginForAccessToken(request, actors.office)),
  );
  expect(initialCase.draftRevision).toBeGreaterThan(0);
  expect(initialCase.draftDefinition).not.toHaveProperty("storedPath");

  await createRevisionConflict(request, actors.office, initialCase);
  const skipSummary = page.getByRole("checkbox", {
    name: "Skip summary-style rows",
  });
  await skipSummary.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("A newer draft revision is already saved.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText(
      "Reload this page to review the newer draft, then reapply any unsaved changes.",
    ),
  ).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await expect(page.locator("#data-end-row")).toHaveValue("3");
  const stalePreview = await delayNextResponse(
    page,
    (url) => url.endsWith("/preview"),
  );
  await page.getByRole("button", { name: "Run result preview" }).click();
  await stalePreview.intercepted;
  await page
    .getByRole("checkbox", { name: "Skip summary-style rows" })
    .check();
  await expect(
    page.getByText(
      "Save a complete mapping, then run a bounded result preview.",
    ),
  ).toBeVisible();
  stalePreview.release();
  await expect(
    page.getByText(
      "Save a complete mapping, then run a bounded result preview.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Run result preview" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("1 canonical row(s)")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByRole("cell", { name: "YEG1", exact: true }).first()).toBeVisible();
  const previewRegion = page.locator(
    'section[aria-labelledby="preview-heading"]',
  );
  await expect(previewRegion.getByText("CARTON", { exact: true })).toHaveCount(0);
  await expect(previewRegion.getByText("carton", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Create linked manual report" }).click();
  await expect(page).toHaveURL(/\/containers\/new\?learningCaseId=/);
  await expect(page.getByText(`Source import: ${importId}`)).toBeVisible();
  await fillManualReport(page, containerNo);
  await page.getByRole("button", { name: "Create manual report" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/containers\/(?!new)[^/?#]+$/, {
    timeout: 30_000,
  });

  await page.goBack({ waitUntil: "networkidle" });
  await page.goBack({ waitUntil: "networkidle" });
  if (!page.url().endsWith(`/imports/${importId}/parser-learning`)) {
    await expect(page).toHaveURL(new RegExp(`/imports/${importId}$`));
    await page.getByRole("button", { name: "Build parser template" }).click();
  }
  await expect(page).toHaveURL(
    new RegExp(`/imports/${importId}/parser-learning$`),
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Open linked manual report" })).toBeVisible();
  await expect(
    page
      .locator('section[aria-labelledby="manual-heading"]')
      .getByText(containerNo, { exact: true }),
  ).toBeVisible();
  const resumedCase = await getJson<LearningCase & { linkedContainer: { id: string } }>(
    request,
    `/api/parser-learning-cases/${caseId}`,
    authHeaders(await loginForAccessToken(request, actors.office)),
  );
  expect(resumedCase.id).toBe(caseId);
  expect(resumedCase.linkedContainer.id).toBeTruthy();

  const staleReplay = await delayNextResponse(
    page,
    (url) => /\/replays\/[^/]+\/download$/.test(url),
  );
  await page.getByRole("button", { name: "Compare with manual result" }).click();
  await staleReplay.intercepted;
  await page
    .getByRole("checkbox", { name: "Skip summary-style rows" })
    .uncheck();
  await expect(
    page.getByText(
      "Link a manual result and save the mapping before comparing results.",
    ),
  ).toBeVisible();
  staleReplay.release();
  await expect(
    page.getByText(
      "Link a manual result and save the mapping before comparing results.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Compare with manual result" }).click();
  await expect(
    page.getByText("The mapped result matches the available manual evidence."),
  ).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/0 material difference\(s\)/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Manual result" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Mapped result" })).toBeVisible();
  const replayRegion = page.locator(
    'section[aria-labelledby="reconcile-heading"]',
  );
  await expect(replayRegion.getByText("CARTON", { exact: true })).toHaveCount(0);
  await expect(replayRegion.getByText("carton", { exact: true })).toHaveCount(2);
  await page.locator("#parser-profile-name").fill(`layout-${containerNo}`);
  await page.locator("#parser-customer-label").fill("Unsupported warehouse split");
  await page.getByRole("button", { name: "Submit draft candidate" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Draft candidate submitted" })).toBeVisible();
  await expect(
    page.getByText(
      "The draft is awaiting unloading completion evidence. It is not approved or trusted.",
    ),
  ).toBeVisible();

  const submittedCase = await getJson<
    LearningCase & {
      latestProfileVersion: { id: string };
      linkedContainer: { id: string };
    }
  >(
    request,
    `/api/parser-learning-cases/${caseId}`,
    authHeaders(await loginForAccessToken(request, actors.office)),
  );
  const profileId = submittedCase.latestProfileVersion.id;
  const completionResponse = await request.patch(
    `/api/containers/${submittedCase.linkedContainer.id}`,
    {
      data: {
        reason: "E2E unloading completion evidence",
        status: "UNLOADED",
      },
      headers: authHeaders(await loginForAccessToken(request, actors.office)),
    },
  );
  expect(completionResponse.status()).toBe(200);
  const completionBody = (await completionResponse.json()) as {
    container: { status: string };
    parserLearning: {
      replayJobId: string;
      snapshotCreated: boolean;
      warningCodes: string[];
    };
  };
  expect(completionBody).toMatchObject({
    container: { status: "UNLOADED" },
    parserLearning: { snapshotCreated: true, warningCodes: [] },
  });
  await waitForReplayJob(
    request,
    actors.office,
    caseId,
    completionBody.parserLearning.replayJobId,
  );
  await expect
    .poll(
      async () => {
        const current = await getJson<LearningCase>(
          request,
          `/api/parser-learning-cases/${caseId}`,
          authHeaders(await loginForAccessToken(request, actors.office)),
        );
        return current.status;
      },
      { timeout: 180_000 },
    )
    .toBe("AWAITING_APPROVAL");

  const officeApproval = await request.post(
    `/api/parser-profiles/versions/${profileId}/approve`,
    {
      data: {
        expectedRevision: 0,
        reason: "OFFICE must not approve",
        replayId: "forbidden-office-replay",
      },
      headers: authHeaders(await loginForAccessToken(request, actors.office)),
    },
  );
  expect(officeApproval.status()).toBe(403);
  await setPresentation(page, "en", "light");
  await page.goto(`/parser-profiles/${profileId}/review`, {
    waitUntil: "networkidle",
  });
  await expect(page.getByRole("heading", { name: "Profile review" })).toBeVisible();
  await expect(page.getByText("Eligible for approval")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve profile" })).toHaveCount(0);

  await page.context().clearCookies();
  await loginThroughApi(page, request);
  const governanceGeometry = await captureGovernanceVisualMatrix(
    page,
    profileId,
  );
  const governanceZoomEvidence = await captureGovernanceRealBrowserZoom(
    adminToken,
    profileId,
    testInfo.outputPath("browser-zoom-governance"),
  );
  await setPresentation(page, "en", "light");
  await page.goto("/parser-profiles", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Parser profile governance" })).toBeVisible();
  await expect(
    page.getByText("Unsupported warehouse split").first(),
  ).toBeVisible();
  await page.goto(`/parser-profiles/${profileId}/review`, {
    waitUntil: "networkidle",
  });
  await performGovernanceAction(
    page,
    "Approve profile",
    "Admin reviewed immutable completion evidence",
    "Active",
    "Approve this immutable version?",
  );
  await expect(page.getByText("Review required", { exact: true })).toBeVisible();
  await expect(page.getByText("0/3", { exact: true })).toBeVisible();
  await performGovernanceAction(
    page,
    "Pause profile",
    "Pause while customer confirms layout",
    "Paused",
    "Pausing immediately excludes",
  );
  await performGovernanceAction(
    page,
    "Resume profile",
    "Customer confirmed the layout",
    "Active",
    "Enter an audit reason",
  );
  await performGovernanceAction(
    page,
    "Retire profile",
    "Customer layout permanently replaced",
    "Retired",
    "Retiring permanently excludes",
  );
  await writeFile(
    path.resolve(GOVERNANCE_OUTPUT_DIR, "browser-evidence.json"),
    `${JSON.stringify(
      {
        caseId,
        containerNo,
        governanceGeometry,
        governanceZoomEvidence,
        profileId,
      },
      null,
      2,
    )}\n`,
  );

  await page.goto("/containers/new?learningCaseId=missing-parser-case", {
    waitUntil: "networkidle",
  });
  await expect(
    page.getByRole("heading", {
      name: "The linked learning case could not be opened",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Container No. *")).toHaveCount(0);
  await page.goto(`/imports/${importId}/parser-learning`, {
    waitUntil: "networkidle",
  });

  await assertRolePages(page, request, importId, actors);
  const geometry = await captureVisualMatrix(page, request, importId, actors.office);
  const zoomEvidence = await captureRealBrowserZoom(
    officeToken,
    importId,
    testInfo.outputPath("browser-zoom-profile"),
  );
  await writeFile(
    path.resolve(OUTPUT_DIR, "browser-evidence.json"),
    `${JSON.stringify(
      {
        browserErrors,
        caseId,
        containerNo,
        geometry,
        importId,
        expectedConflictConsole,
        serverErrors,
        zoomEvidence,
      },
      null,
      2,
    )}\n`,
  );
    expect(browserErrors).toEqual([]);
    expect(expectedConflictConsole).toHaveLength(1);
    expect(serverErrors).toEqual([]);
  } finally {
    await cleanupLearningFixture(containerNo);
  }
});

async function cleanupLearningFixture(containerNo: string): Promise<void> {
  const sourceFilename = `${containerNo} unsupported warehouse split.xlsx`;
  const storagePaths = runSql(
    String.raw`
COPY (
  SELECT stored_path
  FROM import_files
  WHERE original_filename = :'source_filename'
  UNION
  SELECT generated_files.storage_path
  FROM generated_files
  JOIN parser_learning_cases
    ON parser_learning_cases.id = generated_files.parser_learning_case_id
  JOIN import_files
    ON import_files.id = parser_learning_cases.source_import_id
  WHERE import_files.original_filename = :'source_filename'
) TO STDOUT;
`,
    ["-v", `source_filename=${sourceFilename}`],
  )
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  runSql(
    String.raw`
BEGIN;
CREATE TEMP TABLE parser_exit_import_ids ON COMMIT DROP AS
  SELECT id FROM import_files WHERE original_filename = :'source_filename';
CREATE TEMP TABLE parser_exit_container_ids ON COMMIT DROP AS
  SELECT id FROM containers WHERE container_no = :'container_no';
CREATE TEMP TABLE parser_exit_case_ids ON COMMIT DROP AS
  SELECT id
  FROM parser_learning_cases
  WHERE source_import_id IN (SELECT id FROM parser_exit_import_ids)
     OR linked_container_id IN (SELECT id FROM parser_exit_container_ids);
CREATE TEMP TABLE parser_exit_version_ids ON COMMIT DROP AS
  SELECT id
  FROM parser_profile_versions
  WHERE source_learning_case_id IN (SELECT id FROM parser_exit_case_ids);
CREATE TEMP TABLE parser_exit_family_ids ON COMMIT DROP AS
  SELECT DISTINCT family_id
  FROM parser_profile_versions
  WHERE id IN (SELECT id FROM parser_exit_version_ids);
CREATE TEMP TABLE parser_exit_generated_ids ON COMMIT DROP AS
  SELECT id
  FROM generated_files
  WHERE import_file_id IN (SELECT id FROM parser_exit_import_ids)
     OR container_id IN (SELECT id FROM parser_exit_container_ids)
     OR parser_learning_case_id IN (SELECT id FROM parser_exit_case_ids);

UPDATE parser_learning_cases
SET completion_replay_job_id = NULL
WHERE id IN (SELECT id FROM parser_exit_case_ids);
DELETE FROM correction_feedback
WHERE import_file_id IN (SELECT id FROM parser_exit_import_ids)
   OR container_id IN (SELECT id FROM parser_exit_container_ids)
   OR container_line_id IN (
     SELECT id FROM container_lines
     WHERE container_id IN (SELECT id FROM parser_exit_container_ids)
   )
   OR container_destination_id IN (
     SELECT id FROM container_destinations
     WHERE container_id IN (SELECT id FROM parser_exit_container_ids)
   )
   OR generated_file_id IN (SELECT id FROM parser_exit_generated_ids);
DELETE FROM parser_profile_audit_events
WHERE import_file_id IN (SELECT id FROM parser_exit_import_ids)
   OR container_id IN (SELECT id FROM parser_exit_container_ids)
   OR learning_case_id IN (SELECT id FROM parser_exit_case_ids)
   OR profile_version_id IN (SELECT id FROM parser_exit_version_ids)
   OR profile_family_id IN (SELECT family_id FROM parser_exit_family_ids);
DELETE FROM parser_profile_evidence
WHERE import_file_id IN (SELECT id FROM parser_exit_import_ids)
   OR profile_version_id IN (SELECT id FROM parser_exit_version_ids);
DELETE FROM parser_profile_reviews
WHERE import_file_id IN (SELECT id FROM parser_exit_import_ids)
   OR profile_version_id IN (SELECT id FROM parser_exit_version_ids)
   OR accepted_container_id IN (SELECT id FROM parser_exit_container_ids);
DELETE FROM async_jobs
WHERE import_file_id IN (SELECT id FROM parser_exit_import_ids)
   OR container_id IN (SELECT id FROM parser_exit_container_ids)
   OR parser_learning_case_id IN (SELECT id FROM parser_exit_case_ids)
   OR generated_file_id IN (SELECT id FROM parser_exit_generated_ids);
DELETE FROM generated_files WHERE id IN (SELECT id FROM parser_exit_generated_ids);
DELETE FROM parser_profile_versions WHERE id IN (SELECT id FROM parser_exit_version_ids);
DELETE FROM parser_learning_cases WHERE id IN (SELECT id FROM parser_exit_case_ids);
DELETE FROM pallet_events
WHERE pallet_id IN (
  SELECT pallets.id
  FROM pallets
  JOIN container_destinations
    ON container_destinations.id = pallets.container_destination_id
  WHERE container_destinations.container_id IN (SELECT id FROM parser_exit_container_ids)
);
DELETE FROM pallets
WHERE container_destination_id IN (
  SELECT id FROM container_destinations
  WHERE container_id IN (SELECT id FROM parser_exit_container_ids)
);
DELETE FROM container_lines WHERE container_id IN (SELECT id FROM parser_exit_container_ids);
DELETE FROM container_destinations WHERE container_id IN (SELECT id FROM parser_exit_container_ids);
DELETE FROM containers WHERE id IN (SELECT id FROM parser_exit_container_ids);
DELETE FROM import_files WHERE id IN (SELECT id FROM parser_exit_import_ids);
DELETE FROM parser_profile_families
WHERE id IN (SELECT family_id FROM parser_exit_family_ids);
DO $cleanup$
BEGIN
  IF EXISTS (
    SELECT 1 FROM generated_files
    WHERE id IN (SELECT id FROM parser_exit_generated_ids)
  ) OR EXISTS (
    SELECT 1 FROM parser_profile_versions
    WHERE id IN (SELECT id FROM parser_exit_version_ids)
  ) OR EXISTS (
    SELECT 1 FROM parser_learning_cases
    WHERE id IN (SELECT id FROM parser_exit_case_ids)
  ) OR EXISTS (
    SELECT 1 FROM containers
    WHERE id IN (SELECT id FROM parser_exit_container_ids)
  ) OR EXISTS (
    SELECT 1 FROM import_files
    WHERE id IN (SELECT id FROM parser_exit_import_ids)
  ) OR EXISTS (
    SELECT 1 FROM parser_profile_families
    WHERE id IN (SELECT family_id FROM parser_exit_family_ids)
  ) THEN
    RAISE EXCEPTION 'Parser E2E fixture cleanup left database residue';
  END IF;
END
$cleanup$;
COMMIT;
`,
    [
      "-v",
      `source_filename=${sourceFilename}`,
      "-v",
      `container_no=${containerNo}`,
    ],
  );

  for (const storagePath of storagePaths) {
    const resolvedPath = path.resolve(storagePath);
    if (!resolvedPath.startsWith("/workspace/storage/")) {
      throw new Error(`Refusing to remove parser E2E path outside storage: ${resolvedPath}`);
    }
    try {
      await unlink(resolvedPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const residue = runSql(
    String.raw`
COPY (
  SELECT
    (SELECT COUNT(*) FROM import_files WHERE original_filename = :'source_filename')::text
    || '|' ||
    (SELECT COUNT(*) FROM containers WHERE container_no = :'container_no')::text
    || '|' ||
    (SELECT COUNT(*) FROM parser_profile_families
      WHERE stable_name = :'stable_name')::text
) TO STDOUT;
`,
    [
      "-v",
      `source_filename=${sourceFilename}`,
      "-v",
      `container_no=${containerNo}`,
      "-v",
      `stable_name=layout-${containerNo}`,
    ],
  );
  expect(residue.trim()).toBe("0|0|0");
}

function runSql(input: string, variables: string[]): string {
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
      ...variables,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: requiredEnv("POSTGRES_PASSWORD") },
      input,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for parser E2E cleanup.`);
  return value;
}

async function prepareActors(
  request: APIRequestContext,
  adminToken: string,
): Promise<Record<keyof typeof actorInputs, E2ETestUser>> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(actorInputs).map(async ([key, input]) => [
        key,
        await ensureTestUser(request, adminToken, {
          ...input,
          roleCodes: [...input.roleCodes],
        }),
      ]),
    ),
  ) as Record<keyof typeof actorInputs, E2ETestUser>;
}

async function delayNextResponse(
  page: Page,
  matches: (url: string) => boolean,
): Promise<{
  intercepted: Promise<void>;
  release: () => void;
}> {
  let markIntercepted!: () => void;
  let releaseResponse!: () => void;
  const intercepted = new Promise<void>((resolve) => {
    markIntercepted = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route(
    (url) => matches(url.toString()),
    async (route) => {
      const response = await route.fetch();
      markIntercepted();
      await released;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  return { intercepted, release: releaseResponse };
}

async function createFailedImport(
  request: APIRequestContext,
  token: string,
  workbookPath: string,
): Promise<string> {
  const workbook = await readFile(workbookPath);
  const upload = await request.post("/api/imports", {
    headers: authHeaders(token),
    multipart: {
      file: {
        buffer: workbook,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        name: path.basename(workbookPath),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const imported = (await upload.json()) as { id: string };
  const parse = await request.post(`/api/imports/${imported.id}/parse`, {
    headers: authHeaders(token),
  });
  expect(parse.status()).toBe(201);
  const parsed = (await parse.json()) as {
    containers: unknown[];
    importFile: { format: string; parseStatus: string };
  };
  expect(parsed.containers).toEqual([]);
  expect(parsed.importFile).toMatchObject({ format: "UNKNOWN", parseStatus: "ERROR" });
  return imported.id;
}

async function assertMutationRbac(
  request: APIRequestContext,
  importId: string,
  actors: Record<keyof typeof actorInputs, E2ETestUser>,
) {
  for (const actor of [actors.warehouse, actors.hrManager]) {
    const token = await loginForAccessToken(request, actor);
    const response = await request.post("/api/parser-learning-cases", {
      data: { importFileId: importId },
      headers: authHeaders(token),
    });
    expect(response.status()).toBe(403);
  }
}

async function configureFirstRowMapping(page: Page) {
  await page.locator("#headerRow").fill("2");
  await page.locator("#dataStartRow").fill("3");
  await page.locator("#data-end-row").fill("3");
  await page.locator("#containerCell").selectOption("A1");
  await page.locator("#field-destinationCode").selectOption({ label: "仓库" });
  await page.locator("#field-cartons").selectOption({ label: "CTNS" });
  await page.locator("#field-volumeCbm").selectOption({ label: "CURBIC" });
  const packageType = page.locator("#field-packageType");
  await packageType.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown", { delay: 25 });
  await page.keyboard.press("ArrowDown", { delay: 25 });
  await page.keyboard.press("Enter");
  await expect(packageType).toHaveValue("CITY");
  for (const field of ["destinationCode", "cartons", "volumeCbm"]) {
    const checkbox = page.locator(`#confirm-${field}`);
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
  }
}

async function createRevisionConflict(
  request: APIRequestContext,
  actor: E2ETestUser,
  learningCase: LearningCase,
) {
  const token = await loginForAccessToken(request, actor);
  const response = await request.put(
    `/api/parser-learning-cases/${learningCase.id}/draft`,
    {
      data: {
        expectedRevision: learningCase.draftRevision,
        fingerprintDefinition:
          learningCase.draftDefinition.fingerprintDefinition,
        mappingDefinition: learningCase.draftDefinition.mappingDefinition,
      },
      headers: authHeaders(token),
    },
  );
  expect(response.status()).toBe(200);
}

async function fillManualReport(page: Page, containerNo: string) {
  await page.getByLabel("Container No. *").fill(containerNo);
  await page.getByLabel("Destination code *").fill("YEG1");
  await page.getByLabel("Cartons *").fill("43");
  await page.getByLabel("Pallets *").fill("1");
  await page.getByLabel("Volume CBM").fill("1.387008");
}

async function assertRolePages(
  page: Page,
  request: APIRequestContext,
  importId: string,
  actors: Record<keyof typeof actorInputs, E2ETestUser>,
) {
  for (const actor of [actors.warehouse, actors.hrManager]) {
    await page.context().clearCookies();
    await loginWithCredentials(page, request, actor);
    await setPresentation(page, "en", "light");
    await page.goto(`/imports/${importId}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Build parser template" })).toHaveCount(0);
    await page.goto(`/imports/${importId}/parser-learning`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByText("You do not have permission to build parser templates."),
    ).toBeVisible();
  }
}

async function captureVisualMatrix(
  page: Page,
  request: APIRequestContext,
  importId: string,
  office: E2ETestUser,
) {
  await page.context().clearCookies();
  await loginWithCredentials(page, request, office);
  const geometry: Array<Record<string, unknown>> = [];
  for (const locale of ["en", "zh-CN"] as const) {
    for (const theme of ["light", "dark"] as const) {
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1366, height: 900 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        await setPresentation(page, locale, theme);
        await page.goto(`/imports/${importId}/parser-learning`, {
          waitUntil: "networkidle",
        });
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(
          page.getByRole("heading", {
            name: locale === "en" ? "Build a parser template" : "建立解析模板",
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: locale === "en" ? "Draft candidate submitted" : "草稿候选已提交",
          }),
        ).toBeVisible();
        const dimensions = await page.evaluate(() => {
          const clientWidth = document.documentElement.clientWidth;
          window.scrollTo({ left: 10_000, top: window.scrollY });
          const maxPageScrollX = window.scrollX;
          window.scrollTo({ left: 0, top: window.scrollY });
          const localScrollRegions = [
            ...document.querySelectorAll<HTMLElement>(".overflow-auto, .overflow-x-auto"),
          ].filter((element) => element.scrollWidth > element.clientWidth + 1);
          return {
            clientWidth,
            localHorizontalScrollRegions: localScrollRegions.length,
            maxPageScrollX,
            overflowNodes: [...document.querySelectorAll<HTMLElement>("body *")]
              .map((element) => ({
                className: element.className,
                right: Math.round(element.getBoundingClientRect().right),
                tag: element.tagName,
                width: Math.round(element.getBoundingClientRect().width),
              }))
              .filter((item) => item.right > clientWidth + 2)
              .slice(0, 12),
            scrollWidth: document.documentElement.scrollWidth,
          };
        });
        expect(
          dimensions.maxPageScrollX,
          JSON.stringify(dimensions.overflowNodes),
        ).toBe(0);
        if (viewport.width <= 1366) {
          expect(dimensions.localHorizontalScrollRegions).toBeGreaterThan(0);
        }
        geometry.push({ locale, theme, viewport, ...dimensions, zoom: 100 });
        await page.screenshot({
          fullPage: true,
          path: path.resolve(
            OUTPUT_DIR,
            `wizard-${locale}-${theme}-${viewport.width}x${viewport.height}-zoom-100.png`,
          ),
        });
      }
    }
  }
  return geometry;
}

async function captureGovernanceVisualMatrix(page: Page, profileId: string) {
  const geometry: Array<Record<string, unknown>> = [];
  for (const presentation of [
    { locale: "en", theme: "light", viewport: { width: 390, height: 844 } },
    { locale: "zh-CN", theme: "dark", viewport: { width: 768, height: 1024 } },
    { locale: "en", theme: "dark", viewport: { width: 1366, height: 900 } },
    { locale: "zh-CN", theme: "light", viewport: { width: 1920, height: 1080 } },
  ] as const) {
    await page.setViewportSize(presentation.viewport);
    await setPresentation(page, presentation.locale, presentation.theme);
    await page.goto(`/parser-profiles/${profileId}/review`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("html")).toHaveAttribute(
      "lang",
      presentation.locale,
    );
    await expect(
      page.getByRole("heading", {
        name: presentation.locale === "en" ? "Profile review" : "模板复核",
      }),
    ).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: path.resolve(
        GOVERNANCE_OUTPUT_DIR,
        `governance-page-${presentation.locale}-${presentation.theme}-${presentation.viewport.width}x${presentation.viewport.height}-zoom-100.png`,
      ),
    });
    const approveName = presentation.locale === "en" ? "Approve profile" : "批准模板";
    await page.getByRole("button", { name: approveName }).click();
    await expect(page.getByRole("dialog")).toContainText("0/3");
    const dimensions = await page.evaluate(() => {
      window.scrollTo({ left: 10_000, top: window.scrollY });
      const maxPageScrollX = window.scrollX;
      window.scrollTo({ left: 0, top: window.scrollY });
      const dialog = document.querySelector<HTMLElement>('[role="dialog"] > div');
      return {
        clientWidth: document.documentElement.clientWidth,
        dialogRight: dialog ? Math.round(dialog.getBoundingClientRect().right) : null,
        dialogWidth: dialog ? Math.round(dialog.getBoundingClientRect().width) : null,
        maxPageScrollX,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(dimensions.maxPageScrollX).toBe(0);
    expect(dimensions.dialogRight ?? 0).toBeLessThanOrEqual(
      dimensions.clientWidth + 1,
    );
    geometry.push({
      locale: presentation.locale,
      theme: presentation.theme,
      viewport: presentation.viewport,
      zoom: 100,
      ...dimensions,
    });
    await captureBrowserViewport(
      page,
      path.resolve(
        GOVERNANCE_OUTPUT_DIR,
        `governance-${presentation.locale}-${presentation.theme}-${presentation.viewport.width}x${presentation.viewport.height}-zoom-100.png`,
      ),
    );
    await page.getByRole("button", {
      name: presentation.locale === "en" ? "Cancel" : "取消",
    }).click();
  }
  return geometry;
}

async function captureGovernanceRealBrowserZoom(
  token: string,
  profileId: string,
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
  const evidence: Array<Record<string, unknown>> = [];
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await configureBrowserActor(context, token);
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    for (const presentation of [
      { locale: "en", theme: "light" },
      { locale: "zh-CN", theme: "dark" },
    ] as const) {
      await context.addCookies([
        {
          name: "bestar_locale",
          sameSite: "Lax",
          url: new URL(E2E_BASE_URL).origin,
          value: presentation.locale,
        },
        {
          name: "bestar_theme",
          sameSite: "Lax",
          url: new URL(E2E_BASE_URL).origin,
          value: presentation.theme,
        },
      ]);
      await zoomPage.goto(`/parser-profiles/${profileId}/review`, {
        waitUntil: "networkidle",
      });
      await setRealBrowserZoom(zoomPage, worker, 2, 1366);
      await expect(
        zoomPage.getByRole("heading", {
          name: presentation.locale === "en" ? "Profile review" : "模板复核",
        }),
      ).toBeVisible();
      const approveName =
        presentation.locale === "en" ? "Approve profile" : "批准模板";
      await zoomPage.getByRole("button", { name: approveName }).click();
      await expect(zoomPage.getByRole("dialog")).toContainText("0/3");
      const dimensions = await zoomPage.evaluate(() => {
        window.scrollTo(10_000, window.scrollY);
        const maxPageScrollX = window.scrollX;
        window.scrollTo(0, window.scrollY);
        const dialog = document.querySelector<HTMLElement>('[role="dialog"] > div');
        return {
          innerWidth: window.innerWidth,
          maxPageScrollX,
          dialogRight: dialog ? Math.round(dialog.getBoundingClientRect().right) : null,
        };
      });
      expect(dimensions.maxPageScrollX).toBe(0);
      expect(dimensions.dialogRight ?? 0).toBeLessThanOrEqual(
        dimensions.innerWidth + 1,
      );
      evidence.push({ ...presentation, ...dimensions, zoom: 200 });
      await captureBrowserViewport(
        zoomPage,
        path.resolve(
          GOVERNANCE_OUTPUT_DIR,
          `governance-${presentation.locale}-${presentation.theme}-1366x768-zoom-200.png`,
        ),
      );
      await zoomPage.getByRole("button", {
        name: presentation.locale === "en" ? "Cancel" : "取消",
      }).click();
      await setRealBrowserZoom(zoomPage, worker, 1, 1366);
    }
  } finally {
    await context.close();
  }
  return evidence;
}

async function performGovernanceAction(
  page: Page,
  actionName: string,
  reason: string,
  expectedLifecycle: string,
  expectedImpact: string,
) {
  await page.getByRole("button", { name: actionName }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(expectedImpact);
  await dialog.getByLabel("Reason").fill(reason);
  await dialog.getByRole("button", { name: "Confirm action" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(expectedLifecycle, { exact: true })).toBeVisible();
}

async function waitForReplayJob(
  request: APIRequestContext,
  actor: E2ETestUser,
  caseId: string,
  jobId: string,
) {
  const token = await loginForAccessToken(request, actor);
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `/api/parser-learning-cases/${caseId}/replay-jobs/${jobId}`,
          { headers: authHeaders(token) },
        );
        expect(response.status()).toBe(200);
        const body = (await response.json()) as {
          lastErrorCode: string | null;
          status: string;
        };
        if (body.status === "failed") {
          throw new Error(
            `Completion replay failed with ${body.lastErrorCode ?? "unknown error"}`,
          );
        }
        return body.status;
      },
      { timeout: 180_000 },
    )
    .toBe("succeeded");
}

async function setPresentation(
  page: Page,
  locale: "en" | "zh-CN",
  theme: "dark" | "light",
) {
  const url = new URL(page.url() === "about:blank" ? "http://nginx" : page.url());
  await page.context().addCookies([
    { name: "bestar_locale", sameSite: "Lax", url: url.origin, value: locale },
    { name: "bestar_theme", sameSite: "Lax", url: url.origin, value: theme },
  ]);
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
  const evidence: Array<Record<string, unknown>> = [];
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await configureBrowserActor(context, token);
    const zoomPage = context.pages()[0] ?? (await context.newPage());
    for (const presentation of [
      { locale: "en", theme: "light" },
      { locale: "zh-CN", theme: "dark" },
    ] as const) {
      await context.addCookies([
        {
          name: "bestar_locale",
          sameSite: "Lax",
          url: new URL(E2E_BASE_URL).origin,
          value: presentation.locale,
        },
        {
          name: "bestar_theme",
          sameSite: "Lax",
          url: new URL(E2E_BASE_URL).origin,
          value: presentation.theme,
        },
      ]);
      await zoomPage.goto(`/imports/${importId}/parser-learning`, {
        waitUntil: "networkidle",
      });
      await setRealBrowserZoom(zoomPage, worker, 2, 1366);
      await expect(
        zoomPage.getByRole("heading", {
          name:
            presentation.locale === "en"
              ? "Build a parser template"
              : "建立解析模板",
        }),
      ).toBeVisible();
      const dimensions = await zoomPage.evaluate(() => {
        window.scrollTo(10_000, window.scrollY);
        const maxPageScrollX = window.scrollX;
        window.scrollTo(0, window.scrollY);
        const sourceScroller = document.querySelector<HTMLElement>(
          'section[aria-labelledby="structure-heading"] .overflow-auto',
        );
        return {
          innerWidth: window.innerWidth,
          maxPageScrollX,
          sourceClientWidth: sourceScroller?.clientWidth ?? null,
          sourceScrollWidth: sourceScroller?.scrollWidth ?? null,
        };
      });
      expect(dimensions.maxPageScrollX).toBe(0);
      expect(dimensions.sourceScrollWidth ?? 0).toBeGreaterThan(
        dimensions.sourceClientWidth ?? 0,
      );
      evidence.push({ ...presentation, ...dimensions, zoom: 200 });
      await zoomPage.screenshot({
        path: path.resolve(
          OUTPUT_DIR,
          `wizard-${presentation.locale}-${presentation.theme}-1366x768-zoom-200.png`,
        ),
      });
      const mappingSection = zoomPage.locator(
        'section[aria-labelledby="mapping-heading"]',
      );
      await mappingSection.scrollIntoViewIfNeeded();
      await captureBrowserViewport(
        zoomPage,
        path.resolve(
          OUTPUT_DIR,
          `wizard-${presentation.locale}-${presentation.theme}-1366x768-zoom-200-mapping.png`,
        ),
      );
      const mappingScroller = mappingSection.locator(".overflow-x-auto");
      await mappingScroller.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      await expect(
        mappingSection.locator("#confirm-volumeCbm"),
      ).toBeVisible();
      await captureBrowserViewport(
        zoomPage,
        path.resolve(
          OUTPUT_DIR,
          `wizard-${presentation.locale}-${presentation.theme}-1366x768-zoom-200-mapping-end.png`,
        ),
      );
      await setRealBrowserZoom(zoomPage, worker, 1, 1366);
    }
  } finally {
    await context.close();
  }
  return evidence;
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
      const tabsApi = (
        globalThis as unknown as { chrome: { tabs: TabsApi } }
      ).chrome.tabs;
      const tabId = (await tabsApi.query({})).find(
        (tab) => tab.url === url,
      )?.id;
      if (tabId === undefined) throw new Error(`No browser tab found for ${url}`);
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
    await writeFile(
      screenshotPath,
      Buffer.from(screenshot.data, "base64"),
    );
  } finally {
    await session.detach();
  }
}

async function getJson<T>(
  request: APIRequestContext,
  route: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await request.get(route, { headers });
  expect(response.status()).toBe(200);
  return (await response.json()) as T;
}

interface LearningCase {
  id: string;
  status: string;
  draftRevision: number;
  draftDefinition: {
    fingerprintDefinition: Record<string, unknown>;
    mappingDefinition: Record<string, unknown>;
  };
}
