---
name: nestjs-prisma-api
description: Use for NestJS API and Prisma work in this repository, including schema and migrations, healthchecks, import file APIs, worker parse integration, correction APIs, generated report/label APIs, inventory query APIs, load jobs, scan transactions, and reprint audit endpoints.
---

# NestJS Prisma API Skill

## Must Read

Before editing API or database work, read:
- `AGENTS.md`
- The relevant task prompt under `prompts/tasks/`
- `.codex/skills/bestar-domain/SKILL.md` for warehouse business rules
- `apps/api/package.json`
- `apps/api/prisma/schema.prisma` when schema, persistence, generated files, inventory, pallets, load jobs, scans, or corrections are involved
- Existing files under `apps/api/src/` and `apps/api/test/` for the module being changed
- `docs/architecture/*` when present; if the directory is empty, state that and derive the required schema from the task prompt and existing Prisma schema

Also read these skills when the task prompt lists them:
- `.codex/skills/unloading-excel-parser/SKILL.md` for parser integration
- `.codex/skills/unloading-report-generator/SKILL.md` for report generation APIs
- `.codex/skills/pallet-label-generator/SKILL.md` for label and QR APIs
- `.codex/skills/warehouse-scan-flow/SKILL.md` for load job and scan APIs

## Project Shape

- API app: `apps/api`
- Framework: NestJS + TypeScript
- ORM: Prisma with PostgreSQL
- Prisma schema: `apps/api/prisma/schema.prisma`
- Generated Prisma client output: `apps/api/src/generated/prisma`
- Do not manually edit generated Prisma client files.
- Keep API routes under the global `/api` prefix.

## Phase Boundaries

- P1 is database and API foundation. Do not build office UI, mobile UI, or print-agent behavior in P1 tasks.
- P3 scan APIs must use backend/database state and transactions; never rely on frontend state for inventory.
- P4 reprint APIs must audit print actions without changing loaded inventory state.
- P5 deployment tasks should not introduce business API behavior.

## Data Rules

- Preserve original uploaded Excel files under storage and record stored path.
- Detect duplicate imports by `file_sha256`.
- Parser output must record `parser_version`, warnings, errors, and raw JSON.
- Unknown parser columns belong in `raw_json`; do not discard them.
- Corrections must be stored in `correction_feedback`; do not overwrite values without audit.
- Generated Excel reports, PDFs, parsed JSON, HTML reports, and corrections JSON must be recorded in `generated_files`.
- Pallets must have unique `pallet_id` and unique `qr_payload`.
- Pallet loaded status must only change through a scan transaction.
- Pallet events are historical; insert new events instead of rewriting old ones.
- Remaining inventory must be calculated from database rows, not request payloads or client state.

## API Implementation Rules

- Use DTO validation for request bodies and query parameters.
- Return explicit errors for failed import, parse, generation, correction, scan, and reprint operations.
- Do not mark a request successful unless the file and database side effects both succeeded.
- When creating or changing schema, add a Prisma migration and run generate.
- Keep generated-file and pallet creation idempotent. If repeat generation is allowed, use a clear force/version/supersede strategy and record it.
- Scan transactions must lock or otherwise protect the pallet update path, validate load job state, insert a pallet event, update pallet status, and return updated progress.
- Duplicate scans in the same load job must return a duplicate result without decrementing inventory twice.
- Invalid QR payloads must return a clear error and be persisted as an exception or event when the task requires it.

## Common Commands

Use the narrowest relevant checks:

```bash
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api prisma generate
pnpm --filter api prisma migrate dev
```

Run worker tests too when API work invokes or depends on Python parser/report/label behavior:

```bash
cd apps/worker-python && uv run pytest
```
