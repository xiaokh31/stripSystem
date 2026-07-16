# Cross-Platform Mobile Scan App PRD

## Delivery Scope Override (2026-07-15)

- Android APK and iOS IPA remain active delivery targets.
- Windows React Native Windows project generation, Credential Locker/camera
  integration, MSIX packaging, signing and Windows-device smoke are archived.
- Archived Windows work is not a current acceptance criterion or release
  blocker. Existing Windows requirements are retained below as a reversible
  reactivation reference rather than deleted.
- Reactivation requires explicit product approval, removal of the
  `Task-Status: ARCHIVED` marker from P6-MOBILE-09 through P6-MOBILE-13, and
  synchronized updates to the open-task index and completion report.

## Background

Bestar Warehouse Unloading System is deployed inside the company local area
network. Office staff can use the browser-based office web app from desktop
computers. Warehouse operators need a smaller standalone scan app that can be
installed on warehouse devices without exposing office workflows.

The existing web mobile scan pages remain useful for browser access and as a
behavior reference. The new standalone app must be a separate operator-focused
native app with only login and mobile scan features.

The main reason for this new app is operational: browser-based mobile scan can
be blocked by HTTPS/camera restrictions in a local LAN deployment. The target
client must therefore use native camera access, native secure storage, native
device permissions, and native packaging. A WebView-first wrapper or PWA is not
the final product.

## Goal

The original cross-platform architecture can produce the following artifacts;
the active delivery scope is currently Android and iOS as stated above:

- Windows MSIX for warehouse PCs, Windows tablets, or local scan stations.
- Android apk for company-managed phones and Android PDA devices.
- iOS ipa for company-managed iPhones or iPads.

The app must work inside the company LAN against the existing Bestar API, avoid
browser camera limitations, and preserve current scan transaction, auth,
permission, audit, duplicate scan, supervisor override, and offline queue rules.

## Non-Goals

- No office import/upload pages.
- No container detail editing.
- No unloading report or label generation.
- No admin user/role/permission management.
- No full ERP or customer-facing portal.
- No local inventory mutation without the API.
- No mock data standing in for real load jobs or pallets.
- No WebView-first wrapper, PWA, or browser-only camera implementation as the
  final delivery target.

## Users

- Warehouse operator: logs in, selects assigned/open load jobs, scans pallets,
  sees success/error/progress, completes loading when allowed.
- Loading supervisor: same as warehouse operator, plus supervisor override when
  granted `scan.override`.
- Office staff: does not use this app for planning; still uses the office web
  app to create load jobs and manage reports.

## Required Capabilities

1. Login
   - Uses `POST /api/auth/native/login` with stable device identity.
   - Uses short-lived access tokens plus rotating, revocable Native refresh
     sessions; it does not reuse the browser cookie lifetime as its session
     policy.
   - Reads current user via `GET /api/auth/me`.
   - Atomically stores access token, refresh token, session metadata, and cached
     user in the platform secure store.
   - Shows clear expired-session and permission-denied states.

2. LAN API configuration
   - Allows setting an API base URL such as `http://192.168.x.x/api`.
   - Shows API connectivity and authenticated-user status.
   - Must not require internet access for normal operation.

3. Load job list
   - Calls the real load jobs API.
   - Shows only operator-relevant planned/in-progress jobs according to current
     API permissions.
   - Displays load No., destination region, truck No., dock No., carrier,
     scheduled departure, status, and progress.

4. Scan workflow
   - Supports camera QR scanning.
   - Supports scanner-gun keyboard input and manual input with Enter submit.
   - Calls the real scan transaction API with selected `loadJobId`.
   - Displays success, duplicate, invalid QR, not-in-plan, already-loaded,
     plan-line-full, closed-job, and unauthorized states.
   - Shows container No., destination, pallet No., and updated load job
     progress from the backend response.

5. Offline queue
   - Queues network-send failures locally.
   - Stores `localId`, `loadJobId`, `qrPayload`, `scannedAt`, `deviceId`,
     `syncStatus`, and `lastError`.
   - Does not pretend inventory changed while offline.
   - Retries through the real API and relies on backend duplicate handling.

6. Supervisor override
   - Available only when current user has `scan.override` or equivalent admin
     permission.
   - Requires a reason and explicit confirmation.
   - Calls the existing scan API override payload and preserves audit behavior.

7. Complete loading
   - Allows permitted operators to mark a job completed.
   - Requires dock No. when current business rules require it.
   - Records the authenticated user through existing API audit fields.

## Recommended Technical Direction

Use React Native as the primary native app stack:

- Android and iOS: React Native.
- Windows: React Native Windows.
- Language: TypeScript.
- Camera QR scanning: native camera module, with React Native VisionCamera or
  an equivalent maintained native scanner selected during implementation.
- Scanner-gun/manual input: native text input and hardware keyboard events.
- Local queue: native persistent storage selected by platform needs.

Rationale:
- React Native creates native platform views and can access native device APIs,
  avoiding reliance on browser `getUserMedia` HTTPS behavior.
- React Native Windows is an established path for native Windows apps, so the
  same TypeScript/React skillset can cover Android, iOS, and Windows.
- The existing project already uses TypeScript and React patterns, so API
  contract code and workflow logic can be shared or ported without copying the
  office web UI.
- Native camera/scanner modules allow QR scanning even when a LAN browser page
  would be blocked by secure-context rules.

Rejected as the default direction:
- Capacitor/Cordova/WebView-first app: too close to the browser/PWA model that
  caused the camera access problem.
- Tauri/Electron-only desktop app: useful for Windows but does not solve Android
  and iOS as one primary mobile stack.
- Flutter: viable technically, but it would introduce Dart and duplicate more
  API/workflow code from the existing TypeScript project.

P6-MOBILE-01 must confirm library versions and packaging commands before code is
written, but the product direction is native React Native, not a web app.

## API Dependencies

Existing API contracts expected to be reused:

- `POST /api/auth/native/login`
- `POST /api/auth/native/refresh`
- `POST /api/auth/native/logout`
- `GET /api/auth/me`
- `GET /api/load-jobs`
- `GET /api/load-jobs/:id`
- `PATCH /api/load-jobs/:id`
- `POST /api/load-jobs/:id/scan`
- `POST /api/load-jobs/:id/scan/reverse`
- `POST /api/load-jobs/:id/close`

The Native session endpoints are intentionally distinct from browser login so
the app can silently rotate short access tokens while retaining server-side
revoke and current-account checks.

## Security Requirements

- Token storage must use the best available secure storage for each runtime.
- The app must support server-side logout/revoke followed by local token
  clearing. Offline logout still clears local credentials immediately.
- Temporary network failure must preserve an otherwise valid local session and
  offline queue; only stable invalid/revoked/inactive results clear it.
- Concurrent protected requests may perform only one refresh and retry each
  original request at most once after explicit `AUTH_TOKEN_EXPIRED`.
- App logs must not print JWTs, passwords, or full secrets.
- API base URL can be stored locally, but passwords and JWTs must not be stored
  in plain text when a secure platform store is available.
- iOS and Android camera permission prompts must be explicit and user-friendly.

## Deployment Requirements

- Windows: document prerequisites, build command, output artifact, install
  steps, LAN API configuration, and update process.
- Android: document debug apk and production signed apk process.
- iOS: document Apple Developer account, signing, provisioning profile, device
  installation/TestFlight or internal distribution constraints.
- LAN: document server hostname/IP, firewall ports, API HTTP/HTTPS security
  requirements, and native camera permission behavior. Camera scanning must not
  depend on browser HTTPS secure-context behavior.

## Acceptance Criteria

For the current Android/iOS delivery scope, the standalone app is complete when:

1. A fresh warehouse device can install the app and configure LAN API URL.
2. A warehouse user can log in with an existing account.
3. The app shows real load jobs from the backend.
4. Camera scan and scanner-gun/manual input both call the real scan API.
5. Offline scans are queued and later synced without double decrementing.
6. Supervisor override works only for authorized users and writes audit events.
7. Android apk and iOS ipa build instructions are documented and tested to the
   extent possible in the available environment. Windows MSIX is excluded while archived.
8. No office/admin/report/import UI is bundled into the app.

## Open Decisions

- Final native scanner/storage libraries for React Native Android/iOS/Windows.
- Whether production LAN API should use HTTPS for credential transport even
  though native camera scanning no longer depends on browser HTTPS rules.
- Enterprise distribution method for iOS ipa.
- Whether warehouse devices are company-managed and can receive MDM profiles.
