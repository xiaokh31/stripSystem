# Native Scan App Release Runbook

## Current Delivery Scope (2026-07-15)

Android APK and iOS IPA are the active release targets. Windows React Native
Windows project generation, native module integration, Credential Locker,
MSIX packaging/signing and Windows-device smoke are archived by product
decision. The Windows section remains below only as a reversible technical
reference. Do not execute it or treat it as an active release gate until the
P6-MOBILE-09 through P6-MOBILE-13 archive markers, Task index and completion
report are explicitly reactivated together.

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

The Native app must use the dedicated login/refresh/logout API and a revocable
session; it must not treat the browser's long JWT lifetime as its session
policy. Local access token, refresh token, session id/expiries, and cached user
must be written atomically through `NativeModules.BestarSecureTokenStore`. Do
not ship a production build that silently falls back to AsyncStorage.
Android uses Android Keystore-backed AES-GCM and iOS uses Keychain. The Windows
Credential Locker path is retained only in the archived reference section.

Before signing a release, exercise access expiry, app restart, device restart,
temporary offline restore, server revoke, account disable, refresh replay, and
online/offline logout. Verify no secret appears in logs or artifacts. Uninstall
or OS credential clearing may remove the local secure record and must lead to a
localized login prompt on the next launch.

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
the Android, iOS, and Windows platform projects exist on this checkout. Its
Windows result is diagnostic while the Windows package route is archived. It
distinguishes native module source boundaries from generated platform projects;
source files alone are not enough for MSIX/IPA readiness. It does not create
signing secrets and does not claim an install package exists.

Use strict mode only as an all-platform architecture diagnostic while Windows
is archived; it is not the active Android/iOS release gate:

```bash
pnpm --filter mobile-scan-app package:check -- --strict
```

Strict mode returns non-zero when any platform is missing required generated
project markers such as iOS `Podfile`/`.xcodeproj`/`.xcworkspace` or Windows
`.sln`/`.vcxproj`/`Package.appxmanifest`.

## Windows MSIX (Archived Reactivation Reference)

Do not run the commands in this section while the Windows native package route
is archived. They are preserved so a future approved reactivation can resume
without reconstructing the build and signing procedure.

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

P6-MOBILE-11 readiness markers:

```text
apps\mobile-scan-app\windows\*.sln
apps\mobile-scan-app\windows\**\*.vcxproj
apps\mobile-scan-app\windows\**\Package.appxmanifest
```

The current source boundary files must be added to the generated C# project:

```text
apps\mobile-scan-app\windows\BestarQrScanner\BestarQrScannerModule.cs
apps\mobile-scan-app\windows\BestarQrScanner\BestarSecureTokenStoreModule.cs
```

Run this after generation:

```powershell
pnpm --filter mobile-scan-app package:check
pnpm --filter mobile-scan-app package:check -- --strict
pnpm --filter mobile-scan-app windows:check
```

P6-MOBILE-13 adds a Windows-specific handoff checklist and readiness command:

```text
apps\mobile-scan-app\windows\P6-MOBILE-13-MSIX-RELEASE-CHECKLIST.md
```

Fill the checklist on the Windows 11 build machine with the generated project
paths, MSIX artifact path, artifact SHA-256, device smoke result, and blocker
decision. Do not record passwords, JWTs, private certificate keys, `.pfx`
passwords, provisioning files, or the MSIX binary itself in git. The local
command below must pass before calling the Windows release complete:

```powershell
pnpm --filter mobile-scan-app windows:check
```

Common blockers:

- `dotnet.exe` or `where` not found: the command is running on macOS/Linux or a
  Windows machine without Visual Studio/.NET build tools. Move to the Windows
  11 build machine.
- `unknown command 'run-windows'`: the React Native Windows platform command is
  not available in the current checkout/host. Confirm the generated RNW project
  exists, run on Windows 11, and verify `react-native config` lists a `windows`
  project.
- `.sln` or `.vcxproj` missing: RNW project generation has not completed.
- `Package.appxmanifest` missing: MSIX packaging metadata has not been generated
  or restored.
- `windows:check` fails: run it on Windows 11 after generated project markers
  exist, and confirm the checklist is present and module source files are added
  to the generated project.
- Native modules unavailable at runtime: include the two C# module files in the
  generated project and verify `BestarQrScanner` and `BestarSecureTokenStore`
  are registered.
- MSIX signing failure: install/use the company signing certificate outside git;
  do not commit `.pfx` or signing passwords.

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

Target local debug build matrix:

```text
Android Studio JBR or Temurin: JDK 17+
React Native: 0.84.1
Android Gradle Plugin: 8.12.0
Gradle wrapper: 9.0.0
Kotlin Gradle plugin: 2.1.20
compileSdk: 36
targetSdk: 36
minSdk: 24
buildToolsVersion: 36.0.0
NDK: 27.1.12297006
```

### Platform Project

Current repository status can be checked with:

```bash
pnpm --filter mobile-scan-app package:check
```

The repository includes the generated Android platform project. It must contain
files such as:

```text
apps/mobile-scan-app/android/gradlew
apps/mobile-scan-app/android/settings.gradle
apps/mobile-scan-app/android/app/build.gradle
apps/mobile-scan-app/android/app/src/main/AndroidManifest.xml
```

For Android Studio Quail 1 and newer, the Android project uses a standard
Gradle layout instead of relying on legacy root `buildscript` classpath wiring:

- `settings.gradle` declares plugin repositories, applies the React Native
  settings plugin, runs autolinking through the pinned local React Native CLI,
  includes `:app`, and includes the local React Native Gradle plugin build.
- Root `build.gradle` declares shared Android/Kotlin/React plugins with
  `apply false`.
- `app/build.gradle` uses the plugins DSL and declares the app SDK values,
  React Native dependencies, CameraX dependencies, and ML Kit barcode scanning.

Open this exact directory in Android Studio:

```text
apps/mobile-scan-app/android
```

Do not open the repository root as an Android project. The repository root is a
pnpm workspace, while the Gradle Android root project is
`apps/mobile-scan-app/android`.

`apps/mobile-scan-app/android/local.properties` is machine-specific and ignored
by git. On each build machine, Android Studio or Gradle should create it with
the local SDK path, for example:

```properties
sdk.dir=C\:\\Users\\<user>\\AppData\\Local\\Android\\Sdk
```

or on macOS:

```properties
sdk.dir=/Users/<user>/Library/Android/sdk
```

If Android Studio reports `Missing ExternalProject for :` after a Gradle build
shows `BUILD SUCCESSFUL`, it is an IDE Gradle-sync/import problem, not an APK
compiler error. First confirm Android Studio's Gradle JDK is the bundled JBR 21
or another installed JDK 21. In Android Studio this is typically named
`jbr-21`; do not leave the Gradle JDK pointed at an unresolved `#JAVA_HOME`
entry. Then confirm the IDE is linked to the Android Gradle root above and that
the Gradle project model contains:

```text
Root project 'BestarNativeScan'
+--- Project ':app'
\--- Project ':react-native-async-storage_async-storage'
```

The command-line verification is:

```bash
cd apps/mobile-scan-app/android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
./gradlew projects
```

If the command above shows `:app` but Quail still reports the same
`Missing ExternalProject for :`, close Android Studio and force a clean IDE
import by moving the local, ignored IDE caches aside:

```bash
mkdir -p /private/tmp/bestar-androidstudio-cache
mv apps/mobile-scan-app/android/.idea /private/tmp/bestar-androidstudio-cache/android.idea 2>/dev/null || true
mv apps/mobile-scan-app/android/.gradle /private/tmp/bestar-androidstudio-cache/android.gradle 2>/dev/null || true
mv "$HOME/Library/Caches/Google/AndroidStudio2026.1.1/projects/android.b0fcbd39" \
  /private/tmp/bestar-androidstudio-cache/androidstudio-project-cache 2>/dev/null || true
open -a "Android Studio" apps/mobile-scan-app/android
```

Those directories are local IDE/build caches and must stay out of git.

### Camera Permission

The Android manifest must include camera permission before camera release
testing:

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

Scanner-gun and manual input must still work when camera permission is denied.

Android P6-MOBILE-09 camera module source:

```text
apps/mobile-scan-app/android/app/src/main/java/com/bestar/nativescan/BestarQrScannerModule.kt
apps/mobile-scan-app/android/app/src/main/java/com/bestar/nativescan/BestarQrScannerPackage.kt
apps/mobile-scan-app/android/app/src/main/java/com/bestar/nativescan/BestarQrScannerActivity.kt
```

`BestarQrScannerActivity` uses CameraX and ML Kit barcode scanning, accepts QR
payloads only, and returns the trimmed payload to
`NativeModules.BestarQrScanner.scanOnce()`. The app still submits scans through
the existing backend `POST /api/load-jobs/:id/scan` route.

Android P6-MOBILE-10 secure token storage source:

```text
apps/mobile-scan-app/android/app/src/main/java/com/bestar/nativescan/BestarSecureTokenStoreModule.kt
```

`BestarSecureTokenStoreModule` encrypts JWT values with an Android Keystore
AES-GCM key and stores only ciphertext plus IV in private SharedPreferences.
The app will fail explicitly if `NativeModules.BestarSecureTokenStore` is not
available.

### Debug APK

The project debug APK is configured as a standalone device smoke package: it
bundles `index.android.bundle` and does not require Metro to be running. Install
and run on a connected Android device or emulator:

```bash
pnpm --filter mobile-scan-app android
```

Gradle debug package:

```bash
cd apps/mobile-scan-app/android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
./gradlew assembleDebug
```

On Windows PowerShell, use the Android Studio JBR and SDK paths from that
machine:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd apps\mobile-scan-app\android
.\gradlew.bat assembleDebug
```

Debug artifact:

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

P6-MOBILE-11 readiness markers:

```text
apps/mobile-scan-app/ios/Podfile
apps/mobile-scan-app/ios/*.xcodeproj
apps/mobile-scan-app/ios/*.xcworkspace
apps/mobile-scan-app/ios/**/Info.plist
```

The current source boundary files must be added to the generated Xcode app
target:

```text
apps/mobile-scan-app/ios/BestarQrScanner/BestarQrScanner.swift
apps/mobile-scan-app/ios/BestarQrScanner/BestarSecureTokenStore.swift
apps/mobile-scan-app/ios/BestarQrScanner/BestarQrScannerBridge.m
```

The generated project must include:

- `NSCameraUsageDescription` in the app target `Info.plist`.
- Swift/Objective-C bridge support for React Native modules.
- `pod install` result that produces the workspace used by Xcode.
- No signing profiles, private keys, or Apple credentials in git.

Recommended generation workflow:

1. On the macOS build machine, generate a scratch React Native app from the
   pinned `react-native@0.84.1` template using the company-approved package
   mirror.
2. Merge the generated `ios/` project into `apps/mobile-scan-app/ios/` without
   deleting `BestarQrScanner/` or `PLATFORM-STATUS.md`.
3. Set the bundle identifier to the company-owned value.
4. Add the three Bestar native module files to the Xcode app target.
5. Add `NSCameraUsageDescription`.
6. Run:

```bash
cd apps/mobile-scan-app/ios
pod install
cd ../../..
pnpm --filter mobile-scan-app package:check
pnpm --filter mobile-scan-app package:check -- --strict
pnpm --filter mobile-scan-app exec react-native build-ios --mode Debug
```

Common blockers:

- No `Podfile`: iOS platform project has not been generated.
- No `.xcodeproj`/`.xcworkspace`: Xcode project generation or `pod install` is
  incomplete.
- `Cannot read properties of null (reading 'automaticPodsInstallation')` from
  `react-native run-ios`: React Native CLI sees `project.ios = null`; generate
  or restore the Xcode project before running iOS commands.
- `NSCameraUsageDescription` missing: camera permission prompt will fail App
  Review and device acceptance.
- Signing error: select the company team/provisioning profile in Xcode or CI;
  do not commit `.mobileprovision`, `.p12`, or Apple credentials.

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

## Startup Performance Evidence

Before release approval, run five cold launches of the signed release artifact
on the same physical device and use the median. Record device model, OS,
artifact version and SHA-256, network condition, and the three app-relative
marks `first-shell`, `session-resolved`, and `load-jobs-ready`. The targets are
1.5s, 2.5s, and 4s respectively. The metrics implementation records elapsed
time only; never include credentials, tokens, QR payloads, request bodies, or
customer data in a trace or release note.

The 2026-07-11 repository check produced a clean Android release build after
adding an explicit AsyncStorage Codegen dependency before native CMake
configuration. It did not produce device timing samples. Android/iOS release
measurements and screenshots remain required, and Windows continues to require
a Windows 11 MSIX build and device smoke before this cross-platform gate can
close.

## Release Checklist

Before distributing any MSIX/APK/IPA:

- Shared checks passed: lint, typecheck, test, build, package:check.
- API health works from the target device network.
- Login succeeds with a real warehouse account.
- `GET /api/auth/me` returns the expected current user, roles, and permissions.
- App restart restores a valid token through platform secure storage.
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
- Old access and refresh tokens are rejected after logout or administrator
  revoke.
- Expired access silently refreshes once; concurrent requests do not rotate the
  same refresh token concurrently.
- Temporary network loss preserves the secure session and offline queue.
- Reopening after logout does not restore a previous token.
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

## Current Status At P6-MOBILE-12

- The Android platform project is generated. Debug builds include the
  `BestarQrScanner` CameraX/ML Kit module and the Android Keystore-backed
  `BestarSecureTokenStore`; Android real-device smoke has validated LAN API URL
  configuration, login, and native camera pallet QR scan.
- The iOS platform project is generated with `Podfile`, Xcode project,
  workspace, Pods, app target, `BestarQrScanner`, and `BestarSecureTokenStore`
  target wiring. After local Apple signing was configured, iOS real-device
  debug smoke was completed and passed on 2026-07-09.
- Windows still has only the native module source boundary. The remaining RNW
  project and MSIX work is archived rather than an active release blocker.
- `pnpm --filter mobile-scan-app package:check` reports Android and iOS ready
  and the archived Windows markers missing/blocked. Strict all-platform checks
  still fail diagnostically, but that result is not the active release status.
- P6 mobile exit gate is passed for the Android+iOS pilot route. Do not present
  Windows MSIX as ready; report it as archived.

## Archived Status At P6-MOBILE-13 (2026-07-15)

- `P6-MOBILE-13` and its P6-MOBILE-09 through 12 predecessor Tasks now carry
  `Task-Status: ARCHIVED` and the business-task supervisor rejects execution.
- The repository now includes the P6-MOBILE-13 Windows release checklist and
  `pnpm --filter mobile-scan-app windows:check` command for the Windows build
  machine as dormant reactivation assets.
- `package:check` still reports Android and iOS ready and the archived Windows
  markers missing. This is retained diagnostic output, not an active blocker.
- `package:check -- --strict` and `windows:check` may continue to report missing
  Windows markers; that diagnostic result does not block the active Android/iOS
  scope. Do not run Windows packaging work unless the archive is explicitly reopened.
