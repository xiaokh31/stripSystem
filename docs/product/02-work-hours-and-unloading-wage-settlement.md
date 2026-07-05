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
one or more unloader names.

Ocean containers pay CAD 300 per container number. US-to-Canada transfer work
pays CAD 360 per paid transfer unit. US-to-Canada transfer work often combines
multiple container numbers, for example `ZCSU1234567B+TGBU1234567B`, and that
combined work counts as one paid unit.

## Solution

Add two office workflows:

1. Work hours settlement: upload the monthly attendance record, parse punch
   rows, calculate each employee's payable work hours, and generate a wage
   record workbook from the real wage template.
2. Unloading wage settlement: add unloading wage fields directly to the
   existing container detail workflow, then add a monthly settlement page that
   summarizes those completed container records by worker.

The unloading wage feature must be anchored in existing container detail, not a
separate warehouse-manager data-entry workflow. If the backend uses an internal
grouping table for US-to-Canada transfer settlement, that is an implementation
detail behind the container detail page.

The delivery should follow the existing project order. Start with real fixtures
and batch-readable outputs, then add persistence/API, then add office web pages.

## Actors

- HR manager: uploads attendance records and reviews generated wage records.
- Warehouse manager: opens container detail, classifies the container, records
  trailer/association data, marks unloading as completed, assigns unloaders,
  and generates monthly unloading wage settlement.
- Office user: imports or manually creates containers in the existing office
  workflow.
- Admin: manages worker names/users and pay-rate settings.
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
13. As a warehouse manager, I want container detail to include unloader name
    selection, so that I can record who unloaded the container.
14. As a warehouse manager, I want an add-unloader action on container detail,
    so that I can add multiple workers to one container or combined transfer
    unit.
15. As a warehouse manager, I want a monthly unloading wage settlement page, so
    that I can generate each worker's unloading wage for the month.
16. As a warehouse manager, I want the monthly settlement to show which
    containers were unloaded that month, so that each worker total can be
    checked against the unloading report.
17. As an admin, I want pay rates stored as settings, so that CAD 300 and CAD
    360 can change later without changing code.

## Business Rules

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
- A day with an odd number of punch times is not silently calculated; it must be
  flagged for manual review.
- Default calculation assumption: pair punch times in chronological order and
  sum each pair as a work interval. This assumption must be confirmed against
  the target wage template before implementation is accepted.
- Overtime, statutory holiday pay, vacation pay, deductions, and tax/payroll
  compliance are out of scope unless the business provides explicit rules.

### Container Detail Unloading Wage Rules

- Every imported or manually created container detail must have an unloading
  wage section.
- The section must include:
  - container wage tag: `海柜` or `美转加`
  - trailer number, required only for `美转加`
  - associated container numbers, used only for `美转加` combined work
  - unloading status, including `已拆完`
  - unloader rows, each selecting one worker name
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
  completion, or unloaders after saving, the change must be audited.
- If completed unloading data is changed after a monthly settlement has been
  generated, the affected settlement must be marked stale, superseded, or needs
  review before it is used again.
- Default MVP allocation assumption: if multiple unloaders are selected and no
  specific allocation is provided, the paid amount is split equally. If the
  business does not accept equal split, the UI must add per-worker amount or
  percentage before production use.

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

## Data Concepts

- Attendance import: original attendance workbook plus SHA-256, parse status,
  parser version, warnings, errors, and raw metadata.
- Attendance row: one employee-day parsed from the workbook, preserving raw
  source data and calculated hours.
- Wage record file: generated workbook based on the wage template and recorded
  as a durable artifact.
- Container wage tag: the container detail field that classifies a container as
  `海柜` or `美转加`.
- Trailer number: required container detail field for `美转加`.
- Container wage association: the related container numbers that make one
  paid `美转加` transfer unit.
- Unloading completion: the `已拆完` state shown from container detail.
- Unloader assignment: one or more worker-name rows on container detail.
- Unloading wage settlement: monthly generated result by worker and by
  completed container or associated transfer unit.

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

### P1: Persistence and API

- Add or adjust schema so existing container records can expose unloading wage
  tag, trailer number, associated container numbers, unloading completion, and
  unloaders through container detail.
- Add API behavior for saving the unloading wage section from container detail.
- Add API behavior for generating monthly unloading wage settlement from saved
  container detail data.
- Preserve all uploaded source files and generated files.
- Record classification, association, completion, unloader, and settlement
  changes for audit.

### P2: Office Web UI

- Add a Work Hours Settlement page for HR.
- Add an unloading wage section to `/containers/[id]`.
- The `/containers/[id]` section must handle tag selection, trailer number,
  container association, `已拆完` status, unloader selection, and add-unloader.
- Add an Unloading Wage Settlement page for warehouse manager monthly review.

## Proposed API Surface

The exact route names can change during implementation, but the behavior should
be stable. The user-facing workflow must still start from container detail.

- `POST /api/attendance-imports`
- `POST /api/attendance-imports/:id/parse`
- `GET /api/attendance-imports/:id/parse-result`
- `POST /api/attendance-imports/:id/generate-wage-record`
- `GET /api/attendance-imports/:id/files`
- `PATCH /api/containers/:id/unloading-wage`
- `PATCH /api/containers/:id/unloading-wage-associations`
- `POST /api/containers/:id/complete-unloading`
- `PUT /api/containers/:id/unloaders`
- `POST /api/unloading-wage-settlements`
- `GET /api/unloading-wage-settlements`
- `GET /api/unloading-wage-settlements/:id`

If the backend keeps internal `pay_containers` or similar models, those models
should be created and updated by the container-detail APIs. They should not
force the warehouse manager to maintain a separate pay-container page before
using the existing container detail.

## UI Requirements

### Work Hours Settlement Page

- Upload one monthly `.xls` attendance workbook.
- Display filename, SHA-256, parse status, warning count, and error count.
- Show parsed employee/day rows before generation.
- Show warnings for missing employee, missing date, missing punch, odd punch
  count, and unsupported workbook layout.
- Generate and download the wage record workbook.
- Show generated file history.

### Container Detail Unloading Wage Section

Add this section to existing `/containers/[id]`.

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
  - should make incomplete records visibly excluded from settlement
- Unloader rows:
  - each row is one worker-name option
  - add action creates another unloader row
  - duplicate worker names in the same unit should be rejected
- Save action:
  - persists the section through the API
  - refreshes from API after save
  - shows validation errors for missing trailer number, missing unloaders, or
    invalid associated containers

### Unloading Wage Settlement Page

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

## Implementation Decisions

- Treat HR attendance wage records and warehouse unloading wage settlements as
  separate workflows. They share employee identities and generated-file/audit
  patterns, but they should not share parser models.
- Put the unloading wage entry workflow inside existing container detail.
- Do not overload `ContainerStatus.LOADED` for `已拆完`. Existing `LOADED` is
  tied to pallet loading scan transactions. Use a separate unloading completion
  concept for wage settlement.
- Use container records as the visible source for wage tag, trailer number, and
  association state. Internal settlement-unit records may exist, but they should
  be synchronized from container detail and treated as implementation details.
- Store pay rates as operational settings or rate records with effective dates.
  Do not hard-code CAD 300 and CAD 360 into calculation code only.
- Settlement generation should snapshot rates, associations, unloaders, and
  included container numbers so later changes do not silently rewrite
  historical wages.
- Permissions should follow existing roles: `ADMIN` and `OFFICE` can manage
  settings; warehouse-manager access may need a permission; ordinary
  `WAREHOUSE` users should not edit rates or approve settlement unless the
  business explicitly allows it.

## Testing Decisions

- Parser tests should use the real files in `samples/wage`.
- Detector tests should reject unsupported workbooks with explicit errors.
- Attendance calculation tests should cover normal four-punch days, missing
  punches, odd punch counts, blank rows, unknown columns, and duplicate uploads.
- Wage record generator tests should verify the template is copied, not
  modified in place, and that key employee/hour cells are written.
- Container-detail API tests should cover saving `海柜`, saving `美转加` with
  trailer number, rejecting `美转加` without trailer number, adding associated
  container numbers, marking `已拆完`, adding multiple unloaders, and rejecting
  duplicate unloaders.
- Unloading wage tests should cover ocean container CAD 300, US-to-Canada CAD
  360 for combined containers, monthly filtering by completion date, equal split
  across multiple unloaders, and settlement snapshot.
- UI tests should verify the container detail unloading wage section, trailer
  number conditional display, association add/remove, `已拆完`, unloader
  add/remove, monthly filter, settlement generation, and settlement detail.

## Acceptance Criteria

- A developer can identify the first worker tasks without building UI first.
- The attendance workflow starts from real wage fixtures and outputs parsed
  JSON plus a generated wage workbook.
- Existing container detail includes unloading wage tag, trailer number,
  associated containers, unloading completion, and unloader rows.
- `海柜` uses one container number as one CAD 300 paid unit.
- `美转加` requires trailer number and can associate multiple container numbers
  as one CAD 360 paid unit.
- `已拆完` does not conflict with pallet loaded status or scan transaction
  rules.
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

- Should attendance work hours subtract a fixed lunch break, use paired punch
  intervals, or follow another company rule?
- Does the wage record template require pay rate, gross wage, or only work
  hours?
- What is the official employee identifier in the attendance workbook: user id,
  employee number, name, or another field?
- For multiple unloaders on one container or transfer unit, is equal split
  always correct, or do managers need percentage/amount allocation from day one?
- Can one trailer number be reused for different transfer groups in the same
  month, or is trailer number unique enough to identify one combined paid unit?
- Who is allowed to mark `已拆完` and who is allowed to approve the monthly
  settlement?
