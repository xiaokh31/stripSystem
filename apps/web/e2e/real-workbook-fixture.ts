import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { TestInfo } from "@playwright/test";

const execFileAsync = promisify(execFile);
const SOURCE_CONTAINER_NO = "CAAU8011090";
const SOURCE_WORKBOOK = path.resolve(
  __dirname,
  "../../..",
  "samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx",
);
let lastContainerDigits = -1;

export async function createDerivedRealWorkbook(
  testInfo: TestInfo,
  containerNo: string,
): Promise<string> {
  const workbookPath = testInfo.outputPath(`${containerNo} UNLOADING PLAN.xlsx`);
  await mkdir(path.dirname(workbookPath), { recursive: true });

  await execFileAsync(
    "python3",
    [
      "-c",
      [
        "from zipfile import ZIP_DEFLATED, ZipFile",
        "import sys",
        "source, output, old, new = sys.argv[1:]",
        "hits = 0",
        "with ZipFile(source, 'r') as source_zip, ZipFile(output, 'w', ZIP_DEFLATED) as output_zip:",
        "    for info in source_zip.infolist():",
        "        value = source_zip.read(info.filename)",
        "        if info.filename.endswith('.xml'):",
        "            text = value.decode('utf-8')",
        "            count = text.count(old)",
        "            if count:",
        "                value = text.replace(old, new).encode('utf-8')",
        "                hits += count",
        "        output_zip.writestr(info, value)",
        "if hits == 0:",
        "    raise SystemExit(f'container number {old} was not found in source workbook')",
      ].join("\n"),
      SOURCE_WORKBOOK,
      workbookPath,
      SOURCE_CONTAINER_NO,
      containerNo,
    ],
    { timeout: 30_000 },
  );

  return workbookPath;
}

export function uniquePolicyContainerNo(): string {
  const timestampValue = Date.now() % 10_000_000;
  lastContainerDigits =
    timestampValue <= lastContainerDigits
      ? (lastContainerDigits + 1) % 10_000_000
      : timestampValue;
  const timestampDigits = String(lastContainerDigits).padStart(7, "0");
  return `TSPU${timestampDigits}`;
}
