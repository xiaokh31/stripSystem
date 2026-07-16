# Native Scan App Testing Runbook

## Current Delivery Scope (2026-07-15)

Android and iOS are the active Native test/release platforms. The Windows RNW,
Credential Locker, camera, MSIX and Windows-device matrix is archived. Existing
Windows/P6-MOBILE-09 through 13 sections are historical reactivation references
and must not be executed while their Task files carry `Task-Status: ARCHIVED`.

This runbook explains how to test the P6-MOBILE native scan app work as it is
being built. The app lives in `apps/mobile-scan-app` and is a standalone native
React Native app, not the office web app and not a WebView wrapper.

## Report Rule

After each P6-MOBILE task or phase gate, update:

```bash
docs/reports/project-completion-status.html
```

The report must state what changed, what is still missing, and whether the
native app can be used for pilot testing.

## Shared Prerequisites

Install dependencies:

```bash
pnpm install
```

Run the local Docker full stack when a task needs real API data:

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
```

Local routing:

- Office web: `http://127.0.0.1/`
- API through nginx: `http://127.0.0.1/api`
- Native app LAN API base URL on the same machine: `http://127.0.0.1/api`
- Native app LAN API base URL from another device: `http://<server-lan-ip>/api`

## P6-MOBILE-01 Architecture Decision

Purpose:
- Confirm the native app is React Native + React Native Windows.
- Confirm Windows output is MSIX.
- Confirm the app is native, not browser/PWA/WebView.

Automated check:

```bash
git diff --check
```

Manual review:
1. Open `docs/architecture/10-native-scan-app-architecture.md`.
2. Confirm it says Android/iOS use React Native and Windows uses React Native
   Windows.
3. Confirm Windows release scope is MSIX.
4. Confirm browser `getUserMedia`, PWA, and WebView-first wrappers are rejected
   as the final scan app approach.

## P6-MOBILE-02 Scaffold + LAN Settings

Purpose:
- Create `apps/mobile-scan-app`.
- Add LAN API base URL setting.
- Add stable device identity.
- Add API health check.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app build
```

Manual review:
1. Confirm `apps/mobile-scan-app/README.md` exists.
2. Confirm `apps/mobile-scan-app/src/config/lan-settings.ts` persists the API
   base URL.
3. Confirm `apps/mobile-scan-app/src/device/device-id.ts` creates a stable
   device id.
4. Confirm `GET /api/health` is called through the configured API base URL.

Device test when native tooling is available:
1. Start the app on a device/emulator.
2. Enter the LAN API base URL.
3. Tap `Save and check API`.
4. Confirm the health status changes to reachable when the API is up.

## P6-MOBILE-03 / NATIVE-AUTH-01 Native Login + Revocable Session

Purpose:
- Login with real Bestar accounts and stable device identity.
- Restore through a valid access token or silent rotating refresh.
- Revoke server session on logout and clear the local secure record.
- Preserve a valid session during temporary network failure.
- Show localized revoked, inactive, re-login, offline, and permission states.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app android:check
pnpm --filter mobile-scan-app ios:check
pnpm --filter mobile-scan-app windows:check
pnpm --filter api test -- auth --runInBand
pnpm --filter api test:e2e -- auth --runInBand
```

Manual API setup:
1. Start Docker full stack.
2. Confirm the API is healthy at `http://127.0.0.1/api/health`.
3. Confirm the deployment has real ADMIN, OFFICE, and WAREHOUSE accounts.
4. Confirm all Prisma migrations are applied.
5. Confirm the Native auth lifetime/rate variables in `.env` match the intended
   deployment policy.

Device test:
1. Set API base URL to `http://<server-lan-ip>/api`.
2. Login as a WAREHOUSE user.
3. Confirm the app shows user name/email/roles/permissions and records the
   device/platform/app version in `native_auth_sessions`.
4. Login with a wrong password and confirm the error is clear.
5. Login with an inactive user and confirm the user is rejected.
6. Login with a SYSTEM user and confirm ordinary employee login is rejected.
7. Close and reopen the app, then reboot the device; confirm it restores without
   re-entering the password.
8. Allow/force the short access token to expire. Confirm one silent refresh
   enters the Bay Board without flashing English or the login screen.
9. Trigger simultaneous protected requests and confirm only one refresh rotates
   the token; all callers use the resulting session.
10. Disable the user or call the administrator revoke endpoint. Confirm the
    next protected request/refresh returns localized login and clears secrets.
11. Disconnect the network, restart the app, and confirm the cached session and
    offline queue remain. Reconnect and confirm validation/refresh resumes.
12. Tap Logout while online and confirm old access and refresh tokens are both
    rejected. Repeat offline and confirm local credentials are immediately gone.

Administrator revoke API:

```http
POST /api/auth/native/users/:userId/revoke-sessions
Authorization: Bearer <ADMIN access token>
```

The actor needs `users.manage`. Verify `revoked_at`, `revoked_by_user_id`, and
`revoke_reason = ADMIN_REVOKE_ALL`; do not inspect or print token values.

Secure-storage and uninstall notes:

- Production builds require `NativeModules.BestarSecureTokenStore`; tests may
  explicitly inject the memory token store.
- Android stores one AES-GCM ciphertext/IV record using an Android Keystore key
  and commits SharedPreferences synchronously.
- iOS updates one Keychain generic-password item with
  `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- Windows replaces one PasswordVault/Credential Locker credential after the RNW
  project wires the module.
- OS uninstall, app-data clearing, device security reset, Keychain policy, or
  administrator device wipe may remove the local credential. In that case the
  expected behavior is a localized login prompt; the server session remains
  revocable and eventually expires.
- Never copy access/refresh tokens, passwords, or the secure-store JSON into
  logs, screenshots, AsyncStorage, test artifacts, or audit notes.

## P6-MOBILE-04 Native Load Job List

Purpose:
- Show planned and in-progress load jobs from the real API.
- Show a native scan screen placeholder for a selected load job.
- Do not implement scan submission.
- Do not implement office planning or editing.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter api test:e2e
```

Manual API setup:
1. Start Docker full stack.
2. Login to the office web app.
3. Create or publish a load job with status `PLANNED` or `IN_PROGRESS`.
4. Confirm the WAREHOUSE account has `load_jobs.read` and `scan.create`.

Device test:
1. Open the native app.
2. Set API base URL to the Docker nginx API route.
3. Login as WAREHOUSE.
4. Tap `Refresh jobs`.
5. Confirm the list shows load No., destination region, truck No., dock No.,
   carrier, scheduled departure, status, and progress.
6. Tap `Open scan screen`.
7. Confirm the app opens a native placeholder for that load job and does not
   submit scans.
8. Login with a user missing mobile scan permissions and confirm the list is
   blocked.
9. Complete all open jobs or use a database without open jobs and confirm the
   empty state tells office staff to publish a truck loading plan.

## P6-MOBILE-05 Native Scan Workflow

Purpose:
- Submit pallet scans to the real API for the selected load job.
- Support scanner-gun keyboard input and manual Enter submit.
- Route camera scanning through a native module boundary, not browser
  `getUserMedia`.
- Show backend scan result and backend progress.
- Do not implement offline queue or supervisor override.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter api test -- load-jobs.service.spec.ts
pnpm --filter api test:e2e
```

Manual API setup:
1. Start Docker full stack.
2. Use the office web app to import/generate labels for a container.
3. Create or publish an `IN_PROGRESS` load job whose plan line matches one of
   the generated pallets.
4. Print or open the real pallet label QR payload.

Device test:
1. Login to the native app as WAREHOUSE.
2. Open the matching load job.
3. Focus the QR payload input.
4. Scan with a hardware scanner or paste/type the QR payload and press Enter.
5. Confirm the app shows container No., destination code, pallet No., and
   backend remaining pallets.
6. Scan the same pallet again and confirm the duplicate state does not change
   inventory twice.
7. Scan a pallet outside the selected plan and confirm the wrong-load-job
   message.
8. Scan an invalid QR and confirm the invalid-QR message.
9. Complete or close the job from the API/Web and confirm scanning is rejected
   as closed/not open.

Native camera acceptance:
1. The app calls `NativeModules.BestarQrScanner.scanOnce()`.
2. The platform build must include the Android/iOS/Windows native module named
   `BestarQrScanner`.
3. If camera permission or the native module is unavailable, the app must show a
   clear camera unavailable message and keep scanner-gun/manual input usable.

Known limitation:
- The current repository has the TypeScript native scanner adapter and Android
  `BestarQrScanner` module source. iOS and Windows have reviewable native module
  source boundaries, but the generated platform projects still need to be
  created on their matching build machines before IPA/MSIX camera acceptance.

## P6-MOBILE-06 Native Offline Queue

Purpose:
- Queue network-send scan failures locally.
- Preserve the selected `loadJobId` for every queued scan.
- Retry pending/failed records through the real scan API.
- Do not treat pending records as loaded inventory.
- Do not change backend duplicate scan rules.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter api test -- load-jobs.service.spec.ts
```

Manual API setup:
1. Start Docker full stack.
2. Create an `IN_PROGRESS` load job with a real pallet QR.
3. Login to the native app as WAREHOUSE and open that load job.

Device test:
1. Set API base URL to a valid but unreachable LAN address, or disconnect the
   device network.
2. Scan or paste the real QR.
3. Confirm the app shows `Scan queued offline`.
4. Confirm the offline queue shows a `PENDING` record with the same `loadJobId`.
5. Confirm the progress display does not count the pending record as loaded.
6. Restore the API base URL/network.
7. Tap `Sync pending scans`, or tap `Save and check API` after restoring the
   API route.
8. Confirm the queue record becomes `SYNCED` and backend progress updates.
9. Retry the same synced QR again and confirm duplicate behavior comes from the
   backend, not local inventory state.

Known limitation:
- P6-MOBILE-06 uses AsyncStorage-backed native app storage. A future production
  hardening task may replace it with SQLite or another native durable queue.

## P6-MOBILE-07 Native Supervisor Override + Complete Loading

Purpose:
- Show supervisor override only to users with `scan.override`.
- Require override reason and a second confirmation.
- Submit override through the existing `POST /api/load-jobs/:id/scan` API with
  `supervisorOverride: true`.
- Save Dock No. through `PATCH /api/load-jobs/:id`.
- Complete loading through `POST /api/load-jobs/:id/close`.
- Keep completion audit attributed to the current logged-in API user.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter api test -- load-jobs.service.spec.ts
pnpm --filter api test:e2e
```

Manual API setup:
1. Start Docker full stack.
2. Create or publish an `IN_PROGRESS` load job with real generated pallet QR
   labels.
3. Prepare one WAREHOUSE user with only `load_jobs.read` and `scan.create`.
4. Prepare one supervisor-capable user with `load_jobs.read`, `scan.create`,
   `scan.override`, `load_jobs.update`, and `load_jobs.complete`.

Device test:
1. Login as the ordinary WAREHOUSE user, open the load job, and confirm the
   supervisor override section is not visible.
2. Login as the supervisor-capable user and open the same load job.
3. Trigger a rejected scan that returns `PALLET_ALREADY_LOADED`; confirm the
   override QR payload is prefilled.
4. Try submitting override without a reason and without confirmation; confirm
   the submit action remains disabled.
5. Enter a reason, tap the confirmation control, submit override, and confirm
   the API accepts it and backend pallet event audit records the current user.
6. Clear Dock No. and tap `Complete loading`; confirm completion is blocked
   with a Dock No. required message.
7. Enter Dock No., tap `Save dock`, and confirm the updated value comes back
   from the API.
8. Tap `Complete loading`; confirm the load job status becomes `COMPLETED` and
   load job history shows the logged-in loader.

Known limitation:
- P6-MOBILE-07 depends on the existing backend permissions and audit trail. It
  does not add office-side role management, new permission bypasses, or local
  offline completion.

## P6-MOBILE-08 Native Packaging + LAN Deployment Runbook

Purpose:
- Document Windows MSIX, Android APK, and iOS IPA build and installation paths.
- Document LAN API URL, HTTP/HTTPS certificate risk, camera permissions, and
  device distribution.
- Add a native app release checklist covering login, scan, offline queue,
  supervisor override, and complete loading.
- Provide a locally runnable packaging readiness check without committing
  signing secrets.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app build
pnpm --filter mobile-scan-app package:check
git diff --check
```

Manual review:
1. Open `docs/runbooks/native-scan-app-release.md`.
2. Confirm Windows MSIX instructions include build command, artifact path,
   install, update, uninstall, signing certificate, and LAN API configuration.
3. Confirm Android instructions include debug APK, signed release APK, camera
   permission, and PDA/scanner-gun notes.
4. Confirm iOS instructions include Apple Developer account, signing
   certificate, provisioning profile, and TestFlight/MDM/internal distribution
   limits.
5. Confirm the runbook states native camera scanning does not depend on browser
   HTTPS secure-context rules, while API passwords/JWTs should use HTTPS in
   production.
6. Confirm no real signing secret, keystore, certificate private key, or
   provisioning profile is committed.

Device smoke test when a platform package is available:
1. Install the MSIX, APK, or IPA on a warehouse device.
2. Configure API base URL as `http://<server-lan-ip>/api` or
   `https://warehouse-server.local/api`.
3. Tap `Save and check API`.
4. Login with a real warehouse account.
5. Open a real load job and complete one scanner-gun/manual or camera scan.
6. Test offline queue, supervisor override, and complete loading before pilot
   release.

Known limitation:
- P6-MOBILE-08 documents platform packaging and adds readiness checks. Android
  project generation and native camera wiring are handled by P6-MOBILE-09; iOS
  and Windows still need generated platform projects before final device
  acceptance.
- Automatic network-recovery sync is currently triggered by API health recovery
  and manual sync. A later native platform task can add OS network-state
  listeners.

## P6-MOBILE-09 Native Camera Module Wiring

Purpose:
- Keep scanner-gun/manual input available.
- Wire Android `NativeModules.BestarQrScanner.scanOnce()` to a native camera QR
  scanner.
- Preserve scan submission through the existing backend scan transaction.
- Add iOS/Windows native module source boundaries and document platform
  build-machine blockers.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app package:check
cd apps/mobile-scan-app/android
./gradlew assembleDebug
git diff --check
```

Manual Android device test:
1. Install the debug APK on a camera-capable Android device.
2. Set the API base URL to the Docker nginx LAN route.
3. Login as WAREHOUSE and open an `IN_PROGRESS` load job.
4. Tap `Start native camera scan`.
5. Grant camera permission.
6. Scan a real Bestar pallet label QR.
7. Confirm the app submits the returned payload through
   `POST /api/load-jobs/:id/scan` and shows backend progress.
8. Deny camera permission on a second run and confirm scanner-gun/manual input
   still works.
9. Scan the same pallet again and confirm duplicate handling comes from the
   backend.

Platform notes:
- Android source lives under `apps/mobile-scan-app/android/app/src/main/java/com/bestar/nativescan`.
  It uses CameraX and ML Kit barcode scanning for QR payload extraction.
- iOS source lives under `apps/mobile-scan-app/ios/BestarQrScanner`. It must be
  added to the generated Xcode app target, with `NSCameraUsageDescription` in
  `Info.plist`, before device validation.
- Windows source lives under `apps/mobile-scan-app/windows/BestarQrScanner`.
  It preserves the module boundary but rejects with a clear platform blocker
  until the React Native Windows solution and approved QR decoder dependency are
  generated and reviewed.

Known limitation:
- P6-MOBILE-09 can be code-reviewed on this checkout. Full iOS/MSIX camera
  acceptance still requires their generated platform projects and physical
  devices. Android camera acceptance requires a physical/emulator device with a
  camera and Gradle access to CameraX/ML Kit dependencies.

## P6-MOBILE-10 Secure Token Storage

Purpose:
- Keep `SecureTokenStore` as the auth-session interface.
- Store JWTs through platform secure storage, not AsyncStorage.
- Fail explicitly when `BestarSecureTokenStore` is missing in a production
  build.
- Keep memory fallback limited to explicit tests.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app package:check
cd apps/mobile-scan-app/android
./gradlew assembleDebug
git diff --check
```

Manual Android device test:
1. Install the rebuilt APK on a device.
2. Set the LAN API base URL and login with a real WAREHOUSE account.
3. Close and reopen the app; confirm `GET /api/auth/me` restores the current
   user without re-entering credentials.
4. Tap Logout, close and reopen the app, and confirm the user remains logged
   out.
5. If testing with an expired or revoked token, confirm restore clears the local
   token and shows the session-expired state.

Platform notes:
- Android source lives at
  `apps/mobile-scan-app/android/app/src/main/java/com/bestar/nativescan/BestarSecureTokenStoreModule.kt`
  and uses Android Keystore-backed AES-GCM.
- iOS source lives under `apps/mobile-scan-app/ios/BestarQrScanner` and must be
  added to the generated Xcode target before IPA validation.
- Windows source lives under `apps/mobile-scan-app/windows/BestarQrScanner` and
  must be added to the generated React Native Windows project before MSIX
  validation.

Known limitation:
- Android can be compiled on this checkout. iOS and Windows secure-storage
  device validation still require generated native projects on their platform
  build machines.

## P6-MOBILE-11 Windows / iOS Native Project Hardening

Purpose:
- Distinguish native module source boundaries from generated platform projects.
- Make `package:check` report Android, iOS, and Windows readiness without
  treating placeholders as ready.
- Document exact generated project markers and platform build-machine blockers.
- Do not add office web features or new scan business behavior.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app package:check
pnpm --filter mobile-scan-app package:check -- --strict
pnpm --filter mobile-scan-app ios
pnpm --filter mobile-scan-app windows
git diff --check
```

Expected result on this macOS checkout before generated projects are restored:

- `package:check` exits successfully but reports iOS and Windows as blocked.
- `package:check -- --strict` exits non-zero while iOS/Windows generated
  markers are missing.
- `pnpm --filter mobile-scan-app ios` is blocked until `ios/Podfile`,
  `.xcodeproj`/`.xcworkspace`, and app `Info.plist` exist.
- `pnpm --filter mobile-scan-app windows` is blocked until the command is run on
  a Windows 11 machine with generated `.sln`/`.vcxproj`/`Package.appxmanifest`.

Manual Windows 11 build-machine acceptance:

1. Generate or restore the React Native Windows project.
2. Confirm `windows/*.sln`, `windows/**/*.vcxproj`, and
   `windows/**/Package.appxmanifest` exist.
3. Add `windows/BestarQrScanner/*.cs` to the generated project.
4. Run `pnpm --filter mobile-scan-app package:check -- --strict`.
5. Run `pnpm --filter mobile-scan-app windows` or the release x64 build command.
6. Record artifact paths under `windows/<AppName>/AppPackages/` or
   `windows/x64/Release/`.

Manual macOS/Xcode iOS acceptance:

1. Generate or restore the React Native iOS project.
2. Confirm `ios/Podfile`, `ios/*.xcodeproj`, `ios/*.xcworkspace`, and
   `ios/**/Info.plist` exist.
3. Add `ios/BestarQrScanner/*` to the generated app target.
4. Add `NSCameraUsageDescription`.
5. Run `pod install`.
6. Run `pnpm --filter mobile-scan-app package:check -- --strict`.
7. Run `pnpm --filter mobile-scan-app exec react-native build-ios --mode Debug`
   or an Xcode simulator/device build.

Known limitation:
- P6-MOBILE-11 can harden readiness checks and document the exact platform
  markers from this checkout. It cannot honestly mark Windows/iOS ready until
  those generated native projects are produced on their required build machines
  and their smoke-build results are recorded.

## P6-MOBILE-12 Cross-Platform Device Smoke + P6 Exit Gate

Purpose:
- Run the final P6-MOBILE gate without adding new scan features.
- Use Docker full-stack nginx routing and real API/load-job/pallet-label QR
  data.
- Record device smoke status without storing passwords, JWTs, signing secrets,
  provisioning profiles, or private keys.

Automated checks:

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
scripts/healthcheck.sh
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app package:check
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
git diff --check
```

Device smoke evidence recorded on 2026-07-09:

- Android real device: install/run path was validated with LAN API URL
  configuration, real login, and native camera scan of a real pallet label QR.
  Native app tests cover manual/scanner-gun submit, duplicate result handling,
  offline queue sync, supervisor override validation, Dock No. requirement, and
  complete-loading API calls.
- iOS real device: signed install/debug was completed after Apple signing was
  configured locally; the operator confirmed the iOS device smoke passed. Do
  not record the device password, Apple credentials, JWT, or provisioning
  profile in git.
- Windows: `package:check` still reports missing Windows generated markers because the
  React Native Windows `.sln`, `.vcxproj`, and `Package.appxmanifest` are not in
  this checkout. Windows MSIX generation and device smoke are archived.

P6 exit decision:
- P6 mobile exit gate is passed for the Android+iOS pilot route.
- Windows MSIX is not marked ready; it must be shown as `Archived`, not as an
  active blocker or next release task.

## Before Pilot Release

Run the full current native app checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter api test:e2e
git diff --check
```

Run broader repo checks when preparing a commit or release:

```bash
pnpm typecheck
pnpm test
scripts/healthcheck.sh
```

Active native device packaging checks cover Android and iOS. Historical work followed P6-MOBILE-08 through P6-MOBILE-12:
Android can be built from `apps/mobile-scan-app/android`; iOS has a generated
Xcode workspace and device smoke evidence. The Windows generated-project and
MSIX acceptance path is archived.

## NATIVE-UX-04 Startup And Cross-Platform Exit Gate

Use a signed release APK/IPA on the same physical device for a five-sample
cold-start baseline. Do not use Fast Refresh, a debug build, or a warm resume.
Record the median of these app-relative marks:

| Mark | Meaning | Target |
| --- | --- | --- |
| `first-shell` | Process start to the first usable native shell | <= 1.5s |
| `session-resolved` | Process start to session restore/validation result | <= 2.5s |
| `load-jobs-ready` | Process start to the authenticated task list becoming ready on normal LAN | <= 4s |

`src/app/startup-metrics.ts` records elapsed durations only. It must never
record or emit passwords, JWTs, API request bodies, QR payloads, device IDs, or
other sensitive values. Use a local development debugger or approved platform
profiler to read the three marks; do not send the values to production logs.

For each platform, record the release artifact/version, SHA-256, device model,
OS version, network condition, five cold-start samples, median, and whether the
task list was populated from live API data. Keep screenshots limited to Login,
Bay Board, Scan Workspace, an offline/error state, and Settings in both English
and Chinese. Do not capture credentials, tokens, real QR payloads, or private
customer data.

Current evidence on 2026-07-11:

- Android `:app:assembleRelease` passes from a clean generated-output state.
  `android/app/build.gradle` explicitly makes every CMake configuration task
  depend on AsyncStorage Codegen, preventing a clean build from failing when
  autolinking references its generated JNI directory.
- Startup safely loads settings, device ID, and locale together; it restores
  the session before choosing the screen, then reads the offline queue without
  holding up the initial shell. Queue replay and backend scan confirmation
  semantics are unchanged.
- No Android or iOS device was attached to this workstation at the gate check,
  so no Android five-sample release baseline or Android release screenshots may
  be claimed. On 2026-07-11, the signed iOS Release app was built, installed,
  and launched on a paired iPhone 15 Pro; five-sample timing, screenshots, and
  Login/Bay Board/scan/manual regression remain required.
- Windows RNW/MSIX/device evidence is archived and no longer affects this gate.
  Android/iOS evidence still determines whether this gate is `Partial` or complete.

## P6-MOBILE-13 Windows MSIX Release Completion (Archived Reference)

Do not execute this section while `P6-MOBILE-13` is archived. The commands and
checklists below are retained only to make a future approved reactivation reversible.

Purpose:
- Complete or explicitly block the Windows MSIX release gate.
- Use a Windows 11 build machine with Visual Studio 2022, Windows SDK, MSIX
  packaging tools, and a trusted signing certificate.
- Preserve Android/iOS pilot readiness while Windows remains archived.

Automated checks from any host:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app package:check
pnpm --filter mobile-scan-app package:check -- --strict
pnpm --filter mobile-scan-app windows:check
git diff --check
```

Expected result on this macOS checkout until Windows artifacts are generated:

- `package:check` exits successfully and reports Windows blocked.
- `package:check -- --strict` exits non-zero because Windows generated markers
  are missing.
- `windows:check` exits non-zero because it is not running on Windows and
  `.sln` / `.vcxproj` / `Package.appxmanifest` are missing.

Windows 11 build-machine acceptance:

1. Generate or restore React Native Windows with the pinned dependencies.
2. Confirm `windows/*.sln`, `windows/**/*.vcxproj`, and
   `windows/**/Package.appxmanifest` exist.
3. Add `windows/BestarQrScanner/*.cs` to the generated project.
4. Run `pnpm --filter mobile-scan-app package:check -- --strict`.
5. Run `pnpm --filter mobile-scan-app windows:check`.
6. Run `pnpm --filter mobile-scan-app windows`.
7. Run `pnpm --filter mobile-scan-app windows -- --release --arch x64`.
8. Package and sign MSIX through Visual Studio Publish or company CI.
9. Record the artifact path and SHA-256 in
   `apps/mobile-scan-app/windows/P6-MOBILE-13-MSIX-RELEASE-CHECKLIST.md`.

Windows device smoke:

1. Install the signed or test-signed MSIX on a Windows warehouse device.
2. Configure the LAN API URL.
3. Login with a real WAREHOUSE account.
4. Open a real planned or in-progress load job.
5. Submit one scanner-gun/manual pallet QR through the real scan API.
6. Verify duplicate scan behavior comes from the backend.
7. Verify app restart restores the token from Windows Credential Locker.
8. Logout, restart, and verify the token is cleared.
9. If Windows camera is required, scan a real QR through the Windows camera
   module; otherwise record scanner-gun/manual input as the approved Windows
   pilot mode.

Archive status:
- P6-MOBILE-13 is not an active Task or release blocker. The correct current
  release decision is `windows native msix archived`.
