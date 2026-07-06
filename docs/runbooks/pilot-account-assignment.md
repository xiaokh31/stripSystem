# Pilot Account Assignment Manual

## Scope

Use this manual to prepare real named accounts for a warehouse production pilot.

This document does not add roles or permissions. It only describes how to assign
the roles that already exist in the system.

## Rules

- Use one account per person. Do not share operator accounts.
- Do not use E2E, smoke-test, or demo accounts in pilot.
- Do not manually insert users, password hashes, roles, or permissions in
  PostgreSQL.
- Use the admin UI or the `/api/users` account-management API.
- Store temporary passwords in the approved company password handoff process.
- Disable departed or inactive employees instead of deleting them.
- Keep `SYSTEM` for services only; do not use it for browser login.

## Role Assignment Summary

| Role | Assign To | Main Access | Do Not Use For |
| --- | --- | --- | --- |
| `ADMIN` | System owner and one backup local IT/admin person. | Users, roles, settings, all operational areas. | Daily warehouse scanning or routine office work. |
| `OFFICE` | Office operators who import Excel files, correct containers, generate reports/labels, and plan load jobs. | Imports, containers, reports, labels, inventory, load jobs. | HR work-hours settlement or warehouse unloading wage settlement by default. |
| `WAREHOUSE` | Loading/scanning operators who need mobile/PDA access. | Mobile load jobs, scans, inventory read. | User management, report/label regeneration, wage settlement generation. |
| `HR_MANAGER` | HR manager or payroll reviewer responsible for monthly work-hours settlement. | Work Hours Settlement only. | Unloading wage settlement unless another role explicitly grants it. |
| `WAREHOUSE_MANAGER` | Warehouse supervisor responsible for container detail unloading wage and monthly unloading settlement. | Container detail unloading wage, unloader assignment, monthly unloading wage settlement. | HR attendance/work-hours settlement unless another role explicitly grants it. |
| `SYSTEM` | Worker/service account only. | Scripted internal operations. | Interactive login. |

Users with multiple active roles receive the union of those role permissions.
Avoid assigning multiple roles unless the warehouse supervisor approves the
combined access.

## Pre-Pilot Roster

Prepare the roster before creating accounts.

| Person | Email | Display name | Role codes | Needs mobile/PDA login? | Needs wage access? | Backup person | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | `ADMIN` | no | no | | |
| | | | `OFFICE` | no | no | | |
| | | | `WAREHOUSE` | yes | no | | |
| | | | `HR_MANAGER` | no | HR work hours | | |
| | | | `WAREHOUSE_MANAGER` | no | unloading wage | | |

For unloading wage worker selection, selectable unloaders are maintained in the
temporary unloader directory. They do not need login accounts, email addresses,
passwords, or `WAREHOUSE` roles. The monthly settlement stores the worker
code/name snapshot when unloaders are saved, so later name changes do not
rewrite historical settlement lines.

## Create Accounts

Start from the local Docker/nginx full-stack route:

```text
http://<server-lan-ip>/
```

Preferred browser path:

1. Log in as `ADMIN`.
2. Open Admin -> Users.
3. Create a user with the real email, display name, temporary password, and
   role codes from the roster.
4. Record the account in the roster.
5. Have the assigned person log in and verify access.

API fallback:

```bash
curl -sS -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin-email>","password":"<admin-password>"}'

TOKEN='<accessToken from login response>'

curl -sS -X POST http://localhost/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "<person-email>",
    "name": "<person-display-name>",
    "password": "<unique-temporary-password>",
    "roleCodes": ["WAREHOUSE"]
  }'
```

Use `roleCodes` from the roster, for example:

```json
["OFFICE"]
["WAREHOUSE"]
["HR_MANAGER"]
["WAREHOUSE_MANAGER"]
["ADMIN"]
```

## Password Handoff

Minimum rules:

- Use unique passwords per account.
- Do not send passwords in group chat.
- Do not keep passwords in the repository.
- Do not reuse E2E credentials.
- After handoff, record only that the handoff happened, not the password.

| Person | Account created | Password handed off | Login verified | Initials |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |

## Access Verification

Run these checks with real pilot accounts.

### ADMIN

| Check | Pass / Fail / N/A | Evidence |
| --- | --- | --- |
| Can log in. | | |
| Can open Admin -> Users. | | |
| Can open Admin -> Roles. | | |
| Can disable and re-enable a test-designated account. | | |
| Can reset a password. | | |

### OFFICE

| Check | Pass / Fail / N/A | Evidence |
| --- | --- | --- |
| Can log in. | | |
| Can upload/import unloading Excel files. | | |
| Can open container detail and save normal corrections. | | |
| Can generate unloading reports and label PDFs. | | |
| Can create and manage load jobs. | | |
| Cannot open Admin -> Users. | | |
| Does not see Work Hours Settlement unless explicitly assigned `HR_MANAGER`. | | |
| Does not see Warehouse Unloading Wage Settlement unless explicitly assigned `WAREHOUSE_MANAGER`. | | |

### WAREHOUSE

| Check | Pass / Fail / N/A | Evidence |
| --- | --- | --- |
| Can log in on mobile/PDA route. | | |
| Can see open/in-progress load jobs. | | |
| Can scan pallets and see backend-confirmed results. | | |
| Can reverse scans only where permitted. | | |
| Cannot open Admin -> Users. | | |
| Cannot generate reports or labels. | | |
| Cannot generate HR work-hours records. | | |
| Cannot generate unloading wage settlements. | | |

### HR_MANAGER

| Check | Pass / Fail / N/A | Evidence |
| --- | --- | --- |
| Can log in. | | |
| Can open Work Hours Settlement. | | |
| Can upload the monthly attendance `.xls` workbook. | | |
| Can parse attendance and generate wage record workbook. | | |
| Can download generated wage files. | | |
| Cannot open Warehouse Unloading Wage Settlement. | | |
| Cannot save container detail unloading wage fields. | | |

### WAREHOUSE_MANAGER

| Check | Pass / Fail / N/A | Evidence |
| --- | --- | --- |
| Can log in. | | |
| Can open container detail unloading wage section. | | |
| Can create/select active temporary unloaders from the unloader directory. | | |
| Can mark unloading completed for wage settlement. | | |
| Can open Warehouse Unloading Wage Settlement. | | |
| Can generate monthly unloading wage settlement. | | |
| Cannot open Work Hours Settlement. | | |
| Cannot upload or parse attendance workbooks. | | |

## Worker Directory Rules

The unloading wage worker selector is not free text for new assignments.

- Selectable unloaders are active records in the temporary unloader directory.
- Temporary unloaders do not need system login accounts.
- Inactive directory records are not selectable for new unloader assignments.
- Historical unloading wage settlement lines keep saved worker name/code
  snapshots.
- If a temporary worker should no longer be selected, deactivate the directory
  record after the final approved settlement review. Do not delete rows that may
  be referenced by historical assignments.
- If a saved legacy worker name appears, the warehouse manager must reselect or
  create a temporary unloader directory record before saving unloaders again.

## Disable Or Change Accounts

Disable an inactive employee:

```http
PATCH /api/users/:id/status
```

Payload:

```json
{ "isActive": false }
```

Reset a password:

```http
POST /api/users/:id/reset-password
```

Payload:

```json
{ "password": "Use-A-New-Unique-Password-123!" }
```

Update role assignments through the admin UI or:

```http
PATCH /api/users/:id/roles
```

Payload:

```json
{ "roleCodes": ["OFFICE"] }
```

Do not delete accounts to hide history. Audit records and generated files may
reference historical users.

## Pilot Sign-Off

| Check | Pass / Fail / N/A | Evidence |
| --- | --- | --- |
| Primary and backup `ADMIN` accounts are known to supervisor/local IT. | | |
| Every office operator has a named `OFFICE` account. | | |
| Every scanning operator has a named `WAREHOUSE` account. | | |
| HR work-hours user has `HR_MANAGER` only unless extra access is approved. | | |
| Warehouse wage supervisor has `WAREHOUSE_MANAGER` only unless extra access is approved. | | |
| Selectable unloaders are active temporary unloader directory records, not login accounts. | | |
| E2E/smoke/test accounts are disabled or excluded from pilot use. | | |
| Permission-denied checks were verified for each role. | | |
| No one edited account tables manually. | | |
