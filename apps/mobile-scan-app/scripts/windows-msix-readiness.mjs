import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const json = process.argv.includes("--json");

const checks = [
  {
    code: "WINDOWS_HOST",
    ok: process.platform === "win32",
    message:
      process.platform === "win32"
        ? "Running on Windows."
        : `Running on ${process.platform}; MSIX release requires Windows 11.`,
  },
  markerCheck("WINDOWS_SOLUTION", "windows/**/*.sln", () =>
    hasFileOrDirectoryWithExtension(join(appRoot, "windows"), ".sln", 2),
  ),
  markerCheck("WINDOWS_PROJECT", "windows/**/*.vcxproj", () =>
    hasFileOrDirectoryWithExtension(join(appRoot, "windows"), ".vcxproj", 5),
  ),
  markerCheck("WINDOWS_MANIFEST", "windows/**/Package.appxmanifest", () =>
    hasFileNamed(join(appRoot, "windows"), "Package.appxmanifest", 5),
  ),
  markerCheck(
    "QR_SCANNER_MODULE_SOURCE",
    "windows/BestarQrScanner/BestarQrScannerModule.cs",
    () =>
      existsSync(
        join(appRoot, "windows/BestarQrScanner/BestarQrScannerModule.cs"),
      ),
  ),
  markerCheck(
    "SECURE_TOKEN_MODULE_SOURCE",
    "windows/BestarQrScanner/BestarSecureTokenStoreModule.cs",
    () =>
      existsSync(
        join(appRoot, "windows/BestarQrScanner/BestarSecureTokenStoreModule.cs"),
      ),
  ),
  {
    code: "WINDOWS_CREDENTIAL_LOCKER_SOURCE",
    ok: fileContains(
      "windows/BestarQrScanner/BestarSecureTokenStoreModule.cs",
      "Windows.Security.Credentials",
    ),
    message:
      "BestarSecureTokenStoreModule.cs must use Windows Credential Locker.",
  },
  {
    code: "QR_CAMERA_RELEASE_DECISION",
    ok: fileContains("windows/PLATFORM-STATUS.md", "scanner-gun/manual"),
    message:
      "Windows camera QR scanner remains blocked until an approved decoder is wired, or scanner-gun/manual input is accepted for Windows pilot.",
  },
  {
    code: "MSIX_SECRET_GUARDRAILS",
    ok: guardrailPatternsPresent(),
    message:
      "Repository ignore rules must keep MSIX/AppX packages and signing secrets out of git.",
  },
  {
    code: "WINDOWS_RELEASE_CHECKLIST",
    ok: existsSync(join(appRoot, "windows/P6-MOBILE-13-MSIX-RELEASE-CHECKLIST.md")),
    message:
      "Windows release evidence checklist must exist for the build-machine handoff.",
  },
];

const failed = checks.filter((check) => !check.ok);
const result = {
  status: failed.length === 0 ? "ready" : "blocked",
  host: `${process.platform} ${process.arch}`,
  requiredBuildMachine:
    "Windows 11 + Visual Studio 2022 + Windows SDK + MSIX packaging tools",
  checks,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Bestar Native Scan App Windows MSIX readiness");
  console.log(`Host: ${result.host}`);
  console.log(`Required build machine: ${result.requiredBuildMachine}`);
  console.log("");
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "BLOCKED"} ${check.code}`);
    console.log(`  ${check.message}`);
  }
  console.log("");
  console.log(`Windows MSIX release status: ${result.status}`);
  if (failed.length > 0) {
    console.log(
      `Blocking checks: ${failed.map((check) => check.code).join(", ")}`,
    );
  }
}

if (failed.length > 0) {
  process.exit(1);
}

function markerCheck(code, label, check) {
  const ok = check();
  return {
    code,
    ok,
    message: ok ? `${label} present.` : `${label} missing.`,
  };
}

function fileContains(relativePath, text) {
  const path = join(appRoot, relativePath);
  return existsSync(path) && readFileSync(path, "utf8").includes(text);
}

function guardrailPatternsPresent() {
  const gitignorePath = join(appRoot, "../../.gitignore");
  if (!existsSync(gitignorePath)) {
    return false;
  }
  const gitignore = readFileSync(gitignorePath, "utf8");
  return ["*.pfx", "*.msix", "*.msixbundle", "*.appx", "*.appxbundle"].every(
    (pattern) => gitignore.includes(pattern),
  );
}

function hasFileOrDirectoryWithExtension(directory, extension, depth) {
  if (!existsSync(directory) || depth < 0) {
    return false;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if ((entry.isFile() || entry.isDirectory()) && entry.name.endsWith(extension)) {
      return true;
    }
    if (
      entry.isDirectory() &&
      hasFileOrDirectoryWithExtension(entryPath, extension, depth - 1)
    ) {
      return true;
    }
  }

  return false;
}

function hasFileNamed(directory, fileName, depth) {
  if (!existsSync(directory) || depth < 0) {
    return false;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isFile() && entry.name === fileName) {
      return true;
    }
    if (entry.isDirectory() && hasFileNamed(entryPath, fileName, depth - 1)) {
      return true;
    }
  }

  return false;
}
