# Windows Platform Project Status

Status at P6-MOBILE-11: source boundary present, generated React Native Windows
project blocked.

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

Do not commit:

- `.pfx`, `.cer` private key material, generated `.msix`/`.appx` packages,
  signing passwords, or local Visual Studio user files.
- `bin/`, `obj/`, `Generated Files/`, or per-user `.vs/` state.

P6-MOBILE-11 conclusion for this checkout: Windows cannot be marked ready until
the generated RNW solution is restored or generated on the Windows 11 build
machine and the debug or release build result is recorded.
