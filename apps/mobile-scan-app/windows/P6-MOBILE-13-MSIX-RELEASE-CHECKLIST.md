# P6-MOBILE-13 Windows MSIX Release Checklist

Use this checklist on the Windows 11 build machine. Do not fill passwords,
JWTs, private certificate keys, or signing secrets into this file.

## Required Build Machine

- Windows 11:
- Visual Studio 2022 version:
- Windows SDK version:
- Node.js version:
- pnpm version:
- React Native Windows package: `react-native-windows@0.84.0`
- Signing mode: signed / test-signed
- Certificate distribution: Trusted People / company MDM / other

## Generated Project Evidence

Record the exact relative paths after generating or restoring the React Native
Windows project:

- Solution: `apps/mobile-scan-app/windows/...`
- Project: `apps/mobile-scan-app/windows/...`
- Manifest: `apps/mobile-scan-app/windows/.../Package.appxmanifest`

Required source files included in the generated project:

- [ ] `windows/BestarQrScanner/BestarQrScannerModule.cs`
- [ ] `windows/BestarQrScanner/BestarSecureTokenStoreModule.cs`

Native module decisions:

- `BestarSecureTokenStore`: Windows Credential Locker verified / blocked
- `BestarQrScanner`: camera decoder wired / scanner-gun manual Windows-only
  exception approved
- If camera decoder is deferred, record approver and reason:

## Commands To Run

From the repository root on Windows:

```powershell
pnpm install --frozen-lockfile=false --ignore-scripts
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter mobile-scan-app package:check
pnpm --filter mobile-scan-app package:check -- --strict
pnpm --filter mobile-scan-app windows:check
pnpm --filter mobile-scan-app windows
pnpm --filter mobile-scan-app windows -- --release --arch x64
```

If the React Native Windows project has not been generated yet, generate it on
the Windows build machine with the pinned dependency set, then review the diff:

```powershell
pnpm --filter mobile-scan-app exec react-native-windows-init --overwrite
```

Do not overwrite existing hand-edited native source without reviewing the diff.

## MSIX Artifact

Record only paths and hashes. Do not commit the package or private key.

- Artifact path:
- Artifact SHA-256:
- Package version:
- Signing certificate public thumbprint:
- Release notes path:

Typical artifact directories:

```text
apps/mobile-scan-app/windows/<AppName>/AppPackages/
apps/mobile-scan-app/windows/x64/Release/
```

## Windows Device Smoke

Use a real warehouse Windows device or Windows tablet.

- Device model:
- Windows version:
- Install method: Add-AppxPackage / double-click / MDM
- API base URL: `http://<server-lan-ip>/api` or internal HTTPS URL
- Login role: WAREHOUSE / supervisor-capable WAREHOUSE
- Load job:
- Pallet QR source:

Smoke checklist:

- [ ] MSIX installs successfully.
- [ ] App opens without Metro bundler.
- [ ] LAN API URL can be saved and health check passes.
- [ ] Real WAREHOUSE account can log in.
- [ ] App restart restores session from Windows Credential Locker.
- [ ] Logout clears session; restart does not restore logged-out token.
- [ ] Planned or in-progress load jobs load from the real API.
- [ ] Scanner-gun/manual input scans a real pallet QR through the real scan API.
- [ ] Duplicate scan does not decrement inventory twice.
- [ ] Offline queue stores network-send failure and syncs later through API.
- [ ] Supervisor override is hidden from ordinary WAREHOUSE users.
- [ ] Supervisor override requires reason and audit confirmation for authorized
      users.
- [ ] Dock No. is required before complete loading when business rules require
      it.
- [ ] Complete loading records the authenticated user.
- [ ] App logs do not contain JWTs, passwords, certificate secrets, or signing
      passwords.

Camera checklist if Windows camera is required:

- [ ] Windows camera permission prompt appears.
- [ ] Native camera scan returns a real pallet QR payload.
- [ ] Camera payload is submitted through `POST /api/load-jobs/:id/scan`.
- [ ] Manual/scanner-gun input still works if camera permission is denied.

## Completion Decision

Select one:

- `windows msix release complete`
- `windows msix release blocked`

If blocked, list blockers:

- 
