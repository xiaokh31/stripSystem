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
- Future tasks add platform camera module wiring and generated native platform
  project hardening.

## Token Storage

P6-MOBILE-03 stores tokens behind a `SecureTokenStore` interface. The current
scaffold uses an AsyncStorage fallback so the native auth flow can be tested
before platform projects and native secure-storage modules are generated.

Risk: AsyncStorage is not the final production token store. Before pilot
release, replace the fallback with platform secure storage:

- iOS: Keychain.
- Android: Keystore-backed secure storage.
- Windows: Windows Credential Locker or a reviewed native module.

## Native Camera Scanner

P6-MOBILE-05 uses a native module boundary named `BestarQrScanner`:

```ts
NativeModules.BestarQrScanner.scanOnce(): Promise<string>
```

This keeps camera scanning native and avoids browser `getUserMedia` and HTTPS
secure-context rules. Platform projects still need the Android/iOS/Windows
native implementation of that module before camera scanning can pass device
acceptance. Scanner-gun and manual input remain available when the native camera
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
```

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
