# Upload Filename Metadata Repair

## Purpose

Use this procedure only for historical `ImportFile` and `AttendanceImport`
records whose UTF-8 filename bytes were reversibly decoded as Latin-1 at the
multipart boundary. It repairs canonical display metadata; it does not repair
an irreversible filename already damaged on the user's computer.

The command is dry-run by default. It never prints customer workbook content,
employee data, or storage paths. Findings contain only model, record id,
escaped old/new code points, round-trip verdict, eligibility, and a stable
reason code.

## Safety Contract

- Stop import writes or use an approved maintenance window.
- Take PostgreSQL and `storage/` backups from the same recovery point.
- Keep both artifacts outside the repository and active storage volume.
- Verify both SHA-256 values and create a
  `bestar-matched-backup-v1` manifest before apply.
- Do not replace this command with bulk SQL, file renames, or search/replace.
- Ambiguous, missing, outside-root, unreadable, or SHA-mismatched files are
  skipped. Escalate their stable reason code for manual review.

Apply changes only `original_filename`, raw `transport_filename` evidence,
`filename_codec_version`, and `filename_review_code`. It preserves import id,
file SHA, original bytes/path, actor, timestamps, generated-file history,
deletion events, attendance rows, and all immutable audit history.

## Dry Run

Run from the repository root against the healthy canonical stack:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  node /workspace/apps/api/dist/src/upload-filenames/repair-upload-filenames.js \
  > filename-repair-dry-run.json
```

Review only the summary counts and escaped findings. Expected contract fields
include `mode=dry-run`, `dryRunCandidateCount`, `eligibleCount`,
`skippedCount`, `afterCandidateCount`, and `findings`. Dry-run performs no
database writes.

## Matched Backup Manifest

Use the normal backup procedure in `docs/runbooks/backup-restore.md`. Put the
verified database dump, storage archive, and manifest in one approved backup
directory. The paths inside the manifest are paths visible to the one-off API
container, for example `/repair-backup/postgres.sql` and
`/repair-backup/storage.tar.gz`:

```json
{
  "contractVersion": "bestar-matched-backup-v1",
  "snapshotId": "approved-maintenance-snapshot-id",
  "postgres": {
    "path": "/repair-backup/postgres.sql",
    "sha256": "64-lowercase-or-uppercase-hex-digits"
  },
  "storage": {
    "path": "/repair-backup/storage.tar.gz",
    "sha256": "64-lowercase-or-uppercase-hex-digits"
  }
}
```

Do not put credentials, customer data, or personal information in the
manifest or maintenance notes.

## Apply

Mount the approved backup directory read-only into a one-off API container.
The command validates artifact existence, non-empty size, and SHA before taking
an advisory transaction lock:

```bash
BACKUP_DIR=/approved/outside-repository/backup
docker compose -f infra/docker/compose.local.yml run --rm --no-deps \
  -v "$BACKUP_DIR:/repair-backup:ro" \
  --entrypoint node api \
  /workspace/apps/api/dist/src/upload-filenames/repair-upload-filenames.js \
  --apply --backup-manifest /repair-backup/manifest.json \
  > filename-repair-apply.json
```

The result must report `mode=apply`, the approved `applyCount`, and
`afterCandidateCount=0` for repaired reversible candidates. A concurrent name
change aborts the transaction with `FILENAME_REPAIR_CONCURRENT_CHANGE`.

## Idempotence And Recovery

Run the same apply command a second time. It must report `applyCount=0` and
`afterCandidateCount=0`. Then run:

```bash
scripts/healthcheck.sh
```

If apply fails, retain both matched backup artifacts and the safe JSON result,
keep writes paused, and diagnose the stable code. Do not perform partial manual
updates. Restore both PostgreSQL and `storage/` to the same snapshot if rollback
is required.

The automated isolated proof for this contract is:

```bash
scripts/verify-file-upload-01-repair.sh
```

It creates a temporary database/storage root, verifies dry-run/no-write,
rejects apply without a manifest, applies one reversible record, confirms the
source SHA is unchanged, proves second-apply zero-change, and removes all
temporary database, backup, and storage artifacts.
