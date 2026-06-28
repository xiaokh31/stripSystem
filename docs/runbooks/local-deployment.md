# Local Deployment Runbook

## Scope

This runbook starts the local full stack for warehouse pilot use:

- nginx
- web
- API
- worker-python runtime
- PostgreSQL
- Redis

It does not add business behavior. It only describes deployment, persistence,
health checks, and operator access.

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
NEXT_PUBLIC_API_BASE_URL=/api
WEB_SERVER_API_BASE_URL=http://api:4000/api
WEB_API_PROXY_BASE_URL=http://api:4000/api
JWT_SECRET=change-this-in-local-env
```

For pilot or production, replace default passwords and `JWT_SECRET`. The
compose file builds the API `DATABASE_URL` from `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `POSTGRES_DB`.

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
deleting or rewriting host development dependencies.

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
| `http://127.0.0.1:3000` shows API degraded | Local Web dev defaults to nginx at `http://127.0.0.1/api`; if overridden, set `API_BASE_URL=http://127.0.0.1/api` and `API_PROXY_BASE_URL=http://127.0.0.1/api`. |
| Upload succeeds but file disappears | `storage/` bind mount and host permissions. |
| Worker parse/report/label fails | API image must include Python, uv, and worker dependencies; inspect `api` logs. |
| Mobile cannot access app | Use the server LAN IP and allow HTTP port through firewall. |
| Labels print wrong size | Disable print scaling and verify 150mm x 100mm labels with the calibration PDF. |

## Pilot Safety Rules

- Change default secrets before warehouse pilot.
- Back up PostgreSQL and `storage/` before restore or destructive tests.
- Preserve original uploaded files.
- Keep generated reports and labels in `storage/`.
- Use the reprint audit workflow before reprinting labels.
