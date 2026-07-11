import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJsonPath = join(appRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const strict = process.argv.includes("--strict");

const requiredScripts = [
  "android",
  "ios",
  "windows",
  "windows:check",
  "build",
  "test",
];
const missingScripts = requiredScripts.filter(
  (script) => !packageJson.scripts?.[script],
);
const expectedDependencies = ["react-native", "react-native-windows"];
const missingDependencies = expectedDependencies.filter(
  (dependency) => !packageJson.dependencies?.[dependency],
);

const platformChecks = [
  {
    buildMachine: "macOS/Linux/Windows with Android Studio and Android SDK",
    generatedMarkers: [
      pathMarker("android/gradlew"),
      pathMarker("android/app/build.gradle"),
      pathMarker("android/app/src/main/AndroidManifest.xml"),
    ],
    name: "Android",
    nextStep:
      "Use cd apps/mobile-scan-app/android && ./gradlew assembleDebug or assembleRelease.",
    releaseCommand:
      "cd apps/mobile-scan-app/android && ./gradlew assembleRelease",
    sourceBoundaryMarkers: [
      pathMarker("android/app/src/main/java/com/bestar/nativescan/BestarQrScannerModule.kt"),
      pathMarker(
        "android/app/src/main/java/com/bestar/nativescan/BestarSecureTokenStoreModule.kt",
      ),
    ],
  },
  {
    buildMachine: "macOS with Xcode, CocoaPods, Apple signing, and target devices",
    generatedMarkers: [
      pathMarker("ios/Podfile"),
      extensionMarker("ios", ".xcodeproj", 2),
      extensionMarker("ios", ".xcworkspace", 2),
      fileNameMarker("ios", "Info.plist", 4),
    ],
    name: "iOS",
    nextStep:
      "Generate/restore the React Native iOS project on macOS, add BestarQrScanner sources to the app target, run pod install, then build-ios.",
    releaseCommand:
      "pnpm --filter mobile-scan-app exec react-native build-ios --mode Release",
    sourceBoundaryMarkers: [
      pathMarker("ios/BestarQrScanner/BestarQrScanner.swift"),
      pathMarker("ios/BestarQrScanner/BestarSecureTokenStore.swift"),
      pathMarker("ios/BestarQrScanner/BestarQrScannerBridge.m"),
    ],
  },
  {
    buildMachine: "Windows 11 with Visual Studio 2022, Windows SDK, and MSIX signing",
    generatedMarkers: [
      extensionMarker("windows", ".sln", 2),
      extensionMarker("windows", ".vcxproj", 5),
      fileNameMarker("windows", "Package.appxmanifest", 5),
    ],
    name: "Windows",
    nextStep:
      "Generate/restore the React Native Windows project on Windows 11, add the C# native modules to the project, then build the MSIX.",
    releaseCommand:
      "pnpm --filter mobile-scan-app windows -- --release --arch x64",
    sourceBoundaryMarkers: [
      pathMarker("windows/BestarQrScanner/BestarQrScannerModule.cs"),
      pathMarker("windows/BestarQrScanner/BestarSecureTokenStoreModule.cs"),
    ],
  },
];

console.log("Bestar Native Scan App packaging readiness");
console.log(`Host: ${process.platform} ${process.arch}`);
console.log(`React Native: ${packageJson.dependencies?.["react-native"] ?? "missing"}`);
console.log(
  `React Native Windows: ${
    packageJson.dependencies?.["react-native-windows"] ?? "missing"
  }`,
);
console.log(`Xcode CLI: ${commandExists("xcodebuild") ? "available" : "not found"}`);
console.log(
  `Windows build tools: ${
    process.platform === "win32"
      ? "run Visual Studio/MSBuild checks on this machine"
      : "requires Windows 11 build machine"
  }`,
);

const blockedPlatforms = [];
for (const platform of platformChecks) {
  const sourceBoundary = markerSummary(appRoot, platform.sourceBoundaryMarkers);
  const generated = markerSummary(appRoot, platform.generatedMarkers);
  const status = generated.missing.length === 0 ? "ready" : "blocked";
  if (status === "blocked") {
    blockedPlatforms.push(platform.name);
  }

  console.log("");
  console.log(`${platform.name}: ${status}`);
  console.log(
    `  Source boundary: ${
      sourceBoundary.missing.length === 0
        ? "present"
        : `incomplete; missing ${sourceBoundary.missing.join(", ")}`
    }`,
  );
  console.log(
    `  Generated project markers: ${
      generated.missing.length === 0
        ? `present (${generated.present.join(", ")})`
        : `missing ${generated.missing.join(", ")}`
    }`,
  );
  console.log(`  Build machine: ${platform.buildMachine}`);
  console.log(`  Release path: ${platform.releaseCommand}`);
  if (status === "blocked") {
    console.log(`  Next step: ${platform.nextStep}`);
  }
}

if (missingScripts.length > 0 || missingDependencies.length > 0) {
  if (missingScripts.length > 0) {
    console.error(`Missing scripts: ${missingScripts.join(", ")}`);
  }
  if (missingDependencies.length > 0) {
    console.error(`Missing dependencies: ${missingDependencies.join(", ")}`);
  }
  process.exit(1);
}

console.log("");
console.log("Shared TypeScript packaging prerequisites are present.");
if (blockedPlatforms.length > 0) {
  console.log(`P6 native platform readiness is blocked for: ${blockedPlatforms.join(", ")}.`);
  if (strict) {
    process.exit(1);
  }
}

function markerSummary(root, markers) {
  const present = [];
  const missing = [];
  for (const marker of markers) {
    if (marker.check(root)) {
      present.push(marker.label);
    } else {
      missing.push(marker.label);
    }
  }
  return { missing, present };
}

function pathMarker(relativePath) {
  return {
    check(root) {
      return existsSync(join(root, relativePath));
    },
    label: relativePath,
  };
}

function extensionMarker(relativePath, extension, depth) {
  return {
    check(root) {
      return hasFileOrDirectoryWithExtension(join(root, relativePath), extension, depth);
    },
    label: `${relativePath}/**/*${extension}`,
  };
}

function fileNameMarker(relativePath, fileName, depth) {
  return {
    check(root) {
      return hasFileNamed(join(root, relativePath), fileName, depth);
    },
    label: `${relativePath}/**/${fileName}`,
  };
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
    if (entry.isDirectory() && hasFileOrDirectoryWithExtension(entryPath, extension, depth - 1)) {
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

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}
