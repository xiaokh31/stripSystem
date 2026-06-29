# Warehouse Pilot Run Checklist

## How To Use

Run this checklist during warehouse pilot testing before Go-Live. Use real
warehouse users, real scanners, real printers, and real `.xlsx` unloading files.

Status values:

- Pass
- Fail
- N/A

Do not mark a section complete while a failed item has no owner or workaround.
Record every failure in the issue log.

## Run Information

| Field | Value |
| --- | --- |
| Date | |
| Warehouse | |
| Server OS | |
| System version / commit | |
| Office operator | |
| Warehouse scanner operator | |
| Supervisor | |
| Local IT owner | |
| Test container numbers | |
| Test load job numbers | |
| Backup directory | |
| Printer model | |
| Scanner / PDA model | |

## 1. Pre-Pilot Preparation

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Linux or Windows deployment runbook has been followed. | | |
| `.env` has non-default `POSTGRES_PASSWORD` and `JWT_SECRET`. | | |
| `docker compose -f infra/docker/compose.local.yml ps` shows all services healthy. | | |
| `scripts/healthcheck.sh` passes. | | |
| Office computer can open `http://<server-lan-ip>/`. | | |
| Phone/PDA can open `http://<server-lan-ip>/mobile/load-jobs`. | | |
| API health endpoint returns status OK. | | |
| `storage/` exists and is writable. | | |
| PostgreSQL data volume is persistent. | | |
| Backup directory is outside the repository. | | |
| Label printer has 150mm x 100mm labels loaded. | | |
| Print scaling is disabled. | | |
| Scanner sends keyboard input plus Enter. | | |
| Warehouse Wi-Fi coverage is acceptable at loading area. | | |
| Staff know who can approve restore or No-Go decision. | | |

## 2. Account And Permission Test

Use real pilot accounts. Do not use mock users as evidence of readiness.

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Default roles and permissions have been seeded. | | |
| Initial `ADMIN` account can log in. | | |
| `ADMIN` can call `GET /api/auth/me`. | | |
| `ADMIN` can call `GET /api/users`. | | |
| `OFFICE` account can log in. | | |
| `OFFICE` can access office import, container, report, and load job workflows. | | |
| `WAREHOUSE` account can log in on the mobile/PDA page. | | |
| `WAREHOUSE` can access assigned mobile load job and scan workflows. | | |
| `WAREHOUSE` is rejected from user management and office-only actions. | | |
| Disabled employee account cannot log in. | | |
| Password reset through API works and old password no longer works. | | |
| A manual correction or scan event records the authenticated `userId`. | | |
| No operator is instructed to manually edit user, role, or permission tables. | | |

## 3. Real XLSX Test

Use at least three real unloading files:

- one normal Chinese unloading plan
- one Bestar receiving report
- one file with known warnings or missing fields

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Upload real `.xlsx` unloading file. | | |
| Original uploaded Excel file is preserved in `storage/original_files/`. | | |
| SHA-256 is recorded for the upload. | | |
| Uploading the same file again is blocked or clearly reported as duplicate. | | |
| Parser detects the correct format. | | |
| Unknown file format shows explicit warning or error. | | |
| Parser errors are visible and not hidden. | | |
| Missing container number, destination, cartons, or volume shows warning/error. | | |
| Volume `0` with cartons greater than `0` shows warning. | | |
| Unknown columns remain traceable in raw JSON. | | |
| Manual container creation is available when source parsing fails. | | |

## 4. Report Generation Test

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Parsed destination totals are visible. | | |
| Cartons, volume, and pallet counts are understandable to office operator. | | |
| Manual destination correction can be saved when needed. | | |
| Manual pallet/final pallet correction can be saved when needed. | | |
| Correction feedback is stored and auditable. | | |
| Excel unloading report generates from imported container. | | |
| Excel unloading report generates from manually created container. | | |
| Generated report file is recorded in system. | | |
| Generated report opens in Excel. | | |
| Report values match reviewed container detail. | | |
| Regenerating report uses latest corrected data. | | |

## 5. Pallet Label Printing Test

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Label PDF generates from imported container. | | |
| Label PDF generates from manually created container. | | |
| Generated label file is recorded in system. | | |
| Label PDF page size is 150mm x 100mm. | | |
| Printed paper size is 150mm x 100mm. | | |
| QR physical size is about 25mm x 25mm. | | |
| Long destination text does not cover QR. | | |
| Date, container number, destination, pallet number, and QR are visible. | | |
| Reprint flow records audit event. | | |
| Reprinted label scans successfully. | | |
| Labels are not printed from screenshots. | | |

## 6. QR Scan Test

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Create or open a load job. | | |
| Scan valid pallet QR. | | |
| Scan result is clear to warehouse operator. | | |
| Pallet status changes to loaded only after accepted scan. | | |
| Pallet event is recorded. | | |
| Remaining pallet count decreases from backend/database state. | | |
| Inventory report refreshes after scan. | | |
| Invalid QR is rejected and recorded as an exception. | | |

## 7. Duplicate Scan Test

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Scan the same pallet twice in the same load job. | | |
| Second scan returns duplicate result. | | |
| Inventory does not decrement twice. | | |
| Duplicate event or audit entry is visible. | | |
| Scan the same pallet against a different load job. | | |
| System prevents incorrect loading or clearly reports the conflict. | | |
| Historical pallet events are not overwritten. | | |

## 8. Real Load Plan Test

Run the following scenarios with real or supervisor-approved pilot data. Do not
use mock data as evidence of business readiness.

### 8.1 One Truck, Multiple Containers

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Create one load job for a truck containing more than one container. | | |
| Pallets from container A can be scanned into the job. | | |
| Pallets from container B can be scanned into the same job. | | |
| Inventory report separates source containers correctly. | | |
| Closing the load job preserves all scan events. | | |

### 8.2 Single Container, Partial Pallets

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Create a load job that loads only part of one container. | | |
| Scan only selected pallets. | | |
| Loaded pallets show loaded. | | |
| Unscanned pallets remain available / not loaded. | | |
| Remaining inventory equals backend pallet state. | | |

### 8.3 Same Container Split Into Multiple Load Jobs

Use a real split such as `part1` and `part2`.

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Create load job `part1` for part of the container. | | |
| Create load job `part2` for the remaining pallets. | | |
| Pallets scanned in `part1` cannot decrement inventory again in `part2`. | | |
| `part2` can load only pallets not already loaded. | | |
| Reports show total loaded and remaining correctly. | | |
| Closing `part1` does not block valid `part2` scans. | | |

### 8.4 External Transfer Freight

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| External transfer freight can be represented in container/load job workflow. | | |
| Destination and note make transfer status clear to office operator. | | |
| Pallet labels identify transfer destination clearly. | | |
| Scan result is clear to warehouse operator. | | |
| Inventory report does not mix transfer freight with normal unload freight incorrectly. | | |

### 8.5 Pure Transfer Truck

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Create a load job for a truck carrying only transfer freight. | | |
| Scan all transfer pallets. | | |
| No unrelated unload pallets are required to close the job. | | |
| Closing the job records all transfer pallet events. | | |
| Inventory remaining is correct after truck departure. | | |

## 9. Offline Scan Test

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Open mobile/PDA load job page while online. | | |
| Disconnect phone/PDA network. | | |
| Scan pallet while offline. | | |
| Scan enters pending/offline queue. | | |
| UI does not claim confirmed inventory change while pending. | | |
| Scan multiple pallets while offline. | | |
| Reconnect network. | | |
| Pending scans sync successfully. | | |
| Duplicate retry does not decrement inventory twice. | | |
| Failed sync item shows actionable error. | | |

## 10. Power Loss / Restart Test

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Run backup before restart test. | | |
| Stop services with `docker compose -f infra/docker/compose.local.yml down`. | | |
| Start services with `docker compose -f infra/docker/compose.local.yml up -d`. | | |
| `scripts/healthcheck.sh` passes after restart. | | |
| Uploaded original files remain. | | |
| Generated reports and label PDFs remain. | | |
| Database records remain. | | |
| Existing load jobs and scan events remain. | | |
| Inventory report still matches pallet states. | | |
| Phone/PDA can reconnect after restart. | | |

Optional host reboot test:

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Reboot the host. | | |
| Start Docker Desktop or Docker Engine if needed. | | |
| Start services again. | | |
| Healthcheck and office/mobile access pass. | | |

## 11. Backup Restore Test

Do not run confirmed restore against live pilot data unless supervisor and
local IT approve it. Prefer a non-production restore target.

| Item | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| PostgreSQL backup completes. | | |
| Storage backup completes. | | |
| Backup files are stored outside repository. | | |
| Backup files are non-empty. | | |
| PostgreSQL restore dry-run works. | | |
| Storage restore dry-run works. | | |
| Confirmed restore succeeds in non-production environment. | | |
| API health is OK after restore. | | |
| Known uploaded Excel file exists after restore. | | |
| Known generated report or label PDF exists after restore. | | |
| Inventory query works after restore. | | |

## 12. Issue Log

Severity values:

- Blocker: must fix before Go-Live.
- Major: must have owner, workaround, and supervisor approval.
- Minor: does not block pilot but must be tracked.

| ID | Time | Area | Severity | Description | Evidence / Screenshot | Owner | Workaround | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |

## 13. Go / No-Go Decision

### Blockers

Any one of these is an automatic No-Go:

| Blocker | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| Initial `ADMIN` account cannot log in after deployment. | | |
| Role-based access control allows a user to perform forbidden actions. | | |
| Manual correction or scan audit records are missing authenticated `userId`. | | |
| Original uploaded files are not preserved. | | |
| Duplicate imports are not detected by SHA-256. | | |
| Parser failures are hidden or silently ignored. | | |
| Missing destination/cartons/volume/container data has no warning/error. | | |
| Manual correction is not stored or not auditable. | | |
| Generated reports or labels are not recorded. | | |
| Label PDF is not 150mm x 100mm. | | |
| QR payload does not contain a unique pallet ID. | | |
| Printed labels cannot be scanned reliably. | | |
| Pallet loaded status changes without scan transaction. | | |
| Duplicate scan decrements inventory twice. | | |
| Historical pallet events are overwritten. | | |
| Remaining inventory is calculated only from frontend state. | | |
| Offline scan queue loses scans or confirms inventory incorrectly. | | |
| Backup or restore dry-run cannot be executed. | | |
| System cannot restart without losing database or `storage/` files. | | |

### Go Criteria

| Requirement | Pass / Fail / N/A | Remarks |
| --- | --- | --- |
| All blocker rows above are Pass or N/A with supervisor approval. | | |
| All failed Major issues have owner and workaround. | | |
| ADMIN, OFFICE, and WAREHOUSE role tests have passed. | | |
| Office operator can complete upload, parse, correction, report, and labels. | | |
| Warehouse operator can complete scan workflow on PDA/phone. | | |
| Supervisor accepts one truck / multiple container workflow. | | |
| Supervisor accepts partial pallet workflow. | | |
| Supervisor accepts split load job workflow such as part1/part2. | | |
| Supervisor accepts transfer freight workflow. | | |
| Backup location and restore process are confirmed. | | |
| Local IT knows how to collect logs and restart services. | | |

## Sign-Off

| Role | Name | Go / No-Go | Signature / Initials | Time |
| --- | --- | --- | --- | --- |
| Warehouse supervisor | | | | |
| Office operator | | | | |
| Loading operator | | | | |
| Local IT | | | | |

Final decision:

```text
Go / No-Go:
Reason:
Required follow-up before production:
```
