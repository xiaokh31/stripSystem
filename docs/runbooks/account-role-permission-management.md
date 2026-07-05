# Account, Role, and Permission Management Runbook

## Current State

The API stores users in the `users` table with:

- `email`
- `name`
- `password_hash`
- `last_login_at`
- `role`
- `is_active`

RBAC data is stored in:

- `roles`
- `permissions`
- `role_permissions`
- `user_roles`

The default role codes are:

- `ADMIN`
- `OFFICE`
- `WAREHOUSE`
- `HR_MANAGER`
- `WAREHOUSE_MANAGER`
- `SYSTEM`

The canonical default role and permission matrix is defined in:

```text
apps/api/src/auth/default-rbac.ts
```

The Prisma seed file writes those defaults into the database:

```text
apps/api/prisma/seed.ts
```

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
- Classify containers as ocean or US-to-Canada transfer for wage purposes.
- Record trailer number and associated containers.
- Mark unloading as completed and assign unloaders.
- Generate and review monthly unloading wage settlements.
- Cannot manage HR attendance settlement unless another role grants those
  permissions.

`SYSTEM`

- Used by workers, scripts, and scheduled processes.
- Should not be used for interactive browser login.

## Permission Matrix

| Area                      | ADMIN | OFFICE | WAREHOUSE               | SYSTEM      |
| ------------------------- | ----- | ------ | ----------------------- | ----------- |
| Import Excel              | yes   | yes    | no                      | worker-only |
| Parse import              | yes   | yes    | no                      | worker-only |
| Manual container          | yes   | yes    | no                      | no          |
| Destination correction    | yes   | yes    | no                      | no          |
| Generate report           | yes   | yes    | no                      | worker-only |
| Generate labels           | yes   | yes    | no                      | worker-only |
| Reprint labels            | yes   | yes    | no                      | no          |
| Create load job           | yes   | yes    | no                      | no          |
| Edit planned load job     | yes   | yes    | no                      | no          |
| Edit in-progress load job | yes   | yes    | limited scan correction | no          |
| Delete planned load job   | yes   | yes    | no                      | no          |
| Complete load job         | yes   | yes    | yes                     | no          |
| Scan pallet               | yes   | yes    | yes                     | no          |
| Supervisor scan override  | yes   | yes    | no                      | no          |
| Reverse scan              | yes   | yes    | yes                     | no          |
| View inventory            | yes   | yes    | yes                     | no          |
| View audit history        | yes   | yes    | limited own job         | no          |
| Manage users/roles        | yes   | no     | no                      | no          |
| Backup/restore            | yes   | no     | no                      | scripted    |

## Wage Permission Matrix

| Area | ADMIN | HR_MANAGER | WAREHOUSE_MANAGER | OFFICE | WAREHOUSE | SYSTEM |
| --- | --- | --- | --- | --- | --- | --- |
| Read attendance imports | yes | yes | no | no | no | worker-only |
| Upload attendance workbook | yes | yes | no | no | no | no |
| Parse attendance workbook | yes | yes | no | no | no | worker-only |
| Generate attendance wage record | yes | yes | no | no | no | worker-only |
| Read unloading wage data | yes | no | yes | no | no | no |
| Edit container unloading wage section | yes | no | yes | no | no | no |
| Mark unloading as completed for wage | yes | no | yes | no | no | no |
| Generate unloading wage settlement | yes | no | yes | no | no | worker-only |

For production pilot account assignment, use
[pilot-account-assignment.md](pilot-account-assignment.md). It explains how to
assign named staff accounts without using shared, E2E, or smoke-test accounts.

## Seed Default Roles And Permissions

Start the Docker full stack first. The API container runs committed migrations
during startup. Then seed roles and permissions inside the API container:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma db seed
```

The seed is idempotent:

- It upserts stable permission codes.
- It upserts the default roles.
- It synchronizes default role permissions.
- It does not create an administrator unless explicit seed variables are set.

## Initial Administrator

Create or recover an administrator through one-time seed variables. Replace the
email and password before running the command:

```bash
docker compose -f infra/docker/compose.local.yml exec -T \
  -e SEED_ADMIN_EMAIL='<admin-email>' \
  -e SEED_ADMIN_PASSWORD='<unique-strong-admin-password>' \
  -e SEED_ADMIN_NAME='Initial Admin' \
  api pnpm --filter api prisma db seed
```

Production must not use a shared or example password. The seed rejects weak
administrator passwords and requires `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` to be set together.

The command is idempotent for the supplied email:

- If the email does not exist, it creates an active ADMIN user.
- If the email already exists, it resets that account's password, sets
  `is_active = true`, keeps the user row, and ensures the ADMIN role assignment
  exists.
- It does not delete or replace other users.

After the first administrator logs in, create normal users through the API:

```http
POST /api/users
```

Assign roles with `roleCodes` such as `OFFICE` or `WAREHOUSE`. Do not manually
insert users or password hashes in the database.

## Browser E2E Administrator

Playwright browser E2E tests do not create or assume a hidden administrator.
Create a dedicated local test administrator with the seed command above, then
run E2E with explicit credentials:

```bash
E2E_ADMIN_EMAIL='<admin-email>' \
E2E_ADMIN_PASSWORD='<unique-strong-admin-password>' \
pnpm --filter web test:e2e
```

Do not use the E2E administrator as a production shared account.

## Login Verification

Verify API health first through Docker/nginx:

```bash
curl -sS http://localhost/api/health
```

Verify the initial administrator:

```bash
curl -sS -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin-email>","password":"<unique-strong-admin-password>"}'
```

Use the returned Bearer token to verify the current profile and account access:

```bash
curl -sS http://localhost/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

curl -sS http://localhost/api/users \
  -H "Authorization: Bearer $TOKEN"

curl -sS http://localhost/api/roles \
  -H "Authorization: Bearer $TOKEN"

curl -sS http://localhost/api/permissions \
  -H "Authorization: Bearer $TOKEN"
```

## Disable And Reset Accounts

Disable an inactive or departed employee:

```http
PATCH /api/users/:id/status
```

Payload:

```json
{ "isActive": false }
```

Inactive users cannot log in and cannot use existing Bearer tokens.

Reset a password:

```http
POST /api/users/:id/reset-password
```

Payload:

```json
{ "password": "Use-A-New-Unique-Password-123!" }
```

Password hashes are never returned by API responses.

## Enforcement Rules

- Every mutating endpoint should receive an authenticated user identity.
- Permission checks must happen in the API, not only in the frontend.
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
