import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJsonPath = join(appRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const requiredScripts = ["android", "ios", "windows", "build", "test"];
const missingScripts = requiredScripts.filter((script) => !packageJson.scripts?.[script]);
const expectedDependencies = ["react-native", "react-native-windows"];
const missingDependencies = expectedDependencies.filter(
  (dependency) => !packageJson.dependencies?.[dependency],
);

const platformDirs = [
  {
    markers: ["android/gradlew", "android/app/build.gradle"],
    name: "Android",
    path: "android",
    releaseCommand:
      "cd apps/mobile-scan-app/android && ./gradlew assembleRelease",
  },
  {
    markers: ["ios/Podfile"],
    name: "iOS",
    path: "ios",
    releaseCommand:
      "Open apps/mobile-scan-app/ios/*.xcworkspace in Xcode, then Product > Archive",
  },
  {
    markers: ["windows/*.sln", "windows/**/*.vcxproj"],
    name: "Windows",
    path: "windows",
    releaseCommand:
      "pnpm --filter mobile-scan-app windows -- --release --arch x64",
  },
];

console.log("Bestar Native Scan App packaging readiness");
console.log(`React Native: ${packageJson.dependencies?.["react-native"] ?? "missing"}`);
console.log(
  `React Native Windows: ${
    packageJson.dependencies?.["react-native-windows"] ?? "missing"
  }`,
);

for (const platform of platformDirs) {
  const directoryPresent = existsSync(join(appRoot, platform.path));
  const generated =
    directoryPresent &&
    platform.markers.some((marker) => hasMarker(appRoot, marker));
  console.log(
    `${platform.name}: ${
      generated
        ? "platform project generated"
        : directoryPresent
          ? "placeholder directory present; platform project not generated yet"
          : "platform project not generated yet"
    }`,
  );
  console.log(`  Release path: ${platform.releaseCommand}`);
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

console.log("Shared TypeScript packaging prerequisites are present.");

function hasMarker(root, marker) {
  if (!marker.includes("*")) {
    return existsSync(join(root, marker));
  }

  if (marker === "windows/*.sln") {
    return hasFileWithExtension(join(root, "windows"), ".sln", 1);
  }

  if (marker === "windows/**/*.vcxproj") {
    return hasFileWithExtension(join(root, "windows"), ".vcxproj", 4);
  }

  return false;
}

function hasFileWithExtension(directory, extension, depth) {
  if (!existsSync(directory) || depth < 0) {
    return false;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith(extension)) {
      return true;
    }
    if (entry.isDirectory() && hasFileWithExtension(entryPath, extension, depth - 1)) {
      return true;
    }
  }

  return false;
}
