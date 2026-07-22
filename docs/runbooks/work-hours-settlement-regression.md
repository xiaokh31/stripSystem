# Work Hours Settlement Regression

This runbook verifies the WAGE-QA-01 regression scope for HR monthly work hours
settlement. It does not introduce new business behavior.

> 2026-07-21 revision: `WAGE-HOURS-01` is complete and supersedes the old
> odd-punch/manual-review-only expectation. `WAGE-HOURS-02` through
> `WAGE-HOURS-04` remain active. Do not claim the complete revised work-hours
> workflow verified until WAGE-HOURS-04 updates this runbook with executed
> Docker/API/LibreOffice evidence.

## Scope

- Real attendance fixture upload, duplicate SHA-256 handling, parse, and wage
  record generation.
- Worker output, API persistence/downloads, and office web review workflow.
- Permission behavior for read-only and unauthorized users.
- Generated file audit metadata and browser download links.
- Preservation of the original attendance workbook and wage template.

## Prerequisites

- Run the local Docker full stack from the repository root:

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
```

- For an existing persistent database, confirm migrations have been applied:

```bash
DATABASE_URL='postgresql://bestar:bestar_dev_password@localhost:15432/bestar_unloading?schema=public' pnpm --filter api prisma migrate deploy
```

- Open the web app through nginx: `http://127.0.0.1/`.
- Use an admin or `HR_MANAGER` account with attendance permissions.
- Keep the real wage fixtures unchanged:

| Fixture | SHA-256 |
| --- | --- |
| `samples/wage/workAttendanceRecordForm_June.xls` | `4c3a5c0750e04f99cd614da033d54d948b5fd1b72e0ffec4f19a3d35c9f682b3` |
| `samples/wage/20260601-0630_wageRecords.xls` | `6f2fb31f54e7cca39e696c11e8891f0a6e36041c28b98f1d287f703f9ecf375a` |

## Automated Checks

Run the WAGE-QA-01 required checks:

```bash
cd apps/worker-python
uv run pytest
```

```bash
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

Run the browser smoke against the Docker full stack:

```bash
E2E_ADMIN_EMAIL=admin@bestarcca.com E2E_ADMIN_PASSWORD='Bestar-Admin-Local-2026!' pnpm --filter web exec playwright test e2e/work-hours.spec.ts
```

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
9. Click Generate wage record.
10. Confirm the generated files list includes `WAGE_RECORD_XLS` and
    `TASK_REPORT_HTML`, with SHA-256, size, MIME type, status, and browser
    download links.
11. Confirm the UI does not expose internal storage paths such as
    `/workspace/storage`, `storage/attendance`, or
    `attendance_original_files`.
12. Download the generated wage record and task report from the browser links.
13. In the API response for `GET /api/attendance-imports/:id/files`, confirm
    generated file audit metadata includes storage path, SHA-256, MIME type, and
    file size.

## Permission Verification

1. Log in as a user with only `attendance.read`.
2. Open `/work-hours?attendanceImportId=<existing-id>`.
3. Confirm the page can show read-only import/parse data, but does not show the
   upload input, Upload `.xls`, Parse, or Generate wage record actions.
4. Log in as `WAREHOUSE_MANAGER`.
5. Confirm `/work-hours` does not expose executable attendance actions and the
   attendance API returns 403 for upload, parse, and wage generation.
6. Log in as a user without `attendance.read`.
7. Confirm direct access to `/work-hours` shows the permission message and does
   not fetch attendance data.
8. Confirm API regression includes 403 coverage for unauthorized attendance
   parse and generated file download attempts.
9. Confirm `HR_MANAGER` owns `attendance.*` by default, `WAREHOUSE_MANAGER`
   owns `unloading_wage.*` by default, and ordinary `OFFICE` / `WAREHOUSE`
   roles do not receive wage-settlement permissions by default.

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
