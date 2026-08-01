# Storage And Deployment Architecture

## Storage Layout

Local/dev storage root:

```text
storage/
```

Phase 0 output directories:

```text
storage/original_files/
storage/parsed_json/
storage/reports/
storage/labels/
storage/task_reports/
storage/corrections/
```

Deployment must mount storage persistently. Original uploaded Excel files and
generated artifacts are business records and must survive container restarts.

## Storage Semantics

### Original Files

- Preserve original bytes.
- Store by SHA-256 path or another collision-resistant path.
- Keep the raw multipart transport filename as evidence and the NFC canonical
  original filename as separate display metadata. Record the codec version and
  stable review code.
- Derive a separate storage-safe basename. Strip path separators, control/bidi
  and platform-reserved characters, cap the UTF-8 byte length, and assert the
  resolved file remains inside its SHA directory before every write.
- Never expose the local absolute storage path in ordinary API responses or
  use the storage basename as the user-facing original filename.
- Duplicate content must not overwrite the first stored file.
- Repair reversible legacy display metadata only through
  `docs/runbooks/upload-filename-repair.md`; the process never renames, moves,
  overwrites, or re-hashes original bytes.

### Parsed JSON

- Store worker parse output.
- Record in `generated_files` as `PARSED_JSON` when database/API exists.
- Include warnings/errors for failed or unsupported files.

### Reports

- Excel reports live under `storage/reports`.
- Generated reports must be recorded in `generated_files`.
- Template source is `samples/templates/卸柜报告-En.xlsx`.
- The template must not be modified directly.

### Labels

- PDF labels live under `storage/labels`.
- Generated label PDFs must be recorded in `generated_files`.
- Labels must remain 150mm x 100mm.
- QR target size is 25mm x 25mm.
- `storage/labels/print-calibration.pdf` is reserved for print-size
  verification in P4.

### Task Reports And Corrections

- Phase 0 HTML task reports live under `storage/task_reports`.
- Phase 0 corrections JSON drafts live under `storage/corrections`.
- Once API/database exists, manual corrections must be persisted in
  `correction_feedback`; corrections JSON remains an import/review aid.

## Generated File Recording

Every durable generated artifact should create a `generated_files` row with:
- import file id when applicable
- container id when applicable
- file type
- storage path
- file SHA-256 when available
- MIME type
- byte size
- status
- error message for failed generation
- generator user/system actor when available

Repeated generation must not hide history. Use one of:
- append a new generated-file record;
- mark older records `SUPERSEDED`;
- block duplicate generation until the user explicitly forces it.

## Docker Compose

Development compose:

```text
infra/docker/compose.dev.yml
```

Current dev services:
- PostgreSQL 17
- Redis 7

Local full-stack compose:

```text
infra/docker/compose.local.yml
```

Current local full-stack services:
- web
- api
- worker-python
- postgres
- redis
- nginx

Required deployment behaviors now implemented by the local compose file:
- PostgreSQL data volume is persistent.
- Storage directory is host-mounted.
- nginx routes web and `/api` traffic clearly.
- API healthcheck is exposed at `/api/health`.
- Environment variables are documented in `.env.example`.
- Logs and service status can be inspected with documented commands.
- Committed Prisma migrations run during API startup with
  `prisma migrate deploy`.

## Backup And Restore

Backup scope:
- PostgreSQL database.
- `storage/` directory.

Rules:
- Backups must include timestamps.
- Backup destination must be configurable.
- Restore scripts must use dry-run or explicit confirmation.
- Restore scripts must warn before overwriting data.
- Do not silently delete current storage or database state.
- Verify restore by checking API health and a representative generated file.

## Healthchecks

Healthcheck scripts should verify:
- Web responds.
- API responds.
- API can reach database.
- PostgreSQL container is healthy or reachable.
- Storage path is writable.

API health response should include:
- status
- version
- database connection status
- timestamp

## LAN And Device Access

Deployment docs must include:
- Server LAN IP or hostname.
- Office browser URL.
- Mobile/PDA URL.
- Required Wi-Fi/LAN assumptions.
- Firewall ports.
- Scanner-gun input mode assumption: keyboard wedge plus Enter.

## Printing And Scaling Risk

Current label strategy is PDF generation and manual/browser printing.

Risks:
- PDF viewers may auto-scale.
- Printer drivers may add margins.
- Wrong paper size will invalidate 150mm x 100mm labels.
- QR scan reliability depends on keeping QR physically near 25mm x 25mm.

P4 must provide:
- Print calibration PDF.
- Instructions to disable auto scaling.
- ADR comparing manual PDF printing, browser printing, Tauri, local print
  agent, and ZPL/TSPL direct printing.

## Production Cutover Rules

Before pilot:
- Run Phase 0 batch against real fixtures.
- Upload real `.xlsx` through API/UI.
- Generate report and labels.
- Verify label physical size.
- Scan valid QR payloads.
- Test duplicate scans.
- Test real loading plans:
  - one truck with multiple containers
  - one container split across multiple load jobs
  - `-P-part1` / `-P-part2` source text
  - external transfer lines and pure transfer trucks
- Test offline queue behavior if enabled.
- Test database backup/restore.
- Test storage backup/restore.
- Confirm generated files and audit events are queryable.
