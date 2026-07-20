# API Contracts

## API Owner

The NestJS API lives in:

```text
apps/api
```

Required baseline:
- Global prefix: `/api`.
- Health endpoint: `GET /api/health`.
- Prisma access through a service/module, not ad hoc client creation in every
  controller.
- DTO validation for request bodies and query parameters.
- Explicit errors for failed upload, parse, generation, correction, scan, and
  reprint operations.

## P1 Routes

### Health

```http
GET /api/health
```

Response should include:
- `status`
- `version`
- database connection status
- `timestamp`

Database connection failure must be visible in the response and tests.

### Import Files

```http
POST /api/imports
GET /api/imports
GET /api/imports/:id
```

Upload rules:
- Accept only `.xlsx`.
- Preserve original file bytes in storage.
- Compute `file_sha256`.
- Reject duplicate SHA-256 or return the existing import state clearly.
- Write `import_files`.
- Do not call the parser in this endpoint.
- Do not report success if file storage or database write failed.

Expected response fields:
- import id
- original filename
- stored path or download-safe reference
- file SHA-256
- import status
- parse status
- format when known
- warning/error counts when known

### Worker Parse Integration

```http
POST /api/imports/:id/parse
GET /api/imports/:id/parse-result
```

Rules:
- Load `import_files.stored_path`.
- Resolve the current pallet policy once and pass that exact snapshot to the
  Python parser/worker integration for that file.
- Persist parser output to:
  - `containers`
  - `container_lines`
  - `container_destinations`
- Store parse warnings/errors.
- Set `import_files.parse_status` accurately.
- Store `parser_version`.
- Preserve original file path.
- Failed parse must not create a false successful container.

Mapping from worker to DB:
- `parsed_result.containerNo` -> `containers.container_no`
- `parsed_result.formatType` -> `containers.source_format`
- `parsed_result.parserVersion` -> `containers.parser_version`
- `parsed_result.rawMetadata` -> `containers.raw_json` or
  `import_files.raw_metadata` as appropriate
- `parsed_result.lines[].raw_json` -> `container_lines.raw_json`
- `destinationSummaries[]` + pallet calculation -> `container_destinations`
- `pallet_result.plans[].policySnapshot` ->
  `container_destinations.pallet_policy_snapshot`

Python and TypeScript calculations use stable rule codes and exact decimal
strings. New calculations must agree on destination group, capacity, rounding,
calculated pallets, warning codes, and the complete policy snapshot.

### Parser Learning Cases

```http
POST /api/parser-learning-cases
GET /api/parser-learning-cases/:id
POST /api/parser-learning-cases/:id/link-container
POST /api/parser-learning-cases/:id/unlink-container
POST /api/parser-learning-cases/:id/close
```

Rules:
- Start requires `parser_profiles.train` and an `ERROR`, `WARNING`, or
  unknown/not-parsed import. It is idempotent and locks the source import row so
  concurrent start/delete cannot pass a stale deletion check.
- Read requires `parser_profiles.read` and returns stable source/result ids,
  source SHA, source raw metadata, manual-result raw metadata, and state.
- A result must be a standalone `MANUAL` / `manual-entry-v1` container. The
  optional `learningCaseId` on `POST /api/containers/manual` commits container,
  destinations, correction audit, and link in one transaction.
- Import deletion takes the same row lock, checks learning/evidence before any
  file cleanup, commits `IMPORT_DELETE_BLOCKED`, then returns
  `IMPORT_USED_BY_PARSER_LEARNING`. Later evidence writers must follow the same
  import-row lock protocol.
- Unlink/close are permissioned and audited. Close releases only a
  dependency-free draft's active links; immutable id/SHA provenance remains.
- Validation and business failures expose stable codes such as
  `PARSER_LEARNING_VALIDATION_FAILED`; Web maps codes/enums through separate
  English and Chinese labels.

### Parser Profile Review Gate

```http
GET /api/imports/:id/profile-review
POST /api/imports/:id/profile-review/accept
POST /api/imports/:id/profile-review/correct
POST /api/imports/:id/profile-review/reject
```

Rules:
- A unique match against an `ACTIVE + REVIEW_REQUIRED` exact profile version
  stores an immutable staged snapshot and sets the import to
  `REVIEW_REQUIRED`; it does not create a formal container, report, pallet, or
  inventory record.
- The snapshot pins the import SHA, profile/fingerprint/matcher/mapping/Worker
  versions, canonical rows, provenance, warnings/errors, pallet policy,
  destinations, and report preview.
- Read requires both import and parser-profile read grants. Decisions require
  `parser_profiles.review`, `containers.update`, and `corrections.create`.
- Accept/correct locks the review, import, and exact profile-version rows.
  Formal container/line/destination persistence, evidence, audit, streak, and
  possible trust promotion commit in one transaction.
- The staged-write transaction re-checks that the exact version is still
  `ACTIVE + REVIEW_REQUIRED`. Match/execute failures are audit events; a
  no-match/collision preserves built-in precedence, while execution failure
  after a unique legal match is an explicit import error.
- Parser errors block accept/correct from creating false-success formal data.
  Corrected/final data is persisted separately and never overwrites staged
  canonical, provenance, warning, or error evidence.
- The server computes material correction from persisted staged data and the
  allowlisted corrected canonical result. Clients never submit a material flag,
  streak, or trust state.
- A no-change acceptance from a distinct import SHA advances the consecutive
  streak up to `3/3`. A material correction or rejection records actor/reason/
  diff/time and resets the streak to zero without deleting history.
- The third consecutive valid acceptance promotes only that exact profile
  version to `TRUSTED`. Unique evidence plus row locks make repeat/concurrent
  acceptance idempotent and prevent duplicate containers or `4/3`.
- Reference, delivery, and package edits reset the streak only when the
  server-calculated grouping or pallet outcome changes. Outcome-neutral edits
  remain audited accepted evidence. Source/mapping changes continue through
  explicit match rejection and the immutable-version fork workflow.
- Responses expose stable codes/raw evidence, short SHA values, and bounded
  previews; they do not expose storage paths or internal JSON instructions.

### Correction API

```http
POST /api/containers/manual
PATCH /api/containers/:id
PATCH /api/container-destinations/:id
POST /api/corrections
GET /api/corrections
```

Correction rules:
- `POST /api/containers/manual` creates a manual unloading report container
  without an `import_file_id` when parsing is impossible. Payload must include
  `containerNo` and at least one destination with `destinationCode`, `cartons`,
  and `pallets`.
- It may include `learningCaseId`; free-text reason/note never substitutes for
  the formal relationship.
- Manual containers use `source_format = UNKNOWN`,
  `parser_version = manual-entry-v1`, and audited `correction_feedback` rows for
  the container and each manually entered destination.
- Allow container-level correction for container number, dock number, and
  company.
- Allow destination-level correction for destination code, destination type,
  manual pallets, cartons, volume, and note.
- Every change must insert `correction_feedback`.
- `final_pallets = manual_pallets ?? calculated_pallets`.
- Manual destination creation and correction-triggered recalculation resolve
  the same effective pallet policy used by import jobs and persist its
  immutable snapshot.
- Changing only `manual_pallets` updates manual/final values in an existing new
  snapshot. It must not synthesize current-policy metadata onto a legacy row
  whose snapshot is null.
- Applying the data update and writing `correction_feedback` must be
  transactional.

### Generate Report

```http
POST /api/containers/:id/generate-report
GET /api/containers/:id/files
```

Rules:
- Read container and destination data from DB.
- Use corrected `final_pallets`.
- Support both parsed containers and manual unloading report containers.
- Generate Excel report under `storage/reports`.
- Copy the template; never modify it in place.
- Write `generated_files`.
- Repeated generation should rebuild from the latest DB values, overwrite the
  report artifact path, and update the current generated-file record for that
  container/file type.
- Failures must return an error and record failure when possible.

### Generate Labels

```http
POST /api/containers/:id/generate-labels
GET /api/pallets?containerId=
```

Rules:
- Use `container_destinations.final_pallets`.
- Support both parsed containers and manual unloading report containers.
- Create the expected number of `pallets`.
- Each pallet must have unique `pallet_id` and `qr_payload`.
- Generate PDF under `storage/labels`.
- Write `generated_files`.
- Do not generate QR payloads without inserting pallet records.
- Repeated generation should rebuild from the latest DB values, overwrite the
  label PDF artifact path, and replace old planned/label-printed pallets before
  they enter loading. If any existing pallet has been assigned, loaded, or
  otherwise used, regeneration must be blocked.

### Inventory Queries

```http
GET /api/reports/container-summary
GET /api/reports/inventory
GET /api/containers/:id/summary
```

Rules:
- Support filters by container number, destination code, and status.
- Calculate `totalPallets`, `activeTotalPallets`, `loadedPallets`,
  `adjustedOutPallets`, `cancelledPallets`, and `remainingPallets` from DB
  state.
- `totalPallets` remains the raw historical count. `activeTotalPallets`
  excludes `CANCELLED` and `ADJUSTED_OUT` records and is the Web inventory
  denominator.
- `remainingPallets` excludes `LOADED`, `CANCELLED`, and `ADJUSTED_OUT`
  pallets.
- Do not accept frontend-provided inventory totals as truth.

### Unloaded Inventory Synchronization

Any formal transition to container `UNLOADED`, including the office container
status route and unloading-wage completion routes, reconciles each destination
before its status/audit record is committed.

Rules:
- Treat `ContainerDestination.finalPallets` as the actual unloading snapshot.
- Reuse `PLANNED` and `LABEL_PRINTED` pallets without changing IDs, QR payloads,
  label timestamps, or history; create missing `PLANNED` pallets with a
  `CREATED` event; mark only safe unused surplus as `CANCELLED` with a
  `CANCELLED` event.
- Responses include structured per-destination `inventorySync` summaries:
  expected, reused, created, cancelled, active total, and stable warning codes.
- `LOADING_IN_PROGRESS` or `LOADED` containers cannot be recomputed or moved
  back to `UNLOADED`.
- Concurrent sync, unsafe operational surplus, invalid final counts, and sync
  failures return stable codes. The Web maps those codes through its locale
  catalogs rather than displaying raw codes.

### Manual Inventory Depletion

```http
POST /api/container-destinations/:id/inventory-adjustments
GET /api/container-destinations/:id/inventory-adjustments
```

Rules:
- `POST` requires `inventory.adjust`; default role seed grants it to `ADMIN`
  and `OFFICE` only.
- `GET` requires `inventory.read`.
- Request body accepts `count` or `palletIds`; explicit `palletIds` override
  `count`.
- `reasonCode` is one of `DELIVERED_WITHOUT_SCAN`, `SCAN_MISSED`,
  `DATA_CLEANUP`, or `OTHER`; `OTHER` requires `note`.
- Eligible pallets are `PLANNED`, `LABEL_PRINTED`, or `EXCEPTION` with no
  `loadJobId` or `loadedAt`.
- The transaction must lock selected pallet rows, create one
  `inventory_adjustments` row, create one
  `MANUAL_INVENTORY_DEPLETION` pallet event per pallet, and then set each
  selected pallet to `ADJUSTED_OUT`.
- Manual depletion must not create scan events, set pallets to `LOADED`, set
  `loaded_at`, or increase loaded counts.
- API responses return stable enum/code/raw data only; UI labels are resolved
  by Web i18n helpers.

## P3 Routes

### Load Jobs

```http
POST /api/load-jobs
GET /api/load-jobs
GET /api/load-jobs/:id
PATCH /api/load-jobs/:id
DELETE /api/load-jobs/:id
POST /api/load-jobs/:id/close
GET /api/load-jobs/operator-history/me
```

Create request:
- `loadNo` required
- optional `truckNo`, `dockNo`, `carrier`, `destinationRegion`, `createdById`
- optional `startedAt`, `scheduledDepartureAt`
- `lines[]` required with at least one entry
- each line may provide `sourceText`, `containerNo`, `containerId`,
  `containerDestinationId`, `destinationCode`, `plannedPallets`,
  `externalTransfer`, and `note`

Rules:
- A load job is a truck/departure plan, not a whole container.
- New load jobs start as `PLANNED`.
- Supported operational statuses are `PLANNED`, `IN_PROGRESS`, and
  `COMPLETED`.
- `PLANNED` jobs can be edited and deleted.
- `IN_PROGRESS` jobs can be edited but cannot be deleted; edits must not remove
  already-loaded pallets or reduce a plan line below the already-loaded count.
- `COMPLETED` jobs cannot be edited or scanned.
- Switching a job to `COMPLETED` requires `dockNo`.
- A load job may mix internal system lines and external transfer lines.
- A load job has one `destinationRegion`; when set, every plan-line
  `destinationCode` must match it.
- A single container/destination may be split across multiple load jobs, using
  source text like `CSNU5938021-11P-part1` and `CSNU5938021-3P-part2`.
- Line parsing should accept `-<count>P`, `-<count>P-part<n>`, and external
  transfer spacing such as `FFAU3143604转运 -3P`.
- External transfer lines are recorded and counted separately, but they do not
  produce scanable system pallets.
- A pure external transfer truck is valid; its system progress is `0/0/0`.
- Internal lines must resolve to existing system containers and, when
  destination-constrained, existing container destinations.
- Progress totals are the sum of internal plan-line `plannedPallets`, not all
  pallets in the referenced containers.
- If an in-progress job is completed before all planned pallets are scanned,
  the unscanned pallets remain warehouse inventory. These leftover internal
  cycle pallets are not reserved by the completed job and may be scanned by a
  future load job whose plan line matches the same container/destination scope.
- Open/in-progress jobs can scan.
- Completed/cancelled jobs cannot scan.
- Mobile warehouse users may close a load job after loading is finished.
- Closing a load job requires `dockNo`, switches status to `COMPLETED`, and
  writes an audit event with the authenticated user as operator.
- Load job responses expose the completion operator from the completion audit
  event so office history can show who completed loading.
- `GET /api/load-jobs/operator-history/me` returns the authenticated operator's
  completed load jobs with load number, destination region, truck number, dock
  number, carrier, scheduled departure time, completion time, total loaded
  pallets, and loaded pallet/container details.

### Scan Transaction

```http
POST /api/load-jobs/:id/scan
```

Request:
- `qrPayload`
- optional `deviceId`

Rules:
- Parse `SSP1|PALLET|...|PALLET_ID`.
- Find pallet by `pallet_id` or exact `qr_payload`.
- Use a database transaction.
- Lock or otherwise protect the pallet update path against concurrent scans.
- Validate pallet exists.
- Validate pallet is not cancelled/void.
- Validate load job is open.
- Validate the pallet belongs to an internal load job line.
- Validate the internal line has not already reached `plannedPallets`.
- Validate pallet is not already loaded by another load job.
- Creating a load job never reserves inventory; only a successful scan changes
  pallet state.
- Insert `pallet_events`.
- Update pallet status to `LOADED`.
- Set `loaded_at` and `load_job_id`.
- Return load job progress from DB state.

Duplicate behavior:
- Same load job + same pallet: return duplicate; do not create another loaded
  inventory decrement.
- Different load job + already loaded pallet: block unless a later supervisor
  override is explicitly designed.
- Invalid QR payload: return clear error and persist exception event/log.

## P4 Routes

### Reprint Audit

```http
POST /api/pallets/:id/print
POST /api/containers/:id/labels/reprint
```

Rules:
- Record reprint audit in `pallet_events` or a dedicated audit table added by
  migration.
- Record pallet id, user id, printed at, and reason.
- Do not change loaded inventory status.
- Cancelled/void pallets should not be reprinted unless supervisor override is
  explicitly implemented.

## Error Shape Guidance

Use a consistent error body:

```json
{
  "code": "DUPLICATE_IMPORT",
  "message": "A file with this SHA-256 already exists.",
  "details": {}
}
```

Keep machine-readable `code` values stable enough for Web UI handling.

## Transaction Guidance

Use transactions for:
- Import metadata when coupled to file storage outcome.
- Parse result persistence across container, lines, and destinations.
- Corrections and `correction_feedback`.
- Label generation when creating pallets and generated-file records.
- Scan transaction and pallet event insertion.
- Reprint audit.
