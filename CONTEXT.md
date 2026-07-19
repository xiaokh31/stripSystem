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
Current active delivery targets are Android and iOS. The Windows RNW/MSIX
installation-package route was archived by product decision on 2026-07-15;
its source boundaries and documents remain only as reactivation references.
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

**HR Manager**:
The business role that owns work hours settlement. This role can upload and
parse attendance records and generate wage records. It should not manage
unloading wage settlement by default.
_Avoid_: Office user, admin, warehouse manager

**Unloading Wage Settlement**:
The monthly settlement that calculates unloading pay for warehouse workers from
completed unloading work and the container pay classification.
_Avoid_: Payroll, attendance wage record

**Warehouse Manager**:
The business role that owns unloading wage settlement. This role can manage
container-detail unloading wage data and generate monthly unloading wage
settlements. It should not manage HR attendance wage records by default.
_Avoid_: Warehouse scan operator, HR manager

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
The list of temporary unloader directory workers credited with unloading a
container or associated US-to-Canada transfer group. Historical records may
still carry legacy user-backed worker IDs, but wage settlement uses the saved
worker code/name snapshot.
_Avoid_: Scan operator, load job creator, login user account

**Parser Learning Case**:
The auditable relationship between one failed original import and the manual
container/report outcome used to propose and verify a parser profile. It keeps
the source workbook, field provenance, corrections, completion snapshot and
replay result together.
_Avoid_: Parse retry, correction note, unloading completion

**Parser Profile**:
A named, versioned and approved definition for recognizing one workbook layout
and mapping its source cells into the warehouse's canonical unloading fields.
It is deterministic configuration, not a self-modifying machine-learning
model.
_Avoid_: Customer account, workbook filename, parser result

**Structural Fingerprint**:
The normalized workbook-layout evidence used to decide whether a parser
profile may be considered for an import, including sheets, header anchors and
relative column structure but not customer cargo values.
_Avoid_: File hash, customer name, filename pattern

**Profile Approval**:
The explicit authorized decision that a replayed parser-profile version is
allowed to process future matching imports in review-required mode. Unloading
completion makes a learning case eligible for replay; it does not approve the
mapping.
_Avoid_: Unloading completion, trusted auto-parse

**Profile Evidence Acceptance**:
The office review decision for one distinct imported workbook parsed by an
approved profile. Only an acceptance with no material parser correction counts
toward trusted automatic parsing.
_Avoid_: Reparse, report generation, unloading completion

**Trusted Auto-Parse**:
The trust state reached after an approved parser profile produces three
consecutive, distinct-SHA accepted imports with no material parser correction.
It permits
automatic parsing only while the workbook continues to satisfy the approved
structural matcher without ambiguity or drift.
_Avoid_: Profile approval, parse success, high confidence alone
