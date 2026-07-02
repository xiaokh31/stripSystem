# Native Scan App Architecture Execution Plan

## Status

P6-MOBILE-01 architecture decision, accepted for implementation planning.

This document turns `docs/adr/0003-native-scan-app.md` and
`docs/product/01-cross-platform-mobile-scan-app.md` into an execution plan for a
standalone installed Native Scan App. It is not an office web app, not a PWA,
and not a WebView-first wrapper.

## Decision

Build the P6-MOBILE client with React Native and React Native Windows:

- Android: React Native native app.
- iOS: React Native native app.
- Windows: React Native Windows native app.
- Language: TypeScript.
- App workspace: `apps/mobile-scan-app`.
- Internal package name: `mobile-scan-app`.

The app contains only:

- LAN API settings and device identity.
- Login/logout and current user.
- Load job list.
- Native scan workflow.
- Scanner-gun/manual input.
- Offline scan queue.
- Supervisor override when the user has `scan.override`.
- Complete loading when permitted.

It must not contain office import, report, label, admin, settings, correction, or
container management screens.

## Why This Is Native

The driver for this project is that browser-based mobile scan can be blocked by
HTTPS/camera restrictions in a local LAN deployment. The native app therefore
uses platform camera APIs through React Native modules. Camera scanning must not
depend on browser `getUserMedia`, browser secure-context rules, PWA install
behavior, or a WebView wrapper.

The existing `/mobile/*` web routes remain a workflow reference and temporary
fallback. They are not the P6-MOBILE target.

## Version Strategy

React Native Windows version alignment is the controlling constraint.

P6-MOBILE-02 must select and pin a React Native and React Native Windows pair
from the official React Native Windows compatibility guidance at scaffold time.
Do not start with an Android/iOS React Native version that Windows cannot
follow. If Android/iOS support is ahead of Windows support, choose the latest
stable React Native version that is compatible with React Native Windows.

The React Native new architecture setting must also follow the generated
template and official React Native Windows guidance for the selected version.

## Workspace Layout

Expected structure:

```text
apps/mobile-scan-app/
  android/
  ios/
  windows/
  src/
    app/
    api/
    auth/
    config/
    device/
    load-jobs/
    scan/
    offline-queue/
    storage/
    ui/
  __tests__/
  package.json
  tsconfig.json
```

The app may share pure TypeScript DTOs or API-client helpers with existing code
only if that sharing does not pull in Next.js, browser-only APIs, React DOM, or
office UI code. Any shared code must be platform-neutral.

## Runtime Dependencies

Required categories:

- React Native core runtime.
- React Native Windows.
- Navigation for native screens.
- Native camera/QR scanning.
- Secure token storage.
- Local persistent queue storage.
- Network client with explicit API base URL handling.
- Date/time formatting using device locale/time zone.

Recommended initial candidates:

- Navigation: React Navigation or a minimal native screen state machine if the
  first release remains small.
- Android/iOS QR scanning: VisionCamera barcode scanner or an equivalent
  maintained native scanner.
- Windows QR scanning: scanner-gun/manual input first; camera support requires
  P6-MOBILE-01 follow-up validation of a Windows native module.
- Token storage:
  - iOS: Keychain.
  - Android: Keystore-backed secure storage.
  - Windows: Windows Credential Locker through a native module or supported
    community package.
- Offline queue storage: SQLite or another native durable store. The queue
  must not use browser `localStorage` as the final implementation.

Dependency choices are not allowed to weaken business rules. If a package lacks
Windows support, the implementation must isolate that feature behind a platform
adapter.

## Platform Adapters

Use explicit interfaces:

```text
CameraScanner
  start()
  stop()
  onCode(payload)

SecureTokenStore
  getToken()
  setToken(token)
  clearToken()

DeviceStore
  getOrCreateDeviceId()
  getApiBaseUrl()
  setApiBaseUrl(url)

OfflineQueueStore
  enqueue(scan)
  list()
  markSynced(localId)
  markFailed(localId, error)
```

The scan flow must call these interfaces, not platform APIs directly. This keeps
Android/iOS/Windows differences contained and makes tests deterministic.

## API Contract

P6-MOBILE reuses existing API contracts. No new API is required for P6-MOBILE-01.

Required endpoints:

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/load-jobs`
- `GET /api/load-jobs/:id`
- `PATCH /api/load-jobs/:id`
- `POST /api/load-jobs/:id/scan`
- `POST /api/load-jobs/:id/scan/reverse`
- `POST /api/load-jobs/:id/close`

Rules:

- All calls use the configured LAN API base URL.
- Authenticated calls use the existing Bearer token contract.
- Scan requests must include the selected `loadJobId` in the route.
- Device identity should be included where the existing API accepts `deviceId`.
- Supervisor override uses the existing scan request fields:
  `supervisorOverride: true` and `overrideReason`.

## Business Rules Preserved

- The app never decrements inventory locally.
- A scan changes inventory only after the backend scan transaction accepts it.
- Duplicate scans rely on backend idempotency.
- Pending offline scans are not inventory truth.
- Offline queue records must preserve `loadJobId`, `qrPayload`, `scannedAt`,
  `deviceId`, `syncStatus`, and `lastError`.
- Same-container split loading must not merge queue records across load jobs.
- Supervisor override requires permission, reason, explicit confirmation, and
  backend audit.
- Complete loading must keep the existing dock number and user attribution
  rules.

## LAN And Security Plan

The app stores a configurable API base URL, for example:

```text
http://192.168.1.10/api
https://warehouse-server.local/api
```

Camera scanning no longer depends on HTTPS because scanning is native. API
transport is a separate security decision:

- Pilot LAN may use HTTP if the site accepts the credential risk.
- Production should prefer HTTPS with a trusted internal certificate, because
  login passwords and JWTs travel over the LAN.
- The app must show API reachability and authenticated-user status.
- The app must never log passwords, full JWTs, signing secrets, or keystore
  passwords.

## Build And Packaging Plan

### Shared Scaffold

P6-MOBILE-02 should scaffold under `apps/mobile-scan-app` and add pnpm scripts:

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "android": "react-native run-android",
    "ios": "react-native run-ios",
    "windows": "react-native run-windows"
  }
}
```

Exact commands may change based on the generated React Native template, but
these script names should remain stable for task prompts.

### Android APK / AAB

Build outputs:

- Debug install: Android debug APK through Gradle/React Native CLI.
- Internal warehouse sideload: signed release APK.
- Store-style release: signed AAB.

Required setup:

- Android Studio.
- JDK.
- Android SDK.
- Camera permission in native manifest.
- Upload/release signing key kept outside git.

Expected release command category:

```bash
pnpm --filter mobile-scan-app android -- --mode release
pnpm --filter mobile-scan-app exec react-native build-android --mode=release
```

For sideload APK, P6-MOBILE-08 must add the exact Gradle assemble command once
the scaffold exists.

Risk:

- Some Android PDA devices expose hardware scanners as keyboard input; those
  must work through the manual/scanner input even if camera permissions fail.
- Proguard/minification can break native scanner dependencies and must be tested
  before enabling.

### iOS IPA

Build outputs:

- Debug device build through Xcode.
- Release archive through Xcode.
- IPA via App Store Connect/TestFlight, MDM, or Apple enterprise distribution
  depending on company account eligibility.

Required setup:

- macOS build machine.
- Xcode.
- Apple Developer account.
- Bundle identifier.
- Signing certificate.
- Provisioning profile.
- Camera usage description in `Info.plist`.

Expected release path:

```text
Xcode -> Product -> Archive -> Distribute App
```

Risk:

- IPA distribution is not just a technical build; it depends on Apple account,
  signing, provisioning, and device distribution policy.
- If the company has no Apple Developer/MDM path, iOS must remain deferred while
  Android and Windows proceed.

### Windows Native App / MSIX Requirement

React Native Windows creates a native Windows app project under `windows/`.

Development command:

```bash
pnpm --filter mobile-scan-app windows
```

Release build path:

```text
Open windows/*.sln in Visual Studio
Select Release + x64
Build solution
Project -> Publish -> Create App Packages...
```

Expected distributable:

- MSIX/APPX package for normal Windows app installation.
- Windows release scope is MSIX. Do not add a separate `.exe` bootstrapper
  unless a future task explicitly changes this decision.

Required setup:

- Windows 11 build machine.
- Visual Studio with Windows app workload.
- Windows SDK.
- Code-signing certificate for trusted installation.

Risk:

- React Native Windows camera QR scanning may require a custom native module.
- Warehouse Windows devices may be better served by scanner-gun keyboard input
  than camera scanning. Camera support remains required if Windows tablets with
  cameras are part of acceptance.

## Native Camera Plan

Android/iOS:

- Use a native scanner module.
- Prefer QR-only scanning for performance.
- Request camera permission through native permission APIs.
- If camera permission is denied, keep scanner-gun/manual input available.

Windows:

- Scanner-gun/manual input is the baseline.
- Camera QR support requires evaluation of a Windows-native module using
  Windows camera APIs plus a barcode/QR decoder.
- Do not block P6-MOBILE-02 through P6-MOBILE-04 on Windows camera parity.
  Block P6-MOBILE Exit Gate if Windows camera is an explicit pilot device
  requirement and remains unimplemented.

## Testing Plan

Architecture-only task:

```bash
git diff --check
```

After scaffold:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
```

Before release:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter api test:e2e
scripts/healthcheck.sh
```

Manual device tests:

- Configure LAN API URL.
- Login as WAREHOUSE.
- Login denial for unauthorized user.
- List real load jobs.
- Scan real QR with native camera.
- Scan with hardware scanner/manual input.
- Duplicate scan does not double decrement.
- Offline queue records pending and later syncs.
- Supervisor override only appears for authorized users.
- Complete loading requires dock number when applicable.

## Implementation Sequence

1. P6-MOBILE-02: scaffold React Native + React Native Windows workspace and LAN
   API settings.
2. P6-MOBILE-03: auth session and secure token storage.
3. P6-MOBILE-04: real load job list.
4. P6-MOBILE-05: native scan workflow for Android/iOS and scanner-gun/manual
   input for all platforms.
5. P6-MOBILE-06: native offline queue.
6. P6-MOBILE-07: supervisor override and complete loading.
7. P6-MOBILE-08: packaging and LAN deployment runbook.
8. P6-MOBILE Exit Gate: device and release validation.

## Open Risks

- Windows camera QR scanning has higher native-module risk than Android/iOS.
- iOS IPA distribution depends on Apple account and device management decisions.
- Production should use HTTPS for credentials even though camera scanning no
  longer depends on browser HTTPS.
- Shared TypeScript code must not pull browser/Next.js dependencies into the
  native app.
- Signing secrets for Android, iOS, and Windows must be stored outside git and
  outside normal `.env` files committed to the repo.

## References

- React Native environment setup:
  https://reactnative.dev/docs/environment-setup
- React Native Android release signing:
  https://reactnative.dev/docs/signed-apk-android
- React Native iOS release/archive flow:
  https://reactnative.dev/docs/publishing-to-app-store
- React Native Windows getting started and packaging:
  https://microsoft.github.io/react-native-windows/docs/getting-started/
- React Native Windows native modules:
  https://microsoft.github.io/react-native-windows/docs/native-modules
- VisionCamera barcode scanner:
  https://visioncamera.margelo.com/docs/barcode-scanner
