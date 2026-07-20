# PARSER-PROFILE-04 Office Mapping Wizard Verification

## Terminal review status

`DONE` on 2026-07-19 MDT after a fresh supervised focused remediation. The
second review's three remaining acceptance gaps are closed:

- workbook inspection now classifies both zero-sheet workbooks and workbooks
  whose sheets contain no previewable cells as the localized empty-workbook
  recovery flow;
- lookup validation focuses its first editable source-value input, links both
  lookup inputs to the visible error with `aria-invalid` and
  `aria-describedby`, and keeps the preview action reachable so validation can
  focus the first invalid control;
- replay package evidence maps `CARTON` and `WOODEN_CRATE` through typed
  localized business labels and hides unknown package enums behind the
  localized review fallback without changing customer destination/cell text.

The terminal dual-axis review then closed two additional presentation and
request-race gaps: canonical preview package values now use the same typed
localized labels as replay evidence, and a superseded preview failure cannot
replace the current draft's action message after its reducer result is ignored.

The first remediation had already fixed and reverified the following findings:

- editing a draft now invalidates both in-flight preview and replay responses,
  so stale responses cannot replace the current draft state;
- a failed learning-case lookup on the manual page now renders localized
  recovery actions and never falls back to an unlinked manual report;
- replay diff rows show business-readable manual and mapped `actual` /
  `expected` evidence without exposing JSON paths or internal codes;
- inspection issues, empty/error recovery, source-cell location, linked field
  validation and non-colour source selection states are complete;
- common parser warning/error stable codes are mapped to the typed locale
  catalog;
- runtime replay artifacts are ignored under
  `storage/parser-profile-replays/`.

## Result

`PARSER-PROFILE-04` completes the office-facing failed-import learning flow.
An eligible parse-failed or unsupported import now exposes a permissioned entry
that idempotently creates or resumes a learning case at
`/imports/{importId}/parser-learning`. The wizard keeps the preserved import in
context, provides bounded source evidence and allowlisted business controls,
links the resulting manual unloading report through the formal
`learningCaseId`, replays the saved mapping and submits only a `DRAFT` /
`REVIEW_REQUIRED` candidate. It does not approve, activate or trust a profile.

## Route, state and recovery behavior

- Import detail keeps retry parse and manual-report actions while showing the
  learning entry only for an eligible failed/unsupported import and a user with
  `parser_profiles.train`.
- ADMIN and OFFICE may enter and mutate according to their grants. WAREHOUSE
  and HR_MANAGER have no entry or mutation control; direct mutation attempts
  receive API 403 and the Web route renders localized permission feedback.
- The compact wizard covers source structure, sheet/header/data range,
  container and canonical field mapping, allowlisted transformations, row
  filtering, canonical preview/provenance, manual result, replay diff and
  candidate submission.
- Required suggestions remain explicitly unconfirmed until reviewed. Source
  evidence is windowed by the bounded inspection response and rendered inside
  named local scroll regions rather than an unbounded workbook DOM.
- Draft autosave is debounced and revision guarded. Editing the draft
  invalidates any in-flight preview or replay request. A real concurrent update
  produced API 409, displayed the reload/merge state, and refresh restored the
  server revision and saved mapping. Request identity prevents an old preview
  or replay from replacing a newer result.
- Browser back/forward, import-detail return, refresh, locale and theme changes
  retain the stable case URL and server draft. The manual form sends
  `learningCaseId`; the case subsequently exposes the linked manual result. A
  missing or failed learning-case lookup blocks the form instead of silently
  creating an unlinked report.
- Replay waits for the async job, downloads the server-generated artifact and
  submits the artifact's `artifactId`. The resulting case is
  `AWAITING_COMPLETION`; the UI never describes it as approved or trusted.

## API and stable-code presentation

The Web API client uses the protected inspect, draft, preview, replay-job,
replay-list/download and submit contracts. Response DTOs expose bounded source
evidence and download URLs but no internal storage path. Validation and status
regions use fixed-height or bounded scrolling so loading, saving, saved, save
error, stale revision, preview running, warnings/errors, replay mismatch,
awaiting completion and submitted draft remain stable while requests change.

All new headings, controls, table headers, instructions, ARIA text, statuses,
warnings and errors are typed catalog entries in `en` and `zh-CN`. Wizard
helpers map inspection-limit codes, revision conflict, unsupported/empty
workbook, missing canonical fields, zero-volume-with-cartons, permission
failure, queue/replay failure and the actual Worker codes
`PROFILE_WORKER_INVOCATION_FAILED`, `PROFILE_WORKER_EMPTY_OUTPUT` and
`PROFILE_WORKER_INVALID_OUTPUT` to recoverable localized copy. Customer
workbook headers/cells remain unchanged source data; raw enums, JSON paths,
backend English messages and storage paths are not primary UI text.

## Docker Chromium and visual verification

The dedicated `apps/web/e2e/parser-learning-wizard.spec.ts` test uses a
derived unsupported-layout workbook based on the repository's real Excel
fixture. Through the full nginx route it uploads and parses to a genuine
`UNKNOWN` / `ERROR` result, enters the wizard, inspects real Worker output,
maps fields with keyboard input, autosaves, forces and recovers from revision
409, previews canonical output, creates and reopens the formally linked manual
report, runs replay, downloads the replay JSON and submits its artifact as a
DRAFT candidate. The test also checks ADMIN/OFFICE access and WAREHOUSE /
HR_MANAGER Web and API denial.

The same run also holds delayed preview and replay responses, edits the draft,
then releases the old responses to prove latest-write-wins behavior. It checks
source-cell location, inspection recovery, linked field errors, localized
package values in both canonical preview and replay actual/expected evidence,
and the invalid-learning-case manual-page blocker.

The run captures and asserts the following matrix:

- `en` and `zh-CN`;
- light and dark themes;
- 390x844, 768x1024, 1366x900 and 1920x1080 at 100%;
- real Chromium 200% browser zoom at 1366x768 for English/light and
  Chinese/dark, including mapping-table start/end evidence.

All 16 base geometries reported page-level `scrollX = 0`. Both 200% checks
reported browser `innerWidth = 683`, page-level `scrollX = 0`, and a bounded
source region with intentional local horizontal scrolling. Twenty-two
screenshots plus `browser-evidence.json` were generated under the ignored local
directory `test-results/parser-profile-04/`; representative mobile, desktop,
theme, locale and zoom/mapping images were inspected. Browser and server error
arrays were empty. The single captured 409 console resource error was the
deliberately induced revision-conflict assertion, and no hydration warning was
reported.

## Automated verification

All project commands ran in Docker against images built from the current
worktree:

- Web production build passed and includes the parser-learning route;
- Web lint and typecheck passed;
- Web unit/contract: 235 tests passed, including draft serialization,
  confirmation, explicit revision-conflict state, stale preview success/failure, formal manual
  payload linkage, shared latest-request guards, validation/evidence labels,
  API client containment, sheets-without-cells empty recovery, localized replay
  package evidence and localized Worker/inspection-limit recovery;
- dedicated Docker Chromium flow and visual matrix: 1 test passed in about
  1.9 minutes, including lookup error focus/ARIA and assertions that preview
  plus both replay package cells show `carton` while raw `CARTON` is absent;
- API lint and typecheck passed;
- API unit: 36 suites / 286 tests passed;
- API E2E: 20 suites / 119 tests passed, including real Worker preview/replay,
  revision conflict, Worker failure, artifact download and candidate submit;
- Worker full suite: 171 tests passed, including bounded inspection limits,
  real-fixture inspection/mapping and parser-profile CLI contracts;
- Prisma migration status found 28 migrations and an up-to-date database;
- all PostgreSQL, Redis, API, Web, nginx and Worker containers were healthy;
  API/Web/static-asset/storage healthcheck passed;
- `git diff --check` passed.

## Manual review steps

1. Sign in as OFFICE, open a failed import, enter the wizard and confirm that
   required suggestions cannot save until reviewed.
2. Map container, destination, cartons and volume with keyboard controls;
   refresh after autosave and confirm the same case/revision is restored.
3. Preview, open the manual report, save it, return to the case, replay and
   submit; confirm the candidate remains DRAFT / REVIEW_REQUIRED and the case
   says awaiting completion.
4. Repeat direct access as WAREHOUSE and HR_MANAGER and confirm localized denial
   plus API 403; repeat as ADMIN and confirm access.
5. Toggle locale/theme and inspect the local source/mapping scrollers at narrow
   width and 200% zoom; confirm no page-level horizontal overflow or mixed UI
   language.

## Boundary and next Task

No external verification remains for this Task. Completion snapshot, approval,
activation and governance remain exclusively in
`PARSER-PROFILE-05Completion Snapshot Approval and Profile Governance.md`.
