import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const platform = process.argv[2];

const checksByPlatform = {
  android: [
    contains(
      "ANDROID_KEYSTORE",
      "android/app/src/main/java/com/bestar/nativescan/BestarSecureTokenStoreModule.kt",
      "AndroidKeyStore",
    ),
    contains(
      "ATOMIC_SESSION_COMMIT",
      "android/app/src/main/java/com/bestar/nativescan/BestarSecureTokenStoreModule.kt",
      ".commit()",
    ),
    contains(
      "NO_ASYNC_STORAGE_SECRET_FALLBACK",
      "src/auth/token-store.ts",
      "secure token storage is required in production builds",
    ),
  ],
  ios: [
    contains(
      "IOS_KEYCHAIN",
      "ios/BestarQrScanner/BestarSecureTokenStore.swift",
      "kSecClassGenericPassword",
    ),
    contains(
      "ATOMIC_KEYCHAIN_UPDATE",
      "ios/BestarQrScanner/BestarSecureTokenStore.swift",
      "SecItemUpdate",
    ),
    contains(
      "THIS_DEVICE_ONLY",
      "ios/BestarQrScanner/BestarSecureTokenStore.swift",
      "kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly",
    ),
  ],
};

if (!(platform in checksByPlatform)) {
  console.error("Usage: native-auth-platform-check.mjs android|ios");
  process.exit(2);
}

const checks = checksByPlatform[platform].map((check) => ({
  ...check,
  ok: check.run(),
}));
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.code}: ${check.path}`);
}
if (checks.some((check) => !check.ok)) process.exit(1);

function contains(code, path, expected) {
  return {
    code,
    path,
    run() {
      const absolutePath = join(appRoot, path);
      return (
        existsSync(absolutePath) &&
        readFileSync(absolutePath, "utf8").includes(expected)
      );
    },
  };
}
