# Warehouse Operator Manual

## Scope

This manual is for office staff, loading staff, supervisors, and local IT. It
assumes the system is already deployed with Docker Compose. It does not replace
the Linux or Windows deployment runbooks.

Deployment references:

- Linux: [deploy-linux.md](deploy-linux.md)
- Windows: [deploy-windows.md](deploy-windows.md)
- Backup and restore: [backup-restore.md](backup-restore.md)

## Access URLs

Office web app:

```text
http://<server-lan-ip>/
```

Mobile or PDA loading scan:

```text
http://<server-lan-ip>/mobile/load-jobs
```

API health check for local IT:

```text
http://<server-lan-ip>/api/health
```

Phones and PDA devices must be on the same LAN or Wi-Fi network as the server.

## Start Of Day Checks

Local IT or the shift supervisor should confirm:

- Office app opens on at least one office computer.
- Mobile/PDA page opens on at least one scanner device.
- API health reports OK.
- `storage/` has free disk space.
- Latest PostgreSQL and storage backups exist.
- Printer is set to 150mm x 100mm label paper.
- Print scaling is disabled.
- Scanner sends Enter after each scan.

Linux or WSL/Git Bash:

```bash
scripts/healthcheck.sh
```

PowerShell quick check:

```powershell
docker compose -f infra/docker/compose.local.yml ps
curl.exe http://localhost/api/health
```

## Office Workflow

1. Open the office web app.
2. Upload real `.xlsx` unloading files.
3. If the same file was already imported, confirm the duplicate upload error.
4. Open import detail.
5. Trigger parse.
6. Review parser warnings and errors.
7. If parsing fails or the source file is incomplete, use manual container
   creation instead of waiting on the page.
8. Open container detail.
9. Review destination totals, cartons, volume, and calculated pallets.
10. Correct destination or pallet counts when required.
11. Generate the Excel unloading report.
12. Generate pallet label PDFs.
13. Download and print labels.

Do not use mock or temporary spreadsheets as if they are real business files.
Original uploaded Excel files must be preserved.

## Manual Corrections

Corrections must be entered through the system.

Do not rely on handwritten-only changes because:

- generated reports will not match system state
- labels may contain old destination or pallet information
- inventory reports will be wrong
- audit trail will be incomplete

If a container or destination is manually created, confirm the final container
number, destination code, cartons, pallets, and notes before printing labels.

## Label Printing Rules

- Label paper size must be 150mm x 100mm.
- QR target size is 25mm x 25mm.
- Disable automatic print scaling.
- Do not print labels from screenshots.
- Do not edit generated label PDFs outside the system.
- Reprints must use the system reprint flow so the event is audited.
- The pilot path is PDF/manual printing. No local print agent or Tauri desktop
  app is installed unless a later ADR/runbook explicitly says so.

If QR scans are unreliable, stop printing and check:

- printer paper size
- print scaling
- QR physical size
- label damage
- scanner focus and Enter suffix

Record the following before asking for a local print agent:

- printer model
- label stock and supplier
- driver version and default paper/scaling settings
- PDF viewer or browser used for printing
- measured outer label size
- measured QR size
- number of failed labels and total labels printed
- whether failures were caused by scaling, damaged stock, scanner focus, or
  operator workflow

Continue using the generated PDF download/manual print fallback until the
supervisor and local IT confirm that repeated print failures justify direct
printer control.

## Warehouse Loading Workflow

1. Open the mobile/PDA page.
2. Select an open load job.
3. Scan each pallet QR label.
4. Read the scan result before moving to the next pallet.
5. Continue only after the scan is accepted or supervisor instructions are
   clear.
6. Close the load job when loading is complete.

Expected scan outcomes:

- success
- duplicate
- invalid
- already loaded
- load job closed

## Duplicate Scan Handling

If a pallet is scanned twice for the same load job:

- the system should return duplicate
- inventory must not decrement twice
- staff should continue with the next pallet

If a pallet is already loaded to another job:

- stop and notify supervisor or office staff
- do not manually mark inventory loaded
- keep the pallet aside until the issue is resolved

## Offline Or Network Issues

If offline queue is enabled:

- scans during network failure enter pending state
- pending scans are not confirmed inventory changes
- sync when network returns
- resolve failed sync items before closing the load job

If the phone or PDA cannot open the app:

1. Confirm Wi-Fi is connected to the warehouse LAN.
2. Confirm the server LAN IP did not change.
3. Ask local IT to check firewall port 80.
4. Do not continue scanning on paper unless the supervisor approves an
   exception process.

## Backup Responsibility

Backups must include both:

- PostgreSQL database
- `storage/` directory

`storage/` contains original uploaded files and generated reports/labels. A
database-only backup is not enough.

Linux or WSL/Git Bash example:

```bash
BACKUP_DIR=/var/backups/bestar-unloading scripts/backup-postgres.sh
BACKUP_DIR=/var/backups/bestar-unloading scripts/backup-storage.sh
```

Windows with WSL example:

```bash
BACKUP_DIR=/mnt/d/bestar-backups scripts/backup-postgres.sh
BACKUP_DIR=/mnt/d/bestar-backups scripts/backup-storage.sh
```

Store backups outside the project folder and, when possible, on a separate
disk or backup share.

## Restore Escalation

Restore can overwrite current database or file state. Operators should not run
restore during active unloading or loading unless a supervisor and local IT
approve it.

Before restore:

- stop app traffic
- confirm the backup file path
- run dry-run restore commands
- create a fresh backup of the current state
- keep staff informed that the system is unavailable

Dry-run commands:

```bash
DRY_RUN=1 scripts/restore-postgres.sh <postgres-backup.sql>
DRY_RUN=1 scripts/restore-storage.sh <storage-backup.tar.gz>
```

Confirmed restore requires:

```bash
CONFIRM_RESTORE=yes
```

Run `scripts/healthcheck.sh` after restore and verify a known import, report,
label, and inventory page.

## Logs For Support

If local IT asks for logs:

```bash
docker compose -f infra/docker/compose.local.yml logs --tail=200
docker compose -f infra/docker/compose.local.yml logs --tail=200 api
docker compose -f infra/docker/compose.local.yml logs --tail=200 web
docker compose -f infra/docker/compose.local.yml logs --tail=200 nginx
```

Do not delete logs, backups, `storage/`, or Docker volumes while an incident is
being investigated.

## Common Faults

| Symptom | Action |
| --- | --- |
| Office app does not open | Ask local IT to run `scripts/healthcheck.sh` and check nginx/web logs. |
| API health fails | Check PostgreSQL container, API logs, and `.env` database settings. |
| Phone/PDA cannot connect | Check LAN IP, Wi-Fi, firewall port 80, and URL spelling. |
| Upload is missing after success | Stop and check `storage/` mount and disk space. |
| Duplicate file is accepted | Escalate; duplicate import by SHA-256 should be enforced. |
| Report or label generation fails | Check API logs and worker Python/template paths. |
| QR label scans invalid | Confirm the label came from the current system and was not printed from a screenshot. |
| Inventory count looks wrong | Do not edit database manually; check scan history and duplicate scan results. |
| Backup fails | Stop restore attempts and escalate with script output. |

## End Of Day Checks

- All required unloading reports were generated.
- All required labels were printed from generated PDFs.
- Load jobs are closed or intentionally left open.
- Exceptions and correction notes are entered in the system.
- Backup scripts completed successfully.
- The latest backup files are present in the configured backup directory.

Escalate to technical support when:

- original upload is missing
- duplicate file is accepted incorrectly
- report or label generation fails
- QR labels scan as invalid
- inventory count does not match loaded pallets
- backup or restore fails
