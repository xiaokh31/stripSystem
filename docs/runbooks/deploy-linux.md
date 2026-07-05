# Linux Deployment Runbook

## Scope

Deploy the Bestar unloading system on one Linux warehouse host using Docker
Compose. This document is written for operators and technicians. It does not
change business behavior.

The full local stack is:

- nginx
- web
- API
- worker-python runtime
- PostgreSQL
- Redis

Use `infra/docker/compose.local.yml` for this deployment.

## Safety Rules

- Preserve `storage/`; it contains original uploaded Excel files, parsed JSON,
  generated Excel reports, label PDFs, task reports, and corrections.
- Preserve the Docker PostgreSQL volume `bestar_postgres_data`.
- Back up PostgreSQL and `storage/` before restore, machine replacement, disk
  work, or destructive testing.
- Do not use `docker compose down -v` unless data loss is intentional and a
  verified backup exists.
- Change default passwords and `JWT_SECRET` before warehouse pilot use.
- Print 150mm x 100mm label PDFs with scaling disabled. QR target size is
  25mm x 25mm.

## Install Docker

For Ubuntu or Debian, install Docker Engine and the Compose plugin from the
official Docker repository. If your distribution is different, use the matching
Docker Engine instructions from Docker.

Typical Ubuntu setup:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
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
```

Optional: allow the deployment user to run Docker without `sudo`.

```bash
sudo usermod -aG docker "$USER"
```

Log out and log back in before testing Docker again.

## Prepare The Host Directory

Use a stable path owned by the deployment user:

```bash
sudo mkdir -p /opt/bestar-unloading
sudo chown "$USER":"$USER" /opt/bestar-unloading
cd /opt/bestar-unloading
```

Place the repository contents in `/opt/bestar-unloading`. The directory must
contain:

```text
infra/docker/compose.local.yml
infra/nginx/nginx.conf
scripts/healthcheck.sh
scripts/backup-postgres.sh
scripts/backup-storage.sh
scripts/restore-postgres.sh
scripts/restore-storage.sh
.env.example
storage/
```

Create required runtime directories:

```bash
mkdir -p storage backups
test -w storage
```

## Configure `.env`

Create the environment file:

```bash
cp .env.example .env
nano .env
```

Minimum values:

```dotenv
HTTP_PORT=80
POSTGRES_USER=bestar
POSTGRES_PASSWORD=replace-with-strong-password
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
JWT_SECRET=replace-with-long-random-secret
JWT_EXPIRES_IN_SECONDS=28800
WORKER_PYTHON_DIR=/workspace/apps/worker-python
REPORT_TEMPLATE_PATH=/workspace/samples/templates/卸柜报告-En.xlsx
```

Notes:

- `POSTGRES_PORT` and `REDIS_PORT` are host-side ports. The containers still
  talk to `postgres:5432` and `redis:6379`.
- Keep `NEXT_PUBLIC_API_BASE_URL=/api` for LAN phones and PDA devices.
- Keep `WEB_SERVER_API_BASE_URL=http://api:4000/api` and
  `WEB_API_PROXY_BASE_URL=http://api:4000/api` for Docker network routing.
- Keep timezone values as IANA names. `America/Edmonton` covers Calgary and
  automatically switches between MDT and MST.
- Do not commit `.env`.

## Start Services

First start:

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
```

Later restarts:

```bash
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
and roles:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma db seed
```

For an empty database, create the first administrator with one-time seed
variables. Replace the email and password before running the command:

```bash
docker compose -f infra/docker/compose.local.yml exec -T \
  -e SEED_ADMIN_EMAIL='<admin-email>' \
  -e SEED_ADMIN_PASSWORD='<unique-strong-admin-password>' \
  -e SEED_ADMIN_NAME='Initial Administrator' \
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

Check service state:

```bash
docker compose -f infra/docker/compose.local.yml ps
```

Run the scripted check:

```bash
scripts/healthcheck.sh
```

Manual checks:

```bash
curl http://localhost/api/health
curl -I http://localhost/
```

The API health response should include `"status":"ok"` and database status
`"up"`.

Verify administrator login and API access:

```bash
curl -sS -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin-email>","password":"<unique-strong-admin-password>"}'

TOKEN='<accessToken from login response>'
curl -sS http://localhost/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
curl -sS http://localhost/api/users \
  -H "Authorization: Bearer $TOKEN"
```

## LAN Access

Find the server LAN IP:

```bash
hostname -I
```

Office staff:

```text
http://<server-lan-ip>/
```

Mobile or PDA loading scan:

```text
http://<server-lan-ip>/mobile/load-jobs
```

Firewall example for port 80:

```bash
sudo ufw allow 80/tcp
sudo ufw status
```

Phones and PDA devices must be on the same LAN or Wi-Fi network as the server.

## View Logs

All services:

```bash
docker compose -f infra/docker/compose.local.yml logs --tail=200
```

Follow one service:

```bash
docker compose -f infra/docker/compose.local.yml logs -f nginx
docker compose -f infra/docker/compose.local.yml logs -f api
docker compose -f infra/docker/compose.local.yml logs -f web
docker compose -f infra/docker/compose.local.yml logs -f worker-python
docker compose -f infra/docker/compose.local.yml logs -f postgres
docker compose -f infra/docker/compose.local.yml logs -f redis
```

## Stop And Restart

Stop application containers while keeping database and files:

```bash
docker compose -f infra/docker/compose.local.yml down
```

Start again:

```bash
docker compose -f infra/docker/compose.local.yml up -d
scripts/healthcheck.sh
```

Restart one service:

```bash
docker compose -f infra/docker/compose.local.yml restart api
```

## Backup

Choose a backup directory outside the repository and preferably on another
disk:

```bash
export BACKUP_DIR=/var/backups/bestar-unloading
mkdir -p "$BACKUP_DIR"
```

Back up PostgreSQL:

```bash
BACKUP_DIR="$BACKUP_DIR" scripts/backup-postgres.sh
```

Back up storage:

```bash
BACKUP_DIR="$BACKUP_DIR" scripts/backup-storage.sh
```

Confirm files exist and are non-empty:

```bash
ls -lh "$BACKUP_DIR"
```

## Restore

Read [backup-restore.md](backup-restore.md) before restore. Restore can change
database and file state.

Dry-run:

```bash
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
| `docker` permission denied | Log out/in after `usermod -aG docker`, or run with `sudo`. |
| nginx returns 502 | `api` or `web` is unhealthy; inspect `docker compose ... ps` and logs. |
| `curl /api/health` fails | nginx, API health, PostgreSQL readiness, firewall, and port 80. |
| Phone/PDA cannot connect | Server LAN IP, same Wi-Fi/LAN, firewall port 80. |
| Upload succeeds but file missing | `storage/` exists, is writable, and is bind-mounted. |
| Reports or labels fail | API image must include Python/uv and template path must exist. |
| Label size wrong | Use 150mm x 100mm paper and disable print scaling. |
| Restore looks wrong | Stop, keep logs, do not run another restore, inspect pre-restore backups. |

## Daily Operator Checks

```bash
scripts/healthcheck.sh
df -h .
ls -lh /var/backups/bestar-unloading | tail
```

Confirm that office users can open `http://<server-lan-ip>/` and PDA users can
open `http://<server-lan-ip>/mobile/load-jobs`.
