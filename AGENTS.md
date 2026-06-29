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
- Prefer small commits.
- Do not introduce mock business data as if it were real.
- Do not bypass tests.

After implementation:
- Show changed files.
- Show tests run.
- Show known limitations.
- Show manual verification steps.
- Show next recommended task.

## Commands

Install:
```bash
pnpm install
```

Run dev infra:
```bash
docker compose -f infra/docker/compose.local.yml up -d postgres redis
```

Local development uses host Web/API plus Docker PostgreSQL/Redis:
- Web: `127.0.0.1:3000`
- API: `127.0.0.1:4000`
- PostgreSQL: `127.0.0.1:15432`
- Redis: `127.0.0.1:16379`

Do not run Docker `api`, `web`, or `nginx` containers while testing
`127.0.0.1:3000`; see `docs/runbooks/local-development.md`.

Run all checks:
```bash
pnpm lint
pnpm typecheck
pnpm test
```

Worker tests:
```bash
cd apps/worker-python
uv run pytest
```


## Definition of Done
A task is not complete unless:

- Code compiles.
- Tests pass.
- Acceptance criteria are checked.
- Database migration exists if schema changed.
- No unrelated files are modified.
- Manual verification steps are documented.
