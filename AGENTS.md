# AGENTS.md

## Project

Bestar Service CCA Warehouse Unloading System.

This system supports:
- Excel unloading list import
- Container number detection
- Destination/carton/volume extraction
- Pallet calculation
- Excel unloading report generation
- 150mm x 100mm pallet label PDF generation
- QR payload generation
- Loading scan
- Inventory and loading progress tracking
- Correction feedback
- Audit trail

## Current Delivery Priority

Phase 0 first.

Do not start with a full web app.

Correct order:
1. Real Excel fixtures
2. Parser detector
3. Parsed JSON output
4. Pallet calculation
5. Excel report generation
6. Pallet label PDF generation
7. HTML task report
8. Then database
9. Then API
10. Then web
11. Then mobile scan

## Tech Stack

- Web: Next.js App Router + TypeScript + PWA
- API: NestJS + TypeScript + Prisma
- Worker: Python + openpyxl + pandas + WeasyPrint + qrcode
- Database: PostgreSQL
- Queue: Redis + BullMQ
- Package manager: pnpm
- Python package manager: uv
- Deployment: Docker Compose

## Non-negotiable Business Rules

1. Original uploaded Excel files must always be preserved.
2. Duplicate imports must be detected by SHA-256.
3. Parser errors must not be silently swallowed.
4. Unknown columns must be preserved in raw_json.
5. Destination, cartons, volume and container number must carry warnings/errors when missing.
6. If volume is 0 but cartons > 0, create a warning.
7. Manual correction must be stored and auditable.
8. Every generated report or label must be recorded.
9. QR payload must contain a unique pallet ID.
10. Pallet loaded status must only be changed by scan transaction.
11. Duplicate scans must not decrement inventory twice.
12. Historical pallet events must not be overwritten.
13. Remaining inventory must be calculated from backend/database state, not frontend state.
14. PDF labels must be exactly 150mm x 100mm.
15. QR physical size target is 25mm x 25mm.

## Agent Workflow

Before editing:
- Read this file.
- Read relevant docs under docs/.
- State files likely to be changed.
- State acceptance criteria.
- State tests to be added or run.

During implementation:
- Modify only files relevant to the task.
- Prefer small, reviewable diffs. The business-agent profile does not create Git commits.
- Do not introduce mock business data as if it were real.
- Do not bypass tests.
- Treat directly related files required by the current task as in scope; adapt to the actual codebase and continue.
- Do not end with an in-progress report while actionable task work remains.

After implementation:
- Show changed files.
- Show tests run.
- Show known limitations.
- Show manual verification steps.
- Show next recommended task.

## Business Agent Sessions

- On a fresh Windows machine or a Session without prior project context, read `docs/runbooks/fresh-windows-agent-onboarding.md`
  before selecting a Task. The tracked Task index and completion report are authoritative; conversation memory and local
  `.codex/business-agent-runs/` history are not required.
- On a Windows PowerShell host without Docker or verification tooling, use
  `scripts\run-business-agent.cmd develop "<task-file>"`. This implementation-only mode must not run tests, builds, migrations,
  services, browsers, emulators, or device checks and can only finish as `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`; another
  capable host must complete the Definition of Done. Use `.cmd task` only on a host that can run the full Task gate.
- The Codex/ChatGPT desktop app is optional for inspection only and must not bypass the supervisor or write the same checkout
  concurrently.
- Read `prompts/agents/business-logic-agent.md` and `docs/runbooks/business-agent-execution.md` before executing a business task.
- Never execute a Task containing `Task-Status: ARCHIVED`. The supervisor rejects it before creating a Session. Reactivation
  requires an explicit product decision, removal of the marker, and synchronized Task index/completion report updates.
- Execute a fully verified Task only through `scripts/run-business-agent.sh task '<task-file>'`, or the Windows PowerShell
  `scripts\run-business-agent.cmd task "<task-file>"` wrapper on a capable host. Use `.cmd develop` only for explicitly unverified
  implementation. Raw `exec`, manual `resume`, and direct launcher prompts are intentionally rejected.
- Use one fresh supervisor-created session per Task. Do not reuse a session created for another Task.
- The supervisor may automatically resume that same session while the current Task reports `CONTINUE`; this does not authorize the next Task.
- A fresh session must inspect and preserve existing uncommitted work, then continue the named Task from the current worktree.
- Progress updates are not completion responses. The supervisor accepts only `DONE`, `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`, or a proven `BLOCKED` state as Task completion.
- External device, Microsoft Excel, target-host, business-signoff, or unavailable-real-sample checks do not justify stopping early; finish every automatable implementation and test first.
- Start and recovery commands are documented in `docs/runbooks/business-agent-execution.md`.

## Commands

## Docker-only Local Development

All local Web, API, worker, dependency, Prisma, lint, typecheck, test, and build
commands must run in Docker. Do not run host `pnpm install`, `npm install`,
`npx`, `jest`, `next`, `prisma`, `uv sync`, or `uv run pytest` for this project.
Do not create or repair host `node_modules` as part of normal development.

The Compose images bake Node dependencies, the Python virtual environment, and
production build outputs from frozen lockfiles. Runtime mounts are limited to
the PostgreSQL data volume and real `storage/` bind mounts. Test-only variables such as `NODE_ENV=test`,
`QUEUE_ENABLED=false`, and `JEST_WORKER_ID` must be scoped to the test process
or test container; do not persist them in the local `.env` or shell profile.

Host commands are limited to Docker Compose orchestration, Git/file inspection,
and platform-native mobile packaging when a native task explicitly requires
Android, iOS, or Windows host toolchains.

Run dev infra:
```bash
docker compose -f infra/docker/compose.local.yml up -d --build
```

Local development and local production rehearsal use one Docker full-stack
mode:
- Web through nginx: `http://127.0.0.1/`
- API through nginx: `http://127.0.0.1/api`
- PostgreSQL host port: `127.0.0.1:15432`
- Redis host port: `127.0.0.1:16379`

Do not run host `pnpm --filter api dev` or `pnpm --filter web dev` as the
default local workflow. Use `docs/runbooks/local-deployment.md` so local
testing matches Windows/Linux Docker production routing.

Run all checks:
```bash
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
```

Worker tests:
```bash
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
```


## Definition of Done
A task is not complete unless:

- Code compiles.
- Tests pass.
- Acceptance criteria are checked.
- Database migration exists if schema changed.
- No unrelated files are modified.
- Manual verification steps are documented.
