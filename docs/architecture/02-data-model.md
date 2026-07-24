# Data Model And Schema

## Schema Owner

The canonical database schema lives in:

```text
apps/api/prisma/schema.prisma
```

Migrations live in:

```text
apps/api/prisma/migrations/
```

Do not manually edit generated Prisma client files under
`apps/api/src/generated/prisma`.

## Model Relationships

```text
users
  -> import_files.imported_by_id
  -> generated_files.generated_by_id
  -> load_jobs.created_by_id
  -> pallet_events.operator_id
  -> correction_feedback.corrected_by_id

import_files
  -> containers
  -> generated_files
  -> correction_feedback
  -> active parser_learning_cases
  -> parser_profile_evidence
  -> optional parser_profile_reviews

containers
  -> container_lines
  -> container_destinations
  -> generated_files
  -> load_jobs
  -> load_job_lines
  -> correction_feedback

destination_rules
  -> container_destinations.destination_rule_id

container_destinations
  -> pallets
  -> load_job_lines
  -> correction_feedback

pallets
  -> pallet_events
  -> correction_feedback
  -> optional load_jobs through pallets.load_job_id

load_jobs
  -> load_job_lines
  -> pallets
  -> pallet_events

generated_files
  -> correction_feedback

parser_profile_families
  -> immutable parser_profile_versions

parser_learning_cases
  -> source import and immutable id/SHA snapshot
  -> optional linked manual container
  -> parser_profile_versions
  -> parser_profile_audit_events

parser_profile_versions
  -> parser_profile_evidence
  -> parser_profile_reviews
  -> profile-mapped containers
```

## Tables

### `users`

Stores operators and system actors.

Required semantics:
- `role` distinguishes `ADMIN`, `OFFICE`, `WAREHOUSE`, and `SYSTEM`.
- User records may be optional on early automated writes, but audit-capable
  APIs should fill the actor when available.

### `import_files`

Stores uploaded Excel file metadata.

Required semantics:
- `original_filename` is the client filename.
- `stored_path` points to preserved original bytes.
- `file_sha256` is unique and is the duplicate detection key.
- `format` is detector output: `UNLOADING_PLAN_CN`, `BESTAR_RECEIVING`, or
  `UNKNOWN`.
- `parse_status` tracks lifecycle: `NOT_PARSED`, `PARSING`, `PARSED`,
  `REVIEW_REQUIRED`, `WARNING`, or `ERROR`.
- `parser_version`, `warning_count`, `error_count`, and `error_message` are
  required to explain parser outcomes.
- `raw_metadata` stores detector and source metadata that does not belong in
  first-class columns. `parseSelection` uses the versioned
  `parser-selection-v1` contract to preserve the selected source, stable reason,
  outcome, bounded candidate count, duration, exact profile identity/runtime
  versions, matched structural reasons, and automatic-commit decision without
  storing workbook cell values.
- Imports referenced by active learning cases or evidence cannot be deleted.
  Learning start and deletion lock the same import row; the blocker audit
  commits before `IMPORT_USED_BY_PARSER_LEARNING`, and no storage cleanup starts
  on the blocked branch.

### `containers`

Stores one parsed container for an import file, or one manual unloading report
container created by office staff when the customer workbook cannot be parsed.

Required semantics:
- `import_file_id` is nullable. Parsed containers must point to
  `import_files`; manual containers use `NULL`.
- `container_no` is unique.
- Parsed `source_format` mirrors the parser format. Manual containers use
  `UNKNOWN`.
- Parsed `parser_version` must be copied from worker output. Manual containers
  use `manual-entry-v1`.
- `raw_json` preserves parsed source-level payload.
- `warnings` and `errors` preserve parser-level issues.
- `status` must reflect business lifecycle, not just file upload state.
- `parser_source_kind` is `BUILT_IN`, `MANUAL`, or `PROFILE`. Only `PROFILE`
  rows have a restrictive `parser_profile_version_id` relationship.

### Parser profile foundation

`parser_profile_families` is the stable identity for a profile line.
`parser_profile_versions` stores an append-only version number and immutable
mapping/fingerprint definitions plus matcher/mapping versions. Lifecycle is
`DRAFT/ACTIVE/PAUSED/RETIRED`; trust is `REVIEW_REQUIRED/TRUSTED`. Approval
actor/time and source learning case are explicit restrictive relations.

`parser_learning_cases` formally connects one unsuccessful source import to at
most one standalone manual container. Nullable unique active foreign keys
prevent duplicate source/result claims. Closing an eligible draft releases
those active links but keeps trigger-protected source id/SHA snapshots and
audit history. Non-draft profile history or evidence prevents close.

`parser_profile_evidence` is unique by profile version and import, with checked
accepted/material-correction outcome flags. `parser_profile_audit_events`
records stable target ids, actor, event code, time, and structured metadata.
It must not contain workbook contents, secrets, or local storage paths.
Historical relationships use restrictive deletion rather than cascade.

An `ACTIVE + TRUSTED` exact version may create a profile-mapped container only
after the import and profile rows are locked and lifecycle, trust,
`lifecycle_revision`, matcher version, and mapping version are rechecked. The
transaction records `TRUSTED_AUTO_COMMITTED`; a state race records
`TRUSTED_AUTO_FALLBACK` and leaves the import in review. A later material parser
correction on that exact profile output records
`TRUST_REVOKED_BY_MATERIAL_CORRECTION`, changes only the version trust state to
`REVIEW_REQUIRED`, resets its streak to zero, and preserves historical imports.

`parser_profile_reviews` is unique by import and keeps the staged-data boundary:
source SHA, exact profile version, fingerprint and runtime versions, bounded
source preview, canonical/provenance/warning evidence, destination/report
previews, decision revision, material diff, reason, actor/time, and optional
accepted container. Pending rows cannot point at a formal container. Accepted
or corrected rows must point at exactly one formal container; rejected rows
must not. Evidence stores `streak_after` in the checked `0..3` range, and an
explicit rejection is material evidence that resets rather than deletes the
history. `staged_result`, staged destinations, provenance, warnings, errors and
report preview remain immutable after the decision; corrected output is stored
separately in nullable `final_result`, `final_destination_summary` and
`final_report_preview` columns.

### `container_lines`

Stores normalized parsed detail rows.

Required semantics:
- `(container_id, line_no)` is unique.
- `raw_json` is required and must preserve unknown source columns.
- `destination_code`, `cartons`, and `volume` can be nullable because source
  files can be incomplete; missing values must remain visible in warnings or
  errors.

### `destination_rules`

Stores optional destination classification and pallet rules.

Required semantics:
- `destination_code` is unique.
- `pallet_rule` is JSON so destination-specific pallet limits can evolve
  without immediate schema churn.
- The active pallet calculation policy is resolved centrally by Settings and
  handed to Worker jobs as an immutable snapshot. This table must not become a
  second settings source for the footprint/height policy.

### `container_destinations`

Stores aggregate destination totals and pallet counts for a container.

Required semantics:
- Unique by `(container_id, destination_code, destination_type)`.
- `cartons` and `volume` are aggregate totals.
- `calculated_pallets` is worker/API output.
- `manual_pallets` is nullable operator override.
- `final_pallets` equals `manual_pallets` when present, otherwise
  `calculated_pallets`.
- Manual unloading report destinations calculate an estimate with the current
  effective policy and store the office-entered value in `manual_pallets`;
  `final_pallets` remains the manual value.
- `pallet_policy_snapshot` is immutable calculation metadata for new results.
  It contains policy/rule versions, settings revision, dimensions, destination
  group/height, capacity, package/calculation mode, rounding, bucket details,
  warnings, and calculated/manual/final counts.
- The snapshot is nullable for legacy rows. The additive migration does not
  backfill or recalculate those rows; their persisted `final_pallets` remains
  authoritative.
- Changes to operator-controlled fields must create `correction_feedback`.
- `warnings` and `errors` keep aggregate-level issues, including missing
  destination. Parsed zero volume with cartons is normalized to the configured
  minimum planning volume before aggregation.

### `pallets`

Stores generated physical pallet records.

Required semantics:
- `pallet_id` is unique and must appear in the QR payload.
- `qr_payload` is unique.
- `(container_destination_id, pallet_no)` is unique.
- Default status is `PLANNED`; label-generation APIs may set
  `LABEL_PRINTED`.
- `LOADED` status must only be set by the scan transaction.
- `loaded_at` must only be filled by the scan transaction.
- `load_job_id` records the load job that loaded the pallet.

### `generated_files`

Stores every durable generated artifact.

Required semantics:
- `file_type` distinguishes parsed JSON, Excel report, pallet label PDF, task
  report HTML, and corrections JSON.
- `storage_path` points to the artifact in storage.
- `file_sha256`, `mime_type`, and `file_size_bytes` should be filled when the
  file exists.
- `status` supports `GENERATED`, `FAILED`, and `SUPERSEDED`.
- Re-generation must create another record or mark older records superseded;
  do not overwrite history silently.

### Attendance settlement audit models

`attendance_imports` is the concurrency boundary for one attendance settlement.
`data_revision` increases after every successful Parse rebuild and every first
employee-day deletion. Parse, delete, and the final generation commit lock this
row so a workbook produced from an older revision can only be recorded as
`SUPERSEDED`, never as current.

`attendance_rows` preserves the complete parsed employee-day record. An active
row has `deleted_at = NULL`; deletion fills `deleted_at`, `deleted_by_id`, and
the required `deletion_reason` without clearing punches, intervals, calculated
hours, raw JSON, warnings, or errors. `(attendance_import_id, deleted_at)` is
indexed for active settlement reads. Successful Parse removes and rebuilds only
active rows; the unique row key held by a deleted row is the durable tombstone
that prevents the same source row from being recreated.

`attendance_row_audit_events` is append-only evidence. The unique
`(attendance_import_id, row_key, event_code)` key makes `DELETED` idempotent.
Each event keeps the original row id/key, employee/date fields, full row JSON
snapshot, authenticated actor id, durable actor display snapshot, required
reason, and occurrence time. The optional row and actor relations use
historical-safe deletion behavior; display evidence does not depend on a user
remaining active or retaining the same name. The delete transaction commits
the tombstone, event, active aggregates, revision increment, and affected wage
file `SUPERSEDED` transitions together or rolls all of them back.

`wage_generated_files` retains every historical attendance workbook and task
report with SHA-256, generator, timestamps, and status. Deletion never removes
or overwrites those artifacts. New generation receives a server-created
normalized snapshot of active `attendance_rows`; the original `.xls` remains
provenance and is not reparsed as an authority that could bypass tombstones.

### `load_jobs`

Stores warehouse loading work. A load job represents one truck/departure plan,
not one container.

Current schema fields:
- `container_id` is optional and only points to the first/primary system
  container when a load job has internal system lines.
- `job_no`
- `truck_no`
- `carrier`
- `destination_region`
- `status`
- `started_at`
- `scheduled_departure_at`
- `completed_at`
- `created_by_id`

Status semantics:
- `PLANNED`: created but not active.
- `IN_PROGRESS`: open for scanning.
- `COMPLETED`: closed successfully.
- `CANCELLED`: no further scans allowed.

Required semantics:
- A load job may contain multiple plan lines from multiple containers.
- A load job may be a pure external transfer truck with no system pallets.
- One container/destination may be split across multiple load jobs. Each load
  job enforces only its own planned system pallet count; a physical pallet
  already loaded by another job must still be blocked.
- System pallet progress is calculated from internal plan lines, not from whole
  container pallet totals.
- Closing a load job creates an audit event with planned internal/external
  pallet counts.

### `load_job_lines`

Stores one line from the real office loading plan.

Current schema fields:
- `load_job_id`
- `sequence`
- `source_text`
- `container_no`
- `container_id`
- `container_destination_id`
- `destination_code`
- `planned_pallets`
- `external_transfer`
- `note`

Required semantics:
- Lines containing external transfer cargo, such as text with `转运`, are kept
  for truck paperwork but do not map to system pallets.
- `source_text` may include plan suffixes such as `-11P-part1`,
  `-3P-part2`, or spaced transfer text such as `转运 -3P`. The original text is
  preserved while `container_no` and `planned_pallets` are normalized.
- Internal lines must link to a known container by `container_id` or
  `container_no`.
- If a destination is specified or inherited from the load job destination
  region, it must resolve to a container destination.
- Internal plan-line scopes must not be duplicated inside the same load job.
- Scan acceptance is limited by each internal line's `planned_pallets`; a load
  job may schedule only part of a container destination.
- Creating a load job does not reserve or decrement inventory. Inventory moves
  only when a physical pallet is scanned and marked `LOADED`.

### `pallet_events`

Stores immutable scan, status, exception, and audit history.

Required semantics:
- Insert new events only; never update old events to change history.
- `event_type` includes `CREATED`, `LABEL_PRINTED`, `SCANNED`, `LOADED`,
  `DUPLICATE_SCAN`, `INVALID_SCAN`, `STATUS_CHANGED`, and `CANCELLED`.
- Reprint audit can use a new event type in a migration or structured
  `metadata` if the schema is not yet extended.
- Invalid QR payloads should be persisted with `scan_payload`,
  `exception_reason`, and device/operator metadata when available.

### `correction_feedback`

Stores manual correction audit.

Required semantics:
- `target_type` identifies the target class.
- Exactly one target foreign key should usually be filled for a correction.
- `field_name`, `old_value`, and `new_value` describe what changed.
- `reason` and `note` explain why.
- `corrected_by_id` should be filled when an operator is known.
- Applying a correction and inserting `correction_feedback` should happen in
  the same transaction.

## Enums

Keep enum values stable once persisted. If a value must be renamed, add a
migration and a data migration.

Important enums:
- `FileFormat`: parser format.
- `ParseStatus`: import parse lifecycle.
- `ContainerStatus`: container workflow lifecycle.
- `GeneratedFileType`: generated artifact type.
- `GeneratedFileStatus`: generated artifact state.
- `PalletStatus`: physical pallet state.
- `LoadJobStatus`: loading job state.
- `PalletEventType`: event/audit history type.
- `CorrectionTargetType`: correction audit target.

## Required Constraints

- `import_files.file_sha256` unique.
- `containers.container_no` unique.
- `container_lines(container_id, line_no)` unique.
- `container_destinations(container_id, destination_code, destination_type)`
  unique.
- `pallets.pallet_id` unique.
- `pallets.qr_payload` unique.
- `pallets(container_destination_id, pallet_no)` unique.
- `load_job_lines(load_job_id, sequence)` unique.
- Index foreign keys and status columns used by dashboards and worker/API
  lookups.

## Inventory Queries

Inventory must be calculated from database state.

Container summary:

```text
totalPallets = count(all historical pallets for container)
activeTotalPallets = count(pallets where status not in CANCELLED, ADJUSTED_OUT)
loadedPallets = count(pallets where status = LOADED)
adjustedOutPallets = count(pallets where status = ADJUSTED_OUT)
cancelledPallets = count(pallets where status = CANCELLED)
remainingPallets = count(pallets where status not in LOADED, CANCELLED, ADJUSTED_OUT)
```

Destination summary:

```text
group by container_destinations.destination_code
totalPallets = count(all historical pallets)
activeTotalPallets = count(pallets where status not in CANCELLED, ADJUSTED_OUT)
loadedPallets = count(pallets where status = LOADED)
adjustedOutPallets = count(pallets where status = ADJUSTED_OUT)
cancelledPallets = count(pallets where status = CANCELLED)
remainingPallets = count(pallets where status not in LOADED, CANCELLED, ADJUSTED_OUT)
```

`totalPallets` is deliberately historical: it includes cancelled safe surplus
and manually adjusted-out records. Office inventory screens use
`activeTotalPallets` as the current denominator, while `remainingPallets` is
the active count still not loaded.

When a container enters `UNLOADED`, each destination's `finalPallets` is the
actual unloading snapshot. A single transaction must reconcile Pallet rows to
that count before recording `UNLOADED`: reuse safe planned/label-printed rows,
create missing rows with immutable events, and mark only safe surplus as
`CANCELLED`. Operational surplus blocks completion and historical rows are
never deleted or rewritten.

Do not accept `remainingPallets` or `loadedPallets` from the frontend as source
of truth.

Inventory totals are global pallet-state totals. They are not the same as a
load job's planned progress, which is scoped to the load job's internal plan
lines.

## Schema Change Rules

- Add a migration for every schema change.
- Preserve existing audit and generated-file history.
- Do not collapse warnings/errors into a single text field if structured JSON
  is available.
- Do not remove `raw_json` or `raw_metadata`; those fields protect parser
  traceability when real customer files vary.

## Attendance Import Audited Deletion

`attendance_imports` uses an import-level tombstone (`deleted_at`,
`deleted_by_id`, `deletion_reason`) rather than hard deletion. Its source
workbook, SHA-256, parsed rows, row audit events, generated-file rows/bytes and
async jobs remain intact. `deleted_by_id` is `ON DELETE SET NULL`; the durable
display label lives in the immutable `attendance_import_audit_events` snapshot.

Each import can have one `DELETED` event. The event snapshots import/parse
status, period, employee/day and active/deleted row counts, issue counts,
generated-file id/type/old/new status, actor id/display label, reason and
occurrence time. Its import foreign key is `ON DELETE RESTRICT`, so an
accidental hard delete cannot silently erase the audit chain.

SHA uniqueness is active-only:

```sql
CREATE UNIQUE INDEX attendance_imports_active_file_sha256_key
ON attendance_imports(file_sha256)
WHERE deleted_at IS NULL;
```

This keeps concurrent active uploads unique while allowing the same preserved
bytes to create a new import id after the previous import is tombstoned.
Deletion, event creation, `data_revision` increment and all current
`GENERATED -> SUPERSEDED` transitions commit in one PostgreSQL transaction.
