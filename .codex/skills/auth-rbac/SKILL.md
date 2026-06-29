---
name: auth-rbac
description: Use for authentication, login, JWT/session handling, users, roles, permissions, API guards, route permission mapping, current-user decorators, audit user attribution, password hashing, and account-management tasks in this Bestar warehouse system.
---

# Auth RBAC Skill

## Must Read

Before editing authentication, authorization, users, roles, permissions, or audit attribution:
- `AGENTS.md`
- `docs/architecture/04-api-contracts.md`
- `docs/architecture/05-web-and-scan-ui.md` when Web auth UI is involved
- `docs/architecture/09-account-role-permission-management.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md` when Web UI is involved
- `apps/api/prisma/schema.prisma`
- Existing API modules and tests for the routes being protected

## Core Model

- Use explicit users, roles, permissions, user-role mappings, and role-permission mappings.
- Keep `ADMIN`, `OFFICE`, `WAREHOUSE`, and `SYSTEM` as default roles.
- Use permission strings such as `imports.create`, `containers.update`, `scan.create`, and `users.manage`.
- Store password hashes only; never store plaintext passwords.
- Prefer Argon2id for password hashing unless the project has already selected another secure password hash.
- Keep `SYSTEM` as a non-human account; do not allow normal password login unless a task explicitly requires it.

## API Rules

- Keep public routes minimal: health and login are public; business routes require authentication.
- Use JWT Bearer auth with `JWT_SECRET` from environment.
- Return explicit auth errors:
  - `UNAUTHENTICATED` for missing/invalid/expired token.
  - `FORBIDDEN` for authenticated user without permission.
  - `USER_INACTIVE` for inactive users.
- Use DTO validation for login and account-management payloads.
- Do not rely on frontend-only permission hiding.

## Guard Rules

- Implement a JWT auth guard to load the current user from the database.
- Implement a permission guard using route metadata such as `@RequirePermissions(...)`.
- Add a current-user decorator for controllers and services that need audit attribution.
- Allow route-specific public metadata for login and health.
- Tests must prove that protected routes reject unauthenticated requests and insufficient roles.

## Audit Rules

- Prefer the authenticated user from JWT over client-provided user ids.
- Automatically write audit user ids where existing schema supports it:
  - `import_files.imported_by_id`
  - `generated_files.generated_by_id`
  - `load_jobs.created_by_id`
  - `pallet_events.operator_id`
  - `correction_feedback.corrected_by_id`
- If compatibility with existing request fields is needed, only allow admin/system users to override audit user ids.
- Never overwrite historical pallet events or correction feedback.

## Role Defaults

- `ADMIN`: all permissions.
- `OFFICE`: import, parse, correction, report, label, inventory, and load-job planning permissions.
- `WAREHOUSE`: mobile load-job read, dock update, scan, reverse scan, and inventory read permissions.
- `SYSTEM`: internal worker or service permissions only.

## Web Rules

- Store auth token in a deliberate browser storage strategy; document tradeoffs.
- Add login flow before protecting office/mobile pages.
- Show permission-denied states clearly.
- Do not mock authenticated users as if they were real accounts.

## Common Checks

```bash
pnpm --filter api prisma generate
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```
