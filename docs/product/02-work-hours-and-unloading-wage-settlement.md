# Work Hours and Unloading Wage Settlement Plan

## Problem Statement

The office currently performs two monthly wage-related tasks manually in Excel.

The HR manager downloads the monthly employee attendance workbook from the time
clock, for example `samples/wage/workAttendanceRecordForm_June.xls`, and
calculates each employee's work hours into a wage record workbook matching the
format of `samples/wage/20260601-0630_wageRecords.xls`.

The warehouse manager calculates unloading worker pay from completed unloading
work. Ocean containers pay CAD 300 per pay container. US-to-Canada transfer
work pays CAD 360 per pay container, but one paid unit may group multiple
container numbers under one trailer number, such as
`ZCSU1234567B+TGBU1234567B`.

The system needs product scope for these workflows that developers can
implement without guessing payroll rules or breaking existing unloading,
pallet, loading scan, inventory, correction, and audit behavior.

## Solution

Add two office workflows:

1. Work hours settlement: upload the monthly attendance record, parse punch
   rows, calculate each employee's payable work hours, and generate a wage
   record workbook from the real wage template.
2. Unloading wage settlement: classify each imported or manually created
   container into an unloading pay category, group US-to-Canada containers by
   trailer number, mark unloading work as completed, assign one or more
   unloaders, and generate a monthly settlement showing each worker's pay and
   the containers they unloaded.

The delivery should follow the existing project order. Start with the real wage
fixtures and worker batch outputs, then add persistence/API, then add office
web pages.

## Actors

- HR manager: uploads attendance records and reviews generated wage records.
- Warehouse manager: classifies containers, marks unloading completion, assigns
  unloaders, and reviews monthly unloading wage settlement.
- Office user: imports or manually creates containers in the existing office
  workflow.
- Admin: manages employee/user records and pay settings.
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
   to have a container pay classification, so that unloading wages can be
   calculated consistently.
8. As a warehouse manager, I want to select ocean container or US-to-Canada
   transfer, so that the correct rate is applied.
9. As a warehouse manager, I want US-to-Canada transfer work to require a
   trailer number, so that multiple container numbers can be grouped into one
   pay container.
10. As a warehouse manager, I want an ocean container to count as one pay
    container by its container number, so that the CAD 300 rate is applied once
    per container.
11. As a warehouse manager, I want to mark a pay container as unloading
    completed, so that it becomes eligible for monthly settlement.
12. As a warehouse manager, I want to add multiple unloaders to one completed
    pay container, so that shared unloading work is credited to all workers who
    participated.
13. As a warehouse manager, I want monthly settlement by worker, so that I can
    see each worker's unloading wage total.
14. As a warehouse manager, I want the settlement to list the containers or
    trailer groups each worker unloaded, so that the wage amount is explainable.
15. As an admin, I want pay rates stored as configurable settings, so that CAD
    300 and CAD 360 can change later without changing code.

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

### Unloading Wage Rules

- Every imported or manually created container needs a container pay
  classification before it can be included in unloading wage settlement.
- `OCEAN_CONTAINER` pay classification:
  - One container number is one pay container.
  - Default rate is CAD 300.
- `US_TO_CANADA_TRANSFER` pay classification:
  - Trailer number is required.
  - Multiple container numbers may belong to one pay container when they share
    the same trailer settlement group.
  - Default rate is CAD 360 per pay container, not per individual container
    number inside the trailer group.
- Unloading completion is separate from pallet loaded status. A pay container
  can be unloaded for wage purposes before pallets are loaded onto outbound
  trucks.
- Only completed unloading work can be included in monthly settlement.
- Completion must record completed date/time, completing user, and assigned
  unloaders.
- A pay container may have multiple unloaders.
- Default allocation assumption: when multiple unloaders are assigned and no
  manual allocation is entered, the pay amount is split equally by worker.
- Manual allocation should be supported before production payroll use. The
  system should allow either percentage/share or explicit amount overrides and
  record the change for audit.
- Reopening or changing a completed unloading assignment after settlement must
  be audited and should mark the affected settlement as needing regeneration or
  review.

## Data Concepts

- Attendance import: original attendance workbook plus SHA-256, parse status,
  parser version, warnings, errors, and raw metadata.
- Attendance row: one employee-day parsed from the workbook, preserving raw
  source data and calculated hours.
- Wage record file: generated workbook based on the wage template and recorded
  as a durable artifact.
- Pay container: one settlement unit for unloading wages.
- Container pay classification: ocean container or US-to-Canada transfer.
- Trailer number: required group key for US-to-Canada transfer pay containers.
- Unloader assignment: workers credited to a completed pay container, with
  optional allocation share or amount.
- Unloading wage settlement: monthly generated result by worker and by pay
  container.

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

### UNLOAD-WAGE-P0: Unloading Wage Batch Prototype

- Produce a batch-readable input shape from existing container data or a small
  reviewed fixture that references real container numbers.
- Validate pay classification, trailer grouping, completion date, and unloader
  assignment rules.
- Emit monthly settlement JSON and an HTML task report.
- Confirm allocation math against warehouse manager expectations.

### P1: Persistence and API

- Add schema for attendance imports, attendance rows, wage generated files, pay
  containers, unloader assignments, and wage settlements.
- Add API routes for attendance upload/parse/generate and unloading pay
  classification/completion/settlement.
- Preserve all uploaded source files and generated files.
- Record corrections and setting changes for audit.

### P2: Office Web UI

- Add a Work Hours Settlement page for HR.
- Add container pay classification controls to import/manual container review.
- Add unloading completion and unloader assignment controls to the container or
  pay container workflow.
- Add an Unloading Wage Settlement page for warehouse manager review.

## Proposed API Surface

The exact route names can change during implementation, but the behavior should
be stable.

- `POST /api/attendance-imports`
- `POST /api/attendance-imports/:id/parse`
- `GET /api/attendance-imports/:id/parse-result`
- `POST /api/attendance-imports/:id/generate-wage-record`
- `GET /api/attendance-imports/:id/files`
- `PATCH /api/containers/:id/pay-classification`
- `POST /api/pay-containers`
- `PATCH /api/pay-containers/:id`
- `POST /api/pay-containers/:id/complete-unloading`
- `POST /api/unloading-wage-settlements`
- `GET /api/unloading-wage-settlements`
- `GET /api/unloading-wage-settlements/:id`

## UI Requirements

### Work Hours Settlement Page

- Upload one monthly `.xls` attendance workbook.
- Display filename, SHA-256, parse status, warning count, and error count.
- Show parsed employee/day rows before generation.
- Show warnings for missing employee, missing date, missing punch, odd punch
  count, and unsupported workbook layout.
- Generate and download the wage record workbook.
- Show generated file history.

### Container Pay Classification

- For each imported or manually created container, require selection of ocean
  container or US-to-Canada transfer before unloading wage settlement.
- Ocean container requires a container number and uses one pay container per
  container.
- US-to-Canada transfer requires trailer number and allows more than one
  container number in the same pay container.
- Show classification status in container list/detail so unclassified
  containers are visible.

### Unloading Completion and Assignment

- Provide an action to mark unloading completed.
- Capture completed date/time, unloaders, optional note, and allocation method.
- Allow adding/removing unloader rows before settlement finalization.
- After a pay container is included in a settlement, changes require explicit
  audit reason and should mark the settlement stale or superseded.

### Unloading Wage Settlement Page

- Filter by month.
- Show summary by worker: worker name, number of pay containers, gross
  unloading wage amount, and review status.
- Show detail rows: pay container, classification, trailer number when present,
  included container numbers, completion date, total rate, allocation, and
  worker amount.
- Generate a monthly settlement artifact and record it.

## Implementation Decisions

- Treat HR attendance wage records and warehouse unloading wage settlements as
  separate workflows. They share employee identities and generated-file/audit
  patterns, but they should not share parser models.
- Do not overload `ContainerStatus.LOADED` for unloading completion. Existing
  `LOADED` is tied to pallet loading scan transactions. Use a separate
  unloading completion concept.
- Reuse existing container records for imported and manually created container
  numbers, but introduce a pay container concept for settlement because
  US-to-Canada transfer work can group multiple container numbers into one paid
  unit.
- Store pay rates as operational settings or rate records with effective dates.
  Do not hard-code CAD 300 and CAD 360 into calculation code only.
- Settlement generation should snapshot rates, allocations, and included
  containers so later rate changes do not silently rewrite historical wages.
- Permissions should follow existing roles: `ADMIN` and `OFFICE` can manage
  settings; HR access may need a new role or permission; `WAREHOUSE` should not
  edit wage rates.

## Testing Decisions

- Parser tests should use the real files in `samples/wage`.
- Detector tests should reject unsupported workbooks with explicit errors.
- Attendance calculation tests should cover normal four-punch days, missing
  punches, odd punch counts, blank rows, unknown columns, and duplicate uploads.
- Wage record generator tests should verify the template is copied, not
  modified in place, and that key employee/hour cells are written.
- Unloading wage tests should cover ocean container rate, US-to-Canada trailer
  grouping, multiple container numbers under one trailer, multiple unloaders,
  default equal split, manual allocation override, and settlement snapshot.
- API tests should verify permissions, audit records, duplicate SHA-256, stale
  settlement behavior, and error responses.
- UI tests should verify upload, parse warning display, generation links,
  classification, unloader add/remove, monthly filter, and settlement detail.

## Acceptance Criteria

- A developer can identify the first worker tasks without building UI first.
- The attendance workflow starts from real wage fixtures and outputs parsed
  JSON plus a generated wage workbook.
- The unloading wage workflow distinguishes ocean container, US-to-Canada
  transfer, trailer number, pay container, and physical container number.
- Unloading completion does not conflict with pallet loaded status or scan
  transaction rules.
- Multiple unloaders per pay container are supported.
- Monthly unloading settlement can explain each worker total from included pay
  containers.
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

## Open Questions

- Should attendance work hours subtract a fixed lunch break, use paired punch
  intervals, or follow another company rule?
- Does the wage record template require pay rate, gross wage, or only work
  hours?
- What is the official employee identifier in the attendance workbook: user id,
  employee number, name, or another field?
- For multiple unloaders on one pay container, is equal split always correct,
  or do managers need percentage/amount allocation from day one?
- Can a US-to-Canada trailer group span multiple calendar months, or should the
  settlement month be based only on unloading completion date?
- Who is allowed to mark unloading completed and who is allowed to approve the
  monthly settlement?
