# Pilot Data Cleanup And Archive Runbook

## Scope

Use this runbook before a production pilot or go-live rehearsal when the local
Docker full stack has accumulated development, E2E, or smoke-test data.

This document is operational only. It does not add wage business behavior and
does not change the database schema.

## Principles

- Preserve original uploaded files and generated artifacts.
- Back up PostgreSQL and `storage/` before any cleanup.
- Prefer a clean pilot database and clean `storage/` directory over selective
  deletion of business rows.
- Do not manually delete individual audit, pallet, scan, correction, wage, or
  generated-file rows from a live pilot database.
- Do not use E2E or smoke accounts as production pilot accounts.
- Keep every archive outside the repository or in a clearly named local archive
  directory that is not committed.

## What Counts As Pilot Data

Pilot data is real operational data approved by the warehouse supervisor for
the production pilot:

- real unloading files
- real attendance workbooks when HR is included in the pilot
- real containers, destinations, reports, labels, load jobs, scans, corrections
- real HR work-hours records and unloading wage settlements
- real users assigned by name to warehouse staff

Everything else is non-pilot data and should be archived or moved to a separate
environment before the pilot:

- Playwright or E2E generated users, containers, attendance imports, settlements
- smoke-test files under `storage/`
- local regression uploads that are not part of supervisor-approved pilot data
- generated reports or labels created only for testing

## Required Inputs

Record these values before starting:

| Field | Value |
| --- | --- |
| Date/time | |
| Operator | |
| Supervisor approving cleanup | |
| Local IT owner | |
| Commit/version | |
| Backup directory | |
| Existing host name | |
| Target pilot host name | |
| Decision: fresh environment or preserve approved data | |

## Step 1: Freeze Traffic

1. Tell office, warehouse, and HR users to stop using the system.
2. Confirm no import, parse, report, label, scan, attendance, or wage settlement
   operation is running.
3. Keep the Docker stack up while creating backups unless local IT needs it
   stopped.

Check service state:

```bash
docker compose -f infra/docker/compose.local.yml ps
scripts/healthcheck.sh
```

## Step 2: Back Up Current State

Set a backup destination outside the repository:

```bash
export BACKUP_DIR=/var/backups/bestar-unloading/pre-pilot-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
```

Windows Git Bash example:

```bash
export BACKUP_DIR=/d/bestar-backups/pre-pilot-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
```

Create both backups:

```bash
scripts/backup-postgres.sh
scripts/backup-storage.sh
```

Record the resulting file names:

| Backup | Path | Size | Operator initials |
| --- | --- | --- | --- |
| PostgreSQL SQL dump | | | |
| Storage tar.gz | | | |

The backup must include account/RBAC data, audit references, original uploaded
files, generated reports, label PDFs, attendance files, wage records, and
unloading wage settlement files.

## Step 3: Inventory Non-Pilot Data

Use read-only queries or the UI to identify data created by tests. Do not delete
rows from this step.

Suggested review areas:

| Area | Common non-pilot signal | Action |
| --- | --- | --- |
| Users | `e2e-*`, `test@`, smoke names | Disable or leave in archived environment; do not use for pilot. |
| Imports | known fixture files or smoke container numbers | Archive by using a clean DB/storage for pilot. |
| Attendance | sample wage fixtures or Playwright-generated wage records | Archive by using a clean DB/storage for pilot. |
| Unloading wage | smoke containers, smoke trailer numbers, E2E unloaders | Archive by using a clean DB/storage for pilot. |
| Load jobs/scans | test load numbers, scanner regression data | Archive by using a clean DB/storage for pilot. |

Useful read-only checks:

```bash
docker exec bestar_postgres_local psql -U bestar -d bestar_unloading \
  -c "select email, name, is_active from users order by created_at desc limit 30;"

docker exec bestar_postgres_local psql -U bestar -d bestar_unloading \
  -c "select original_filename, file_sha256, created_at from import_files order by created_at desc limit 20;"

docker exec bestar_postgres_local psql -U bestar -d bestar_unloading \
  -c "select original_filename, file_sha256, settlement_month, created_at from attendance_imports order by created_at desc limit 20;"

docker exec bestar_postgres_local psql -U bestar -d bestar_unloading \
  -c "select settlement_month, status, total_amount, created_at from unloading_wage_settlements order by created_at desc limit 20;"
```

## Step 4: Choose Cleanup Method

### Recommended: Fresh Pilot Environment

Use this when the current environment contains regression data and no approved
pilot records need to be preserved.

1. Keep the backups from Step 2.
2. Use a fresh checkout or clean target host for the pilot.
3. Start the Docker full stack.
4. Run migrations and seed default roles.
5. Create real pilot accounts using
   [pilot-account-assignment.md](pilot-account-assignment.md).
6. Run `scripts/healthcheck.sh`.

This is the safest option because it avoids breaking audit relationships by
deleting selected rows from a live database.

### Acceptable: Archive Current Host Then Start Clean

Use only with supervisor and local IT approval.

1. Confirm the Step 2 PostgreSQL and storage backups exist and are readable.
2. Stop the stack:

   ```bash
   docker compose -f infra/docker/compose.local.yml down
   ```

3. Move current storage aside:

   ```bash
   mv storage "storage.archive-pre-pilot-$(date +%Y%m%d-%H%M%S)"
   mkdir -p storage
   ```

4. Create a clean PostgreSQL volume by using an approved clean host, approved
   clean volume, or restore target. Do not remove a Docker volume unless local
   IT has recorded the exact volume name and supervisor approval.
5. Start the stack:

   ```bash
   docker compose -f infra/docker/compose.local.yml up -d --build
   ```

6. Seed roles and create real pilot accounts.
7. Run `scripts/healthcheck.sh`.

### Not Recommended: Selective Row Deletion

Selective SQL deletion is not the normal pilot cleanup path. It can break
business history, audit references, generated-file records, pallet state, scan
events, correction feedback, and wage settlement snapshots.

Do not run ad hoc `DELETE` commands against these areas in a live pilot
database:

- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`
- `import_files`, `containers`, `container_destinations`, `generated_files`
- `pallets`, `pallet_events`, `load_jobs`
- `correction_feedback`
- `attendance_imports`, `attendance_rows`, `wage_generated_files`
- `pay_containers`, `unloader_assignments`
- `unloading_wage_settlements`, settlement worker summaries, settlement lines

If the business requires preserving some approved pilot records while removing
others, export a fresh backup and create a reviewed SQL migration/runbook for
that exact case. Do not improvise cleanup on the production pilot database.

## Step 5: Recreate Pilot Baseline

After cleanup, verify the baseline:

```bash
docker compose -f infra/docker/compose.local.yml ps
scripts/healthcheck.sh
```

Seed roles and permissions:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma db seed
```

Create or recover the first administrator with unique production credentials:

```bash
docker compose -f infra/docker/compose.local.yml exec -T \
  -e SEED_ADMIN_EMAIL='<admin-email>' \
  -e SEED_ADMIN_PASSWORD='<unique-strong-admin-password>' \
  -e SEED_ADMIN_NAME='Initial Administrator' \
  api pnpm --filter api prisma db seed
```

Then follow [pilot-account-assignment.md](pilot-account-assignment.md).

## Step 6: Storage Directory Checklist

After cleanup and before pilot traffic, confirm that `storage/` exists and is
writable. It may be empty except for placeholders.

```bash
test -d storage
test -w storage
```

During pilot, do not delete these directories or their contents manually:

- `storage/original_files`
- `storage/parsed_json`
- `storage/reports`
- `storage/labels`
- `storage/task_reports`
- `storage/corrections`
- `storage/attendance_original_files`
- `storage/attendance_imports`
- `storage/unloading_wage_settlements`

These directories contain source evidence, generated artifacts, and wage audit
files.

## Step 7: Verification Sign-Off

| Check | Pass / Fail / N/A | Evidence |
| --- | --- | --- |
| PostgreSQL backup exists outside repository. | | |
| Storage backup exists outside repository. | | |
| Cleanup decision was approved. | | |
| No ad hoc business-table deletion was performed. | | |
| Docker services are healthy. | | |
| `scripts/healthcheck.sh` passes. | | |
| Default RBAC seed completed. | | |
| Real pilot accounts are created. | | |
| E2E/test accounts are not used for pilot operations. | | |
| Original uploaded files will be preserved during pilot. | | |
| Generated files will be retained during pilot. | | |

## Rollback

If cleanup was wrong or data is missing:

1. Stop user traffic.
2. Keep the current failed state for investigation.
3. Use [backup-restore.md](backup-restore.md) to dry-run restore first.
4. Restore PostgreSQL and storage only after supervisor and local IT approval.
5. Run `scripts/healthcheck.sh`.
6. Confirm a known uploaded file, generated file, account, and inventory query
   work after restore.
