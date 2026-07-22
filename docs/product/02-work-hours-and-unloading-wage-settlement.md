# Work Hours and Unloading Wage Settlement Plan

## Problem Statement

The office currently performs two monthly wage-related tasks manually in Excel.

The HR manager downloads the monthly employee attendance workbook from the time
clock, for example `samples/wage/workAttendanceRecordForm_June.xls`, and
calculates each employee's work hours into a wage record workbook matching the
format of `samples/wage/20260601-0630_wageRecords.xls`.

The warehouse manager calculates unloading worker pay every month from
unloading reports. The manager needs each imported or manually created
container detail to carry the unloading wage information needed for settlement:
container wage tag, trailer number for US-to-Canada transfer work, associated
container numbers for combined transfer work, unloading completion status, and
one or more unloader assignments.

Unloading workers are often temporary workers and do not necessarily have
employee login accounts in this office system. The unloader selector must
therefore use a manually maintained unloading-worker directory that is separate
from authenticated user accounts. The selector can still behave like a worker
selector in container detail, but it must not require the selected worker to be
a `User` row or to hold a `WAREHOUSE` role.

The system must separate these two wage workflows by role. The HR manager role
manages only work hours settlement. The warehouse manager role manages only
container-detail unloading wage information and monthly unloading wage
settlement.

When an office user marks a container as `已拆完`, the visible container status
must also change. A container that has finished unloading must not remain stuck
at `LABELS_GENERATED`. The system needs a container lifecycle state for
unloaded work, separate from pallet scan `LOADED`.

Ocean containers pay CAD 300 per container number. US-to-Canada transfer work
pays CAD 360 per paid transfer unit. US-to-Canada transfer work often combines
multiple container numbers, for example `ZCSU1234567B+TGBU1234567B`, and that
combined work counts as one paid unit.

The office also needs a monthly unloading data summary. The summary includes
all containers whose unloading has been completed for the selected month,
including containers that have already advanced to `LOADING_IN_PROGRESS` or
`LOADED` after unloading. The exported workbook should follow the structure of
the `6月拆柜数据` sheet in `samples/workform/Bestar_work_form.xlsx`.

The 2026-07-21 work-hours revision also requires the parsed review to be
organized by employee for the complete month, changes odd/even punch handling,
and closes a generated-workbook regression where writing values with a default
style removes the template colors from matched sheets after the first sheet.

The same revision allows an authorized HR manager to remove an erroneous
parsed employee-day row from active settlement. Removal is an auditable soft
delete, not destruction of source evidence: the system must preserve the
original workbook and raw row, identify the authenticated user who deleted the
row, retain an immutable deletion event, expose deletion history, and prevent a
repeat parse from silently restoring the deleted row.

After the work-hours workflow reached its full exit gate, the office download
surface is narrowed to the actual wage workbook. Parsed JSON, HTML task reports
and future diagnostic artifacts remain preserved and recorded for backend audit
and support, but they are not useful office deliverables and must not appear as
cards or download links on `/work-hours`.

## Solution

Add two office workflows:

1. Work hours settlement: upload the monthly attendance record, parse punch
   rows, calculate each employee's payable work hours, and generate a wage
   record workbook from the real wage template.
2. Unloading wage settlement: add unloading wage fields directly to the
   existing container detail workflow, then add a monthly settlement page that
   summarizes those completed container records by worker.
3. Monthly unloading data summary: summarize all completed unloading container
   data for a month and export an Excel workbook for office review.

The unloading wage feature must be anchored in existing container detail, not a
separate warehouse-manager data-entry workflow. If the backend uses an internal
grouping table for US-to-Canada transfer settlement, that is an implementation
detail behind the container detail page.

The delivery should follow the existing project order. Start with real fixtures
and batch-readable outputs, then add persistence/API, then add office web pages.

## Actors

- HR manager (`HR_MANAGER`): uploads attendance records, parses attendance,
  reviews employee-day rows, and generates work hours wage records.
- Warehouse manager (`WAREHOUSE_MANAGER`): opens container detail, classifies
  the container, records trailer/association data, marks unloading as
  completed, maintains/selects temporary unloaders, and generates monthly
  unloading wage settlement.
- Office user: imports or manually creates containers in the existing office
  workflow and may mark container unloading as completed, but does not receive
  wage-settlement authority by default.
- Warehouse user: scans loading work and may complete loading jobs, but does
  not receive unloading wage settlement authority by default.
- Admin: manages login users, can maintain temporary unloader names, and
  manages pay-rate settings.
- Developer: implements parser, calculation, persistence, APIs, and UI.

## User Stories

1. As an HR manager, I want to upload a monthly attendance record, so that I do
   not manually copy time-clock data into a wage workbook.
2. As an HR manager, I want the system to preserve the original attendance
   workbook, so that the generated wage record can be audited later.
3. As an HR manager, I want duplicate attendance uploads detected by SHA-256, so
   that the same month is not processed twice by accident.
4. As an HR manager, I want the system to show parse warnings for missing
   employee, department, date, or punch times, so that I can correct the record
   before using it for payroll.
5. As an HR manager, I want a generated wage record workbook using the sample
   wage template, so that the output keeps the existing office format.
6. As an HR manager, I want every generated wage workbook recorded, so that
   later regeneration is traceable.
7. As a warehouse manager, I want every imported or manually created container
   detail to show a container wage tag, so that I can classify it as ocean
   container or US-to-Canada transfer.
8. As a warehouse manager, I want an ocean container to count as one paid
   container by its container number, so that the CAD 300 rate is applied once.
9. As a warehouse manager, I want a US-to-Canada transfer container to require a
   trailer number, so that combined transfer work can be grouped correctly.
10. As a warehouse manager, I want to associate multiple US-to-Canada transfer
    container numbers from container detail, so that
    `ZCSU1234567B+TGBU1234567B` counts as one paid CAD 360 transfer unit.
11. As a warehouse manager, I want the associated container numbers visible on
    each related container detail page, so that I can verify the combined work
    before settlement.
12. As a warehouse manager, I want container detail to include an unloading
    status with an `已拆完` state, so that completed unloading work is eligible
    for monthly wage settlement.
13. As a warehouse manager, I want to manually maintain temporary unloader
    names, so that unloading workers can be paid without creating employee
    login accounts for them.
14. As a warehouse manager, I want container detail to include unloader name
    selection from that temporary-worker directory, so that I can record who
    unloaded the container.
15. As a warehouse manager, I want an add-unloader action on container detail,
    so that I can add multiple workers to one container or combined transfer
    unit.
16. As a warehouse manager, I want a monthly unloading wage settlement page, so
    that I can generate each worker's unloading wage for the month.
17. As a warehouse manager, I want the monthly settlement to show which
    containers were unloaded that month, so that each worker total can be
    checked against the unloading report.
18. As an office user, I want clicking `标记已拆完` to change the container
    status to `已拆完`, so that the container no longer appears stuck at
    `LABELS_GENERATED`.
19. As an office user, I want a monthly unloading data summary export, so that
    I can review all containers unloaded in the month using the existing office
    work-form style.
20. As an admin, I want pay rates stored as settings, so that CAD 300 and CAD
    360 can change later without changing code.
21. As an admin, I want a dedicated HR manager role, so that work hours
    settlement is not granted to all office users by default.
22. As an admin, I want a dedicated warehouse manager role, so that unloading
    wage settlement is not granted to all warehouse users by default.
23. As an HR manager, I want to select an employee by name and review every
    employee-day row in the imported month, so that records are not hidden by a
    global first-100-rows limit.
24. As an HR manager, I want odd punch counts calculated from the first and last
    usable punch and even punch counts calculated from paired intervals, so that
    the result follows the office's attendance rule while remaining auditable.
25. As an HR manager, I want every generated employee sheet to retain its
    template colors, borders, number formats, row heights and column widths, with
    bounded expansion for longer content, so that the downloaded workbook is
    consistently readable.
26. As an HR manager, I want to remove an erroneous employee-day row from the
    active monthly settlement, so that it no longer contributes to totals or a
    newly generated wage workbook.
27. As an auditor or HR manager, I want deletion history to show the deleted
    record, authenticated deleter, deletion time and reason, so that payroll
    changes remain traceable without altering the original attendance file.
28. As an HR manager, I want the generated-file area to show only wage record
    workbooks, so that parser JSON and technical task reports do not distract
    office users from the file they actually need.

## Business Rules

### Role and Permission Rules

- Add two default RBAC role records:
  - `HR_MANAGER` / Human Resources Manager
  - `WAREHOUSE_MANAGER` / Warehouse Manager
- `HR_MANAGER` manages only work hours settlement:
  - can access `/work-hours`
  - can upload attendance workbooks
  - can parse attendance imports
  - can view parsed attendance rows and generated attendance files
  - can generate wage record workbooks
  - can soft-delete an employee-day attendance row with an audit reason and
    review the deletion history
  - must not manage unloading wage classification, completion, unloaders, or
    settlement unless another role explicitly grants those permissions
- `WAREHOUSE_MANAGER` manages only unloading wage settlement:
  - can read container detail needed for unloading wage work
  - can edit the container detail unloading wage section
  - can set `海柜` / `美转加`, trailer number, associated containers,
    unloaders, and `已拆完`
  - can create, edit, and deactivate temporary unloader directory records
  - can access `/unloading-wage`
  - can generate monthly unloading wage settlements
  - must not upload, parse, or generate HR attendance wage records unless
    another role explicitly grants those permissions
- `ADMIN` keeps all permissions.
- `OFFICE` keeps normal office import, correction, reporting, label, inventory,
  and load-job planning permissions, but must not receive `attendance.*` or
  `unloading_wage.*` permissions by default after this role split.
  - may mark a container as `已拆完` as an operational container status update
  - may review/export monthly unloading data summary
  - must not generate unloading worker wage settlements unless explicitly
    granted warehouse manager permissions
- `WAREHOUSE` keeps normal loading scan permissions, but must not receive
  `unloading_wage.*` permissions by default after this role split.
- If a user has multiple roles, effective permissions are the union of all
  assigned active roles.
- API guards are the source of truth. Frontend navigation and buttons must
  mirror API permissions, but hiding UI is not sufficient authorization.
- Attendance-row deletion uses a dedicated `attendance.rows.delete`
  permission. Grant it to `HR_MANAGER` and `ADMIN` by default; do not infer it
  from `attendance.read`, `attendance.parse`, or `attendance.generate`, and do
  not grant it to `SYSTEM`, `WAREHOUSE_MANAGER`, `OFFICE`, or `WAREHOUSE` by
  default.

### Temporary Unloader Directory Rules

- Unloading workers are temporary labor for this workflow unless explicitly
  proven otherwise.
- A selectable unloader is a record in the unloading-worker directory, not an
  authenticated system user.
- Do not require every unloader to have an email, password, login session, or
  `WAREHOUSE` / `WAREHOUSE_MANAGER` role.
- `WAREHOUSE_MANAGER` and `ADMIN` can maintain the directory by manually adding,
  editing, and deactivating workers.
- Minimum directory fields:
  - display name
  - active/inactive status
  - worker code or generated stable identifier
  - optional phone/contact note
  - optional internal note
- New unloader assignments must store the directory worker id plus a snapshot
  of worker code and worker name.
- Historical assignments and generated settlements must continue to display the
  saved snapshot even if the directory name is edited later.
- Directory records referenced by assignments or settlements should be
  deactivated rather than deleted.
- If the system already has user-account-backed unloader assignments, those
  records must remain readable and settle correctly, but new assignments must
  not require `workerUserId`.
- Duplicate unloaders in the same ocean container or US-to-Canada paid unit are
  rejected by directory worker id. The UI should also warn before submit.
- The worker selector may support inline creation from container detail, but
  the saved assignment must still reference a durable directory record.

### Attendance Record Rules

- The original uploaded attendance workbook must always be preserved.
- Duplicate attendance uploads must be detected by SHA-256.
- The first supported fixtures are:
  - `samples/wage/workAttendanceRecordForm_June.xls`
  - `samples/wage/20260601-0630_wageRecords.xls`
- The source and template files are legacy Excel `.xls` files, not `.xlsx`.
  Implementation must explicitly support `.xls` or convert safely while
  preserving the original file.
- Parser output must include employee identifier/name, department when present,
  work date, punch times, calculated work duration, raw row data, warnings, and
  errors.
- Unknown source columns must be preserved in raw row data.
- Missing employee, date, or usable punch times must create warnings or errors.
- Normalize valid punch times into chronological order before calculation.
- Zero usable punches remain a zero-hour row with the existing missing-punch
  warning.
- An odd number of usable punches uses the first and last punch as one gross
  interval. The result is calculated rather than left `null`, but a stable
  odd-count fallback warning and calculation-method code must remain visible
  for audit. One usable punch therefore produces a zero-length interval and a
  zero-hour result with the warning.
- An even number of usable punches is paired in chronological order as
  `(1,2)`, `(3,4)`, and so on; gross hours are the sum of those intervals.
- The existing fixed lunch policy remains in force for this revision: subtract
  `0.5` hours once, after gross interval calculation, for a day with at least
  two usable punch boundaries. Do not subtract lunch once per pair. Zero- or
  one-punch days use `0` lunch hours. A future decision that paired gaps replace
  the fixed lunch deduction requires a separate product change.
- Store or expose a stable calculation method and interval breakdown so the
  API, Web review, generated JSON and tests can distinguish odd first/last
  fallback from even paired-interval calculation. Do not localize these codes
  in the API; Web maps them through the locale catalog.
- Increment the parser version when this rule changes. Re-parsing an existing
  attendance import replaces its persisted employee-day rows under the existing
  rebuild strategy; historical generated files remain immutable audit records.
- `WAGE-HOURS-01` implements this contract as `wage-attendance-v2`. Persisted
  rows use `NO_PUNCHES`, `FIRST_LAST_FALLBACK`, or `PAIRED_INTERVALS` plus the
  exact interval list; pre-v2 rows use the explicit `LEGACY_UNKNOWN` compatibility
  value until they are re-parsed.
- Overtime, statutory holiday pay, vacation pay, deductions, and tax/payroll
  compliance are out of scope unless the business provides explicit rules.

### Attendance Row Deletion and History Rules

- The deletable unit is one parsed employee-day `AttendanceRow`. Deleting an
  individual punch inside the row, restoring a deleted row, or deleting the
  attendance import itself is not part of this revision.
- Deletion is a soft delete. Keep the row, original `rawJson`, punch list,
  calculation metadata, warnings/errors and source workbook unchanged. Never
  physically remove source evidence to satisfy the UI action.
- A delete request must use the authenticated JWT actor; a client-supplied user
  id is never trusted. Store `deletedAt`, `deletedById` and a required audit
  reason on the row or equivalent tombstone.
- In the same transaction, append an immutable deletion event containing the
  attendance import id, stable row key, row snapshot, actor id and durable
  actor display snapshot, deletion time and reason. Deactivating or renaming a
  user must not make historical attribution unreadable.
- Repeated deletion of the same row is idempotent and must not create duplicate
  history events. Attempts against another import or an unknown row return a
  stable error without mutation.
- Normal parse-result, employee summaries and wage generation use active rows
  only. History is returned explicitly and is not mixed into the active row
  list. Responses expose an active-row count and deleted-row count so the UI
  cannot present stale totals.
- Re-parsing the same attendance import must reapply its durable deletion
  tombstones and must not resurrect a deleted row or erase deletion history.
  Parser errors must not erase the last auditable state.
- Wage generation must consume the persisted active employee-day row set or an
  equivalent server-controlled correction overlay. It must not independently
  reparse only the original workbook and thereby include deleted rows again.
- Deleting a row after a wage workbook was generated never deletes or rewrites
  the historical file. Affected generated wage artifacts become visibly
  superseded/stale, remain in history with their original SHA and generator,
  and the next generation uses only active rows.
- Reject or safely serialize deletion while parse or wage-generation work is
  queued/running, so a successful mutation cannot race with an output based on
  the previous active row set.
- Users with `attendance.read` may view deletion history. Only users with
  `attendance.rows.delete` may execute deletion. The Web action requires a
  confirmation and non-empty reason.

### Attendance Generated File Visibility Rules

- The normal `/work-hours` generated-file area is an office delivery surface,
  not a technical artifact browser. Its explicit allowlist contains only
  `WAGE_RECORD_XLS`.
- `ATTENDANCE_PARSED_JSON`, `TASK_REPORT_HTML` and any future parser/debug/task
  artifact must not render a card, filename, type label, audit metadata or
  download link on the Work Hours page. New unknown file types remain hidden by
  default until a separate product decision classifies them as office output.
- Keep all technical generated-file records, storage files, SHA-256 values,
  generator attribution and statuses in the database/API for audit,
  troubleshooting and automated verification. This UI change must not stop
  generation, delete artifacts, rewrite history or weaken backend permissions.
- Keep the complete `WAGE_RECORD_XLS` history visible, including current,
  failed and superseded/stale entries. Download availability continues to
  follow the backend status contract; hiding technical artifacts must not hide
  a wage workbook merely because it is superseded or failed.
- Apply the allowlist before server-rendered markup is produced. Hidden
  technical entries must not flash during hydration, locale switching or
  refresh and must not remain exposed through screen-reader-only links.
- The rule applies to every user viewing the operational Work Hours page,
  including `ADMIN` and `HR_MANAGER`. Internal support may continue using the
  authenticated API or a future dedicated audit interface; this revision does
  not add that interface.

### Wage Record Workbook Rules

- Continue copying `samples/wage/20260601-0630_wageRecords.xls`; never modify the
  source template or replace the legacy `.xls` delivery with an approximate new
  workbook.
- A sheet is eligible for the standard attendance writer only when its wage
  table contract contains `DATE`, `HOURS`, `LUNCH HOURS`, `START TIME`, and
  `END TIME`. A special sheet such as `司机WeiSheng Hong`, whose columns include
  `SHIFT&REMARKS` and delivery statistics, must not be overwritten by the
  generic six-column writer.
- Employee-to-sheet matching is one-to-one and may use either a reliable
  employee id or the employee name. Id and name checks are independent;
  missing names must not suppress an exact id match. Name matching uses exact
  normalized tokens of at least three characters, never substrings. One
  employee matching multiple sheets or one sheet matching multiple employees
  must produce a stable warning and leave every ambiguous target unchanged.
- A writable date slot must contain a full calendar-date string or a numeric
  Excel cell whose number format identifies it as a date. Prefer dates in the
  generated attendance period. The supplied office template's prior-month grid
  may be reused only when it proves one complete ordered calendar month;
  isolated numeric/date notes and adjustment rows are not writable slots.
- Every generated value must keep the corresponding cell's own template style:
  fill/color, font, border, alignment, wrapping, number format and protection.
  Do not copy the first sheet's style over later sheets because sheets may have
  intentional differences.
- Preserve merged ranges, formulas, print settings, page setup, hidden state and
  untouched cells/sheets.
- Start row heights and column widths from each sheet's template dimensions.
  Expand touched rows/columns only when generated visible content needs more
  room, using a deterministic ASCII/CJK-aware width calculation, wrapping and
  bounded maximums. Never shrink below the template or let auto-sizing destroy
  the existing printable layout.

### Container Detail Unloading Wage Rules

- Every imported or manually created container detail must have an unloading
  wage section.
- The section must include:
  - container wage tag: `海柜` or `美转加`
  - trailer number, required only for `美转加`
  - associated container numbers, used only for `美转加` combined work
  - unloading status, including `已拆完`
  - unloader rows, each selecting one active temporary worker from the
    unloading-worker directory
  - add-unloader action for multiple unloaders
- `海柜` rules:
  - One container number is one paid unit.
  - Trailer number is not required.
  - Associated container numbers are not required.
  - Default rate is CAD 300.
- `美转加` rules:
  - Trailer number is required.
  - One or more imported or manually created container numbers may be associated
    together from container detail.
  - The associated set counts as one paid transfer unit for settlement.
  - Default rate is CAD 360 per associated transfer unit, not per individual
    container number inside the set.
- The UI label is a business tag for wage calculation. It is not the existing
  physical pallet label PDF.
- Unloading completion is separate from pallet loaded status. Do not use
  pallet `LOADED` or load job completion as proof that unloading workers should
  be paid.
- Only records marked `已拆完` are eligible for monthly unloading wage
  settlement.
- For `美转加` associated containers, each related container detail must show the
  same trailer number, associated container numbers, unloading completion
  status, and unloaders for that paid transfer unit.
- If a user edits classification, trailer number, associations, unloading
  completion, unloader directory records, or unloader assignments after saving,
  the change must be audited.
- If completed unloading data is changed after a monthly settlement has been
  generated, the affected settlement must be marked stale, superseded, or needs
  review before it is used again.
- Default MVP allocation assumption: if multiple unloaders are selected and no
  specific allocation is provided, the paid amount is split equally. If the
  business does not accept equal split, the UI must add per-worker amount or
  percentage before production use.

### Container Unloaded Status Rules

- Add a container lifecycle status for `已拆完`. The recommended enum code is
  `UNLOADED`.
- `UNLOADED` means the physical unloading work is complete and the container is
  ready for downstream loading workflow.
- `UNLOADED` is different from pallet `LOADED` and container `LOADED`.
  Container `LOADED` remains a loading/scan result and must not be manually set
  by the office unloading action.
- User-facing Chinese status labels should distinguish the states clearly:
  - `UNLOADED`: `已拆完`
  - `LOADING_IN_PROGRESS`: `装车中`
  - `LOADED`: `已送库`
- Do not label `LOADED` as `已拆完`. The API enum can remain `LOADED`; this is a
  display-name requirement.
- When an authorized office user, warehouse manager, or admin clicks
  `标记已拆完`, the system must:
  - reconcile every destination's `finalPallets` snapshot to persisted pallet
    records before changing the container status
  - preserve reusable `PLANNED` / `LABEL_PRINTED` pallet identity and history,
    create missing pallets with immutable audit events, and only cancel safe
    unused surplus pallets
  - reject the whole completion when surplus has loading, loaded, adjusted, or
    exception history; it must not delete or overwrite historical pallets
  - save unloading completion data
  - set the visible container status to `UNLOADED` if the container has not
    already advanced to loading
  - create an audit/correction record for the status change
- The pallet reconciliation, `UNLOADED` transition, unloading completion, and
  related audit records are one transaction. A retry is idempotent and returns
  a structured per-destination synchronization summary.
- If the container is already `LOADING_IN_PROGRESS` or `LOADED`, marking or
  re-saving unloading completion must not downgrade the container status to
  `UNLOADED`.
- Loading scan behavior remains authoritative for `LOADING_IN_PROGRESS` and
  `LOADED`.
- For reporting and monthly unloading data summary, these statuses are treated
  as completed unloading statuses:
  - `UNLOADED`
  - `LOADING_IN_PROGRESS`
  - `LOADED`
- Existing containers that are `LOADING_IN_PROGRESS` or `LOADED` should be
  treated as already unloaded for summary filtering, but the summary month must
  still be based on a recorded unloading completion date when available.
- Containers missing an unloading completion date must not be silently assigned
  to a month. They should appear in a review/warning list if their status
  indicates they are already unloaded.

### Monthly Settlement Rules

- The settlement page reads from existing container detail unloading wage data.
- The settlement month is based on the unloading completion date.
- The page includes only completed unloading records for the selected month.
- The page summarizes by worker:
  - worker name
  - number of paid units
  - wage amount
  - detail rows used to calculate the amount
- The page shows the month detail:
  - ocean container numbers paid at CAD 300
  - US-to-Canada trailer numbers paid at CAD 360
  - associated container numbers for each US-to-Canada paid transfer unit
  - completion date
  - unloaders
- Generating a settlement creates a durable generated artifact and does not
  overwrite historical settlement details silently.

### Monthly Unloading Data Summary Rules

- This is an operational unloading summary, not the worker wage settlement.
- The summary includes all containers completed for the selected month.
- Completion eligibility includes containers whose current status is
  `UNLOADED`, `LOADING_IN_PROGRESS`, or `LOADED`.
- The selected month is based on unloading completion date. If a container is
  already in a completed unloading status but lacks a completion date, it must
  be shown as a warning/review item instead of being silently included.
- The export workbook should follow the `6月拆柜数据` sheet in
  `samples/workform/Bestar_work_form.xlsx`:
  - grouped by container
  - container number and optional sequence in column A
  - date plus business tag such as `海柜` / `美转加` in column B
  - destination or service line in column C
  - cartons/count/pallet text in column D
  - reference, appointment, shipment, or raw note field in column E when
    available
  - appointment/unloading time in column F when available
  - variance, split count, or operation note in columns G/H when available
- The export must preserve all available source detail needed for office review
  instead of only outputting wage totals.
- Missing fields should create warnings in the response or task report.
- Every generated summary workbook must be recorded as a generated file and
  available through browser-safe download links.

## Data Concepts

- Attendance import: original attendance workbook plus SHA-256, parse status,
  parser version, warnings, errors, and raw metadata.
- Attendance row: one employee-day parsed from the workbook, preserving raw
  source data, normalized punch times, calculation method, interval breakdown
  and calculated hours.
- Wage record file: generated workbook based on the wage template and recorded
  as a durable artifact.
- Container wage tag: the container detail field that classifies a container as
  `海柜` or `美转加`.
- Trailer number: required container detail field for `美转加`.
- Container wage association: the related container numbers that make one
  paid `美转加` transfer unit.
- Unloading completion: the `已拆完` state shown from container detail.
- Unloaded container status: the container lifecycle status `UNLOADED`, shown as
  `已拆完`, set when office unloading work is completed before loading begins.
- Temporary unloader: a manually maintained directory record for a temporary
  unloading worker who may not have a system login account.
- Unloader assignment: one or more worker rows on container detail, selected
  from the temporary unloader directory and saved with worker name/code
  snapshots.
- Unloading wage settlement: monthly generated result by worker and by
  completed container or associated transfer unit.
- Monthly unloading data summary: operational monthly workbook listing
  completed unloading container details for office review, based on
  `samples/workform/Bestar_work_form.xlsx`.

## Suggested Delivery Phases

### WAGE-P0: Attendance Batch Prototype

- Register the two real wage fixtures and document their SHA-256 values.
- Add a wage attendance detector for the real time-clock workbook layout.
- Emit parsed JSON with raw rows, warnings, errors, employee/day rows, and
  calculated hours.
- Generate the wage record workbook from
  `samples/wage/20260601-0630_wageRecords.xls` as a template.
- Generate an HTML task report for the attendance import.
- Do not build database/API/web in this phase.

### UNLOAD-WAGE-P0: Container Detail Rule Prototype

- Validate the unloading wage calculation using a reviewed fixture that
  references real or reviewed container numbers.
- Cover both `海柜` and `美转加`.
- Cover `美转加` combined work such as
  `ZCSU1234567B+TGBU1234567B` counting as one CAD 360 paid unit.
- Cover `已拆完` filtering and multiple unloader rows.
- Emit monthly settlement JSON and an HTML task report.
- Inspect `samples/workform/Bestar_work_form.xlsx` and document the structure
  of the `6月拆柜数据` sheet for the monthly unloading data summary export.

### P1: Persistence and API

- Add or adjust schema so existing container records can expose unloading wage
  tag, trailer number, associated container numbers, unloading completion, and
  unloaders through container detail.
- Add `UNLOADED` / `已拆完` to the container lifecycle so marking unloading
  complete changes the visible container status.
- Add or adjust schema for a manually maintained temporary unloader directory.
  Do not model temporary unloaders only as authenticated users.
- Add default RBAC role records for `HR_MANAGER` and `WAREHOUSE_MANAGER`, and
  map wage permissions to those manager roles.
- Add API behavior for saving the unloading wage section from container detail.
- Add API behavior for generating monthly unloading wage settlement from saved
  container detail data.
- Add API behavior for monthly unloading data summary and Excel export.
- Preserve all uploaded source files and generated files.
- Record classification, association, completion, unloader, and settlement
  changes for audit.

### P2: Office Web UI

- Add a Work Hours Settlement page for HR.
- Add an unloading wage section to `/containers/[id]`.
- The `/containers/[id]` section must handle tag selection, trailer number,
  container association, `已拆完` status, unloader selection, and add-unloader.
- Add an Unloading Wage Settlement page for warehouse manager monthly review.
- Add a monthly unloading data summary view/export for office review.

### 2026-07-21 Work Hours Revision

1. `WAGE-HOURS-01`: revise the parity calculation contract and persist/expose
   auditable calculation metadata.
2. `WAGE-HOURS-02`: repair all-sheet template styling, safe matching and bounded
   adaptive row/column dimensions.
3. `WAGE-HOURS-03`: replace the globally truncated flat review with an
   employee-oriented complete-month review in strict `en` / `zh-CN`.
4. `WAGE-HOURS-04`: add attendance-row soft deletion, authenticated actor
   attribution, immutable history and reparse/generation safety.
5. `WAGE-HOURS-05`: close Docker full-stack, downloaded-workbook and
   LibreOffice visual regression gates.
6. `WAGE-HOURS-06`: restrict the office generated-file area to wage workbook
   history while retaining parser/task artifacts as backend audit evidence.

## Proposed API Surface

The exact route names can change during implementation, but the behavior should
be stable. The user-facing workflow must still start from container detail.

- `POST /api/attendance-imports`
- `POST /api/attendance-imports/:id/parse`
- `GET /api/attendance-imports/:id/parse-result`
- `DELETE /api/attendance-imports/:id/rows/:rowId`
- `GET /api/attendance-imports/:id/row-history`
- `POST /api/attendance-imports/:id/generate-wage-record`
- `GET /api/attendance-imports/:id/files`
- `PATCH /api/containers/:id/unloading-wage`
- `PATCH /api/containers/:id/unloading-wage-associations`
- `POST /api/containers/:id/complete-unloading`
- `PUT /api/containers/:id/unloaders`
- `GET /api/unloading-wage/workers`
- `POST /api/unloading-wage/workers`
- `PATCH /api/unloading-wage/workers/:workerId`
- `GET /api/unloading-summary?month=YYYY-MM`
- `POST /api/unloading-summary/exports`
- `GET /api/unloading-summary/exports/:fileId/download`
- `POST /api/unloading-wage-settlements`
- `GET /api/unloading-wage-settlements`
- `GET /api/unloading-wage-settlements/:id`

If the backend keeps internal `pay_containers` or similar models, those models
should be created and updated by the container-detail APIs. They should not
force the warehouse manager to maintain a separate pay-container page before
using the existing container detail.

## UI Requirements

### Work Hours Settlement Page

- Only `HR_MANAGER` and `ADMIN` should see or execute work hours settlement
  actions by default.
- Upload one monthly `.xls` attendance workbook.
- Display filename, SHA-256, parse status, warning count, and error count.
- Group parsed rows by stable employee identity and display the employee name as
  the primary selector/group label. Employee id and department remain visible
  secondary identity fields.
- Every employee can expose all employee-day rows in the imported month, ordered
  by work date, including blank/no-punch days and warning rows. Remove the
  global first-100-rows truncation; collapsing or selecting one employee at a
  time is allowed for usability but must not make remaining rows unreachable.
- Show punch times, gross hours, lunch hours, calculated hours, localized
  calculation method and warnings for missing employee/date/punches,
  odd-count fallback and unsupported workbook layout before generation.
- Each active employee-day row exposes a delete action only when the current
  user has `attendance.rows.delete`. Confirmation requires a reason and names
  the employee/date being removed from active settlement.
- Show a deletion-history view for users with `attendance.read`, ordered newest
  first, with employee/date/punch snapshot, deleted hours, deleter, deletion
  time and reason. Deleted rows are visually distinct from active rows and
  cannot be mistaken for payable time.
- After deletion, refresh active employee/month summaries and generated-file
  status from the API without losing the selected import or employee.
- Keep the employee control and complete-month table usable at 320px/mobile,
  desktop and 200% zoom without page-level overflow; a contained table scroller
  is allowed.
- Generate and download the wage record workbook.
- Show wage record workbook history only. Do not show parsed attendance JSON,
  task reports or future diagnostic artifacts as office download cards.

### Container Detail Unloading Wage Section

Add this section to existing `/containers/[id]`.

Only `WAREHOUSE_MANAGER` and `ADMIN` should edit unloading wage pay information
by default. `OFFICE` users with normal container update permission may mark the
operational container status as `已拆完`, but that does not grant them authority
to generate unloading worker wage settlements. Users without unloading wage
permissions may see the underlying container detail if they have container read
access, but wage settlement actions should be hidden or read-only.

Required controls:

- Container wage tag selector:
  - `海柜`
  - `美转加`
- Trailer number input:
  - hidden or disabled for `海柜`
  - required for `美转加`
- Associated container numbers:
  - hidden or disabled for `海柜`
  - visible for `美转加`
  - supports adding existing imported or manually created container numbers
  - shows associated container numbers as a list
- Unloading status:
  - must include `已拆完`
  - marking `已拆完` changes the visible container status to `UNLOADED` unless
    it has already reached `LOADING_IN_PROGRESS` or `LOADED`
  - should make incomplete records visibly excluded from settlement
- Unloader rows:
  - each row is one worker option from the temporary unloader directory
  - add action creates another unloader row
  - selector can create a missing temporary worker before selecting it
  - duplicate worker names in the same unit should be rejected
- Save action:
  - persists the section through the API
  - refreshes from API after save
  - shows validation errors for missing trailer number, missing unloaders, or
    invalid associated containers

### Unloading Wage Settlement Page

- Only `WAREHOUSE_MANAGER` and `ADMIN` should see or execute unloading wage
  settlement actions by default.
- Filter by month.
- Generate settlement from container detail data for that month.
- Show summary by worker: worker name, paid unit count, wage amount, and review
  status.
- Show detail rows:
  - ocean container number or US-to-Canada trailer number
  - associated container numbers for US-to-Canada transfer work
  - completion date
  - rate
  - unloaders
  - worker amount
- Provide generated settlement file links from the API.

### Monthly Unloading Data Summary Page

- Accessible to `OFFICE`, `WAREHOUSE_MANAGER`, and `ADMIN` unless the business
  later narrows this permission.
- Filter by month.
- Show all completed unloading containers for that month.
- Include containers currently in `UNLOADED`, `LOADING_IN_PROGRESS`, and
  `LOADED` status.
- Show review warnings for containers in completed unloading statuses that lack
  unloading completion date.
- Export an Excel workbook based on the `6月拆柜数据` sheet style in
  `samples/workform/Bestar_work_form.xlsx`.
- Provide browser-safe download links for generated exports.

## Implementation Decisions

- Treat HR attendance wage records and warehouse unloading wage settlements as
  separate workflows. They share employee identities and generated-file/audit
  patterns, but they should not share parser models.
- Put the unloading wage entry workflow inside existing container detail.
- Do not overload `ContainerStatus.LOADED` for `已拆完`. Existing `LOADED` is
  tied to pallet loading scan transactions. Add a separate `UNLOADED`
  container status for `已拆完`.
- Display `ContainerStatus.LOADED` as `已送库` in Chinese UI to avoid confusion
  with `已拆完`.
- Do not downgrade containers from `LOADING_IN_PROGRESS` or `LOADED` back to
  `UNLOADED` when unloading completion is saved.
- Use container records as the visible source for wage tag, trailer number, and
  association state. Internal settlement-unit records may exist, but they should
  be synchronized from container detail and treated as implementation details.
- Use a dedicated temporary unloader directory for the worker selector. Do not
  use login `users` as the only source of selectable unloaders.
- Store pay rates as operational settings or rate records with effective dates.
  Do not hard-code CAD 300 and CAD 360 into calculation code only.
- Settlement generation should snapshot rates, associations, unloaders, and
  included container numbers so later changes do not silently rewrite
  historical wages.
- Permissions should use dedicated wage manager roles. `HR_MANAGER` owns work
  hours settlement. `WAREHOUSE_MANAGER` owns unloading wage settlement.
  Ordinary `OFFICE` and `WAREHOUSE` users should not receive wage-settlement
  permissions by default.
- Attendance calculation method values are stable domain codes. API and Worker
  payloads return codes/raw times/numbers only; visible Web labels, warnings,
  empty states, controls, tooltips and accessibility text must be managed by the
  typed `en` / `zh-CN` catalog and show one language at a time.
- Attendance-row deletion is modeled as a durable tombstone plus append-only
  event history. The original workbook, raw parsed row and historical generated
  files remain immutable evidence; current summaries and new generation filter
  active rows at the backend.
- Separate generated-file retention from office visibility. The API and
  database keep all attendance artifacts, while `/work-hours` uses a typed,
  default-deny allowlist whose only office-visible type is `WAGE_RECORD_XLS`.

## Testing Decisions

- Parser tests should use the real files in `samples/wage`.
- Detector tests should reject unsupported workbooks with explicit errors.
- Attendance calculation tests should cover zero, one, two, three, four and
  larger odd/even punch counts; the real three-punch fixture row; fixed lunch
  applied once; blank rows; unknown columns; parser-version migration behavior;
  duplicate uploads; and deterministic interval metadata.
- Wage record generator tests should verify the template is copied, not
  modified in place, and that key employee/hour cells are written. For every
  real-template sheet, inventory name/dimensions/merges/headers/target status/
  row and column metadata/key styles before and after. For every touched cell,
  compare normalized style properties rather than raw XF ids. Compare values,
  formulas and structure for every untouched sheet, verify special/nonstandard
  sheets and adjustment rows remain unchanged, and verify reliable-id,
  short-token, numeric-note and deterministic long ASCII/CJK dimension cases.
- Container-detail API tests should cover saving `海柜`, saving `美转加` with
  trailer number, rejecting `美转加` without trailer number, adding associated
  container numbers, marking `已拆完`, adding multiple unloaders, and rejecting
  duplicate unloaders.
- Container lifecycle tests should cover `LABELS_GENERATED -> UNLOADED` when
  marking unloading complete, no downgrade from `LOADING_IN_PROGRESS` or
  `LOADED`, and scan-only control of loaded pallet/container status.
- Temporary unloader directory tests should cover creating, editing,
  deactivating, listing active workers, selecting a directory worker in
  container detail, rejecting duplicate directory workers, and preserving
  historical snapshots after a name change.
- Unloading wage tests should cover ocean container CAD 300, US-to-Canada CAD
  360 for combined containers, monthly filtering by completion date, equal split
  across multiple unloaders, and settlement snapshot.
- UI tests should verify the container detail unloading wage section, trailer
  number conditional display, association add/remove, `已拆完`, unloader
  add/remove, monthly filter, settlement generation, and settlement detail.
- Monthly unloading data summary tests should verify month filtering,
  inclusion of `UNLOADED`, `LOADING_IN_PROGRESS`, and `LOADED`, review warnings
  for missing completion dates, and generated workbook/download records.
- Role tests should verify that `HR_MANAGER` can perform attendance settlement
  but cannot perform unloading wage settlement, and that `WAREHOUSE_MANAGER`
  can perform unloading wage settlement but cannot perform attendance
  settlement.
- Frontend permission tests should verify that `/work-hours`, `/unloading-wage`,
  and container-detail wage actions are visible only to the matching manager
  role or `ADMIN`.
- Work-hours browser tests should select multiple employee names, prove every
  employee's complete month is reachable, verify odd/even calculation labels
  in both locales, and cover mobile/desktop/200% zoom without mixed-language UI.
- Attendance-row deletion tests should cover authenticated actor attribution,
  required reason, idempotent repeat, wrong-import/not-found protection,
  read-only and cross-role 403s, active/deleted counts, immutable snapshots,
  repeated Parse without resurrection, generation excluding deleted rows,
  stale historical files, parse/generate race protection and en/zh-CN history
  UI behavior.
- Work-hours generated-file visibility tests should prove that the API still
  records and returns `ATTENDANCE_PARSED_JSON` and `TASK_REPORT_HTML`, while the
  English and Chinese page renders only `WAGE_RECORD_XLS` cards/download links.
  Cover SSR, hydration, refresh, generation completion, current/superseded/
  failed wage entries, unknown technical file types, mobile/desktop/200% zoom
  and zero mixed-language or hidden-accessible-link leakage.
- The final generated `.xls` downloaded through the real API must be opened by
  a Docker LibreOffice visual harness. Inspect the first, second, middle and last
  eligible employee sheets, plus structural checks across every sheet, for
  retained colors, borders, number formats, readable row heights/column widths
  and absence of clipped generated content.

### Revised Work Hours Exit Gate Evidence

`WAGE-HOURS-05` closed this revision on 2026-07-22 with the real June attendance
fixture and wage template. The nginx/API/PostgreSQL/Worker/Web flow verified 13
employees and 390 baseline rows, one attributed deletion leaving 389 active rows
and one immutable tombstone/event, repeated Parse without resurrection, and an
active-only replacement workbook while retaining the superseded baseline.

The downloaded legacy workbook retained all 10 sheets: seven matched attendance
sheets, two unmatched sheets and one special driver sheet. A normalized
all-cell BIFF comparison found zero style differences, Worker/API bytes matched,
the Wei Deng adjustment row remained, and the deletion changed only five expected
cells on the affected employee sheet. Docker LibreOffice rendered four workbook
states to 22 pages each; all contact sheets and high-signal original pages were
reviewed without generator-introduced clipping, style loss or special-sheet
overwrite. Chromium also closed English/Chinese, mobile/desktop, read-only,
Warehouse 403 and real 200% zoom behavior. No Microsoft Excel-only check remains
as a delivery blocker.

## Acceptance Criteria

- A developer can identify the first worker tasks without building UI first.
- The attendance workflow starts from real wage fixtures and outputs parsed
  JSON plus a generated wage workbook.
- Each employee can be selected by name and all rows for the imported month are
  reachable; no global 100-row truncation hides later employees.
- Odd punch counts calculate from first to last with an auditable fallback
  warning; even punch counts sum chronological pairs; fixed lunch is deducted
  once under the existing rule.
- All eligible generated wage sheets retain their own template formatting and
  use bounded content-aware dimensions; nonstandard sheets remain unchanged.
- An authorized HR manager can soft-delete an employee-day row with a reason;
  active summaries and newly generated workbooks exclude it, while the original
  workbook, raw row, previous files and attributed deletion history remain
  available and a repeat Parse does not restore the row.
- The Work Hours generated-file area exposes only wage workbook history and
  wage workbook downloads. Parsed JSON and task reports remain auditable in the
  backend but are absent from office-visible and accessibility-visible markup.
- Existing container detail includes unloading wage tag, trailer number,
  associated containers, unloading completion, and unloader rows.
- Temporary unloaders can be manually maintained without creating employee
  login accounts, and container detail selects from that directory.
- `HR_MANAGER` can manage work hours settlement and does not receive unloading
  wage settlement permissions by default.
- `WAREHOUSE_MANAGER` can manage unloading wage settlement and does not receive
  work hours settlement permissions by default.
- `海柜` uses one container number as one CAD 300 paid unit.
- `美转加` requires trailer number and can associate multiple container numbers
  as one CAD 360 paid unit.
- `已拆完` does not conflict with pallet loaded status or scan transaction
  rules.
- Clicking `标记已拆完` changes the visible container status from
  `LABELS_GENERATED` to `UNLOADED`.
- Monthly unloading data summary exports all containers completed in the month,
  including containers that later advanced to `LOADING_IN_PROGRESS` or
  `LOADED`.
- Multiple unloaders per container or transfer unit are supported from
  container detail.
- Monthly unloading settlement can generate each worker's wage and show which
  containers were unloaded that month.
- Unknown or missing payroll rules are explicitly listed as assumptions or open
  questions.

## Out of Scope

- Full payroll compliance, tax withholding, benefits, deductions, vacation pay,
  and statutory holiday calculation.
- Direct integration with the time-clock machine.
- Bank payment export.
- Mobile scan app changes.
- Replacing the existing unloading report, pallet label, inventory, or loading
  scan workflows.
- A separate warehouse-manager pay-container maintenance page as the primary
  workflow.

## Open Questions

- Does the wage record template require pay rate, gross wage, or only work
  hours?
- What is the official employee identifier in the attendance workbook: user id,
  employee number, name, or another field?
- For multiple unloaders on one container or transfer unit, is equal split
  always correct, or do managers need percentage/amount allocation from day one?
- Can one trailer number be reused for different transfer groups in the same
  month, or is trailer number unique enough to identify one combined paid unit?
- Should `HR_MANAGER` and `WAREHOUSE_MANAGER` be seeded as built-in role
  assignments for existing users during deployment, or should admins assign
  them manually after migration?
- Should temporary unloader worker codes be manually assigned, automatically
  generated, or optional as long as settlement snapshots keep a stable worker
  id and name?
