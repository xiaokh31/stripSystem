# Native Scan App Testing Runbook

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

## P6-MOBILE-03 Native Login + Auth Session

Purpose:
- Login with real Bestar accounts.
- Restore current user from `GET /api/auth/me`.
- Logout and clear token.
- Show expired session and permission denied states.

Automated checks:

```bash
pnpm --filter mobile-scan-app lint
pnpm --filter mobile-scan-app typecheck
pnpm --filter mobile-scan-app test
pnpm --filter api test:e2e
```

Manual API setup:
1. Start Docker full stack.
2. Confirm the API is healthy at `http://127.0.0.1/api/health`.
3. Confirm the deployment has real ADMIN, OFFICE, and WAREHOUSE accounts.

Device test:
1. Set API base URL to `http://<server-lan-ip>/api`.
2. Login as a WAREHOUSE user.
3. Confirm the app shows user name/email/roles/permissions.
4. Login with a wrong password and confirm the error is clear.
5. Login with an inactive user and confirm the user is rejected.
6. Login with a SYSTEM user and confirm ordinary employee login is rejected.
7. Tap Logout, restart the app, and confirm protected session data is cleared or
   restored only when a valid token still exists.

Known limitation:
- P6-MOBILE-03 uses a `SecureTokenStore` abstraction but the current scaffold
  stores tokens through AsyncStorage fallback. Before pilot release, replace it
  with Keychain, Android Keystore-backed storage, and Windows Credential Locker.

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
- The current repository has a TypeScript native scanner adapter and UI, but
  the generated Android/iOS/Windows native module implementation is not present
  yet. Device camera acceptance requires wiring `BestarQrScanner` in platform
  code before pilot release.

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
- Automatic network-recovery sync is currently triggered by API health recovery
  and manual sync. A later native platform task can add OS network-state
  listeners.

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

Native device packaging checks are deferred until P6-MOBILE-08.
