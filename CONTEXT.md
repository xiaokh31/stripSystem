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

**Container Wage Tag**:
The business tag shown on a container detail page that classifies the container
as ocean container or US-to-Canada transfer for unloading wage settlement.
_Avoid_: Destination type, source format, pallet label

**Container Pay Classification**:
The business category that determines the unloading pay rate. Current
categories are ocean container and US-to-Canada transfer.
_Avoid_: Destination type, source format

**Trailer Number**:
The trailer identifier required for US-to-Canada transfer containers.
_Avoid_: Container number, truck number

**Container Wage Association**:
The relationship between container numbers that should be treated as one paid
US-to-Canada transfer unit because they belong to the same trailer work.
_Avoid_: Load job line, destination group

**Unloading Completion**:
The business state shown on container detail that marks the container or its
US-to-Canada transfer association as finished for unloading wage settlement. It
is separate from pallet loading completion.
_Avoid_: Loaded, load job completed

**Unloader Assignment**:
The list of warehouse workers credited with unloading a container or associated
US-to-Canada transfer group.
_Avoid_: Scan operator, load job creator
