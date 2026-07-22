# Work Hours Settlement Regression

This runbook verifies the WAGE-QA-01 regression scope for HR monthly work hours
settlement. It does not introduce new business behavior.

> 2026-07-22 revision: `WAGE-HOURS-01/02/03/04/05` are complete and supersede the old
> odd-punch/manual-review-only, default-XF workbook, first-100-row review, and
> physical/no-audit deletion assumptions. The revised work-hours workflow is
> closed by the executed Docker/API/Chromium/BIFF/LibreOffice evidence below.

## Scope

- Real attendance fixture upload, duplicate SHA-256 handling, parse, and wage
  record generation.
- Worker output, API persistence/downloads, and office web review workflow.
- Permission behavior for read-only and unauthorized users.
- Employee-day row soft deletion, authenticated deleter attribution, immutable
  history, repeated-parse tombstone retention, and active-row-only generation.
- Generated file audit metadata and browser download links.
- Preservation of the original attendance workbook and wage template.

## Prerequisites

- Run the local Docker full stack from the repository root:

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
```

- For an existing persistent database, confirm migrations have been applied:

```bash
docker compose -f infra/docker/compose.local.yml exec -T api \
  pnpm --filter api prisma migrate deploy
```

- Open the web app through nginx: `http://127.0.0.1/`.
- Use an admin or `HR_MANAGER` account with attendance permissions.
- Keep the real wage fixtures unchanged:

| Fixture | SHA-256 |
| --- | --- |
| `samples/wage/workAttendanceRecordForm_June.xls` | `4c3a5c0750e04f99cd614da033d54d948b5fd1b72e0ffec4f19a3d35c9f682b3` |
| `samples/wage/20260601-0630_wageRecords.xls` | `6f2fb31f54e7cca39e696c11e8891f0a6e36041c28b98f1d287f703f9ecf375a` |

## Automated Checks

Run the WAGE-QA-01 required checks from the repository root. All dependency,
test and build commands stay inside the Docker services:

```bash
docker compose -f infra/docker/compose.local.yml exec -T worker-python \
  uv run pytest tests/unit/test_wage_generator_formatting.py \
  tests/unit/test_wage_attendance.py tests/integration/test_wage_p0_cli.py
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
```

```bash
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
```

Run the browser smoke against the Docker full stack:

```bash
docker compose -f infra/docker/compose.local.yml --profile e2e run --rm e2e-web \
  e2e/work-hours.spec.ts --project=chromium
```

Run the wage-specific workbook visual gate after the Chromium flow has written
`test-results/wage-hours-05/source/` and its evidence manifest:

```bash
docker compose -f infra/docker/compose.local.yml --profile report-visual \
  build wage-visual-test
docker compose -f infra/docker/compose.local.yml --profile report-visual \
  run --rm wage-visual-test /workspace/test-results/wage-hours-05
```

The gate compares every cell style and all relevant BIFF structure/print
metadata across all 10 sheets, converts four workbooks to 22-page PDFs, renders
88 original-resolution PNG pages, and builds four labeled contact sheets. The
contact sheets do not replace reviewing the original PNGs.

## WAGE-HOURS-02 Workbook Structure Gate

The real wage template has 10 sheets: 7 matched standard sheets, 2 unmatched
standard sheets, and the unsupported `司机WeiSheng Hong` delivery-statistics
sheet. The generator must preserve the last three sheets byte-for-byte at the
cell/style/formula/structure level and must preserve the `Wei Deng` adjustment
row before writing June 1 into the next validated date slot.

The focused generator test inventories every sheet's headers, target status,
dimensions, merges, row/column metadata and key normalized styles. It also
checks every touched cell, reliable employee-id matching, rejection of name
tokens shorter than three characters, Excel-date cell typing, preservation of
positive numeric notes, and deterministic bounded ASCII/CJK/multiline sizing.
The 2026-07-22 closure gate passed 17 focused tests and 181 Worker tests in the
Docker Worker image, plus scoped Ruff and Mypy checks.

## Manual Web Verification

1. Log in to `http://127.0.0.1/` as an admin or `HR_MANAGER` user with
   attendance permissions.
2. Open `/work-hours`.
3. Try uploading an `.xlsx` workbook, for example
   `samples/unloading-plans/BEAU5601716 UNLOADING PLAN.xlsx`.
4. Confirm the page rejects it with the legacy `.xls` attendance workbook error
   and does not call the attendance upload API.
5. Upload `samples/wage/workAttendanceRecordForm_June.xls`.
6. Confirm the page shows the file name and SHA-256. If it is a duplicate, the
   existing import must be opened by id and remain usable.
7. Click Parse.
8. Confirm the parsed result shows 13 selectable employees and that each
   employee exposes all 30 June employee-day rows (390 total), including `ray`,
   calculated hours, and localized parser warnings/errors. There must be no
   global first-100-rows truncation.
9. Generate one baseline wage record and record its file id, SHA-256, generator
   and status.
10. Delete one known employee-day row through its row action. Confirm the
    dialog identifies the employee/date/punches/hours, requires a reason, and
    does not accept a client-provided deleter id.
11. Confirm the active employee/month counts refresh, the deleted row is no
    longer payable, and deletion history shows the row snapshot, authenticated
    deleter, time and reason. The baseline generated file remains in history
    with its original SHA and a stale/superseded state.
12. Refresh and Parse the same import again. Confirm the deleted row does not
    return and that exactly one deletion event remains.
13. Generate and download a new wage record. Confirm the deleted employee-day
    row is excluded while unrelated employees and sheets remain unchanged.
14. Confirm the generated files list includes `WAGE_RECORD_XLS` and
    `TASK_REPORT_HTML`, with SHA-256, size, MIME type, status, and browser
    download links.
15. Confirm the UI does not expose internal storage paths such as
    `/workspace/storage`, `storage/attendance`, or
    `attendance_original_files`.
16. Download the generated wage record and task report from the browser links.
17. In the API response for `GET /api/attendance-imports/:id/files`, confirm
    generated file audit metadata includes storage path, SHA-256, MIME type, and
    file size.

## Permission Verification

1. Log in as a user with only `attendance.read`.
2. Open `/work-hours?attendanceImportId=<existing-id>`.
3. Confirm the page can show read-only import/parse data, but does not show the
   upload input, Upload `.xls`, Parse, Generate wage record, or row-delete
   actions. It may read deletion history.
4. Log in as `WAREHOUSE_MANAGER`.
5. Confirm `/work-hours` does not expose executable attendance actions and the
   attendance API returns 403 for upload, parse, and wage generation.
6. Log in as a user without `attendance.read`.
7. Confirm direct access to `/work-hours` shows the permission message and does
   not fetch attendance data.
8. Confirm API regression includes 403 coverage for unauthorized attendance
   parse, row deletion, and generated file download attempts.
9. Confirm `HR_MANAGER` owns `attendance.*` by default, `WAREHOUSE_MANAGER`
   owns `unloading_wage.*` by default, and ordinary `OFFICE` / `WAREHOUSE`
   roles do not receive wage-settlement permissions by default.
10. Confirm only `ADMIN` and `HR_MANAGER` receive
    `attendance.rows.delete` by default; `SYSTEM` does not receive interactive
    deletion authority.

## Fixture Preservation Check

After automated and manual checks, confirm the source fixture and wage template
hashes are unchanged:

```bash
shasum -a 256 samples/wage/workAttendanceRecordForm_June.xls samples/wage/20260601-0630_wageRecords.xls
```

Expected hashes are listed in the prerequisites table.

## Expected Constraints

- `.xlsx` attendance uploads remain rejected.
- Odd usable punch counts use first-to-last with a visible audit warning; even
  counts sum chronological punch pairs. The fixed `0.5` lunch break is deducted
  once after gross interval calculation for days with at least two punch
  boundaries. There is no tax, holiday, or overtime logic.
- Generated file storage paths are API audit metadata, not end-user UI content.
- Employee-day deletion is a soft delete with a required reason. Original
  workbook/raw row and old generated files remain evidence; repeated Parse does
  not resurrect the row, and new generation uses active rows only.

## WAGE-HOURS-04 Closure Evidence (2026-07-22)

- Existing and fresh temporary PostgreSQL databases deployed all 34 migrations;
  the temporary database was dropped after verification.
- Docker gates passed: API 41 suites / 333 unit and 21 suites / 122 E2E; Web
  262 unit plus lint, typecheck and production build; Worker 183 pytest plus the
  5-test normalized-generation integration file and Ruff; full-stack healthcheck.
- The complete Chromium work-hours spec passed 5/5. After the final validation
  message and mobile screenshot improvements, the audited deletion scenario
  passed again 1/1.
- Real fixture evidence before cleanup was 388 active rows, 2 tombstones and 2
  immutable deletion events with separate HR and ADMIN actor snapshots. Reparse
  preserved both tombstones, and generation used active rows only.
- The three reviewed screenshots are under `test-results/wage-hours-04/`.
  Both source fixture hashes match the prerequisite table.
- Cleanup removed the exact test import, rows, events, generated-file records,
  test users/roles and import-scoped generated storage. Post-cleanup counts for
  import/rows/events/files/users/roles were all zero. Original-upload evidence
  and `samples/wage` remain preserved.

## WAGE-HOURS-05 Closure Evidence (2026-07-22)

- The real flow passed 5/5 Chromium scenarios through nginx, API, PostgreSQL and
  Worker. Baseline evidence was 13 employees / 390 rows with method counts
  271 no-punch, 26 first-last fallback and 93 paired intervals. One HR deletion
  produced 389 active rows, one tombstone and one immutable event; reparse did
  not restore it and the new workbook excluded it.
- Duplicate SHA returned 409; Warehouse attendance operations returned 403;
  read-only history returned 200 and delete returned 403. The original upload,
  template SHA, generated SHA/size/MIME/actor, stale history and storage-safe
  downloads were verified before cleanup.
- The BIFF report passed all 10 sheets with zero normalized style differences.
  Worker and API baseline files were byte-identical; two unmatched sheets and
  the special driver sheet were unchanged; the Wei Deng adjustment row remained;
  after deletion only five expected cells on `BALIHAR SINGH(年轻印)` changed.
- LibreOffice rendered template, Worker baseline, API baseline and API
  after-delete workbooks to 22 pages each. All four contact sheets plus 11
  original high-signal pages were inspected for the second, third, middle,
  special and final sheets and the deletion delta. Colors, borders, time formats,
  TOTAL rows, CJK/ASCII content and dimensions remained readable with no
  generator-introduced clipping or overwrite.
- Docker gates passed: Worker 183; API 333 unit / 122 E2E; Web 262 unit plus
  lint, typecheck and production build; current and fresh databases applied all
  34 migrations; final full-stack build, healthcheck, fixture hashes and diff
  check passed.
- Evidence is gitignored under
  `/Volumes/xfl/logistics/stripSystem/test-results/wage-hours-05/`. Cleanup left
  zero task imports/users/roles and removed only the exact import-scoped
  generated directory; the SHA-addressed original workbook remains preserved.
