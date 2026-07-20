# PARSER-PROFILE-05 Completion Snapshot and Governance Verification

## Terminal status

`DONE` on 2026-07-19 MDT. A linked manual container now freezes its first
parser-relevant unloading-completion snapshot, records a durable replay outbox
job, and exposes an explicit approval/governance workspace. A passing replay
still requires an authenticated user with `parser_profiles.approve`; approval
produces exactly `ACTIVE + REVIEW_REQUIRED + 0/3`, never `TRUSTED`.

No external verification remains for this Task. Trust evidence, 3/3 promotion
and later automatic matching remain in PARSER-PROFILE-06 and 07 respectively.

## Completion hook, snapshot and outbox

- The container correction completion path and both unloading-wage completion
  entry points call the same parser-learning completion capture after the
  existing unloading/inventory transaction succeeds.
- `UNLOADED`, `LOADING_IN_PROGRESS` and `LOADED` are accepted as evidence that
  unloading already completed. The catch-up endpoint can freeze historical
  eligible cases without changing or downgrading container state.
- A compare-and-set update freezes each learning case only once. Snapshot,
  completion timestamp, async-job row and job linkage are written in one
  PostgreSQL transaction; the durable row is dispatched to BullMQ after commit.
- Dispatch checks BullMQ by the recorded job ID. It requeues a durable row when
  Redis lost the job and reuses an existing Bull job when present, preventing
  duplicate completion replays.
- Snapshot capture or queue dispatch failure returns stable warning codes and
  leaves unloading, inventory synchronization, wage completion and loading
  state committed. Catch-up retries the durable state.

The immutable snapshot contains the container number, included parser detail
rows, destination/carton/canonical three-decimal volume/package/reference
evidence, field provenance and parser-relevant correction IDs/revisions. It
deliberately excludes unloaders, wage classifications, dock data, manual pallet
physical overrides, and inventory/loading status as parser-correctness facts.

## Approval eligibility and lifecycle

Approval independently verifies all of the following before entering its
transaction:

- preserved source import, SHA-256 and readable stored workbook;
- linked learning case, manual container and complete frozen snapshot;
- immutable submitted profile definition and unchanged submitted revision;
- required field provenance and non-empty profile name;
- passing completion replay with the exact durable completion job ID;
- pinned source SHA, draft/contract/Worker versions and frozen snapshot hash;
- exact container/destination/carton/canonical volume comparison with no
  unresolved blocking diff;
- no active version in the same family with the same matcher scope.

Incomplete requirements return stable `PROFILE_APPROVAL_*` codes and leave the
DRAFT/manual operational result unchanged. Approval accepts an expected
lifecycle revision and replay ID, obtains the actor only from current auth,
locks both version and family, writes reason/approver/time/audit, and initializes
the evidence streak to zero.

Lifecycle transitions are:

- DRAFT -> approve -> ACTIVE / REVIEW_REQUIRED / 0/3;
- ACTIVE -> pause -> PAUSED while preserving trust, streak and evidence;
- PAUSED -> resume -> ACTIVE with the prior trust/streak, subject to the same
  family matcher-conflict lock;
- ACTIVE or PAUSED -> retire -> RETIRED with all history retained;
- ACTIVE, PAUSED or RETIRED -> fork -> a new immutable DRAFT version with a
  reset streak and no inherited learning evidence.

Mapping definitions cannot be edited in place. Pause and retire commit the
non-active lifecycle immediately, so there is no eligible matching version to
select. The repository does not yet contain a future-import match consumer or
queued match job; PARSER-PROFILE-07 must query/recheck this authoritative
lifecycle immediately before any future match commit.

## API, RBAC and Web governance

The protected API now provides profile list, family detail, version detail,
approve, pause, resume, retire and fork contracts. Read uses
`parser_profiles.read`, fork uses `parser_profiles.train`, and all approval and
lifecycle mutations require `parser_profiles.approve`. DTOs cannot nominate an
approval actor.

The Office Web adds `/parser-profiles`, version detail and review routes, plus
an awaiting-approval link from the learning wizard. The list shows version,
lifecycle, trust/streak, last replay and audited actor/time. Detail shows
business-readable mapping/anchors, provenance, completion snapshot, replay
comparison, eligibility and lifecycle controls. It never makes raw mapping JSON
the main workflow.

OFFICE can read/train under its delegated grants but cannot approve, pause,
resume or retire. ADMIN and explicitly delegated approvers can mutate. The
approval dialog explicitly says the version enters review-required mode at
0/3 and will not automatically parse future workbooks. Reasons are mandatory;
API 403 and other stable failures map to typed localized messages.

## Replay failure and operational isolation

API E2E proves that a completion-replay Worker failure preserves `UNLOADED`
and the manual warehouse result. Unit and full regression suites also cover the
existing inventory synchronization, unloading-wage completion and loading scan
lifecycle. Learning warnings and retry state remain visible without rewriting
historical pallet/container events or decrementing inventory.

## i18n and visual verification

All lifecycle, trust, eligibility, action, audit, replay and permission values
remain stable API codes/enums/raw evidence. Typed English and Chinese catalogs
own the visible status, confirmation, error, ARIA and tooltip text. Customer
source cells remain source evidence; raw backend messages/codes are not shown.

The dedicated Docker Chromium flow used a derived unsupported-layout workbook
from the repository's real Excel fixture and exercised failed import, Office
mapping/manual linkage, unloading completion, completion replay, OFFICE 403,
ADMIN approval, pause, resume and retire through nginx. It generated the
ignored evidence set at `test-results/parser-profile-05/`.

The final visual matrix covered:

- English and Chinese, light and dark themes;
- 390x844, 768x1024, 1366x900 and 1920x1080 at 100%;
- real Chromium 200% zoom at 1366x768 in English/light and Chinese/dark.

All four base viewports reported page-level `maxPageScrollX = 0`. Both 200%
checks reported `innerWidth = 683`, `maxPageScrollX = 0` and dialog right edge
630 within the viewport. The 10 final screenshots were inspected: approval
controls remain visible, SHA-256 wraps, non-blocking evidence reads “Needs
review/需复核”, and the English result column is not clipped.

## Automated verification

All commands ran in Docker against images built from the final worktree:

- API production build and Prisma Client generation passed;
- API lint and typecheck passed;
- API unit: 38 suites / 301 tests passed;
- API E2E: 20 suites / 119 tests passed, including the Task 05 completion,
  replay-failure, stale-token, RBAC and governance flow;
- Web production build, lint and typecheck passed;
- Web unit/contract: 240 tests passed;
- dedicated Docker Chromium real-workbook governance flow: 1 test passed in
  about 2.2 minutes;
- Worker full suite: 171 tests passed;
- a fresh explicit temporary PostgreSQL database applied all 29 migrations,
  including `20260719040000_parser_profile_completion_governance`, then was
  removed; the current database reports schema up to date;
- PostgreSQL, Redis, API, Web, nginx and Worker containers were healthy; nginx
  `/api/health` reported database and queue up with no failed jobs;
- `git diff --check` passed.

## Manual review steps

1. Complete a linked manual container through each supported unloading entry
   point and confirm the first snapshot/job is reused by repeats and catch-up.
2. Force replay failure and confirm unloading, inventory and wage completion
   remain committed while the learning warning can be retried.
3. Sign in as OFFICE and confirm profile read access but no mutation controls
   and API 403 for approval. Repeat as ADMIN and approve with a reason.
4. Confirm approval shows ACTIVE / REVIEW_REQUIRED / 0/3, then pause, resume,
   retire and fork while reviewing immutable audit/evidence history.
5. Toggle locale/theme and review mobile, desktop and 200% zoom; confirm one
   UI language, no page-level horizontal overflow and complete action controls.

## Next Task

The only next recommended Task is
`PARSER-PROFILE-06Review Mode Evidence and Three Acceptance Trust Gate.md`.
Do not begin it in this Task/session.
