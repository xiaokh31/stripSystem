# Bestar Native Scan App

Standalone React Native scan client for warehouse operators.

This app is intentionally separate from the office web app and the existing
`/mobile/*` browser pages. It is the P6-MOBILE native client that will package
as Android APK, iOS IPA, and Windows MSIX.

## Scope

- LAN API URL setting.
- Device identity.
- API health connectivity check.
- Login with existing Bestar accounts through `POST /api/auth/login`.
- Current-user restore through `GET /api/auth/me`.
- Logout and local token clearing.
- Session expired and scan permission denied states.
- Native planned/in-progress load job list from `GET /api/load-jobs`.
- Native scan screen from `GET /api/load-jobs/:id`.
- Real scan submission through `POST /api/load-jobs/:id/scan`.
- Scanner-gun/manual input with Enter submit.
- Native camera scanner adapter through `NativeModules.BestarQrScanner`.
- Offline scan queue with manual/API-recovery sync.
- Supervisor override through the existing scan API with required reason and
  second confirmation.
- Dock No. update and complete loading through the existing protected load job
  APIs.
- Release packaging runbook for Windows MSIX, Android APK, and iOS IPA.
- Android native camera QR module source for `BestarQrScanner`.
- Platform secure token store through `NativeModules.BestarSecureTokenStore`.
- iOS/Windows native module source boundaries awaiting generated platform
  project integration and build-machine smoke results.
- P6-MOBILE-13 Windows MSIX readiness checklist and `windows:check` handoff
  command for the Windows 11 build machine.

## Token Storage

P6-MOBILE-10 keeps tokens behind the `SecureTokenStore` interface and requires
the native module named `BestarSecureTokenStore` in production builds. There is
no silent production fallback to AsyncStorage for JWT storage.

Platform storage:

- Android: Android Keystore AES-GCM key with ciphertext and IV in private
  SharedPreferences.
- iOS: Keychain generic-password storage.
- Windows: Windows Credential Locker.

Tests may explicitly inject `MemorySecureTokenStore`. Local settings such as
the LAN API URL and offline scan queue remain in app-controlled storage and are
separate from auth token storage.

## Native Camera Scanner

P6-MOBILE-05 uses a native module boundary named `BestarQrScanner`:

```ts
NativeModules.BestarQrScanner.scanOnce(): Promise<string>
```

This keeps camera scanning native and avoids browser `getUserMedia` and HTTPS
secure-context rules. Android now includes a CameraX/ML Kit implementation under
`android/app/src/main/java/com/bestar/nativescan`. iOS and Windows have
reviewable module source boundaries under `ios/BestarQrScanner` and
`windows/BestarQrScanner`, but still need generated platform projects and device
validation. Scanner-gun and manual input remain available when the native camera
module or camera permission is unavailable.

## Offline Queue

P6-MOBILE-06 stores network-send failures in a native app controlled queue. Each
record keeps:

- `localId`
- `loadJobId`
- `qrPayload`
- `scannedAt`
- `deviceId`
- `syncStatus`
- `lastError`

Pending queue records are not treated as loaded inventory. Retry always calls
the real `POST /api/load-jobs/:id/scan` endpoint and relies on backend duplicate
handling.

## Commands

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app build
pnpm --filter mobile-scan-app package:check
pnpm --filter mobile-scan-app package:check -- --strict
pnpm --filter mobile-scan-app windows:check
```

`package:check` reports all three platform states. Strict mode is the release
gate and fails while iOS or Windows generated project markers are missing.
`windows:check` is stricter for the Windows MSIX follow-up: it fails until it is
run on Windows with generated `.sln`, `.vcxproj`, and `Package.appxmanifest`
markers present.

Task-by-task manual testing is documented in:

```text
docs/runbooks/native-scan-app-testing.md
docs/runbooks/native-scan-app-release.md
```

Native platform commands require React Native dependencies and platform tooling:

```bash
pnpm --filter mobile-scan-app android
pnpm --filter mobile-scan-app ios
pnpm --filter mobile-scan-app windows
```
