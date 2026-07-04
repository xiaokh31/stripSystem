# Bestar Warehouse Context

Bestar Warehouse Unloading System manages unloading, pallet inventory, loading
plans, scan transactions, and warehouse audit workflows.

## Language

**Office Web App**:
The browser-based application used by office staff for imports, reports,
container corrections, load job planning, settings, and account management.
_Avoid_: Mobile scan app, native scan app

**Web Mobile Scan Page**:
The existing browser/PWA mobile scan surface under `/mobile/*`; it is useful as
a workflow reference but remains subject to browser camera and HTTPS rules.
_Avoid_: Native app, installed scan app

**Native Scan App**:
An installed warehouse scanning application for Windows, Android, and iOS that
contains only login and mobile scan workflows and uses native camera access.
_Avoid_: Web app, PWA, browser scan page, office app

**Scan Transaction**:
A backend-accepted pallet scan operation that changes inventory state and writes
the historical pallet event.
_Avoid_: Local scan, frontend inventory update

**Attendance Record**:
The raw monthly time-clock workbook downloaded by the HR manager. It is the
source record for employee punch times and must stay distinguishable from a
generated wage record.
_Avoid_: Wage record, payroll sheet

**Wage Record**:
The generated monthly workbook that summarizes each employee's payable work
hours from an attendance record.
_Avoid_: Attendance record, punch log

**Unloading Wage Settlement**:
The monthly settlement that calculates unloading pay for warehouse workers from
completed unloading work and the container pay classification.
_Avoid_: Payroll, attendance wage record

**Pay Container**:
The unit counted for unloading pay settlement. For ocean containers it is one
container number; for US-to-Canada transfer work it may be a grouped trailer
work unit containing multiple imported or manually created container numbers.
_Avoid_: Physical container, load job

**Container Pay Classification**:
The business category that determines the pay rate for a pay container.
Current categories are ocean container and US-to-Canada transfer.
_Avoid_: Destination type, source format

**Trailer Number**:
The trailer identifier required for US-to-Canada transfer pay containers.
_Avoid_: Container number, truck number

**Unloading Completion**:
The business state that marks a pay container as finished for unloading wage
settlement. It is separate from pallet loading completion.
_Avoid_: Loaded, load job completed

**Unloader Assignment**:
The list of warehouse workers credited with unloading a pay container.
_Avoid_: Scan operator, load job creator
