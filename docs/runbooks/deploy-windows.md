# Windows Deployment Runbook

## Scope

Deploy the Bestar unloading system on a Windows workstation or mini PC using
Docker Desktop. This document is written for warehouse operators and local IT.
It does not change business behavior.

Use `infra/docker/compose.local.yml` for the full local stack:

- nginx
- web
- API
- worker-python runtime
- PostgreSQL
- Redis

## Safety Rules

- Preserve `storage/`; it contains original uploaded Excel files, parsed JSON,
  generated Excel reports, label PDFs, task reports, and corrections.
- Preserve Docker Desktop volumes, especially `bestar_postgres_data`.
- Back up PostgreSQL and `storage/` before restore, Windows reinstall, disk
  replacement, or destructive testing.
- Do not run `docker compose down -v` unless data loss is intentional and a
  verified backup exists.
- Change default passwords and `JWT_SECRET` before warehouse pilot use.
- Print 150mm x 100mm label PDFs with scaling disabled. QR target size is
  25mm x 25mm.

## Install Docker Desktop

1. Install Docker Desktop for Windows.
2. Enable the WSL 2 backend when prompted.
3. Keep Docker Desktop set to Linux containers.
4. Start Docker Desktop and wait until it says Docker is running.
5. Open PowerShell and verify:

```powershell
docker --version
docker compose version
docker run --rm hello-world
```

Install one shell that can run `.sh` scripts:

- Recommended: WSL 2 Ubuntu.
- Acceptable for local pilot: Git Bash from Git for Windows.

Use PowerShell for Docker status commands if preferred. Use WSL or Git Bash for
`scripts/*.sh` backup, restore, and healthcheck commands.

## Prepare The Project Directory

Use a short local path. Avoid OneDrive or synced folders.

PowerShell:

```powershell
mkdir C:\bestar-unloading
cd C:\bestar-unloading
```

Place the repository contents in `C:\bestar-unloading`. The directory must
contain:

```text
infra\docker\compose.local.yml
infra\nginx\nginx.conf
scripts\healthcheck.sh
scripts\backup-postgres.sh
scripts\backup-storage.sh
scripts\restore-postgres.sh
scripts\restore-storage.sh
.env.example
storage\
```

Create runtime directories:

```powershell
mkdir storage
mkdir backups
```

If using WSL, open Ubuntu and move to the Windows directory:

```bash
cd /mnt/c/bestar-unloading
```

If using Git Bash:

```bash
cd /c/bestar-unloading
```

## Configure `.env`

PowerShell:

```powershell
copy .env.example .env
notepad .env
```

Minimum values:

```dotenv
HTTP_PORT=80
POSTGRES_USER=bestar
POSTGRES_PASSWORD=replace-with-strong-password
POSTGRES_DB=bestar_unloading
POSTGRES_PORT=15432
REDIS_PORT=16379
CORS_ORIGINS=http://localhost,http://127.0.0.1,http://<windows-lan-ip>
TZ=America/Edmonton
OPERATIONAL_TIME_ZONE=America/Edmonton
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_OPERATIONAL_TIME_ZONE=America/Edmonton
WEB_SERVER_API_BASE_URL=http://api:4000/api
WEB_API_PROXY_BASE_URL=http://api:4000/api
REDIS_URL=redis://redis:6379
STORAGE_ROOT=/workspace/storage
HOST_STORAGE_ROOT=./storage
JWT_SECRET=replace-with-long-random-secret
JWT_EXPIRES_IN_SECONDS=28800
WORKER_PYTHON_DIR=/workspace/apps/worker-python
REPORT_TEMPLATE_PATH=/workspace/samples/templates/卸柜报告-En.xlsx
```

Notes:

- Keep `NEXT_PUBLIC_API_BASE_URL=/api` for LAN phones and PDA devices.
- Do not set container URLs to `localhost`; containers use service names such
  as `api`, `postgres`, and `redis`.
- Keep timezone values as IANA names. `America/Edmonton` covers Calgary and
  automatically switches between MDT and MST.
- Do not commit `.env`.

## Start Services

PowerShell:

```powershell
docker compose -f infra/docker/compose.local.yml up -d --build
```

Later restarts:

```powershell
docker compose -f infra/docker/compose.local.yml up -d
```

Expected containers:

```text
bestar_postgres_local
bestar_redis_local
bestar_api_local
bestar_web_local
bestar_worker_python_local
bestar_nginx_local
```

The first start can take several minutes because Docker downloads images and
Node/Python dependencies.

## Initialize Accounts

The API startup applies committed Prisma migrations. It does not create
warehouse users automatically. After the first start, seed default permissions
and roles.

PowerShell:

```powershell
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma db seed
```

For an empty database, create the first administrator with one-time seed
variables. Replace the email and password before running the command:

```powershell
docker compose -f infra/docker/compose.local.yml exec -T `
  -e SEED_ADMIN_EMAIL="<admin-email>" `
  -e SEED_ADMIN_PASSWORD="<unique-strong-admin-password>" `
  -e SEED_ADMIN_NAME="Initial Administrator" `
  api pnpm --filter api prisma db seed
```

The seed is idempotent, rejects weak administrator passwords, and only creates
or updates the administrator when both `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` are provided. Do not write production passwords into the
repository or manually edit account tables. After the administrator logs in,
create office, warehouse, HR manager, and warehouse manager staff through the
user management API. For production pilot roster and password handoff, follow
[pilot-account-assignment.md](pilot-account-assignment.md).

## Verify Deployment

PowerShell:

```powershell
docker compose -f infra/docker/compose.local.yml ps
curl.exe http://localhost/api/health
curl.exe -I http://localhost/
```

WSL or Git Bash:

```bash
scripts/healthcheck.sh
```

The API health response should include `"status":"ok"` and database status
`"up"`.

Verify administrator login and API access.

PowerShell:

```powershell
curl.exe -sS -X POST http://localhost/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"<admin-email>","password":"<unique-strong-admin-password>"}'

$env:TOKEN = "<accessToken from login response>"
curl.exe -sS http://localhost/api/auth/me -H "Authorization: Bearer $env:TOKEN"
curl.exe -sS http://localhost/api/users -H "Authorization: Bearer $env:TOKEN"
```

## LAN Access

Find the Windows LAN IP:

```powershell
ipconfig
```

Use the IPv4 address for the active Ethernet or Wi-Fi adapter.

Office staff:

```text
http://<windows-lan-ip>/
```

Mobile or PDA loading scan:

```text
http://<windows-lan-ip>/mobile/load-jobs
```

Allow inbound HTTP through Windows Firewall:

1. Open Windows Security.
2. Go to Firewall & network protection.
3. Allow an app through firewall or create an inbound rule for TCP port 80.
4. Confirm the network profile is Private for the warehouse LAN.

Phones and PDA devices must be on the same LAN or Wi-Fi network as the Windows
host.

## View Logs

PowerShell:

```powershell
docker compose -f infra/docker/compose.local.yml logs --tail=200
docker compose -f infra/docker/compose.local.yml logs -f nginx
docker compose -f infra/docker/compose.local.yml logs -f api
docker compose -f infra/docker/compose.local.yml logs -f web
docker compose -f infra/docker/compose.local.yml logs -f worker-python
docker compose -f infra/docker/compose.local.yml logs -f postgres
docker compose -f infra/docker/compose.local.yml logs -f redis
```

## Stop And Restart

Stop application containers while keeping database and files:

```powershell
docker compose -f infra/docker/compose.local.yml down
```

Start again:

```powershell
docker compose -f infra/docker/compose.local.yml up -d
```

Then verify from WSL or Git Bash:

```bash
scripts/healthcheck.sh
```

Restart one service:

```powershell
docker compose -f infra/docker/compose.local.yml restart api
```

## Backup

Use a backup folder outside the project directory, preferably on another drive:

```text
D:\bestar-backups
```

From WSL:

```bash
export BACKUP_DIR=/mnt/d/bestar-backups
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$BACKUP_DIR" scripts/backup-postgres.sh
BACKUP_DIR="$BACKUP_DIR" scripts/backup-storage.sh
ls -lh "$BACKUP_DIR"
```

From Git Bash:

```bash
export BACKUP_DIR=/d/bestar-backups
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$BACKUP_DIR" scripts/backup-postgres.sh
BACKUP_DIR="$BACKUP_DIR" scripts/backup-storage.sh
ls -lh "$BACKUP_DIR"
```

Back up both PostgreSQL and `storage/`. A database dump alone is not enough
because uploaded Excel files and generated PDFs live in `storage/`.

## Restore

Read [backup-restore.md](backup-restore.md) before restore. Restore can change
database and file state.

From WSL:

```bash
export BACKUP_DIR=/mnt/d/bestar-backups
DRY_RUN=1 scripts/restore-postgres.sh "$BACKUP_DIR/postgres-bestar_unloading-YYYYmmdd-HHMMSS.sql"
DRY_RUN=1 scripts/restore-storage.sh "$BACKUP_DIR/storage-YYYYmmdd-HHMMSS.tar.gz"
```

Confirmed restore:

```bash
CONFIRM_RESTORE=yes scripts/restore-postgres.sh "$BACKUP_DIR/postgres-bestar_unloading-YYYYmmdd-HHMMSS.sql"
CONFIRM_RESTORE=yes scripts/restore-storage.sh "$BACKUP_DIR/storage-YYYYmmdd-HHMMSS.tar.gz"
scripts/healthcheck.sh
```

PostgreSQL restore creates a pre-restore dump first. Storage restore moves the
current `storage/` directory aside before extracting the archive.

## Common Faults

| Symptom | Check |
| --- | --- |
| Docker command fails | Docker Desktop is running, WSL 2 backend is enabled, and Linux containers are selected. |
| Port 80 already in use | Change `HTTP_PORT` in `.env`, restart compose, and use the new URL port. |
| Phone/PDA cannot connect | Windows Firewall, Private network profile, same LAN/Wi-Fi, correct IPv4 address. |
| nginx returns 502 | `api` or `web` is unhealthy; inspect `docker compose ... ps` and logs. |
| Upload succeeds but file missing | `storage\` exists, is shared with Docker Desktop, and is writable. |
| Backup script cannot run | Use WSL or Git Bash, not plain PowerShell, for `scripts/*.sh`. |
| QR scans but API rejects | Confirm labels came from this environment and the pallet exists in the database. |
| Printed label is scaled | Disable "Fit to page" or automatic scaling in print dialog. |

## Daily Operator Checks

PowerShell:

```powershell
docker compose -f infra/docker/compose.local.yml ps
curl.exe http://localhost/api/health
```

WSL or Git Bash:

```bash
scripts/healthcheck.sh
ls -lh "$BACKUP_DIR" | tail
```

Confirm that office users can open `http://<windows-lan-ip>/` and PDA users can
open `http://<windows-lan-ip>/mobile/load-jobs`.
