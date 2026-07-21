# PARSER-PROFILE-08 Golden Sample Full-Stack Exit Verification

Date: 2026-07-20 MDT

Task: `PARSER-PROFILE-08`

Environment: Docker Compose local full stack, PostgreSQL 17, Redis 7,
Chromium/Playwright 1.61.1

## Result

Repository implementation and all verification possible in the current
environment are complete. The Task remains
`CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`: the required four same-layout
new-customer golden pairs and their business approvals were not supplied and
must not be replaced by generated or derived workbooks.

PARSER-PROFILE-01 through 07 already provide the production path from failed
import and Office mapping through immutable completion replay, explicit
approval, three distinct-SHA reviews, trusted automatic parsing, report and
persisted downstream data, plus drift/collision/demotion fallback. This exit
gate re-ran that path, the negative contracts, the full regression suites, and
the bilingual browser journeys without changing application schema or business
logic.

## Golden-pair intake status

The repository contains 28 tracked real unloading workbooks, but no discoverable
bundle satisfies the Task's new-customer acceptance contract. In particular,
there is no set of four same-layout source workbooks paired with all of the
following:

- an approved canonical mapping/completion snapshot;
- the corresponding final unloading report;
- approved destination, carton, volume, container and pallet outcomes;
- layout variation notes; and
- a deidentified reviewer role and signoff date for the initial approval and
  each later no-material-correction review.

Therefore Pair A, B, C and D hashes, the actual `0/3 -> 1/3 -> 2/3 -> 3/3`
business evidence, and the customer-layout `TRUSTED` signoff are all pending.
No hash or reviewer identity is fabricated in this report.

The tracked CAAU fixture used by automated profile tests has SHA-256
`a30b…09f6` (shortened deliberately). The API E2E derives structurally related,
distinct-SHA copies from those tracked bytes to prove the machinery. These are
technical automation only and are not customer acceptance evidence.

## Automated full-stack evidence

The real-workbook API journey proves the following through PostgreSQL, HTTP and
Worker subprocesses:

1. failed import, learning case, mapping/replay and explicit approval;
2. OFFICE approval denial and authorized approval to `REVIEW_REQUIRED 0/3`;
3. three distinct SHA acceptances, exact-version `TRUSTED` promotion and trusted
   automatic commit;
4. destination/pallet outcome, repeat-parse idempotency and persisted audit;
5. duplicate SHA, material correction reset/demotion, collision, header drift,
   paused profile and stale lifecycle/trust fallback; and
6. import/reference deletion protection, stable concurrency outcomes and no
   silent Worker/API success.

Full API E2E additionally covers imports, generated reports and labels,
containers, corrections, inventory, loading scan, duplicate scan protection,
manual pallet override, unloading/loading state separation, RBAC, queue and wage
regressions. Worker full regression covers parser detection, warnings/errors,
pallet calculation, report generation, exact label/QR contracts and existing
real fixtures. No database migration was required.

The report template remains byte-identical at SHA-256
`31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027`;
`samples/` has no Task diff.

## I18n, accessibility and browser evidence

Typed English and Chinese catalogs own all parser-learning, governance, review,
selection, fallback, status, action, error, ARIA and diagnostics copy. API and
Worker responses retain stable codes/raw data; the Web resolves the primary
message and keeps raw codes in technical diagnostics. Customer workbook cells
remain visibly original data and are not translated.

Docker Chromium passed the failed-import mapping journey and the governance /
review journey in English and Chinese, light and dark themes, desktop/mobile,
refresh and true 200% browser zoom. Keyboard controls, first-error focus, ARIA
relationships, role-denied actions and SSR/hydration assertions are included in
those journeys. Nine high-signal screenshots were inspected at original
resolution across:

- `test-results/parser-profile-04/` — English 390px mapping, Chinese dark 768px,
  and English true-200%-zoom mapping end;
- `test-results/parser-profile-05/` — English 390px approval and Chinese dark
  true-200%-zoom governance; and
- `test-results/parser-profile-06/` — English desktop review, Chinese dark
  412px review, long-reason true-200%-zoom and evidence timeline.

No page-level horizontal overflow, clipping, overlap, visible bilingual copy,
raw-code primary message, English first-frame flash or hydration mismatch was
found. Source preview/diff regions use intentional local scrolling.

## Performance and operational evidence

- Active profile selection is bounded by `PROFILE_CANDIDATE_LIMIT = 100`.
- The real-fixture selection test performs one bounded workbook inspection and
  ranks 100 candidates under a 2.5-second in-test budget: 4 tests passed in
  2.34 seconds; the Docker command wall clock was 3.49 seconds.
- PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` used
  `parser_profile_versions_lifecycle_trust_state_idx`; the current empty active
  set executed in 0.165 ms before the 100-row limit.
- API health reported database and Redis queue up, with waiting, active, delayed
  and failed counts all zero.
- The browser E2E now cleans its exact generated import, container, learning
  case, profile family/version, review/evidence/audit/job/generated-file and
  storage records in `finally`. The cleanup is ID-scoped, rejects paths outside
  `/workspace/storage/`, and asserts transaction residue. Two fixtures left by
  earlier runs in this Task were also removed by exact identity; unrelated
  historical records were preserved.

## Verification commands and results

- API lint: passed.
- API typecheck: passed.
- API unit: 41 suites / 327 tests passed.
- API full E2E: 21 suites / 121 tests passed.
- Focused API learning/profile/governance unit: 6 suites / 93 tests passed.
- Focused API real-profile E2E: 2 suites / 5 tests passed.
- Worker full: 173 tests passed.
- Worker focused parser-profile coverage: 46 tests passed.
- Worker real-fixture selection budget: 4 tests passed.
- Web lint: passed.
- Web typecheck: passed.
- Web unit/i18n: 246 tests passed.
- API, Web and Worker production Docker builds: passed.
- Docker Chromium parser learning/governance/review: 2 tests passed; the
  cleanup-strengthened learning journey then passed independently.
- Prisma migration status: 32 migrations found; schema up to date.
- `scripts/healthcheck.sh`: passed with all six services healthy.
- sample/template byte checks and `git diff --check`: passed before document
  finalization and are repeated at handoff.

## External exit gate

To close this Task as `DONE`, business must supply and sign off one complete
same-layout new-customer set:

1. Pair A original or explicitly deidentified workbook, approved mapping /
   completion snapshot, final report, expected business outcome, variation
   notes and initial authorized approval;
2. Pair B, C and D with distinct SHA-256 values, matching approved outcomes and
   three separately dated no-material-correction review decisions;
3. actual evidence that the chain advances `0/3`, `1/3`, `2/3`, `3/3` and then
   becomes `TRUSTED` without bypassing review; and
4. a fifth same-layout customer workbook for automatic-parse signoff when
   available. Until then, existing same-layout real fixture automation proves
   only the mechanism, not that customer's business result.

Microsoft Excel-specific visual confirmation is required only if the supplied
customer final report needs an Excel-only layout/print decision. No repository
implementation or current-environment automation remains.
