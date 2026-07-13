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

## Docker-Only Development

Docker Compose is the only local development runtime for the API, web, worker,
dependency installation, Prisma, lint, typecheck, tests, and builds. The
Compose images copy the current source tree at build time and install
dependencies plus production build outputs into immutable image layers from
the committed frozen lockfiles; do not run host
`pnpm install`, `npm install`, `npx`, `jest`, `next`, `prisma`, `uv sync`, or
`uv run pytest`, and do not create host `node_modules` to repair a check.

After a source change, rebuild the affected service with Docker Compose. This
is intentional: it keeps host dependency folders out of the execution path and
makes the local runtime match the Docker deployment image.

```bash
docker compose -f infra/docker/compose.local.yml up -d --build api web worker-python
```

BuildKit caches the dependency layers independently from application source:

- source-only changes reuse the pnpm/uv dependency layers;
- `package.json`, `pnpm-lock.yaml`, `pyproject.toml`, or `uv.lock` changes
  invalidate the matching dependency layer;
- container restart and recreation run baked artifacts directly and do not run
  `pnpm install`, `uv sync`, Prisma generate, or application builds;
- API startup runs committed migrations before starting the compiled server.

Use the operation that matches the change:

```bash
# Source changed: rebuild only the affected image and recreate that service.
docker compose -f infra/docker/compose.local.yml up -d --build api

# No source, manifest, lockfile, image, or Compose config changed: restart only.
docker compose -f infra/docker/compose.local.yml restart api

# A manifest or lockfile changed: rebuild the affected dependency layer.
docker compose -f infra/docker/compose.local.yml build --progress=plain api
docker compose -f infra/docker/compose.local.yml up -d --no-build api
```

Replace `api` with `web` or `worker-python` as appropriate. A first cold build
must download its base image and dependencies. On later builds, inspect the
plain BuildKit output and confirm the applicable frozen install step reports
`CACHED`:

```bash
docker compose -f infra/docker/compose.local.yml build --progress=plain api web worker-python
docker compose -f infra/docker/compose.local.yml --profile e2e build --progress=plain e2e-web
```

Inspect the cache contract without changing the worktree:

```bash
scripts/verify-docker-cache-contract.sh --static
scripts/verify-docker-cache-contract.sh --source-probe
scripts/verify-docker-cache-contract.sh --manifest-probe
```

The source and manifest probes build disposable copied contexts, use
cache-only outputs, and remove their temporary directories on exit.

Use host commands only for Docker Compose orchestration, Git/file inspection,
or an explicitly assigned Android, iOS, or Windows native-platform task. Test
variables such as `NODE_ENV=test`, `QUEUE_ENABLED=false`, and `JEST_WORKER_ID`
must stay within the relevant test process or container, never in `.env`, shell
startup files, or normal runtime Compose configuration.

## Files

- Compose file: `infra/docker/compose.local.yml`
- API local image base: `infra/docker/api.Dockerfile`
- Web local image base: `infra/docker/web.Dockerfile`
- Worker local image base: `infra/docker/worker-python.Dockerfile`
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
JWT_EXPIRES_IN_SECONDS=34560000
REPORT_TEMPLATE_PATH=/workspace/samples/templates/卸柜报告-En.xlsx
```

For pilot or production, replace default passwords and `JWT_SECRET` with unique
strong values before starting services. The compose file builds the API
`DATABASE_URL` from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
Do not use the example values as production credentials.

`JWT_EXPIRES_IN_SECONDS` controls both the API JWT `exp` and the Web
`bestar_auth_token` cookie `Max-Age`. The default is `34560000` seconds
(400 days) so office browsers stay signed in unless the user logs out, clears
cookies, the account is disabled, or the configured token lifetime is reached.
Browsers may cap very long persistent cookies, and shorter values can be set
for stricter workstation security.

`TZ`, `OPERATIONAL_TIME_ZONE`, and `NEXT_PUBLIC_OPERATIONAL_TIME_ZONE` must use
an IANA timezone name. `America/Edmonton` is the Calgary/Edmonton warehouse
timezone and automatically switches between MDT and MST.

## Persistent Storage

The compose file copies application source into the API, web, and worker images
at build time, then bind-mounts only host `storage/` where API and worker
runtime artifacts must persist. Do not delete `storage/`; it contains:

- original uploaded Excel files
- parsed JSON
- generated Excel reports
- label PDFs
- task reports
- correction drafts

PostgreSQL data is stored in the Docker named volume
`bestar_postgres_data`.

Node dependency folders, pnpm store, the worker Python `.venv`, and Web `.next`
are baked into their service images. Compose does not mount dependency or build
output volumes over them, so recreating a service starts the exact artifacts
that were validated during image build.

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

Prisma Client generation and API/Web builds happen during image build. At
runtime the API runs committed migrations and then starts the compiled server;
the Web starts the baked Next.js production output directly. The web service
waits for API health before starting. nginx waits for web and API health and is
restarted when either upstream is recreated so it resolves the current
container address.

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

## Docker Development Checks

Run all application checks inside the already-running Compose services. These
commands use the same baked dependency layers and service configuration as the
local production rehearsal.

API lint, typecheck, unit, and E2E checks:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e
```

Web lint, typecheck, unit test, and production build:

```bash
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml up -d --build web
```

Worker and Prisma checks:

```bash
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma generate
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api prisma migrate status
```

The API service already runs committed migrations during normal startup. Do not
use `prisma migrate reset` against the local persistent database. For a fully
isolated test process, use `docker compose ... run --rm -T <service> <command>`
instead of introducing a host dependency environment.

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

Older checkouts may leave obsolete dependency volumes on the local Docker
host. They are no longer mounted. After confirming no older checkout uses
them, an operator may remove only these exact legacy volumes:

```bash
docker volume rm \
  docker_bestar_pnpm_store \
  docker_bestar_node_modules \
  docker_bestar_api_node_modules \
  docker_bestar_web_node_modules \
  docker_bestar_web_next \
  docker_bestar_worker_venv
```

Never include `docker_bestar_postgres_data` in dependency cleanup. Do not run
the legacy-volume cleanup as part of normal startup or automated validation.

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
| Source edit is not visible | Rebuild the affected service with `docker compose -f infra/docker/compose.local.yml up -d --build api web worker-python`; source is intentionally image-copied. |
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

## Business Agent Non-Interactive Profile

This project has a Codex CLI profile for the business-logic development agent.
It is intentionally separate from the default Codex profile and is only loaded
through the project launcher.

Install or validate the local profile once after checking out the repository:

```bash
scripts/install-business-agent-profile.sh
```

Execute one complete Task through the programmatic supervisor:

```bash
./scripts/run-business-agent.sh task \
  'prompts/tasks/<task-file>.md'
```

Run this from a normal terminal after leaving the old Codex session. The supervisor starts a fresh Session, requires structured
turn results, and automatically resumes the same Task after `CONTINUE`, malformed output, premature in-progress output, or a
recoverable Codex process failure. Only a valid terminal state stops the process. It also prevents concurrent supervised Tasks and
stores run evidence under `.codex/business-agent-runs/`.

Raw `exec`, manual `resume`, and direct launcher prompts are intentionally rejected. Running `./scripts/run-business-agent.sh`
without a subcommand still opens an unsupervised interactive TUI, but that mode is only for discussion, inspection, or diagnosis,
not complete Task execution. Do not run a second bare `codex` command afterward.

Use one fresh supervised process for each Task. The supervisor may call `codex exec resume` internally only for that same Task; do
not manually resume a different Task or a long-lived multi-task conversation. A new Session sees the shared worktree and must
continue existing uncommitted changes after inspecting them. See `docs/runbooks/business-agent-execution.md` for the exact start,
automatic continuation, recovery, status, and external-verification workflow.

The launcher always applies `business-agent`, `--sandbox danger-full-access`,
`--ask-for-approval never`, and the repository root. This is required because
the Docker-only workflow must reach the host Docker socket; `approval=never`
on a `:workspace` sandbox only turns a denied operation into an immediate
failure and does not grant the missing capability. Do not replace the launcher
with a direct `codex` invocation when this profile is required.

After this profile changes, exit the existing Agent Session, run
`scripts/install-business-agent-profile.sh --replace`, and start a new supervised Task. Resuming a Session created under another
sandbox, approval policy, or Task keeps the wrong runtime context and is not allowed.

The canonical profile is `.codex/business-agent.config.toml`; the installed
copy is `$CODEX_HOME/business-agent.config.toml`. The installer refuses to
overwrite a different local profile; use `--replace` only to migrate an older
copy that was installed from this repository. Project `.codex/execpolicy.rules` blocks
destructive Git operations, recursive deletion, package/image publishing,
remote infrastructure tools, high-risk Docker operations, and direct host
package/test/build commands. Docker Compose builds, tests, Prisma
generate/migrations, and local services remain normal in-scope work, subject
to platform-managed restrictions.

`danger-full-access` removes Codex's operating-system workspace boundary and
must only be used on a trusted local development host for this repository. The
fixed cwd, agent instructions, and execpolicy keep task scope and destructive
actions constrained, but they are not a filesystem sandbox. Managed host
requirements, credentials, and external/production controls can still impose
non-bypassable restrictions.

Run the no-business-side-effect capability smoke after installation or Codex
CLI updates:

```bash
scripts/smoke-business-agent-profile.sh
```

The smoke only reads `AGENTS.md`, writes and deletes a file in `/private/tmp`,
prints ESLint help from the web container, performs `docker compose ps`, and
verifies policy blocks. Use `scripts/smoke-business-agent-profile.sh
--policy-only` when validating only the allow/deny policy without launching a
Docker capability checks.
It does not create business records, change database/storage data, or call an
external release endpoint. A managed sandbox, OS permission, credential
request, production deployment, or action forbidden by the policy remains a
hard boundary; a repository prompt or launcher cannot override it.
