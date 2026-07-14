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
  errorMessage: string | null;
  fileSha256: string | null;
  fileSizeBytes: string | null;
  fileType: string;
  id: string;
  mimeType: string | null;
  status: string;
  storagePath: string;
}

interface PackageInspection {
  allLayoutsMatchTemplate: boolean;
  allRunSequencesMatchTemplate: boolean;
  destinations: Array<Array<{ cell: string; value: string }>>;
  dimension: string;
  endsWithWhenStored: boolean;
  fontNames: string[];
  fontSizes: string[];
  newlineCount: number;
  runCount: number;
  worksheetCount: number;
}

test("real API download preserves Palletizing Standards rich text and report audit metadata", async ({
  request,
}, testInfo) => {
  test.setTimeout(180_000);
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

  const parse = await request.post(`/api/imports/${uploaded.id}/parse`, { headers });
  await expectStatus(parse, 201);
  const parsed = (await parse.json()) as {
    containers: Array<{ containerNo: string; id: string }>;
  };
  const container = parsed.containers.find((item) => item.containerNo === containerNo);
  expect(container).toBeDefined();

  const report = await request.post(
    `/api/containers/${container!.id}/generate-report`,
    { headers },
  );
  await expectStatus(report, 201);
  const reportBody = (await report.json()) as {
    errors: unknown[];
    generatedFile: GeneratedFile;
    warnings: unknown[];
  };
  expect(reportBody.errors).toEqual([]);
  expect(reportBody.generatedFile).toMatchObject({
    containerId: container!.id,
    errorMessage: null,
    fileType: "EXCEL_REPORT",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    status: "GENERATED",
  });
  expect(reportBody.generatedFile.storagePath).toContain("/storage/reports/");
  expect(reportBody.generatedFile.fileSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(Number(reportBody.generatedFile.fileSizeBytes)).toBeGreaterThan(0);

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
    allLayoutsMatchTemplate: true,
    allRunSequencesMatchTemplate: true,
    dimension: "B1:P25",
    endsWithWhenStored: true,
    worksheetCount: 1,
  });
  expect(packageInspection.runCount).toBeGreaterThan(1);
  expect(packageInspection.worksheetCount).toBeGreaterThan(0);
  expect(packageInspection.fontNames).toEqual(expect.arrayContaining(["Arial", "宋体"]));
  expect(packageInspection.fontSizes).toEqual(["10", "11"]);
  expect(packageInspection.newlineCount).toBeGreaterThan(1);
  expect(packageInspection.destinations[0]).toHaveLength(9);
  expect(packageInspection.destinations[0][8]).toEqual({
    cell: "N5",
    value: "贵司卡尔加里仓",
  });

  const verification = {
    actorUserId: me.id,
    containerId: container!.id,
    containerNo,
    generatedFile: reportBody.generatedFile,
    importFileId: uploaded.id,
    packageInspection,
    reportPath,
    sourceFixtureSha256: sha256Buffer(workbookBuffer),
  };
  await writeFile(
    path.join(artifactDir, "api-verification.json"),
    `${JSON.stringify(verification, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "generated-file-id.txt"),
    `${reportBody.generatedFile.id}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactDir, "actor-user-id.txt"),
    `${me.id}\n`,
    "utf8",
  );
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
});

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
