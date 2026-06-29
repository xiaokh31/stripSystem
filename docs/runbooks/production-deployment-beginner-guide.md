# 生产环境小白部署指导手册 (Windows and Linux)

## Purpose

This is the beginner-friendly production deployment guide for the Bestar
Warehouse Unloading System. It is the Windows and Linux production deployment
manual for non-developer operators.

Use this guide when setting up a Windows 11 or Linux warehouse computer for
office users, warehouse mobile scanning, report generation, label generation,
and local data storage.

For platform-specific details, also keep these runbooks nearby:

- Windows: [deploy-windows.md](deploy-windows.md)
- Linux: [deploy-linux.md](deploy-linux.md)
- Backup and restore: [backup-restore.md](backup-restore.md)
- Database migrations: [database-migrations.md](database-migrations.md)
- Account and permission setup:
  [account-role-permission-management.md](account-role-permission-management.md)

## Recommended Deployment Method

Use Git to download and update the source code.

Do not copy the whole developer working directory as the normal deployment
method. A developer directory often contains machine-specific caches and build
outputs such as `node_modules/`, `.venv/`, `.next/`, `dist/`, logs, and local
test data.

Git deployment keeps the production host reproducible:

```bash
git clone <your-git-repository-url> bestar-unloading
cd bestar-unloading
```

For updates:

```bash
git pull
docker compose -f infra/docker/compose.local.yml up -d --build
```

## Important Git Ignore Notice

The current repository intentionally does not track all local runtime files.

Git pull includes:

- application source code
- Docker Compose and nginx configuration
- Prisma migrations
- backup, restore, and healthcheck scripts
- committed runbooks
- empty `storage/` directory placeholders
- `.env.example`

Git pull does not include:

- `.env`
- production secrets
- PostgreSQL Docker volume data
- runtime files under `storage/`
- backup archives under `backups/`
- dependency caches such as `node_modules/`, `.venv/`, `.next/`, and `dist/`
- local Excel samples under `samples/`

This matters because the Docker API service expects the report template at:

```text
samples/templates/卸柜报告-En.xlsx
```

Before production testing, copy the required template files from the approved
release bundle or the current pilot machine:

```text
samples/templates/卸柜报告-En.xlsx
samples/templates/卸柜报告-Zh.xlsx
```

For pilot import testing, also copy real test unloading files if needed:

```text
samples/unloading-plans/
```

If the team wants a pure Git-only deployment later, the non-sensitive template
files should be explicitly unignored and committed after approval.

## Production Data Rule

Production data is not source code.

Always protect these items:

- PostgreSQL data volume `bestar_postgres_data`
- `storage/`, including original uploads, parsed JSON, reports, labels,
  corrections, and task reports
- `.env`, especially `POSTGRES_PASSWORD` and `JWT_SECRET`
- backup files

Do not run this command on a production or pilot host unless data loss is
intentional and a verified backup exists:

```bash
docker compose -f infra/docker/compose.local.yml down -v
```

## Windows 11 Deployment

### 1. Install Required Software

Install:

- Docker Desktop for Windows
- Git for Windows
- WSL 2 Ubuntu, recommended for running `.sh` scripts

In Docker Desktop:

- enable WSL 2 backend
- use Linux containers
- start Docker Desktop before running commands

Verify in PowerShell:

```powershell
docker --version
docker compose version
docker run --rm hello-world
git --version
```

### 2. Download The Project

Use a short local path. Avoid OneDrive, Desktop sync folders, or network drives.

PowerShell:

```powershell
cd C:\
git clone <your-git-repository-url> bestar-unloading
cd C:\bestar-unloading
```

If the project already exists:

```powershell
cd C:\bestar-unloading
git pull
```

### 3. Copy Required Template Files

Create the template directory if it does not exist:

```powershell
mkdir samples
mkdir samples\templates
```

Copy these files from the approved release bundle or existing pilot machine:

```text
samples\templates\卸柜报告-En.xlsx
samples\templates\卸柜报告-Zh.xlsx
```

Do not skip this step. Report generation can fail if
`samples\templates\卸柜报告-En.xlsx` is missing.

### 4. Configure Environment

PowerShell:

```powershell
copy .env.example .env
notepad .env
```

Minimum production values:

```dotenv
HTTP_PORT=80
POSTGRES_USER=bestar
POSTGRES_PASSWORD=<strong-production-password>
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
JWT_SECRET=<long-random-production-secret>
JWT_EXPIRES_IN_SECONDS=28800
WORKER_PYTHON_DIR=/workspace/apps/worker-python
REPORT_TEMPLATE_PATH=/workspace/samples/templates/卸柜报告-En.xlsx
```

Rules:

- Do not commit `.env`.
- Do not use default passwords in production.
- Keep `NEXT_PUBLIC_API_BASE_URL=/api` for LAN phones and PDA devices.
- Keep Docker internal API URLs as `http://api:4000/api`.
- Keep timezone values as IANA names. `America/Edmonton` covers Calgary and
  automatically switches between MDT and MST.

### 5. Create Runtime Folders

PowerShell:

```powershell
mkdir storage
mkdir backups
```

### 6. Start The Full Stack

PowerShell:

```powershell
docker compose -f infra/docker/compose.local.yml up -d --build
```

First startup can take several minutes.

Expected containers:

```text
bestar_postgres_local
bestar_redis_local
bestar_api_local
bestar_web_local
bestar_worker_python_local
bestar_nginx_local
```

### 7. Initialize Accounts

Seed roles and permissions:

```powershell
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma db seed
```

Create the first administrator. Replace the email and password:

```powershell
docker compose -f infra/docker/compose.local.yml exec -T `
  -e SEED_ADMIN_EMAIL="<admin-email>" `
  -e SEED_ADMIN_PASSWORD="<unique-strong-admin-password>" `
  -e SEED_ADMIN_NAME="Initial Administrator" `
  api pnpm --filter api prisma db seed
```

After the administrator logs in, create office and warehouse accounts through
the system user management screen or API. Do not manually edit password hashes
in PostgreSQL.

### 8. Verify Windows Deployment

PowerShell:

```powershell
docker compose -f infra/docker/compose.local.yml ps
curl.exe http://localhost/api/health
curl.exe -I http://localhost/
```

WSL Ubuntu or Git Bash:

```bash
scripts/healthcheck.sh
```

Expected API health:

```json
{"status":"ok","database":{"status":"up"}}
```

Office URL:

```text
http://<windows-lan-ip>/
```

Mobile scan URL:

```text
http://<windows-lan-ip>/mobile/load-jobs
```

Allow inbound TCP port 80 in Windows Firewall.

### 9. Windows Backup

Use WSL or Git Bash for backup scripts.

WSL example:

```bash
export BACKUP_DIR=/mnt/d/bestar-backups
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$BACKUP_DIR" scripts/backup-postgres.sh
BACKUP_DIR="$BACKUP_DIR" scripts/backup-storage.sh
ls -lh "$BACKUP_DIR"
```

Back up both PostgreSQL and `storage/`. A database dump alone is not enough.

## Linux Deployment

### 1. Install Required Software

Install Docker Engine, Docker Compose plugin, and Git.

Ubuntu or Debian example:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Verify:

```bash
docker --version
docker compose version
sudo docker run --rm hello-world
git --version
```

Optional: allow the deployment user to run Docker without `sudo`.

```bash
sudo usermod -aG docker "$USER"
```

Log out and log back in after changing Docker group membership.

### 2. Download The Project

Use a stable host directory:

```bash
sudo mkdir -p /opt/bestar-unloading
sudo chown "$USER":"$USER" /opt/bestar-unloading
cd /opt
git clone <your-git-repository-url> bestar-unloading
cd /opt/bestar-unloading
```

If the project already exists:

```bash
cd /opt/bestar-unloading
git pull
```

### 3. Copy Required Template Files

Create the template directory:

```bash
mkdir -p samples/templates
```

Copy these files from the approved release bundle or existing pilot machine:

```text
samples/templates/卸柜报告-En.xlsx
samples/templates/卸柜报告-Zh.xlsx
```

Do not skip this step. Report generation can fail if
`samples/templates/卸柜报告-En.xlsx` is missing.

### 4. Configure Environment

```bash
cp .env.example .env
nano .env
```

Minimum production values:

```dotenv
HTTP_PORT=80
POSTGRES_USER=bestar
POSTGRES_PASSWORD=<strong-production-password>
POSTGRES_DB=bestar_unloading
POSTGRES_PORT=15432
REDIS_PORT=16379
CORS_ORIGINS=http://localhost,http://127.0.0.1,http://<server-lan-ip>
TZ=America/Edmonton
OPERATIONAL_TIME_ZONE=America/Edmonton
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_OPERATIONAL_TIME_ZONE=America/Edmonton
WEB_SERVER_API_BASE_URL=http://api:4000/api
WEB_API_PROXY_BASE_URL=http://api:4000/api
REDIS_URL=redis://redis:6379
STORAGE_ROOT=/workspace/storage
HOST_STORAGE_ROOT=./storage
JWT_SECRET=<long-random-production-secret>
JWT_EXPIRES_IN_SECONDS=28800
WORKER_PYTHON_DIR=/workspace/apps/worker-python
REPORT_TEMPLATE_PATH=/workspace/samples/templates/卸柜报告-En.xlsx
```

### 5. Create Runtime Folders

```bash
mkdir -p storage backups
test -w storage
```

### 6. Start The Full Stack

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
```

First startup can take several minutes.

### 7. Initialize Accounts

Seed roles and permissions:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma db seed
```

Create the first administrator:

```bash
docker compose -f infra/docker/compose.local.yml exec -T \
  -e SEED_ADMIN_EMAIL='<admin-email>' \
  -e SEED_ADMIN_PASSWORD='<unique-strong-admin-password>' \
  -e SEED_ADMIN_NAME='Initial Administrator' \
  api pnpm --filter api prisma db seed
```

### 8. Verify Linux Deployment

```bash
docker compose -f infra/docker/compose.local.yml ps
scripts/healthcheck.sh
curl http://localhost/api/health
curl -I http://localhost/
```

Expected API health:

```json
{"status":"ok","database":{"status":"up"}}
```

Find the LAN IP:

```bash
hostname -I
```

Office URL:

```text
http://<server-lan-ip>/
```

Mobile scan URL:

```text
http://<server-lan-ip>/mobile/load-jobs
```

Open firewall port 80 if needed:

```bash
sudo ufw allow 80/tcp
sudo ufw status
```

### 9. Linux Backup

```bash
export BACKUP_DIR=/var/backups/bestar-unloading
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$BACKUP_DIR" scripts/backup-postgres.sh
BACKUP_DIR="$BACKUP_DIR" scripts/backup-storage.sh
ls -lh "$BACKUP_DIR"
```

## Updating An Existing Production Host

Before updating:

```bash
BACKUP_DIR=<backup-directory> scripts/backup-postgres.sh
BACKUP_DIR=<backup-directory> scripts/backup-storage.sh
```

Then update code and containers:

```bash
git pull
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma db seed
scripts/healthcheck.sh
```

The API container runs committed Prisma migrations during startup. If a schema
change exists, verify migration status before business testing.

## Fresh Install Or Migration

Fresh install:

- clone the repository
- copy required template files
- create `.env`
- start Docker Compose
- seed roles and the first administrator

Migration from another host:

- back up PostgreSQL on the old host
- back up `storage/` on the old host
- copy required template files
- recreate `.env` with approved production secrets
- restore PostgreSQL and `storage/`
- run healthcheck

Do not rely on Git to move production data.

## Production Acceptance Checklist

Before warehouse users start real work, verify:

- `docker compose -f infra/docker/compose.local.yml ps` shows services healthy
- `GET /api/health` returns API status `ok` and database status `up`
- administrator login works
- office user login works
- warehouse user login works
- unauthorized user cannot access admin-only pages or APIs
- a real Excel unloading file can be imported
- duplicate import detection works for the same file
- an unloading report can be generated and downloaded
- a label PDF can be generated and downloaded
- a 150mm x 100mm label prints with scaling disabled
- mobile scan page opens from a phone or PDA on the warehouse LAN
- a scan transaction changes pallet state once
- backup scripts create PostgreSQL and storage backups
- restore procedure has been reviewed by the local owner

## Common Problems

| Symptom | Most likely check |
| --- | --- |
| API health is degraded | PostgreSQL is unhealthy, migrations failed, or `.env` database values are wrong. |
| Database status is down | Check `bestar_postgres_local` logs and `POSTGRES_PASSWORD` consistency. |
| Report generation fails | Confirm `samples/templates/卸柜报告-En.xlsx` exists on the host. |
| Web opens but API calls fail | Use Docker/nginx routing consistently. Browser API calls should go through `/api`. |
| Phone cannot open the site | Check LAN IP, same Wi-Fi/LAN, firewall port 80, and `HTTP_PORT`. |
| Backup scripts fail on Windows | Run scripts from WSL Ubuntu or Git Bash, not plain PowerShell. |
| Printed labels are wrong size | Use 150mm x 100mm paper and disable automatic print scaling. |
| Permission errors after login | Seed roles and permissions, then assign the correct role to the user. |

## What To Keep Written Down Offline

Keep these outside Git in an approved password manager or locked operations
document:

- production host name and LAN IP
- administrator account owner
- `.env` secret owner
- PostgreSQL password
- `JWT_SECRET`
- backup location
- restore approval owner
- printer model and label stock settings
