# Backup And Restore Runbook

## Scope

Back up and restore PostgreSQL data and `storage/` artifacts. Both are required
for a usable system.

## What To Back Up

- PostgreSQL database.
  - includes users, password hashes, roles, permissions, role assignments, and
    audit records that reference `userId`
  - includes Browser/Native session rows, hashed refresh tokens, revocation
    state and `auth_audit_events`; plaintext refresh/CSRF secrets are not stored
- `storage/` directory, including:
  - original uploaded Excel files
  - parsed JSON
  - generated Excel reports
  - label PDFs
  - task reports
  - corrections JSON
  - attendance original files
  - attendance parsed JSON and generated wage record workbooks
  - attendance task reports
  - unloading wage settlement JSON and task reports

The `.env` file is not part of the PostgreSQL dump. Preserve deployment
secrets such as `JWT_SECRET` and database passwords in the warehouse password
manager or another approved secure location.

Restoring the database also restores the session/revocation state at that
recovery point. After a restore, rotate JWT/database/Redis credentials that may
have been exposed and revoke affected users through the application endpoints.
Do not delete/truncate session or auth audit tables to “clean up” a restore;
that destroys incident and revocation evidence.

## Backup Location

Use a directory outside the repository and outside Docker volumes:

```bash
BACKUP_DIR=/var/backups/bestar-unloading
```

On Windows, use a separate drive or folder:

```text
D:\bestar-backups
```

Windows WSL example:

```bash
BACKUP_DIR=/mnt/d/bestar-backups
```

Windows Git Bash example:

```bash
BACKUP_DIR=/d/bestar-backups
```

The scripts default to `./backups` when `BACKUP_DIR` is not set. That default
is useful for local tests, but warehouse hosts should set `BACKUP_DIR` to a
separate disk or backup share.

Run these scripts from a shell that supports Bash:

- Linux: terminal on the deployment host.
- Windows: WSL 2 Ubuntu or Git Bash from the project directory.

All scripts default to the local full-stack compose file:

```bash
COMPOSE_FILE=infra/docker/compose.local.yml
```

Use `COMPOSE_FILE=infra/docker/compose.dev.yml` only when intentionally working
against the development database container.

## PostgreSQL Backup

Script:

```bash
scripts/backup-postgres.sh
```

Expected behavior:
- create a timestamped dump
- fail if the database container is unavailable
- write output under the configured backup directory
- leave no final backup file when `pg_dump` fails

Manual fallback:

```bash
mkdir -p "$BACKUP_DIR"
docker compose -f infra/docker/compose.local.yml exec -T postgres \
  pg_dump --no-owner --no-privileges -U bestar bestar_unloading \
  > "$BACKUP_DIR/postgres-$(date +%Y%m%d-%H%M%S).sql"
```

## Storage Backup

Script:

```bash
scripts/backup-storage.sh
```

Expected behavior:
- create a timestamped `storage-YYYYmmdd-HHMMSS.tar.gz`
- include original uploaded Excel files and generated artifacts
- leave no final archive when `tar` fails

Manual fallback:

```bash
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/storage-$(date +%Y%m%d-%H%M%S).tar.gz" storage
```

## Restore Rules

Restore is potentially destructive.

Before restore:
- stop app traffic
- confirm backup file path
- create a fresh backup of current state
- confirm the target database and storage path

Restore scripts must use dry-run or explicit confirmation.

Dry-run first:

```bash
DRY_RUN=1 scripts/restore-postgres.sh "$BACKUP_DIR/postgres-bestar_unloading-YYYYmmdd-HHMMSS.sql"
DRY_RUN=1 scripts/restore-storage.sh "$BACKUP_DIR/storage-YYYYmmdd-HHMMSS.tar.gz"
```

Actual restore requires:

```bash
CONFIRM_RESTORE=yes
```

## PostgreSQL Restore

Script:

```bash
scripts/restore-postgres.sh <backup.sql>
```

The script creates a pre-restore dump before applying the SQL file. It runs
`psql` with `ON_ERROR_STOP` and a single transaction so SQL errors do not get
silently ignored.

Example:

```bash
CONFIRM_RESTORE=yes scripts/restore-postgres.sh "$BACKUP_DIR/postgres-bestar_unloading-YYYYmmdd-HHMMSS.sql"
```

Manual fallback:

```bash
docker compose -f infra/docker/compose.local.yml exec -T postgres \
  psql --single-transaction -v ON_ERROR_STOP=1 -U bestar -d bestar_unloading \
  < backup.sql
```

This script does not drop the database automatically. For an exact point-in-time
rollback, stop app traffic and restore into a clean database or volume as a
separate approved operation.

## Storage Restore

Script:

```bash
scripts/restore-storage.sh <storage-backup.tar.gz>
```

The script validates archive paths before extraction. On confirmed restore, it
moves the current `storage/` to `storage.pre-restore-YYYYmmdd-HHMMSS` and then
extracts the archive. It does not delete the previous storage directory.

Example:

```bash
CONFIRM_RESTORE=yes scripts/restore-storage.sh "$BACKUP_DIR/storage-YYYYmmdd-HHMMSS.tar.gz"
```

Manual fallback:

```bash
tar -xzf storage-backup.tar.gz
```

Do not delete current `storage/` until the backup is confirmed.

## Verification After Restore

- `GET /api/health` reports API and database healthy.
- An administrator can log in and `GET /api/auth/me` returns the expected user.
- `GET /api/users` works for an administrator and role assignments are present.
- A known import file exists in storage.
- A known generated report or label PDF exists.
- A known attendance or unloading wage generated file exists when wage
  workflows are in pilot scope.
- Inventory reports can query pallets from the database.
- A sample label QR payload resolves to a pallet.

## Failure Handling

If restore fails:
- keep the failed output logs
- do not run another destructive command immediately
- verify current database/storage state
- restore from the pre-restore backup if needed

## Credential Rotation And Auth Incident Check

1. Restrict ingress and take a matched PostgreSQL plus `storage/` recovery
   point before planned rotation.
2. Replace the credential in the approved secret manager, then recreate only
   the affected containers. Never copy the new value into this runbook, Git,
   logs or `HANDOFF.md`.
3. A JWT signing-key rotation invalidates outstanding access JWTs immediately,
   but a still-active refresh family can later mint access under the new key.
   When compromise is suspected, also use both Browser and Native per-user
   revoke endpoints (or deactivate/reset the account) so forced re-login is
   complete and auditable.
4. Verify old credentials/tokens fail, new browser login/refresh/logout works,
   Native login/refresh still works, `/health` is redacted in public mode and
   auth audit history remains queryable.
5. Record who approved rotation, time, affected systems and verification
   result in the approved incident system without storing secret values.

## Cloudflare Route A Activation Recovery Point

Before the first named-tunnel activation, pause business mutations and create a
PostgreSQL dump plus `storage/` archive in the same maintenance window. Record
their filenames, timestamps, checksums and approved backup location outside the
repository. Run both restore scripts with `DRY_RUN=1`; perform the existing
non-production restore rehearsal and verify database counts plus representative
stored-file hashes before sharing the public hostname.

Adding, stopping, rotating or removing `cloudflared` must not run a restore,
migration, seed, database copy or storage copy. After the tunnel stop,
connector-network isolation and nginx/tunnel recreation drills, verify the same
PostgreSQL volume and storage mount remain canonical and that no import, scan,
correction or generated-file mutation was duplicated.
