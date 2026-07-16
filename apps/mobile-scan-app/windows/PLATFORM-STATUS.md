# Windows Platform Project Status

Task-Status: ARCHIVED
Archived-On: 2026-07-15

The Windows React Native Windows/MSIX delivery route is archived by product
decision. Do not generate the RNW project, integrate modules, build/sign MSIX,
or run Windows device smoke while archived. Existing source and the checklist
below remain as reactivation references. Reactivation requires explicit product
approval plus synchronized P6 Task, open-task index and completion-report updates.

Status at P6-MOBILE-13: source boundary present, generated React Native Windows
project and MSIX release blocked until a Windows 11 build machine is available.

Present source boundary:

- `BestarQrScanner/BestarQrScannerModule.cs`
- `BestarQrScanner/BestarSecureTokenStoreModule.cs`

Missing generated React Native Windows project markers:

- `*.sln`
- `*.vcxproj`
- `Package.appxmanifest`

Required build machine:

- Windows 11.
- Visual Studio 2022.
- Windows SDK and MSIX packaging tools.
- React Native Windows dependencies for `react-native-windows@0.84.0`.
- Company code-signing certificate trusted by target warehouse devices.

P6-MOBILE-13 handoff assets:

- `P6-MOBILE-13-MSIX-RELEASE-CHECKLIST.md`
- `../scripts/windows-msix-readiness.mjs`
- `pnpm --filter mobile-scan-app windows:check`

Generation and hardening checklist:

1. Generate or restore the React Native Windows project using the pinned
   package versions.
2. Add the C# native module source files to the generated project.
3. Confirm `BestarQrScanner` rejects with a clear platform blocker until the
   approved Windows camera QR decoder is implemented.
4. Confirm `BestarSecureTokenStore` is registered and uses Windows Credential
   Locker.
5. Run `pnpm --filter mobile-scan-app windows` for a debug smoke.
6. Run `pnpm --filter mobile-scan-app windows -- --release --arch x64` or build
   Release x64 in Visual Studio.
7. Package and sign MSIX through Visual Studio Publish or the company CI.
8. Install the MSIX on a Windows warehouse device and complete LAN API URL,
   login, scanner-gun/manual scan, secure token restore/logout, and duplicate
   scan smoke.

Do not commit:

- `.pfx`, `.cer` private key material, generated `.msix`/`.appx` packages,
  signing passwords, or local Visual Studio user files.
- `bin/`, `obj/`, `Generated Files/`, or per-user `.vs/` state.

Historical P6-MOBILE-13 conclusion for this checkout: Windows cannot be marked ready until
the generated RNW solution is restored or generated on the Windows 11 build
machine, `windows:check` passes, an MSIX artifact path is recorded, and Windows
device smoke passes. Android and iOS pilot route readiness remains unchanged.
