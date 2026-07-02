# Native Scan App Release Runbook

## Scope

This runbook explains how to build, install, update, and smoke test the Bestar
Native Scan App for warehouse devices. The Native Scan App is an installed
React Native application for login and mobile scan workflows only. It is not the
office web app, not the `/mobile/*` browser page, not a PWA, and not a WebView
wrapper.

The app talks to the existing Bestar LAN API:

```text
GET /api/health
POST /api/auth/login
GET /api/auth/me
GET /api/load-jobs
GET /api/load-jobs/:id
PATCH /api/load-jobs/:id
POST /api/load-jobs/:id/scan
POST /api/load-jobs/:id/close
```

Do not commit signing certificates, keystore files, provisioning profiles,
keystore passwords, Apple credentials, JWT secrets, or production passwords.

## Shared LAN Prerequisites

Start the warehouse full stack through nginx:

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
```

Confirm API health from the server:

```bash
curl http://localhost/api/health
```

Confirm the LAN route from a warehouse device on the same network:

```text
http://<server-lan-ip>/api/health
```

Use the native app API base URL:

```text
http://<server-lan-ip>/api
```

For production, prefer HTTPS with a trusted internal certificate:

```text
https://warehouse-server.local/api
```

HTTP can work on a closed pilot LAN, but login passwords and JWTs travel over
the network in clear text. Native camera scanning does not depend on browser
HTTPS secure-context rules, but API credential transport is still a security
decision. If HTTPS is enabled, install the internal CA certificate on Windows,
Android, and iOS devices before login testing.

## Shared Build Checks

Run these from the repository root before any platform packaging:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app build
pnpm --filter mobile-scan-app package:check
```

`package:check` verifies shared React Native prerequisites and reports whether
the Android, iOS, and Windows platform projects exist on this checkout. It does
not create signing secrets and does not claim an install package exists.

## Windows MSIX

### Build Machine

Use a Windows 11 build machine with:

- Visual Studio 2022.
- Windows SDK.
- Desktop development with C++ workload.
- Universal Windows Platform tools.
- Node.js and pnpm.
- React Native Windows dependencies.
- A code-signing certificate trusted by warehouse Windows devices.

### Generate Or Restore Platform Project

If `apps/mobile-scan-app/windows/` is absent, generate the React Native Windows
project on the Windows build machine using the pinned app dependencies:

```powershell
pnpm --filter mobile-scan-app exec react-native-windows-init --overwrite
```

Review generated files before committing. Do not overwrite hand-edited native
project files without a diff review.

### Development Build

```powershell
pnpm --filter mobile-scan-app windows
```

### Release Build Command

Preferred CLI smoke build:

```powershell
pnpm --filter mobile-scan-app windows -- --release --arch x64
```

Visual Studio release build:

1. Open `apps\mobile-scan-app\windows\*.sln`.
2. Select `Release` and `x64`.
3. Build solution.
4. Use `Project > Publish > Create App Packages...`.
5. Select MSIX packaging.
6. Sign with the company certificate.

### Artifact Path

Typical output paths depend on the generated Windows project name:

```text
apps\mobile-scan-app\windows\<AppName>\AppPackages\
apps\mobile-scan-app\windows\x64\Release\
```

Keep the signed `.msix` or `.msixbundle`, the matching certificate chain, and a
release note in the internal release folder. Do not place private keys in git.

### Install

If the signing certificate is not already trusted, install the public
certificate into `Trusted People` or distribute it by company device policy.

PowerShell:

```powershell
Add-AppxPackage -Path .\BestarNativeScanApp.msix
```

Or double-click the MSIX package on the warehouse Windows device.

### Update

Build a package with a higher version number, then install the new MSIX:

```powershell
Add-AppxPackage -Path .\BestarNativeScanApp-<new-version>.msix
```

The app keeps local settings such as the API base URL and token unless the user
uninstalls and removes app data.

### Uninstall

PowerShell:

```powershell
Get-AppxPackage *Bestar*Native*Scan* | Remove-AppxPackage
```

Or uninstall through Windows Settings.

### LAN API Configuration

Open the app, set:

```text
http://<server-lan-ip>/api
```

Tap `Save and check API`, then login with a real warehouse account.

## Android APK

### Build Machine

Use a build machine with:

- Android Studio.
- JDK compatible with the generated React Native template.
- Android SDK and build tools.
- USB debugging enabled for device testing.
- A release keystore stored outside git.

### Generate Or Restore Platform Project

If `apps/mobile-scan-app/android/` is absent, generate the React Native Android
project from the pinned React Native template on the build machine. Review the
generated native files before committing.

Current repository status can be checked with:

```bash
pnpm --filter mobile-scan-app package:check
```

If it reports `placeholder directory present; platform project not generated
yet`, `pnpm --filter mobile-scan-app android` cannot install to a device yet.
Generate the Android platform project first on a machine with Android Studio,
JDK, and Android SDK. The generated project must create files such as:

```text
apps/mobile-scan-app/android/gradlew
apps/mobile-scan-app/android/settings.gradle
apps/mobile-scan-app/android/app/build.gradle
apps/mobile-scan-app/android/app/src/main/AndroidManifest.xml
```

### Camera Permission

The Android manifest must include camera permission before camera release
testing:

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

Scanner-gun and manual input must still work when camera permission is denied.

### Debug APK

From the repository root:

```bash
pnpm --filter mobile-scan-app start
```

In a second terminal, install and run on a connected Android device or emulator:

```bash
pnpm --filter mobile-scan-app android
```

Gradle debug package:

```bash
cd apps/mobile-scan-app/android
./gradlew assembleDebug
```

Typical debug artifact:

```text
apps/mobile-scan-app/android/app/build/outputs/apk/debug/app-debug.apk
```

Install:

```bash
adb install -r apps/mobile-scan-app/android/app/build/outputs/apk/debug/app-debug.apk
```

### Signed Release APK

Create a release keystore outside the repository and configure signing through
local Gradle properties or the company CI secret store. Do not commit the
keystore or passwords.

Build:

```bash
cd apps/mobile-scan-app/android
./gradlew assembleRelease
```

Typical release artifact:

```text
apps/mobile-scan-app/android/app/build/outputs/apk/release/app-release.apk
```

Install on company-managed Android devices:

```bash
adb install -r apps/mobile-scan-app/android/app/build/outputs/apk/release/app-release.apk
```

For PDA devices, confirm:

- Hardware scanner sends keyboard input to the QR payload field.
- The scanner appends Enter or the operator can tap Submit scan.
- Camera permission prompt appears and QR camera scan works.
- Manual input remains available if a hardware scanner profile steals focus.

## iOS IPA

### Prerequisites

iOS distribution is controlled by Apple signing and company device management,
not just by a command.

Required:

- macOS build machine.
- Xcode.
- Apple Developer account.
- Bundle identifier owned by the company.
- Signing certificate.
- Provisioning profile.
- Camera usage description in `Info.plist`.
- Distribution channel: TestFlight, Apple Business Manager/MDM, Ad Hoc, or
  Apple Enterprise Program if the company qualifies.

### Generate Or Restore Platform Project

If `apps/mobile-scan-app/ios/` is absent, generate the React Native iOS project
from the pinned React Native template on the macOS build machine. Review the
generated native files before committing.

### Debug Device Build

```bash
pnpm --filter mobile-scan-app ios
```

For physical devices, open the Xcode workspace, select the signing team and
device, then run.

### Release Archive And IPA

1. Open `apps/mobile-scan-app/ios/*.xcworkspace` in Xcode.
2. Set the bundle identifier.
3. Select the company signing team.
4. Confirm `NSCameraUsageDescription` is present.
5. Select `Any iOS Device`.
6. Choose `Product > Archive`.
7. In Organizer, choose `Distribute App`.
8. Select TestFlight, MDM/internal distribution, Ad Hoc, or Enterprise based on
   company policy.

The `.ipa` output path is selected during Xcode export. Keep the exported IPA,
release notes, and provisioning metadata in the internal release folder. Do not
commit provisioning profiles or certificates.

## Release Checklist

Before distributing any MSIX/APK/IPA:

- Shared checks passed: lint, typecheck, test, build, package:check.
- API health works from the target device network.
- Login succeeds with a real warehouse account.
- `GET /api/auth/me` returns the expected current user, roles, and permissions.
- Load job list shows real planned or in-progress jobs.
- Scanner-gun/manual input submits a real pallet QR to the selected load job.
- Native camera scan works on the target platform or a documented platform
  exception is approved.
- Duplicate scan does not decrement inventory twice.
- Offline queue stores network-send failures and syncs through the API later.
- Supervisor override is hidden from users without `scan.override`.
- Supervisor override requires reason and confirmation for authorized users.
- Dock No. is required before complete loading.
- Complete loading updates the job to `COMPLETED` and history shows the loader.
- Logout clears the local session.
- App logs do not expose passwords, JWTs, signing secrets, or keystore
  passwords.
- The package version and release notes are recorded.

## Rollback

If a release fails:

1. Stop distributing the package.
2. Reinstall the previous known-good MSIX/APK/IPA.
3. Keep the same server API URL unless the incident is API-related.
4. Preserve app logs and backend audit events for diagnosis.
5. Do not delete queued scans until the backend state is checked.

## Known Limits At P6-MOBILE-08

- The shared TypeScript native scan app is implemented, but generated
  `android/`, `ios/`, and `windows/` platform projects may still need to be
  created on the matching build machines.
- Native camera module implementation must be wired in platform code before
  camera acceptance can pass.
- Secure token storage still needs platform-specific implementation before
  production pilot.
