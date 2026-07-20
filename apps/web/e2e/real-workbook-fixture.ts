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
const UNSUPPORTED_SOURCE_CONTAINER_NO = "CAIU9927541";
const UNSUPPORTED_SOURCE_TITLE = `6.9 ${UNSUPPORTED_SOURCE_CONTAINER_NO}分仓单`;
const UNSUPPORTED_SOURCE_WORKBOOK = path.resolve(
  __dirname,
  "../../..",
  "samples/unloading-plans/CA-卡尔加里分仓单-CAIU9927541(1).xlsx",
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
        "            try:",
        "                text = value.decode('utf-8')",
        "            except UnicodeDecodeError:",
        "                output_zip.writestr(info, value)",
        "                continue",
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

export async function createDerivedUnsupportedWorkbook(
  testInfo: TestInfo,
  containerNo: string,
): Promise<string> {
  const workbookPath = testInfo.outputPath(
    `${containerNo} unsupported warehouse split.xlsx`,
  );
  await mkdir(path.dirname(workbookPath), { recursive: true });

  await execFileAsync(
    "python3",
    [
      "-c",
      [
        "from zipfile import ZIP_DEFLATED, ZipFile",
        "import sys",
        "source, output, old_title, new_container, old_city = sys.argv[1:]",
        "hits = {'title': 0, 'city': 0}",
        "with ZipFile(source, 'r') as source_zip, ZipFile(output, 'w', ZIP_DEFLATED) as output_zip:",
        "    for info in source_zip.infolist():",
        "        value = source_zip.read(info.filename)",
        "        if info.filename.endswith('.xml'):",
        "            try:",
        "                text = value.decode('utf-8')",
        "            except UnicodeDecodeError:",
        "                output_zip.writestr(info, value)",
        "                continue",
        "            title_count = text.count(old_title)",
        "            city_count = text.count(old_city)",
        "            if title_count or city_count:",
        "                text = text.replace(old_title, new_container).replace(old_city, 'CARTON')",
        "                value = text.encode('utf-8')",
        "                hits['title'] += title_count",
        "                hits['city'] += city_count",
        "        output_zip.writestr(info, value)",
        "if hits['title'] == 0 or hits['city'] == 0:",
        "    raise SystemExit(f'unsupported workbook substitutions missing: {hits}')",
      ].join("\n"),
      UNSUPPORTED_SOURCE_WORKBOOK,
      workbookPath,
      UNSUPPORTED_SOURCE_TITLE,
      containerNo,
      "CALGARY,AB",
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
