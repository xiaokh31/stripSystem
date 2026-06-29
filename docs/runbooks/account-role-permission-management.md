# Account, Role, and Permission Management Plan

## Current State

The API already stores users in the `users` table with:
- `email`
- `name`
- `role`
- `is_active`

The current role enum is:
- `ADMIN`
- `OFFICE`
- `WAREHOUSE`
- `SYSTEM`

This document is a delivery plan. It does not claim that authentication,
session management, or permission enforcement is already complete.

## Target Roles

`ADMIN`
- Manage users, roles, and deployment settings.
- Access all import, correction, reporting, loading, inventory, audit, backup,
  and reprint functions.

`OFFICE`
- Upload and parse import files.
- Create manual unloading reports.
- Edit container destinations and correction feedback.
- Generate reports and labels.
- Create, edit, start, and complete load jobs.
- Review inventory and audit history.

`WAREHOUSE`
- View assigned in-progress load jobs.
- Scan pallet labels.
- Reverse a scan with reason and confirmation.
- View current job progress.
- Cannot edit completed jobs, regenerate labels, or delete load jobs.

`SYSTEM`
- Used by workers, scripts, and scheduled processes.
- Should not be used for interactive browser login.

## Permission Matrix

| Area | ADMIN | OFFICE | WAREHOUSE | SYSTEM |
| --- | --- | --- | --- | --- |
| Import Excel | yes | yes | no | worker-only |
| Parse import | yes | yes | no | worker-only |
| Manual container | yes | yes | no | no |
| Destination correction | yes | yes | no | no |
| Generate report | yes | yes | no | worker-only |
| Generate labels | yes | yes | no | worker-only |
| Reprint labels | yes | yes | no | no |
| Create load job | yes | yes | no | no |
| Edit planned load job | yes | yes | no | no |
| Edit in-progress load job | yes | yes | limited scan correction | no |
| Delete planned load job | yes | yes | no | no |
| Complete load job | yes | yes | no | no |
| Scan pallet | yes | yes | yes | no |
| Reverse scan | yes | yes | yes | no |
| View inventory | yes | yes | yes | no |
| View audit history | yes | yes | limited own job | no |
| Manage users/roles | yes | no | no | no |
| Backup/restore | yes | no | no | scripted |

## Enforcement Rules

- Every mutating endpoint should receive an authenticated user identity.
- Permission checks must happen in the API, not only in the frontend.
- Scanner flows must never trust frontend inventory counts.
- Manual correction and scan reversal must keep audit records.
- Completed load jobs and loaded containers must remain immutable except for
  explicit audit-only annotations.
- `SYSTEM` actions must be traceable to a worker name, script, or service
  account.

## Required Skills for Agent Work

Use these skills for implementation and review:
- `.codex/skills/bestar-domain/SKILL.md` for business rules.
- `.codex/skills/nestjs-prisma-api/SKILL.md` for API, Prisma, migrations, and
  permission enforcement.
- `.codex/skills/nextjs-pwa-ui/SKILL.md` for role-aware UI.
- `.codex/skills/warehouse-scan-flow/SKILL.md` for scan permissions and race
  conditions.
- `.codex/skills/qa-regression/SKILL.md` for review and regression coverage.

## Vibe Coding Task Plan

`AUTH-01 User and session model`
- Add passwordless or local-login decision ADR.
- Add session table or token verification strategy.
- Acceptance: API can identify the current user without trusting a request body
  `createdById`.

`AUTH-02 Permission guard`
- Add NestJS role/permission guard.
- Map routes to permissions.
- Acceptance: forbidden users receive `403` and tests cover each role.

`AUTH-03 User management API`
- Add admin-only user create/update/disable/list endpoints.
- Acceptance: disabled users cannot mutate warehouse data.

`AUTH-04 Role-aware web shell`
- Hide unavailable navigation/actions based on authenticated role.
- Acceptance: hidden UI is matched by API-side permission tests.

`AUTH-05 Warehouse login mode`
- Add mobile-friendly warehouse login or device pairing.
- Acceptance: scan events record operator or device identity.

`AUTH-06 Audit report`
- Add user/action filters for correction, generated file, reprint, and scan
  events.
- Acceptance: office users can review who changed what and when.

## Non-goals for the Current Load Job Update

- No fake accounts or mock users are introduced as production behavior.
- No frontend-only permission gate is considered complete.
- No external identity provider is selected in this document.
