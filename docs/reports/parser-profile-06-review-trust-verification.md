# PARSER-PROFILE-06 Review / Trust Gate Verification

Date: 2026-07-20  
Task: `PARSER-PROFILE-06`  
Result: complete, including post-DONE review remediation

## Post-DONE review findings — closed remediation gate

A two-axis review after the first supervised `DONE` found correctness and
acceptance gaps that the earlier green tests did not cover. The same Task was
reactivated and all findings below are now closed with direct code and
regression evidence:

1. Re-lock and re-check the exact profile lifecycle/trust state inside the
   staged-write transaction after Worker execution. A `PAUSED`, `RETIRED`, or
   already-`TRUSTED` version must not create a new review from stale matching
   evidence.
2. Preserve staged parser errors through accept/correct persistence. Do not
   force `errorCount` or `errors` to zero, and do not allow a result with parser
   errors to become false-success formal data.
3. Persist profile match/execute failure evidence instead of returning `false`
   and silently committing the built-in result. Built-in precedence must remain
   unchanged when there is no unique legal profile match, but profile execution
   failure must be explicit and auditable.
4. Keep the original staged canonical/provenance snapshot immutable. A corrected
   acceptance may store a separate corrected/final snapshot and diff; it must
   not overwrite the staged source evidence.
5. Apply material classification only when reference/package/source changes
   actually affect parser grouping or pallet outcome as defined by the product
   specification; add direct tests for material and non-material variants.
6. Complete the Task-defined parser-relevant correction surface (including row
   add/remove and source/grouping/reference cases) or prove an equivalent
   audited server-side command contract.
7. Add browser/contract evidence for the profile evidence timeline and for
   SSR/hydration locale isolation, not only the import review panel's final DOM.

The remediation adds a second additive migration rather than rewriting the
already-applied review migration. The service now re-locks the exact profile
after Worker execution; audit-persisted match failures preserve built-in
precedence while an exact-match execution failure blocks silent fallback;
staged parser errors block formal commit; and corrected/final canonical,
destination, and report snapshots are stored separately from the immutable
staged snapshot. Direct unit tests cover paused/trusted races, execution
failure audit, error blocking, material/non-material reference and package
variants, and immutable final persistence. The browser flow now covers row
add/remove plus grouping/reference/PO fields, timeline rendering, and direct
English/Chinese SSR HTML assertions followed by hydration with no browser or
server errors.

## Delivered boundary

- A unique `ACTIVE + REVIEW_REQUIRED` profile match now stores a
  `ParserProfileReview` and changes the import to `REVIEW_REQUIRED` without
  creating a formal container, report, pallet, or inventory row.
- The staged record pins source SHA, exact profile version, fingerprint,
  matcher/mapping/Worker/parser versions, canonical rows, provenance,
  warnings/errors, pallet-policy snapshot, destinations, and report preview.
- Accept/correct/reject are explicit guarded commands. Read requires import and
  profile read grants; a decision additionally requires
  `parser_profiles.review`, `containers.update`, and `corrections.create`.
- Accept/correct locks the review, import, and exact profile version and commits
  formal container/line/destination data, evidence, audit, streak, and any trust
  transition together. Repeated or concurrent accept returns the committed
  result without creating another container or evidence event.
- Match and execution failures write stable `REVIEW_MATCH_FAILED` or
  `REVIEW_EXECUTION_FAILED` audit events. A no-match/collision leaves the
  existing built-in precedence intact; failure after a unique legal match is
  an explicit import error and cannot become a false-success built-in result.
- A review containing parser errors cannot be accepted or corrected into
  formal data. Corrected review output is persisted in `final_*` fields while
  the staged canonical/provenance/warning/error evidence remains unchanged.

## Material and trust evidence

- `parser-profile-material.ts` classifies source selection, mapping, row
  inclusion/add/remove, container, destination/grouping, cartons,
  three-decimal volume, package, delivery, waybill, reference, and PO changes.
- Reference/delivery/package edits are material only when the server's
  persisted destination grouping or pallet outcome changes. Outcome-neutral
  edits are audited but remain valid accepted evidence. Dock, wage/unloader,
  lifecycle/status, manual pallet override, report activity,
  and equivalent decimal formatting are not parser-material changes.
- A material correction or explicit rejection preserves reason/diff/actor/time,
  resets the current streak to `0/3`, and retains all prior evidence.
- A no-change acceptance uses the persisted import SHA and advances a locked,
  bounded streak. The third consecutive distinct-SHA acceptance promotes only
  the exact version to `TRUSTED`; the counter cannot exceed three.

## Real-workbook API evidence

`apps/api/test/parser-profile-reviews.e2e-spec.ts` derives five distinct
workbooks from the tracked real CAAU unloading-plan fixture without replacing
its layout. Through real PostgreSQL, HTTP, and the Python Worker it verifies:

1. staged `REVIEW_REQUIRED` with zero formal containers/generated files;
2. WAREHOUSE and HR_MANAGER read/decision `403`;
3. first no-change acceptance at `1/3`;
4. material destination correction and reset to `0/3`;
5. duplicate upload SHA rejection;
6. later `1/3`, concurrent duplicate accept at `2/3` with one evidence and one
   container, then final `3/3` promotion to `TRUSTED`;
7. five immutable evidence timeline entries with 12-character source hashes;
8. the staged destination remains unchanged while the accepted correction is
   stored and returned as a separate final result.

The focused suite passed: 1 test in 46.36 seconds in the remediation rerun.
The existing real-import regression also passed all 16 import tests, including built-in
parse persistence, duplicate SHA, report/label generation, pallet/inventory
summaries, deletion safety, parser errors, and manual learning linkage; Jest also
selected the three related attendance-import tests, for 19/19 total in that run.

## Web and browser evidence

- Import detail clearly labels staged review separately from parsed success and
  shows profile/version/streak, match reasons, bounded source preview,
  canonical rows, destination rows, provenance, warnings, report preview, and
  explicit accept/correct/reject confirmations.
- Profile governance shows short-SHA accepted/corrected/rejected evidence with
  reviewer, time, and streak after the event.
- English and Chinese use typed catalog entries for every new state, reason,
  field, warning, dialog, empty/error, ARIA, and action label.
- The self-cleaning Playwright test uses live nginx/API/PostgreSQL routes and
  verifies English/light desktop, Chinese/dark mobile, refresh, all three
  decision commands, complete row correction controls, material diff, `2/3`
  and reset `0/3`, evidence timeline, English/Chinese SSR response isolation,
  hydration, and zero browser or server errors.
- Real Chromium browser zoom is applied with `chrome.tabs.setZoom(2)`, not CSS
  emulation. The assertion observes a 683 CSS-pixel viewport from a physical
  1366-pixel viewport, no page horizontal scroll, bounded review/dialog geometry,
  and a long English rejection reason with visible controls.

Browser artifacts are generated under `test-results/parser-profile-06/`:

- `review-en-light-1440x1000.png`
- `review-zh-dark-412x915.png`
- `review-en-light-1366x768-real-browser-zoom-200.png`
- `review-reject-dialog-long-reason-real-browser-zoom-200.png`
- `profile-evidence-timeline-en-light.png`

## Verification executed in Docker

- Prisma generation and migration deploy: passed; all 31 migrations applied
  from an empty PostgreSQL database, including the review and remediation
  migrations; all three `final_*` columns were queried directly.
- API focused unit: 4 suites / 30 tests passed in the final rerun.
- API full unit: 41 suites / 319 tests passed.
- API lint and TypeScript typecheck: passed.
- Parser-profile real-workbook E2E: passed.
- Imports real-fixture E2E: 16/16 passed.
- Web full unit: 245/245 passed.
- Web lint and TypeScript typecheck: passed.
- Worker focused profile-match contract: 2/2 passed.
- Worker full pytest: 172/172 passed in 250.94 seconds.
- API and Web production image builds: passed.
- Playwright Chromium review flow: 1/1 passed (latest test 16.0 seconds).
- `git diff --check`: passed.

## Scope boundary and next task

This task intentionally does not auto-commit new imports matched by a trusted
profile and does not implement drift/collision fallback or trusted-profile
demotion. The only next parser-profile task is
`PARSER-PROFILE-07 Trusted Auto Parse Drift and Fallback Integration`.
