# Database Migration Runbook

## Scope

This runbook explains how to inspect, create, apply, and verify PostgreSQL
schema migrations for the local full-stack deployment.

The canonical schema is:

```text
apps/api/prisma/schema.prisma
```

Migration files live in:

```text
apps/api/prisma/migrations/
```

Do not manually edit generated Prisma client files under
`apps/api/src/generated/prisma`.

## Current Local Compose Database

The local full stack runs PostgreSQL inside Docker:

```bash
docker compose -f infra/docker/compose.local.yml ps
```

The API container connects with the internal Docker hostname:

```text
postgres:5432
```

The host port is intended for operator/admin access:

```text
localhost:15432
```

If a command runs inside the `api` container, use the compose-provided
`DATABASE_URL`. If a command runs on the host, set `DATABASE_URL` with
`localhost:15432`.

## Check API And Database Health

```bash
curl http://localhost/api/health
```

Expected result:

```json
{"status":"ok","database":{"status":"up"}}
```

If the API health is degraded, inspect logs:

```bash
docker compose -f infra/docker/compose.local.yml logs --tail=200 api
docker compose -f infra/docker/compose.local.yml logs --tail=200 postgres
```

## Account Data In The Database

The PostgreSQL database stores account and authorization state, including:

- `users` and password hashes
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- audit records that reference `userId`

Default roles and permissions are seeded from
`apps/api/src/auth/default-rbac.ts` by `apps/api/prisma/seed.ts`. Do not edit
these tables manually to create users or bypass permissions. Use the seed for
system defaults and the user management API for staff accounts.

## Check Migration Status

Run Prisma status from inside the API container:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma migrate status
```

Expected result when the database is current:

```text
Database schema is up to date!
```

Inspect applied migrations directly:

```bash
docker compose -f infra/docker/compose.local.yml exec -T postgres \
  psql -U bestar -d bestar_unloading \
  -c "select migration_name, finished_at from _prisma_migrations order by finished_at;"
```

## Check Schema Drift

Use Prisma diff inside the API container:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma migrate diff \
  --from-schema prisma/schema.prisma \
  --to-config-datasource \
  --exit-code
```

Exit codes:

- `0`: no difference detected
- `1`: command error
- `2`: schema and database differ

If the command returns `2`, do not keep testing business workflows until the
schema drift has an owner and a migration/restore plan.

## Create A Migration After Schema Changes

Use this flow when `apps/api/prisma/schema.prisma` changes.

1. Back up PostgreSQL first:

```bash
BACKUP_DIR=/var/backups/bestar-unloading scripts/backup-postgres.sh
```

2. Edit `apps/api/prisma/schema.prisma`.

3. Create a named migration:

```bash
DATABASE_URL='postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public' \
  pnpm --filter api prisma migrate dev --name short_change_name
```

4. Review the generated SQL under `apps/api/prisma/migrations/`.

5. Regenerate Prisma client if needed:

```bash
pnpm --filter api prisma generate
```

6. Run API checks:

```bash
pnpm --filter api typecheck
pnpm --filter api test
```

7. Commit both files:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`

Do not commit a schema change without its migration.

## Apply Migrations To Local Full Stack

The local API service automatically runs migrations during startup:

```text
pnpm --filter api prisma migrate deploy
```

To apply a committed migration to the running local stack:

```bash
docker compose -f infra/docker/compose.local.yml up -d --build api web nginx
```

Or run deploy directly inside the API container:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma migrate deploy
```

Then verify:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma migrate status

docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma db seed

curl http://localhost/api/health
```

Run `prisma db seed` after migrations whenever default role or permission codes
change. The seed is idempotent and keeps the default `ADMIN`, `OFFICE`,
`WAREHOUSE`, and `SYSTEM` role permissions in sync.

## What Not To Do

Do not use these commands on a pilot or production database:

```bash
pnpm --filter api prisma db push
pnpm --filter api prisma migrate reset
docker compose -f infra/docker/compose.local.yml down -v
```

`db push` can bypass migration history. `migrate reset` and `down -v` can
destroy data. Use a reviewed migration or restore from backup instead.

## Rollback Strategy

Prisma migrations in this project are forward-only. If a migration is wrong:

1. Stop office/warehouse traffic.
2. Back up the current broken state for investigation.
3. Prefer a corrective forward migration when data is safe.
4. Restore PostgreSQL from backup only when the warehouse owner approves data
   rollback.

Restore instructions are in `docs/runbooks/backup-restore.md`.

## Manual Table Inspection

List tables:

```bash
docker compose -f infra/docker/compose.local.yml exec -T postgres \
  psql -U bestar -d bestar_unloading -c "\dt"
```

Inspect one table:

```bash
docker compose -f infra/docker/compose.local.yml exec -T postgres \
  psql -U bestar -d bestar_unloading \
  -c "select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'load_jobs' order by ordinal_position;"
```
