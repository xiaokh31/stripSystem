---
name: nextjs-pwa-ui
description: Use for Next.js App Router and TypeScript UI work in this repository, including office upload/import/container/report pages, API client and layout, inventory views, mobile scan pages, offline scan queue, and realtime inventory refresh.
---

# Next.js PWA UI Skill

## Must Read

Before editing web UI work, read:
- `AGENTS.md`
- The relevant task prompt under `prompts/tasks/`
- `.codex/skills/bestar-domain/SKILL.md`
- `apps/web/package.json`
- `apps/web/src/app/layout.tsx`
- Existing files under `apps/web/src/app/`, `apps/web/src/components/`, and `apps/web/src/lib/` that match the target route or shared API client

Also read:
- `.codex/skills/warehouse-scan-flow/SKILL.md` for mobile scan, load job, duplicate scan, or offline queue tasks
- `.codex/skills/pallet-label-generator/SKILL.md` when the UI previews, downloads, prints, or warns about label PDFs

## Project Shape

- Web app: `apps/web`
- Framework: Next.js App Router + React + TypeScript
- Styling: Tailwind CSS is available.
- Current app may still contain starter content; replace only what the task requires.
- Use a real API client. Do not introduce mock business data or fake API state.

## UX Direction

- Build an operational warehouse/office tool: dense, clear, and scan-friendly.
- Prefer tables, filters, status chips, compact summary panels, and explicit error states over marketing-style layouts.
- Keep page sections full-width or unframed unless a repeated item, modal, or tool genuinely needs a card.
- Use stable dimensions for buttons, tables, scan inputs, counters, and status areas so text and state changes do not shift the layout.
- Text must fit on mobile and desktop; do not let labels, statuses, or buttons overlap.
- Use real workflow labels from the task prompt and API contracts.

## Data Rules

- Use true backend responses for imports, containers, generated files, corrections, load jobs, scans, and inventory.
- Do not calculate remaining inventory from frontend state.
- Do not store manual corrections only in React state; saving must call the correction API.
- Duplicate upload, parse failure, generation failure, duplicate scan, invalid scan, and closed load job states must be visible to the user.
- Refresh views from API after mutations that change parse status, corrections, generated files, pallet statuses, or inventory.

## Office Routes

Expected routes from task prompts include:
- `/imports/new`
- `/imports/[id]`
- `/containers/[id]`
- `/reports/inventory`

Office UI tasks should call real APIs for:
- Import upload and duplicate-file errors
- Parse trigger and parse status
- Container detail and destination summaries
- Correction save and audit persistence
- Report and label generation
- Generated file download links
- Inventory filters and summaries

## Mobile Scan Routes

Expected routes from task prompts include:
- `/mobile/load-jobs`
- `/mobile/load-jobs/[id]/scan`

Mobile scan UI must:
- Use large touch targets and readable text.
- Auto-focus the scanner input.
- Support scanner-gun keyboard input with Enter submit.
- Show success, duplicate, invalid, already loaded, and load job closed results.
- Show container number, destination, pallet number, and remaining pallets after successful scans.
- Never pretend an offline scan changed inventory; queue it as pending until the API accepts it.

## Offline Queue

For offline scan queue tasks:
- Store `localId`, `qrPayload`, `loadJobId`, `scannedAt`, `deviceId`, `syncStatus`, and `lastError`.
- Display pending, synced, and failed states.
- Retrying sync must not create duplicate inventory decrements; rely on backend idempotency and duplicate scan rules.

## Common Commands

Use the narrowest relevant checks:

```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```
