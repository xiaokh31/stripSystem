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

The RBAC tables also support default role records beyond the legacy
single-role enum. Wage settlement now requires two dedicated business roles:
- `HR_MANAGER`
- `WAREHOUSE_MANAGER`

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
- Does not receive work hours settlement or unloading wage settlement
  permissions by default.

`WAREHOUSE`
- View assigned in-progress load jobs.
- Scan pallet labels.
- Reverse a scan with reason and confirmation.
- Fill Dock No. and complete a load job from the mobile scan page.
- View current job progress.
- Cannot edit completed jobs, regenerate labels, or delete load jobs.
- Does not receive unloading wage settlement permissions by default.

`HR_MANAGER`
- Manage HR work hours settlement.
- Upload attendance workbooks.
- Parse attendance imports.
- Review parsed attendance rows.
- Generate and download wage record workbooks.
- Cannot manage unloading wage settlement unless another role grants those
  permissions.

`WAREHOUSE_MANAGER`
- Manage unloading wage settlement from container detail.
- Classify containers as `海柜` or `美转加`.
- Record trailer number and associated containers.
- Mark unloading as completed and assign unloaders.
- Generate and review monthly unloading wage settlements.
- Cannot manage HR attendance settlement unless another role grants those
  permissions.

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
| Complete load job | yes | yes | yes | no |
| Scan pallet | yes | yes | yes | no |
| Supervisor scan override | yes | yes | no | no |
| Reverse scan | yes | yes | yes | no |
| View inventory | yes | yes | yes | no |
| View audit history | yes | yes | limited own job | no |
| Manage users/roles | yes | no | no | no |
| Backup/restore | yes | no | no | scripted |

## Wage Manager Permission Matrix

| Area | ADMIN | HR_MANAGER | WAREHOUSE_MANAGER | OFFICE | WAREHOUSE | SYSTEM |
| --- | --- | --- | --- | --- | --- | --- |
| Read attendance imports | yes | yes | no | no | no | worker-only |
| Upload attendance workbook | yes | yes | no | no | no | no |
| Parse attendance workbook | yes | yes | no | no | no | worker-only |
| Generate attendance wage record | yes | yes | no | no | no | worker-only |
| Delete an attendance employee-day row | yes | yes | no | no | no | no |
| Read attendance deletion history | yes | yes | no | no | no | worker-only |
| Read unloading wage data | yes | no | yes | no | no | no |
| Edit container unloading wage section | yes | no | yes | no | no | no |
| Mark unloading as completed for wage | yes | no | yes | no | no | no |
| Generate unloading wage settlement | yes | no | yes | no | no | worker-only |

Notes:
- Employee-day mutation uses the dedicated `attendance.rows.delete`
  permission. Default seeding grants it only to `ADMIN` and `HR_MANAGER`; it is
  not implied by `attendance.read`, `attendance.parse`, or
  `attendance.generate`, and is explicitly absent from `SYSTEM`,
  `WAREHOUSE_MANAGER`, `OFFICE`, and `WAREHOUSE`.
- Deletion history uses `attendance.read`, so a delegated read-only attendance
  user may review immutable events while the Web and API still deny the row
  deletion command.
- `OFFICE` may still read or edit normal container data according to the main
  matrix, but that does not imply wage-settlement authority.
- `WAREHOUSE` may still scan and complete loading jobs, but loading completion
  is separate from unloading wage completion.
- Users with multiple roles receive the union of their active role
  permissions.

## Parser Profile Permission Matrix

| Permission | ADMIN | OFFICE | WAREHOUSE | HR_MANAGER | WAREHOUSE_MANAGER | SYSTEM |
| --- | --- | --- | --- | --- | --- | --- |
| `parser_profiles.read` | yes | yes | no | no | no | no |
| `parser_profiles.train` | yes | yes | no | no | no | no |
| `parser_profiles.review` | yes | yes | no | no | no | no |
| `parser_profiles.approve` | yes | no | no | no | no | no |

Learning-case lookup uses `parser_profiles.read`; start, manual-result link,
unlink, and close use `parser_profiles.train`. Later review and approval routes
must use their dedicated permissions and must not infer authority from a
visible UI action. Default RBAC seeding is exact: `ADMIN` receives all four,
`OFFICE` receives read/train/review, and all other default interactive roles
receive none.

## Attendance Import Deletion Permission

`attendance.imports.delete` is independent from attendance read/create/parse,
generate and employee-day deletion permissions.

| Permission | ADMIN | HR_MANAGER | OFFICE | WAREHOUSE_MANAGER | WAREHOUSE | SYSTEM |
| --- | --- | --- | --- | --- | --- | --- |
| `attendance.imports.delete` | yes | yes | no | no | no | no |

Deletion impact and whole-import mutation require this permission. Immutable
import deletion history uses `attendance.read`. The Web hides the command
without the dedicated permission, while the API route matrix remains the
authority.

## Enforcement Rules

- Every mutating endpoint should receive an authenticated user identity.
- Permission checks must happen in the API, not only in the frontend.
- Frontend navigation and buttons must hide unavailable wage actions, but API
  route permissions remain the source of truth.
- Scanner flows must never trust frontend inventory counts.
- Manual correction, scan reversal, and supervisor scan override must keep audit
  records.
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
