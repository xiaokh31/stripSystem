---
name: docker-local-deploy
description: Use for local deployment, Docker Compose, nginx, PostgreSQL and storage persistence, backup and restore scripts, healthchecks, Linux/Windows deployment documents, warehouse operator docs, and print-agent or Tauri deployment ADRs.
---

# Docker Local Deploy Skill

## Must Read

Before editing deployment, backup, restore, healthcheck, or operational docs, read:
- `AGENTS.md`
- The relevant task prompt under `prompts/tasks/`
- `infra/docker/compose.dev.yml`
- Existing files under `infra/docker/`, `infra/nginx/`, `scripts/`, and `docs/runbooks/` for the area being changed
- `apps/api/package.json`, `apps/web/package.json`, and `apps/worker-python/pyproject.toml` when service startup commands are involved
- `docs/product/00-business-context.md` for warehouse operation goals

Also read:
- `.codex/skills/bestar-domain/SKILL.md` for storage, audit, generated-file, inventory, and scan business constraints
- `.codex/skills/pallet-label-generator/SKILL.md` for print-size and label PDF risks

## Project Shape

- Development compose file: `infra/docker/compose.dev.yml`
- Dev services currently include PostgreSQL and Redis.
- Target local deployment should cover web, api, worker-python, PostgreSQL, Redis, and nginx when the task requests full stack.
- Storage must be host-mounted or otherwise persistent; generated reports, labels, parsed JSON, original files, corrections, and task reports must survive container restarts.
- PostgreSQL data must be persistent and backed up before risky restore operations.

## Deployment Rules

- Do not add business features in deployment tasks.
- Keep `.env.example` complete enough for local operators without committing secrets.
- Prefer explicit service names, healthchecks, restart policies, and documented ports.
- nginx should route web and `/api` traffic clearly when used.
- Document LAN, phone, and PDA access paths for warehouse use.
- Include commands to start, stop, inspect logs, healthcheck, backup, and restore.

## Backup And Restore

- PostgreSQL backups must include timestamps.
- Storage backups must include timestamps and preserve original uploaded files and generated artifacts.
- Backup destination should be configurable.
- Restore scripts must be conservative: include dry-run or explicit confirmation and warn before overwriting data.
- Do not silently delete existing data during restore.
- Healthcheck scripts should verify web, API, database, and any required local services.

## Printing ADR Rules

For print-agent or Tauri decision tasks:
- Compare manual PDF printing, browser printing, Tauri local printer access, a local print agent, and ZPL/TSPL direct printing.
- Call out the 150mm x 100mm label size and 25mm x 25mm QR target.
- Document print scaling risk and the requirement to disable automatic scaling when printing PDFs.
- State the recommended current approach, risks, migration path, and explicitly out-of-scope options.

## Common Commands

Use commands from the active task. Common checks include:

```bash
docker compose -f infra/docker/compose.dev.yml up -d
docker compose -f infra/docker/compose.dev.yml ps
```

For future local full-stack compose tasks, verify the task-specific compose file and API health endpoint:

```bash
docker compose -f infra/docker/compose.local.yml up -d
curl http://localhost/api/health
```
