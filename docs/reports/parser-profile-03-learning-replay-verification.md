# PARSER-PROFILE-03 Learning Replay API Verification

## Result

`PARSER-PROFILE-03` delivers the learning-case API vertical slice from a
preserved failed-import workbook through bounded inspection, recoverable draft
mapping, preview, queued replay, structured diff, replay artifact download and
candidate submission. Candidate profile versions remain `DRAFT` and
`REVIEW_REQUIRED`; this Task adds no approval, activation, trust promotion or
normal-import profile selection.

## API and state contracts

The permissioned endpoints are:

- `GET /api/parser-learning-cases` and `GET /api/parser-learning-cases/:id` —
  list/detail with status filtering and `parser_profiles.read`;
- `POST /api/parser-learning-cases/:id/inspect` — bounded preserved-workbook
  inspection with `parser_profiles.train`;
- `PUT /api/parser-learning-cases/:id/draft` — strict Worker schema validation
  and `expectedRevision` compare-and-set;
- `POST /api/parser-learning-cases/:id/preview` — revision-pinned canonical
  sample, summaries, provenance and structured issues without business writes;
- `POST /api/parser-learning-cases/:id/replay` — durable
  `PARSER_PROFILE_REPLAY` job submission with a caller idempotency key;
- `GET /api/parser-learning-cases/:id/replay-jobs/:jobId` — case-scoped job
  status;
- `GET /api/parser-learning-cases/:id/replays` and
  `GET /api/parser-learning-cases/:id/replays/:artifactId/download` — historical
  generated replay metadata and JSON bytes without a storage path;
- `POST /api/parser-learning-cases/:id/submit` — immutable candidate snapshot;
- existing case start/link/unlink/close endpoints continue to enforce the same
  train permission and audit rules.

The persisted state enum is `OPEN`, `MAPPING`, `READY_FOR_REPLAY`,
`REPLAY_FAILED`, `AWAITING_COMPLETION`, `AWAITING_APPROVAL`, `CLOSED`.
Inspection and preview do not imply approval. A complete guarded definition plus
manual result reaches `READY_FOR_REPLAY`; a failed replay records a stable error
and `REPLAY_FAILED`; a passed replay can be submitted only as an immutable
candidate, which reaches `AWAITING_COMPLETION` until a future Task owns the
completion snapshot. `AWAITING_APPROVAL` is defined for that future transition
but is not approval itself.

Container extraction prefers the mapped workbook field. When the internal value
is absent, the Worker may use the required preserved-filename fallback and emits
filename provenance; replay then proves the extracted value against the manual
container. A filename without a valid container remains a blocking
`MISSING_CONTAINER_NO` result.

## Revision, queue and artifact behavior

- Draft writes increment `draftRevision` only when `expectedRevision` matches.
  Preview rechecks the revision after Worker execution so a late old result
  returns `PROFILE_PREVIEW_STALE_RESULT` rather than replacing newer work.
- Replay pins source import SHA-256, draft revision, mapping schema version,
  fingerprint version, Worker/parser version and a deterministic replay input
  hash. The queue idempotency scope is `<revision>:<caller-key>` and the
  generated-file unique key is
  `parser-profile-replay:<case>:<revision>:<caller-key>`; retries reuse the job
  and artifact identity, including terminal jobs, instead of creating duplicate
  evidence. A replay-specific partial unique job index closes concurrent create
  races, while the case token prevents two different replay keys from writing
  case state at the same time.
- Replay JSON uses `parser-profile-replay-v1` and records the pinned contract,
  canonical result, manual parser-relevant snapshot, diff, warnings/errors and
  blocker codes. `GeneratedFileStatus.GENERATING/GENERATED/FAILED` distinguishes
  durable work from false empty success. Every replay has an audit event; a new
  replay does not overwrite historical files.
- Storage is server-derived. Reads resolve and realpath both the configured root
  and saved file, reject NUL/out-of-root/symlink escape/non-file/missing paths,
  and never accept an API-supplied filesystem path. Responses expose download
  URLs, hashes and sizes, not `storagePath`.
- Import deletion remains blocked while learning/evidence exists; close is also
  blocked while a replay artifact is generating.

## Diff and operational-data isolation

The diff covers container number, detail-row inclusion, destination set,
per-destination cartons, three-decimal CBM, package evidence and reference
evidence. Manual pallet overrides, final pallet count, dock, wage/worker and
loading state are deliberately absent. Missing manual volume with cartons emits
`PROFILE_EVIDENCE_VOLUME_UNVERIFIED`; it is never canonicalized to a false
equality. Worker/queue failure updates only learning/job/generated-file/audit
state.

The real-byte E2E copies preserved
`samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx` (SHA-256
`a30b0373c0dbcd46ab55fe98016058e6479aea7c6bb12a4bc4e5766f1f89450e`)
under a temporary storage root. The API inspected 3 sheets/377 bounded sample
cells, saved and reloaded revision 1, rejected revision 0, previewed 43
canonical rows, replayed 9 destination totals with no material difference,
downloaded the durable JSON and submitted one `DRAFT`/`REVIEW_REQUIRED`
candidate. A serialized before/after assertion proved the linked manual
container—including dock and `manualPallets`—was unchanged. A separate Worker
failure produced a `FAILED` artifact and `REPLAY_FAILED` case with
`PROFILE_WORKER_INVOCATION_FAILED`. Re-executing a completed replay returned the
same generated file without invoking the Worker or rewriting bytes, and an old
failure was unable to clear a newer active replay token.

## Stable codes and strict i18n

Task-specific API codes include:

- request/draft: `PARSER_PROFILE_REQUEST_VALIDATION_FAILED`,
  `PROFILE_MAPPING_DEFINITION_INVALID`,
  `PROFILE_MAPPING_REQUIRED_FIELD_MISSING`, `PROFILE_DRAFT_NOT_FOUND`,
  `PROFILE_DRAFT_REVISION_CONFLICT`, `PROFILE_PREVIEW_STALE_RESULT`;
- replay/candidate: `PROFILE_REPLAY_NOT_READY`,
  `PROFILE_REPLAY_QUEUE_FAILED`, `PROFILE_REPLAY_JOB_NOT_FOUND`,
  `PROFILE_REPLAY_JOB_PAYLOAD_INVALID`, `PROFILE_REPLAY_STALE_REVISION`,
  `PROFILE_REPLAY_MANUAL_SNAPSHOT_CHANGED`,
  `PROFILE_REPLAY_WORKER_FAILED`, `PROFILE_REPLAY_ARTIFACT_NOT_FOUND`,
  `PROFILE_REPLAY_ARTIFACT_NOT_READY`, `PROFILE_CANDIDATE_NOT_READY`,
  `PROFILE_CANDIDATE_FAMILY_CONFLICT`, `QUEUE_DISABLED`,
  `QUEUE_ENQUEUE_FAILED`, `QUEUE_UNAVAILABLE`;
- diff/evidence: `PROFILE_REPLAY_CONTAINER_MISMATCH`,
  `PROFILE_EVIDENCE_DETAIL_ROWS_UNVERIFIED`,
  `PROFILE_REPLAY_DETAIL_ROWS_MISMATCH`,
  `PROFILE_REPLAY_DESTINATION_SET_MISMATCH`,
  `PROFILE_REPLAY_CARTONS_MISMATCH`, `PROFILE_EVIDENCE_VOLUME_UNVERIFIED`,
  `PROFILE_REPLAY_VOLUME_MISMATCH`,
  `PROFILE_REPLAY_PACKAGE_EVIDENCE_MISMATCH`,
  `PROFILE_EVIDENCE_REFERENCE_UNVERIFIED`,
  `PROFILE_REPLAY_REFERENCE_EVIDENCE_MISMATCH`,
  `PROFILE_REPLAY_FIELD_MATCHED`;
- storage/Worker: `PROFILE_SOURCE_SHA_MISMATCH`,
  `PROFILE_REPLAY_MANUAL_RESULT_REQUIRED`,
  `PROFILE_SOURCE_WORKBOOK_NOT_FOUND`,
  `PROFILE_SOURCE_STORAGE_PATH_NOT_FILE`, `PROFILE_STORAGE_PATH_INVALID`,
  `PROFILE_STORAGE_PATH_OUTSIDE_ROOT`, `PROFILE_STORAGE_FILE_NOT_FOUND`,
  `PROFILE_WORKER_INVOCATION_FAILED`, `PROFILE_WORKER_EMPTY_OUTPUT`,
  `PROFILE_WORKER_INVALID_OUTPUT`.

The typed Web `PARSER_PROFILE_CONTRACT_CODES` catalog also contains every
Worker inspection/fingerprint/mapping/data-validation code from Task 02. Its
contract test iterates every state and code, proving English has no Chinese
characters, Chinese has localized text, and neither locale uses the raw enum or
code as the primary label. Raw source headers and customer labels remain data.

## Schema and migration

Migration `20260719020000_parser_profile_learning_replay` replaces legacy
`DRAFT/LINKED` case states with the seven-state contract, maps existing open
rows safely, adds guarded draft/error/replay fields, adds replay job/generated
file relations and indexes, introduces generated-file idempotency and pins
candidate versions to a unique `(sourceLearningCaseId, sourceDraftRevision)`.
The existing database trigger now prevents changes to the submitted source case
or draft revision as part of immutable profile definition history. Follow-up
migration `20260719030000_parser_profile_replay_job_idempotency` adds the
replay-only partial unique async-job idempotency index without changing retry
semantics for unrelated job types.

## Automated verification

All project commands ran in Docker:

- final API, Web and Worker images built from frozen lockfiles; API build
  included Prisma generate and Nest build; Web production build passed;
- API lint and typecheck passed;
- API unit: 36 suites, 286 tests passed;
- API E2E: 20 suites, 119 tests passed, including real-byte success, Worker
  failure and stale concurrent replay cases;
- Web lint, typecheck and 225 tests passed;
- Worker full suite: 171 tests passed in 237.22 seconds, including profile
  CLI/API-parity and real-fixture tests;
- migration applied to local PostgreSQL and Prisma migration status was current;
- full-stack API/nginx health and replay artifact response checks passed;
- `git diff --check` passed.

## Manual verification

1. As OFFICE, open a failed import case, call inspect, save a revision and
   preview; confirm only stable codes and bounded source evidence appear.
2. Link the completed manual report, queue replay twice with the same key and
   confirm one job/artifact identity and an unchanged manual container.
3. Download the replay JSON, follow one field's provenance to the workbook and
   review material/non-material diff codes.
4. Submit the passed artifact and confirm the profile remains `DRAFT` and
   `REVIEW_REQUIRED`; confirm no approve/activate/trust endpoint exists.
5. Repeat inspect as WAREHOUSE or HR_MANAGER and confirm 403; repeat as ADMIN
   and confirm access.

## Boundary and next Task

No external verification remains for this API/Worker Task. Completion snapshot,
approval, lifecycle activation, trust streaks, normal import integration and UI
wizard work remain out of scope. The next supervised Task is only
`PARSER-PROFILE-04Office Mapping Wizard and Failed Import Flow.md`.
