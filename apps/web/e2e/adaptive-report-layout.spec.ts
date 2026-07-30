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
  id: string;
  containerId: string;
  fileType: string;
  fileSha256: string;
  fileSizeBytes: string;
  filename: string;
  mimeType: string;
  status: string;
}

interface Destination {
  id: string;
  destinationCode: string;
  finalPallets: number;
  totalCartons: number;
}

interface ReportPageEvidence {
  page: number;
  layoutMode: "PRIMARY_ONLY" | "EXPANDED";
  expectedDestinationCount: number;
  writtenDestinationCount: number;
  expectedPhysicalRows: number[];
  writtenPhysicalRows: number[];
}

interface ReportResponse {
  errors: unknown[];
  generatedFile: GeneratedFile;
  reportEvidence: {
    expectedDestinationCount: number;
    writtenDestinationCount: number;
    orderedDestinationDigest: string;
    layoutModes: Array<"PRIMARY_ONLY" | "EXPANDED">;
    pageEvidence: ReportPageEvidence[];
  };
  warnings: unknown[];
}

interface PackageInspection {
  allDestinationCellsMirrored: boolean;
  allDestinationRowsKeepVisibility: boolean;
  allDestinationRowStylesMatchTemplate: boolean;
  allLayoutAssignmentsMatch: boolean;
  allLayoutsMatchTemplate: boolean;
  allPageContractsMatch: boolean;
  allRunSequencesMatchTemplate: boolean;
  allSheetEditabilityMatchesTemplate: boolean;
  allUnusedDestinationRowsEmpty: boolean;
  allUnusedRowHeightsMatchTemplate: boolean;
  canonicalRows: Array<{
    destination: string;
    finalPallets: number;
    ordinal: number;
    totalCartons: number;
  }>;
  layoutModes: Array<"PRIMARY_ONLY" | "EXPANDED">;
  pageEvidence: Array<ReportPageEvidence & { unusedRowsEmpty: boolean }>;
}

interface AsyncJob {
  attempts: number;
  generatedFileId: string | null;
  id: string;
  result: unknown;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
}

test("real current report switches 8 -> 9 -> 8 layouts and preserves current bytes on failure", async ({
  request,
}, testInfo) => {
  test.setTimeout(300_000);
  const artifactDir = process.env.UNLOAD_REPORT_ARTIFACT_DIR
    ? path.resolve(process.env.UNLOAD_REPORT_ARTIFACT_DIR)
    : testInfo.outputPath("unload-report-05");
  await mkdir(artifactDir, { recursive: true });

  const token = await loginForAccessToken(request, {
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
  });
  const headers = authHeaders(token);
  const actor = await getJson<{ id: string }>(request, "/api/auth/me", headers);
  await writeFile(path.join(artifactDir, "actor-user-id.txt"), `${actor.id}\n`);

  const containerNo = uniquePolicyContainerNo();
  const workbookPath = await createDerivedRealWorkbook(testInfo, containerNo);
  const workbookBytes = await readFile(workbookPath);
  const upload = await request.post("/api/imports", {
    headers,
    multipart: {
      file: {
        buffer: workbookBytes,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        name: path.basename(workbookPath),
      },
    },
  });
  await expectStatus(upload, 201);
  const imported = (await upload.json()) as {
    fileSha256: string;
    id: string;
    storedPath: string;
  };
  expect(imported.fileSha256).toBe(sha256(workbookBytes));
  await writeFile(path.join(artifactDir, "import-file-id.txt"), `${imported.id}\n`);
  await writeFile(
    path.join(artifactDir, "uploaded-file-sha256.txt"),
    `${imported.fileSha256}\n`,
  );
  await writeFile(
    path.join(artifactDir, "original-storage-path.txt"),
    `${imported.storedPath}\n`,
  );

  const parse = await request.post(`/api/imports/${imported.id}/parse`, { headers });
  await expectStatus(parse, 201);
  const parsed = (await parse.json()) as {
    containers: Array<{ containerNo: string; id: string }>;
  };
  const container = parsed.containers.find((item) => item.containerNo === containerNo);
  expect(container).toBeDefined();
  await writeFile(path.join(artifactDir, "container-id.txt"), `${container!.id}\n`);
  await writeFile(path.join(artifactDir, "container-no.txt"), `${containerNo}\n`);

  let destinations = await containerDestinations(request, container!.id, headers);
  expect(destinations).toHaveLength(9);
  const deletedDestination = destinations[destinations.length - 1];
  await expectStatus(
    await request.delete(`/api/container-destinations/${deletedDestination.id}`, {
      headers,
    }),
    200,
  );

  destinations = await containerDestinations(request, container!.id, headers);
  expect(destinations).toHaveLength(8);
  const primary = await generateAndInspect({
    request,
    headers,
    containerId: container!.id,
    destinations,
    artifactPath: path.join(artifactDir, "api-downloaded-report-8.xlsx"),
    expectedMode: "PRIMARY_ONLY",
    expectedRows: [4, 6, 8, 10, 12, 14, 16, 18],
  });

  if (process.env.E2E_REPORT_EXPECTED_FAILURE_CODE) {
    await verifyFailedGenerationPreservesCurrent({
      request,
      headers,
      containerId: container!.id,
      current: primary,
      expectedCode: process.env.E2E_REPORT_EXPECTED_FAILURE_CODE,
      expectedStage: process.env.E2E_REPORT_EXPECTED_FAILURE_STAGE ?? "reopen.row",
      artifactDir,
    });
    return;
  }

  const created = await request.post(
    `/api/containers/${container!.id}/destinations`,
    {
      headers,
      data: {
        destinationCode: "ZZ-ADAPTIVE-09",
        cartons: 90,
        volume: 9,
        manualPallets: 9,
        reason: "UNLOAD_REPORT_05_EXPANDED_LAYOUT",
      },
    },
  );
  await expectStatus(created, 201);
  const createdBody = (await created.json()) as {
    containerDestination: { id: string };
  };

  destinations = await containerDestinations(request, container!.id, headers);
  expect(destinations).toHaveLength(9);
  const expanded = await generateAndInspect({
    request,
    headers,
    containerId: container!.id,
    destinations,
    artifactPath: path.join(artifactDir, "api-downloaded-report-9.xlsx"),
    expectedMode: "EXPANDED",
    expectedRows: [4, 5, 6, 7, 8, 9, 10, 11, 12],
  });
  expect(expanded.file.id).not.toBe(primary.file.id);
  expect(expanded.file.fileSha256).not.toBe(primary.file.fileSha256);
  await expectStatus(
    await request.delete(
      `/api/container-destinations/${createdBody.containerDestination.id}`,
      { headers },
    ),
    200,
  );

  destinations = await containerDestinations(request, container!.id, headers);
  expect(destinations).toHaveLength(8);
  const finalPrimary = await generateAndInspect({
    request,
    headers,
    containerId: container!.id,
    destinations,
    artifactPath: path.join(artifactDir, "api-downloaded-report.xlsx"),
    expectedMode: "PRIMARY_ONLY",
    expectedRows: [4, 6, 8, 10, 12, 14, 16, 18],
  });
  expect(finalPrimary.file.id).not.toBe(expanded.file.id);
  expect(finalPrimary.file.fileSha256).not.toBe(expanded.file.fileSha256);

  const files = await getJson<{ items: GeneratedFile[] }>(
    request,
    `/api/containers/${container!.id}/files`,
    headers,
  );
  expect(files.items.filter((item) => item.fileType === "EXCEL_REPORT")).toEqual([
    finalPrimary.file,
  ]);

  const firstDestination = destinations[0];
  await expectStatus(
    await request.patch(`/api/container-destinations/${firstDestination.id}`, {
      headers,
      data: {
        destinationCode: "X".repeat(1_000),
        reason: "UNLOAD_REPORT_05_LAYOUT_FAILURE_PROBE",
      },
    }),
    200,
  );
  await verifyFailedGenerationPreservesCurrent({
    request,
    headers,
    containerId: container!.id,
    current: finalPrimary,
    expectedCode: "REPORT_LAYOUT_REVIEW_REQUIRED",
    expectedStage: "planning.layout-review",
    artifactDir,
  });

  await writeFile(
    path.join(artifactDir, "generated-file-id.txt"),
    `${finalPrimary.file.id}\n`,
  );
  await writeFile(
    path.join(artifactDir, "adaptive-layout-verification.json"),
    `${JSON.stringify(
      {
        containerId: container!.id,
        transitions: [
          primary.evidence,
          expanded.evidence,
          finalPrimary.evidence,
        ],
        currentFileCount: 1,
        oldCurrentPreservedOnFailure: true,
      },
      null,
      2,
    )}\n`,
  );

  if (process.env.E2E_FORCE_FAILURE === "1") {
    await writeFile(
      path.join(artifactDir, "intentional-failure-reached.txt"),
      "yes\n",
    );
    throw new Error("Intentional UNLOAD-REPORT-05 cleanup probe failure");
  }
});

async function generateAndInspect({
  request,
  headers,
  containerId,
  destinations,
  artifactPath,
  expectedMode,
  expectedRows,
}: {
  request: APIRequestContext;
  headers: Record<string, string>;
  containerId: string;
  destinations: Destination[];
  artifactPath: string;
  expectedMode: "PRIMARY_ONLY" | "EXPANDED";
  expectedRows: number[];
}): Promise<{
  bytes: Buffer;
  evidence: ReportResponse["reportEvidence"];
  file: GeneratedFile;
}> {
  const response = await request.post(
    `/api/containers/${containerId}/generate-report`,
    { headers },
  );
  await expectStatus(response, 201);
  const report = (await response.json()) as ReportResponse;
  const expectedCanonical = destinations.map((destination, index) => ({
    destination: destination.destinationCode,
    finalPallets: destination.finalPallets,
    ordinal: index + 1,
    totalCartons: destination.totalCartons,
  }));
  expect(report.errors).toEqual([]);
  expect(report.reportEvidence).toEqual({
    expectedDestinationCount: destinations.length,
    writtenDestinationCount: destinations.length,
    orderedDestinationDigest: orderedDigest(expectedCanonical),
    layoutModes: [expectedMode],
    pageEvidence: [
      {
        page: 1,
        layoutMode: expectedMode,
        expectedDestinationCount: destinations.length,
        writtenDestinationCount: destinations.length,
        expectedPhysicalRows: expectedRows,
        writtenPhysicalRows: expectedRows,
      },
    ],
  });

  const download = await request.get(
    `/api/containers/${containerId}/files/${report.generatedFile.id}/download`,
    { headers },
  );
  await expectStatus(download, 200);
  const bytes = await download.body();
  expect(sha256(bytes)).toBe(report.generatedFile.fileSha256);
  await writeFile(artifactPath, bytes);
  const inspection = await inspectPackage(artifactPath);
  expect(inspection).toMatchObject({
    allDestinationCellsMirrored: true,
    allDestinationRowsKeepVisibility: true,
    allDestinationRowStylesMatchTemplate: true,
    allLayoutAssignmentsMatch: true,
    allLayoutsMatchTemplate: true,
    allPageContractsMatch: true,
    allRunSequencesMatchTemplate: true,
    allSheetEditabilityMatchesTemplate: true,
    allUnusedDestinationRowsEmpty: true,
    allUnusedRowHeightsMatchTemplate: true,
    canonicalRows: expectedCanonical,
    layoutModes: [expectedMode],
  });
  expect(inspection.pageEvidence).toEqual([
    {
      page: 1,
      layoutMode: expectedMode,
      expectedDestinationCount: destinations.length,
      writtenDestinationCount: destinations.length,
      expectedPhysicalRows: expectedRows,
      writtenPhysicalRows: expectedRows,
      unusedRowsEmpty: true,
    },
  ]);
  return { bytes, evidence: report.reportEvidence, file: report.generatedFile };
}

async function verifyFailedGenerationPreservesCurrent({
  request,
  headers,
  containerId,
  current,
  expectedCode,
  expectedStage,
  artifactDir,
}: {
  request: APIRequestContext;
  headers: Record<string, string>;
  containerId: string;
  current: { bytes: Buffer; file: GeneratedFile };
  expectedCode: string;
  expectedStage: string;
  artifactDir: string;
}): Promise<void> {
  const submission = await request.post(
    `/api/containers/${containerId}/generate-report-job`,
    { headers },
  );
  await expectStatus(submission, 201);
  const job = await pollJob(
    request,
    ((await submission.json()) as AsyncJob).id,
    headers,
  );
  expect(job.status).toBe("failed");
  const result = job.result as {
    code?: string;
    details?: { stage?: string };
    message?: string;
  };
  expect(result).toMatchObject({ code: expectedCode, message: expectedCode });
  expect(result.details?.stage).toBe(expectedStage);

  const files = await getJson<{ items: GeneratedFile[] }>(
    request,
    `/api/containers/${containerId}/files`,
    headers,
  );
  expect(files.items.filter((item) => item.fileType === "EXCEL_REPORT")).toEqual([
    current.file,
  ]);
  const download = await request.get(
    `/api/containers/${containerId}/files/${current.file.id}/download`,
    { headers },
  );
  await expectStatus(download, 200);
  expect(sha256(await download.body())).toBe(sha256(current.bytes));
  await writeFile(
    path.join(artifactDir, "failed-regeneration-verification.json"),
    `${JSON.stringify(
      {
        failureCode: expectedCode,
        failureStage: expectedStage,
        oldCurrentId: current.file.id,
        oldCurrentSha256: sha256(current.bytes),
        oldCurrentPreserved: true,
      },
      null,
      2,
    )}\n`,
  );
}

async function containerDestinations(
  request: APIRequestContext,
  containerId: string,
  headers: Record<string, string>,
): Promise<Destination[]> {
  const detail = await getJson<{ destinations: Destination[] }>(
    request,
    `/api/containers/${containerId}`,
    headers,
  );
  return detail.destinations;
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

async function inspectPackage(filePath: string): Promise<PackageInspection> {
  const { stdout } = await execFileAsync("python3", [
    path.resolve(__dirname, "report-package-inspector.py"),
    filePath,
    path.resolve(
      __dirname,
      "../../..",
      "samples/templates/卸柜报告-En.xlsx",
    ),
  ]);
  return JSON.parse(stdout) as PackageInspection;
}

function orderedDigest(rows: PackageInspection["canonicalRows"]): string {
  return sha256(Buffer.from(JSON.stringify(rows), "utf8"));
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
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

async function expectStatus(
  response: APIResponse,
  expected: number,
): Promise<void> {
  if (response.status() !== expected) {
    throw new Error(
      `Expected ${expected} from ${response.url()}, got ${response.status()}: ${await response.text()}`,
    );
  }
}
