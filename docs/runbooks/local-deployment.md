# Local Docker Runbook

## Scope

This is the single local runbook for development testing, production rehearsal,
and warehouse pilot use. It starts the same Docker full stack that Windows and
Linux deployment use:

- nginx
- web
- API
- worker-python runtime
- PostgreSQL
- Redis

Use this mode by default. Do not run host `pnpm --filter api dev` or
`pnpm --filter web dev` as the normal local workflow. Keeping local testing on
Docker prevents route drift between `127.0.0.1:3000`, `127.0.0.1:4000`, and the
production nginx `/api` route.

It does not add business behavior. It only describes local Docker startup,
persistence, health checks, and operator access.

## Files

- Compose file: `infra/docker/compose.local.yml`
- API local image base: `infra/docker/api.Dockerfile`
- nginx config: `infra/nginx/nginx.conf`
- Environment template: `.env.example`
- Healthcheck script: `scripts/healthcheck.sh`

## Prerequisites

- Docker and Docker Compose are installed.
- The repository is checked out on the warehouse host.
- `storage/` exists and is writable by the current user.
- The report template exists at `samples/templates/卸柜报告-En.xlsx`.
- Real secrets have been set before pilot use.
- PostgreSQL and storage backups exist before restore or destructive testing.

## Environment Setup

Create `.env` from the template:

```bash
cp .env.example .env
```

Minimum local values:

```bash
HTTP_PORT=80
POSTGRES_USER=bestar
POSTGRES_PASSWORD=bestar_dev_password
POSTGRES_DB=bestar_unloading
POSTGRES_PORT=15432
REDIS_PORT=16379
REDIS_URL=redis://redis:6379
TZ=America/Edmonton
OPERATIONAL_TIME_ZONE=America/Edmonton
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_OPERATIONAL_TIME_ZONE=America/Edmonton
WEB_SERVER_API_BASE_URL=http://api:4000/api
WEB_API_PROXY_BASE_URL=http://api:4000/api
JWT_SECRET=replace-with-long-random-secret
JWT_EXPIRES_IN_SECONDS=28800
REPORT_TEMPLATE_PATH=/workspace/samples/templates/卸柜报告-En.xlsx
```

For pilot or production, replace default passwords and `JWT_SECRET` with unique
strong values before starting services. The compose file builds the API
`DATABASE_URL` from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
Do not use the example values as production credentials.

`TZ`, `OPERATIONAL_TIME_ZONE`, and `NEXT_PUBLIC_OPERATIONAL_TIME_ZONE` must use
an IANA timezone name. `America/Edmonton` is the Calgary/Edmonton warehouse
timezone and automatically switches between MDT and MST.

## Persistent Storage

The compose file bind-mounts the host repository and `storage/` directory into
the API, web, and worker containers. Do not delete `storage/`; it contains:

- original uploaded Excel files
- parsed JSON
- generated Excel reports
- label PDFs
- task reports
- correction drafts

PostgreSQL data is stored in the Docker named volume
`bestar_postgres_data`.

Node dependency folders, pnpm store, and the worker Python `.venv` are also
stored in Docker named volumes. This keeps the local compose runtime from
deleting or rewriting host machine dependency directories.

The web service also stores its runtime `.next` build output in a Docker named
volume. This keeps a host-side `pnpm --filter web build` from overwriting the
static chunks used by the running Docker web process.

## Start Full Stack

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
```

Expected services:

- `bestar_postgres_local`
- `bestar_redis_local`
- `bestar_api_local`
- `bestar_web_local`
- `bestar_worker_python_local`
- `bestar_nginx_local`

The API service runs Prisma generate and migrations before starting. The web
service waits for API health before starting. nginx waits for web and API
health.

## Local URLs

Use nginx routes for local testing:

```text
Office UI: http://127.0.0.1/
API:       http://127.0.0.1/api
Mobile:    http://127.0.0.1/mobile/load-jobs
```

Use the LAN IP for phones and PDA devices:

```text
Office UI: http://<server-lan-ip>/
Mobile:    http://<server-lan-ip>/mobile/load-jobs
```

Do not use `http://127.0.0.1:3000` or `http://127.0.0.1:4000` for the standard
local workflow. Those are internal service ports in this project and can hide
nginx or browser routing problems.

## Initialize Accounts

After the first start, seed the default permissions and roles:

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

The seed rejects weak administrator passwords and requires
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` together. After the first
administrator logs in, create office, warehouse, HR manager, and warehouse
manager staff accounts through `POST /api/users`; for production pilot roster
and wage manager role assignment, follow
[pilot-account-assignment.md](pilot-account-assignment.md). Do not manually
insert users, roles, permissions, or password hashes in PostgreSQL.

## Verify

Container status:

```bash
docker compose -f infra/docker/compose.local.yml ps
```

API health through nginx:

```bash
curl http://localhost/api/health
```

Office UI:

```text
http://localhost/
```

Mobile/PDA UI from the warehouse LAN:

```text
http://<server-lan-ip>/mobile/load-jobs
```

Storage check:

```bash
test -d storage
test -w storage
```

Full scripted healthcheck:

```bash
scripts/healthcheck.sh
```

Then verify authentication through nginx:

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

## Logs

```bash
docker compose -f infra/docker/compose.local.yml logs -f nginx
docker compose -f infra/docker/compose.local.yml logs -f api
docker compose -f infra/docker/compose.local.yml logs -f web
docker compose -f infra/docker/compose.local.yml logs -f worker-python
docker compose -f infra/docker/compose.local.yml logs -f postgres
docker compose -f infra/docker/compose.local.yml logs -f redis
```

## Stop

Stop containers but keep PostgreSQL volume and host storage:

```bash
docker compose -f infra/docker/compose.local.yml down
```

Do not use `docker compose down -v` unless PostgreSQL data has been backed up
and data loss is intentional.

## Backup

Back up PostgreSQL:

```bash
scripts/backup-postgres.sh
```

Back up storage:

```bash
scripts/backup-storage.sh
```

Set `BACKUP_DIR` to write backups outside the repository:

```bash
BACKUP_DIR=/var/backups/bestar-unloading scripts/backup-postgres.sh
BACKUP_DIR=/var/backups/bestar-unloading scripts/backup-storage.sh
```

## Database Migrations

The API service runs committed Prisma migrations automatically during startup.
When `apps/api/prisma/schema.prisma` changes, create and commit a Prisma
migration before deployment.

See `docs/runbooks/database-migrations.md` for the full migration workflow,
drift checks, and recovery rules.

## Common Faults

| Symptom | Check |
| --- | --- |
| nginx returns 502 | `api` or `web` is not healthy; inspect service logs. |
| API health is degraded | PostgreSQL credentials, volume, or migration failed. |
| Web starts but API calls fail | `WEB_API_PROXY_BASE_URL` should be `http://api:4000/api`. |
| `http://127.0.0.1:3000` behaves differently from `http://127.0.0.1/` | Use `http://127.0.0.1/` for Docker/nginx testing; `3000` bypasses nginx. |
| Upload succeeds but file disappears | `storage/` bind mount and host permissions. |
| Worker parse/report/label fails | API image must include Python, uv, and worker dependencies; inspect `api` logs. |
| Report generation fails | Confirm `samples/templates/卸柜报告-En.xlsx` exists on the host. |
| Mobile cannot access app | Use the server LAN IP and allow HTTP port through firewall. |
| Labels print wrong size | Disable print scaling and verify 150mm x 100mm labels with the calibration PDF. |

## Pilot Safety Rules

- Change default secrets before warehouse pilot.
- Back up PostgreSQL and `storage/` before restore or destructive tests.
- Preserve original uploaded files.
- Keep generated reports and labels in `storage/`.
- Use the reprint audit workflow before reprinting labels.
