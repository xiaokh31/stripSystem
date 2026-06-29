# Local Development Runbook

## Scope

Use this run mode while developing and testing at `http://127.0.0.1:3000`.
Keep it separate from the Docker/nginx full-stack deployment mode.

Local development uses one service path:

- Web: host process on `127.0.0.1:3000`
- API: host process on `127.0.0.1:4000`
- PostgreSQL: Docker container exposed on `127.0.0.1:15432`
- Redis: Docker container exposed on `127.0.0.1:16379`

Do not run Docker `api`, `web`, or `nginx` containers while testing the host
development UI. Mixing these modes can route `/api` to an old container image
and cause false 404s.

## Start Dependencies

```bash
docker compose -f infra/docker/compose.local.yml up -d postgres redis
```

If the full Docker stack was already started, stop only the app containers and
keep PostgreSQL/Redis running:

```bash
docker compose -f infra/docker/compose.local.yml stop api web nginx worker-python
```

## Apply Database Migrations

```bash
DATABASE_URL='postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public' \
  pnpm --filter api prisma migrate deploy
```

## Initialize Accounts

Seed the default permissions and the `ADMIN`, `OFFICE`, `WAREHOUSE`, and
`SYSTEM` roles after migrations:

```bash
DATABASE_URL='postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public' \
  pnpm --filter api prisma db seed
```

For an empty development database, create the first administrator with one-time
seed variables. Replace the email and password before running the command:

```bash
SEED_ADMIN_EMAIL='<admin-email>' \
SEED_ADMIN_PASSWORD='<unique-strong-admin-password>' \
SEED_ADMIN_NAME='Initial Administrator' \
DATABASE_URL='postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public' \
  pnpm --filter api prisma db seed
```

The seed is idempotent. It updates default roles and permissions, and creates
or updates the first administrator only when both `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` are provided. Do not store production administrator
passwords in `.env` or commit them.

## Start API

```bash
DATABASE_URL='postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public' \
STORAGE_ROOT="$PWD/storage" \
WORKER_PYTHON_DIR="$PWD/apps/worker-python" \
REPORT_TEMPLATE_PATH="$PWD/samples/templates/卸柜报告-En.xlsx" \
JWT_SECRET='<unique-local-jwt-secret>' \
JWT_EXPIRES_IN_SECONDS=28800 \
  pnpm --filter api dev
```

Verify:

```bash
curl http://127.0.0.1:4000/api/health
```

Expected database status is `up`.

Verify login and current-user access after the API is running:

```bash
curl -sS -X POST http://127.0.0.1:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin-email>","password":"<unique-strong-admin-password>"}'

TOKEN='<accessToken from login response>'
curl -sS http://127.0.0.1:4000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
curl -sS http://127.0.0.1:4000/api/users \
  -H "Authorization: Bearer $TOKEN"
```

## Start Web

The web app defaults server-side API calls and `/api` rewrites to
`http://127.0.0.1:4000/api`.

```bash
pnpm --filter web dev
```

Verify through the browser-facing route:

```bash
curl http://127.0.0.1:3000/api/health
```

Expected database status is `up`. A `PATCH /api/load-jobs/:id` route probe
should return a business error such as `LOAD_JOB_NOT_FOUND`, not `Cannot PATCH`.

## Use One Mode At A Time

For development:

```text
http://127.0.0.1:3000
```

For Docker/nginx full-stack deployment:

```text
http://127.0.0.1
```

Do not test `127.0.0.1:3000` while expecting Docker/nginx routes, and do not
test `127.0.0.1` while expecting host dev routes.

## Health Checks

Host development:

```bash
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1:3000/api/health
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:4000 -sTCP:LISTEN
docker ps --format '{{.Names}} {{.Ports}} {{.Status}}'
```

Only `bestar_postgres_local` and `bestar_redis_local` should be running from
Docker in host development mode.

## Common Faults

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot PATCH /api/load-jobs/:id` from `127.0.0.1:3000` | Web is proxying to old Docker/nginx API. | Stop Docker `api`, `web`, `nginx`, restart host Web. |
| API health database is down | Host API cannot reach Docker Postgres. | Use port `15432` in `DATABASE_URL`; verify `bestar_postgres_local` is healthy. |
| New Prisma field missing in runtime | Migration was created but not applied to local DB. | Run `pnpm --filter api prisma migrate deploy` with the `15432` `DATABASE_URL`. |
| Downloads point to `4000` instead of browser route | Public API base was overridden incorrectly. | Keep `NEXT_PUBLIC_API_BASE_URL=/api` or unset it in host development. |
