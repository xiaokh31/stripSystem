import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import {
  authHeaders,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  loginForAccessToken,
} from "./helpers";
import {
  createDerivedRealWorkbook,
  uniquePolicyContainerNo,
} from "./real-workbook-fixture";

const execFileAsync = promisify(execFile);

interface GeneratedFile {
  containerId: string;
  filename: string;
  fileSha256: string | null;
  fileSizeBytes: string | null;
  fileType: string;
  id: string;
  mimeType: string | null;
  status: string;
}

interface PackageInspection {
  allDestinationCellsMirrored: boolean;
  allDestinationRowsKeepVisibility: boolean;
  allDestinationRowStylesMatchTemplate: boolean;
  allLayoutAssignmentsMatch: boolean;
  allLayoutsMatchTemplate: boolean;
  allPageContractsMatch: boolean;
  allRowsNeverShrink: boolean;
  allRunSequencesMatchTemplate: boolean;
  allSheetEditabilityMatchesTemplate: boolean;
  allUnusedDestinationRowsEmpty: boolean;
  allUnusedRowHeightsMatchTemplate: boolean;
  canonicalRows: CanonicalReportRow[];
  destinations: Array<Array<{ cell: string; value: string }>>;
  dimension: string;
  endsWithWhenStored: boolean;
  fontNames: string[];
  fontSizes: string[];
  newlineCount: number;
  orderedDestinationDigest: string;
  layoutModes: Array<"PRIMARY_ONLY" | "EXPANDED">;
  pageEvidence: ReportPageEvidence[];
  runCount: number;
  standardsHeightAtLeastTemplate: boolean;
  standardsHeights: number[];
  templateStandardsHeight: number;
  worksheetCount: number;
}

interface ReportPageEvidence {
  page: number;
  layoutMode: "PRIMARY_ONLY" | "EXPANDED";
  expectedDestinationCount: number;
  writtenDestinationCount: number;
  expectedPhysicalRows: number[];
  writtenPhysicalRows: number[];
  unusedRowsEmpty?: boolean;
}

interface CanonicalReportRow {
  destination: string;
  finalPallets: number;
  ordinal: number;
  totalCartons: number;
}

interface AsyncJob {
  attempts: number;
  generatedFileId: string | null;
  id: string;
  result: unknown;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
}

test("real API download preserves Palletizing Standards rich text and report audit metadata", async ({
  request,
}, testInfo) => {
  test.setTimeout(300_000);
  const artifactDir = process.env.UNLOAD_REPORT_ARTIFACT_DIR
    ? path.resolve(process.env.UNLOAD_REPORT_ARTIFACT_DIR)
    : testInfo.outputPath("unload-report-01");
  await mkdir(artifactDir, { recursive: true });

  const accessToken = await loginForAccessToken(request, {
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
  });
  const headers = authHeaders(accessToken);
  const me = await getJson<{ id: string }>(request, "/api/auth/me", headers);
  await writeFile(
    path.join(artifactDir, "actor-user-id.txt"),
    `${me.id}\n`,
    "utf8",
  );
  const containerNo = uniquePolicyContainerNo();
  const workbookPath = await createDerivedRealWorkbook(testInfo, containerNo);
  const workbookBuffer = await readFile(workbookPath);

  const upload = await request.post("/api/imports", {
    headers,
    multipart: {
      file: {
        buffer: workbookBuffer,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        name: path.basename(workbookPath),
      },
    },
  });
  await expectStatus(upload, 201);
  const uploaded = (await upload.json()) as {
    fileSha256: string;
    id: string;
    storedPath: string;
  };
  expect(uploaded.fileSha256).toBe(sha256Buffer(workbookBuffer));
  expect(uploaded.storedPath).toContain("/storage/original_files/");
  await writeFile(
    path.join(artifactDir, "import-file-id.txt"),
    `${uploaded.id}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "uploaded-file-sha256.txt"),
    `${uploaded.fileSha256}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "original-storage-path.txt"),
    `${uploaded.storedPath}\n`,
    "utf8",
  );

  const parse = await request.post(`/api/imports/${uploaded.id}/parse`, { headers });
  await expectStatus(parse, 201);
  const parsed = (await parse.json()) as {
    containers: Array<{ containerNo: string; id: string }>;
  };
  const container = parsed.containers.find((item) => item.containerNo === containerNo);
  expect(container).toBeDefined();
  await writeFile(
    path.join(artifactDir, "container-id.txt"),
    `${container!.id}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "container-no.txt"),
    `${containerNo}\n`,
    "utf8",
  );
  const containerDetail = await getJson<{
    destinations: Array<{
      destinationCode: string;
      finalPallets: number;
      id: string;
      totalCartons: number;
    }>;
  }>(request, `/api/containers/${container!.id}`, headers);
  const expectedCanonicalRows = containerDetail.destinations.map(
    (destination, index): CanonicalReportRow => ({
      destination: destination.destinationCode,
      finalPallets: destination.finalPallets,
      ordinal: index + 1,
      totalCartons: destination.totalCartons,
    }),
  );
  const expectedOrderedDestinationDigest =
    orderedDestinationDigest(expectedCanonicalRows);

  const report = await request.post(
    `/api/containers/${container!.id}/generate-report`,
    { headers },
  );
  await expectStatus(report, 201);
  const reportBody = (await report.json()) as {
    errors: unknown[];
    generatedFile: GeneratedFile;
    reportEvidence: {
      expectedDestinationCount: number;
      orderedDestinationDigest: string;
      writtenDestinationCount: number;
      layoutModes: Array<"PRIMARY_ONLY" | "EXPANDED">;
      pageEvidence: ReportPageEvidence[];
    };
    warnings: unknown[];
  };
  expect(reportBody.errors).toEqual([]);
  expect(reportBody.generatedFile).toMatchObject({
    containerId: container!.id,
    filename: expect.stringMatching(/\.xlsx$/),
    fileType: "EXCEL_REPORT",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    status: "GENERATED",
  });
  expect(reportBody.generatedFile).not.toHaveProperty("storagePath");
  expect(reportBody.generatedFile).not.toHaveProperty("errorMessage");
  expect(reportBody.generatedFile.fileSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(Number(reportBody.generatedFile.fileSizeBytes)).toBeGreaterThan(0);
  expect(reportBody.reportEvidence).toEqual({
    expectedDestinationCount: expectedCanonicalRows.length,
    orderedDestinationDigest: expectedOrderedDestinationDigest,
    writtenDestinationCount: expectedCanonicalRows.length,
    layoutModes: ["EXPANDED"],
    pageEvidence: [
      {
        page: 1,
        layoutMode: "EXPANDED",
        expectedDestinationCount: 9,
        writtenDestinationCount: 9,
        expectedPhysicalRows: [4, 5, 6, 7, 8, 9, 10, 11, 12],
        writtenPhysicalRows: [4, 5, 6, 7, 8, 9, 10, 11, 12],
      },
    ],
  });
  await writeFile(
    path.join(artifactDir, "generated-file-id.txt"),
    `${reportBody.generatedFile.id}\n`,
    "utf8",
  );

  const files = await getJson<{ items: GeneratedFile[] }>(
    request,
    `/api/containers/${container!.id}/files`,
    headers,
  );
  expect(files.items).toContainEqual(reportBody.generatedFile);

  const download = await request.get(
    `/api/containers/${container!.id}/files/${reportBody.generatedFile.id}/download`,
    { headers },
  );
  await expectStatus(download, 200);
  expect(download.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const downloadedBuffer = await download.body();
  expect(downloadedBuffer.byteLength).toBe(
    Number(reportBody.generatedFile.fileSizeBytes),
  );
  expect(sha256Buffer(downloadedBuffer)).toBe(reportBody.generatedFile.fileSha256);

  const reportPath = path.join(artifactDir, "api-downloaded-report.xlsx");
  await writeFile(reportPath, downloadedBuffer);
  const packageInspection = await inspectReportPackage(reportPath);
  expect(packageInspection).toMatchObject({
    allDestinationCellsMirrored: true,
    allDestinationRowsKeepVisibility: true,
    allDestinationRowStylesMatchTemplate: true,
    allLayoutAssignmentsMatch: true,
    allLayoutsMatchTemplate: true,
    allPageContractsMatch: true,
    allRowsNeverShrink: true,
    allRunSequencesMatchTemplate: true,
    allSheetEditabilityMatchesTemplate: true,
    allUnusedDestinationRowsEmpty: true,
    allUnusedRowHeightsMatchTemplate: true,
    dimension: "B1:P25",
    endsWithWhenStored: true,
    standardsHeightAtLeastTemplate: true,
    worksheetCount: 1,
  });
  expect(packageInspection.layoutModes).toEqual(["EXPANDED"]);
  expect(packageInspection.pageEvidence).toEqual([
    {
      page: 1,
      layoutMode: "EXPANDED",
      expectedDestinationCount: 9,
      writtenDestinationCount: 9,
      expectedPhysicalRows: [4, 5, 6, 7, 8, 9, 10, 11, 12],
      writtenPhysicalRows: [4, 5, 6, 7, 8, 9, 10, 11, 12],
      unusedRowsEmpty: true,
    },
  ]);
  expect(packageInspection.runCount).toBeGreaterThan(1);
  expect(packageInspection.worksheetCount).toBeGreaterThan(0);
  expect(packageInspection.fontNames).toEqual(expect.arrayContaining(["Arial", "宋体"]));
  expect(packageInspection.fontSizes).toEqual(["10", "11"]);
  expect(packageInspection.newlineCount).toBeGreaterThan(1);
  expect(packageInspection.canonicalRows).toEqual(expectedCanonicalRows);
  expect(packageInspection.orderedDestinationDigest).toBe(
    expectedOrderedDestinationDigest,
  );
  expect(packageInspection.destinations[0]).toHaveLength(9);
  expect(packageInspection.destinations[0][8]).toEqual({
    cell: "N12",
    value: "贵司卡尔加里仓",
  });

  const verification = {
    actorUserId: me.id,
    containerId: container!.id,
    containerNo,
    generatedFile: reportBody.generatedFile,
    importFileId: uploaded.id,
    orderedDestinationEvidence: reportBody.reportEvidence,
    packageInspection,
    reportPath,
    sourceFixtureSha256: sha256Buffer(workbookBuffer),
  };
  await writeFile(
    path.join(artifactDir, "api-verification.json"),
    `${JSON.stringify(verification, null, 2)}\n`,
    "utf8",
  );
  if (process.env.E2E_REPORT_FAILURE_PROBE === "1") {
    await verifyFailedRegenerationPreservesSuccessfulHistory({
      artifactDir,
      containerId: container!.id,
      destinationId: containerDetail.destinations[0].id,
      headers,
      oldDownloadedBuffer: downloadedBuffer,
      oldGeneratedFile: reportBody.generatedFile,
      request,
    });
  }
  if (process.env.E2E_FORCE_FAILURE === "1") {
    await writeFile(
      path.join(artifactDir, "intentional-failure-reached.txt"),
      "yes\n",
      "utf8",
    );
    throw new Error("Intentional UNLOAD-REPORT-03 cleanup probe failure");
  }
});

async function verifyFailedRegenerationPreservesSuccessfulHistory({
  artifactDir,
  containerId,
  destinationId,
  headers,
  oldDownloadedBuffer,
  oldGeneratedFile,
  request,
}: {
  artifactDir: string;
  containerId: string;
  destinationId: string;
  headers: Record<string, string>;
  oldDownloadedBuffer: Buffer;
  oldGeneratedFile: GeneratedFile;
  request: APIRequestContext;
}): Promise<void> {
  const expectedFailureCode =
    process.env.E2E_REPORT_EXPECTED_FAILURE_CODE ??
    "REPORT_LAYOUT_REVIEW_REQUIRED";
  const expectedFailureStage =
    process.env.E2E_REPORT_EXPECTED_FAILURE_STAGE ??
    "planning.layout-review";
  const correction = await request.patch(
    `/api/container-destinations/${destinationId}`,
    {
      data: {
        destinationCode: "X".repeat(1_000),
        reason: "UNLOAD_REPORT_03_LAYOUT_REVIEW_PROBE",
      },
      headers,
    },
  );
  await expectStatus(correction, 200);

  const submission = await request.post(
    `/api/containers/${containerId}/generate-report-job`,
    { headers },
  );
  await expectStatus(submission, 201);
  const submittedJob = (await submission.json()) as AsyncJob;
  const failedJob = await pollJob(request, submittedJob.id, headers);
  expect(failedJob.status).toBe("failed");
  expect(failedJob.attempts).toBeGreaterThan(0);
  const failure = failedJob.result as {
    code?: string;
    details?: { generatedFileId?: string; stage?: string };
    message?: string;
  };
  expect(failure).toMatchObject({
    code: expectedFailureCode,
    message: expectedFailureCode,
  });
  expect(failure.details?.stage).toBe(expectedFailureStage);
  expect(failedJob.generatedFileId).toBeTruthy();
  expect(failedJob.generatedFileId).toBe(failure.details?.generatedFileId);

  const filesAfterFailure = await getJson<{ items: GeneratedFile[] }>(
    request,
    `/api/containers/${containerId}/files`,
    headers,
  );
  const preserved = filesAfterFailure.items.find(
    (item) => item.id === oldGeneratedFile.id,
  );
  expect(preserved).toEqual(oldGeneratedFile);
  expect(
    filesAfterFailure.items.some(
      (item) => item.id === failedJob.generatedFileId,
    ),
  ).toBe(false);

  const preservedDownload = await request.get(
    `/api/containers/${containerId}/files/${oldGeneratedFile.id}/download`,
    { headers },
  );
  await expectStatus(preservedDownload, 200);
  expect(sha256Buffer(await preservedDownload.body())).toBe(
    sha256Buffer(oldDownloadedBuffer),
  );

  await writeFile(
    path.join(artifactDir, "failed-generated-file-id.txt"),
    `${failedJob.generatedFileId}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "failed-regeneration-verification.json"),
    `${JSON.stringify(
      {
        failedGeneratedFileId: failedJob.generatedFileId,
        failureCode: failure.code,
        failureStage: failure.details?.stage,
        jobAttempts: failedJob.attempts,
        jobGeneratedFileId: failedJob.generatedFileId,
        oldGeneratedFileId: oldGeneratedFile.id,
        oldReportSha256: sha256Buffer(oldDownloadedBuffer),
        oldSuccessPreserved: true,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function pollJob(
  request: APIRequestContext,
  jobId: string,
  headers: Record<string, string>,
): Promise<AsyncJob> {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const job = await getJson<AsyncJob>(
      request,
      `/api/queue/jobs/${jobId}`,
      headers,
    );
    if (["succeeded", "failed", "cancelled"].includes(job.status)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for async report job ${jobId}`);
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

function sha256Buffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function orderedDestinationDigest(rows: CanonicalReportRow[]): string {
  const sortedKeyRows = rows.map((row) => ({
    destination: row.destination,
    finalPallets: row.finalPallets,
    ordinal: row.ordinal,
    totalCartons: row.totalCartons,
  }));
  return sha256Buffer(Buffer.from(JSON.stringify(sortedKeyRows), "utf8"));
}

async function inspectReportPackage(filePath: string): Promise<PackageInspection> {
  const inspectorPath = path.resolve(__dirname, "report-package-inspector.py");
  const templatePath = path.resolve(
    __dirname,
    "../../..",
    "samples/templates/卸柜报告-En.xlsx",
  );
  const { stdout } = await execFileAsync("python3", [
    inspectorPath,
    filePath,
    templatePath,
  ]);
  return JSON.parse(stdout) as PackageInspection;
}
