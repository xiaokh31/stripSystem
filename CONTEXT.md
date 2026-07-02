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
