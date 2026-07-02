---
name: mobile-native-scan-app
description: Use for the standalone cross-platform native warehouse scan app, including React Native, React Native Windows, Windows exe, Android apk, iOS ipa packaging, LAN API configuration, native camera scanning, scanner-gun input, mobile login, token storage, offline scan queue, and app release runbooks.
---

# Mobile Native Scan App Skill

## Must Read

Before editing standalone mobile scan app work, read:
- `AGENTS.md`
- `CONTEXT.md`
- `docs/adr/0003-native-scan-app.md`
- `docs/product/01-cross-platform-mobile-scan-app.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/warehouse-scan-flow/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md` when API/auth/scan contracts change
- `.codex/skills/docker-local-deploy/SKILL.md` when LAN deployment, app packaging, certificates, or release docs change
- Existing mobile scan web files under `apps/web/src/app/mobile/`, `apps/web/src/components/mobile/`, and `apps/web/src/lib/`

## Product Boundary

The standalone app is not the office web app and is not the existing Web/PWA
mobile scan page.

It must contain only:
- Login/logout.
- Current user and permission check.
- Load job list for warehouse operators.
- Mobile scan workflow.
- Camera QR scan.
- Scanner-gun/manual QR input.
- Offline scan queue and retry.
- Minimal settings for LAN API base URL and device identity.

Do not add import, report generation, label download, admin, settings, or office correction screens.
Do not implement P6-MOBILE as a WebView-first wrapper, PWA, or browser page. The
core reason for this app is to avoid browser HTTPS/camera restrictions in LAN
operation.

## Preferred Delivery Shape

Use a single app codebase that can package:
- Windows desktop installer/exe for warehouse PCs or rugged Windows tablets.
- Android apk for company-managed phones or PDA devices.
- iOS ipa for company-managed iPhones, subject to Apple signing constraints.

Default recommendation: React Native + React Native Windows, written in
TypeScript.

Use native camera/scanner modules rather than browser `getUserMedia`. React
Native VisionCamera or an equivalent maintained native barcode/QR scanner should
be evaluated during P6-MOBILE-01. Capacitor/Cordova/WebView-first approaches are
not the default because they remain too close to the browser model that caused
the HTTPS camera issue.

## Business Rules

- All scan inventory changes must call the real scan API.
- Do not calculate or decrement inventory locally.
- Offline scans are pending records until the API accepts them.
- Duplicate scan behavior must rely on backend idempotency and scan rules.
- Every queued scan must retain `loadJobId`, `qrPayload`, `scannedAt`, `deviceId`, and auth/user context available at submission time.
- Supervisor override must follow the existing `scan.override` permission, reason-required, and audit rules.
- Tokens must not be logged.
- App logs must not include full JWTs, passwords, or raw secrets.

## LAN Deployment Rules

- The app must allow configuring the local API base URL, for example `http://warehouse-server.local/api` or `http://192.168.x.x/api`.
- The app must show a clear connection status for API reachability and authenticated user.
- For LAN security, document whether the API should use HTTP or HTTPS for
  credential transport. Native camera scanning must not depend on browser HTTPS
  secure-context behavior.
- Release docs must include Windows, Android, and iOS signing/build prerequisites.

## Common Checks

Use task-specific commands once the app scaffold exists. Expected categories:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter mobile-scan-app build
pnpm --filter mobile-scan-app test
```

Native packaging checks depend on the chosen stack and must be documented in the task.
