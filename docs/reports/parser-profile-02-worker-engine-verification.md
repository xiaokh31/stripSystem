# PARSER-PROFILE-02 Worker Engine Verification

## Result

`PARSER-PROFILE-02` delivers a deterministic, bounded Worker deep module for
OOXML workbook inspection, structural fingerprinting, declarative mapping,
field provenance, unknown-column preservation, stable issue codes, and
unapproved mapping suggestions. It does not update profile lifecycle/trust,
write database state, replace built-in parsers, or start replay/API/UI work.

## Versioned contracts

- Workbook inspection: `workbook-inspection-v1`, exposed by
  `workbook_inspection_json_schema()` and `inspect_workbook()`.
- Structural matcher: `workbook-fingerprint-v1`, exposed by
  `fingerprint_definition_json_schema()`, `build_structural_fingerprint()` and
  `rank_profile_matches()`.
- Mapping definition: `parser-profile-mapping-v1`, exposed by
  `mapping_definition_json_schema()` and strict Pydantic models.
- Canonical profile output: `parser-profile-engine-v1`, exposed by
  `profile_parse_result_json_schema()` and `execute_mapping()`.
- Output metadata pins profile version, mapping schema version, fingerprint
  version, replay input hash, source SHA-256, source sheet, header selector and
  bounded data range/execution limits. The canonical result includes optional
  workbook-level company, customer, PO and clear-order fields with provenance.

The allowlist covers direct cell/column/constant row sources; trim, case and
blank normalization; decimal/integer parsing with explicit separators;
coalesce, lookup, concatenate and bounded regex extraction; multiply, divide
and CBM unit conversion; blank/summary/include/exclude/stop predicates; and
canonical destination/package grouping. A container number cannot use a
constant source.

## Safety and explainability

- Inspection accepts `.xlsx`/`.xlsm` OOXML only, disables external links, uses
  read-only formula/cached-value workbooks, records hidden sheet identity and
  bounded dimensions, and reads merged ranges from bounded OOXML archive
  entries. Macros, formulas, external links, filesystem targets and network
  targets are never executed.
- Default inspection/mapping limits are 20 sheets, 500 rows/sheet, 100
  columns/sheet, 20,000 cells, 500 sampled cells/sheet, 5,000 merged
  ranges/sheet, 2,000 archive entries, 20 MB/archive entry and 100 MB total
  uncompressed archive content. Archive budgets are checked before worksheet
  XML reads. Mapping checks selected-sheet width, 500-row limit and the
  row-by-column cell budget before iterating detail rows. Exceeding a budget
  returns a stable structured issue.
- Fingerprints exclude filename, container/customer/cargo values and row count.
  They hash workbook type, selected sheet/header anchors, header merge evidence,
  required relative columns, declared source value types/formula-cache
  requirements and declared data start/stop markers. Match and drift reasons
  remain human-reviewable; any multiple matching profiles return
  `FINGERPRINT_PROFILE_COLLISION` with no selected winner.
- Regex definitions are length-limited and reject nested/repeated ambiguous
  quantifiers, adjacent variable quantifiers and backreferences. The `regex`
  runtime applies a 50 ms per-operation timeout plus one shared 1,000-operation/
  2-second request budget; oversized input, timeout and aggregate exhaustion
  return distinct stable codes. Definitions have no recursive expression model,
  reject unknown fields/operations, and limit sources/transforms/dictionaries/
  predicates.
- Worker payloads contain stable codes, paths, raw values and structured params,
  not localized UI messages. Codes and operations are centralized in
  `issue_registry.py` for later typed `en`/`zh-CN` catalog integration.

## Real fixture evidence

- `samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx`
  - SHA-256 `a30b0373c0dbcd46ab55fe98016058e6479aea7c6bb12a4bc4e5766f1f89450e`.
  - Profile output reconciles 43 canonical rows, container, cartons, CBM and
    destinations with `parse_unloading_plan_cn`; provenance resolves
    destination/cartons/volume to `G7`/`D7`/`F7` on the first row.
- `samples/unloading-plans/137675 JXJU3246131  PO#3404  BESTAR.xlsx`
  - SHA-256 `c468e29e37fcbd250f1611777c6bb3b6a3f2b9d6c73f560866c171cea7034da4`.
  - Profile output reconciles container, company/customer, PO, clear-order,
    item identities, cartons, skid totals and manual-destination summary status
    with `parse_bestar_receiving`; unmapped `PIECES PER CARTON` and `TOTAL # OF
    PCS` remain in `raw_json`, and carton provenance resolves to `E12`.
- `samples/unloading-plans/Unloading Plan SMCU1012780.xlsx`
  - Exercises a real sheet whose OOXML dimension metadata is absent. Bounded
    iteration still reconciles 59 rows and skips the declared numeric summary.
    The workbook has no internal container source, so the required parser
    fallback extracts `SMCU1012780` from the preserved filename and records
    filename provenance.
- `samples/unloading-plans/DRYU9800413 - Unloading Plan.xlsx`
  - SHA-256 `2219f032a56566ac1bcd855b67e1d7197beb53097927e725d71215bec4071aea`.
  - Produces the same structural fingerprint as the CAAU workbook under the
    shared layout definition despite different cargo and row count.

Negative tests cover moved/missing anchors, data start/stop drift, incompatible
OOXML/source value types, Bestar vs unloading-plan drift, unequal-score profile
collision, legacy `.xls`, corrupt OOXML, archive entry/count/total size and
merged-range/row/column/cell limits, missing formula cache before row filters,
missing columns, dangerous/unknown operations, unsafe cell references,
nested/adjacent/oversized regex, per-call timeout and request-budget exhaustion,
conflicting numeric separators, a forbidden constant container and stable i18n
contract scanning.

## Automated verification

All commands ran in Docker according to `AGENTS.md`:

- rebuilt `bestar_worker_python_local:latest` from the frozen lockfile;
- Worker full suite: 169 tests passed in 199.24 seconds, including all existing
  parser/calculator/report/label/Phase 0 real-fixture regression;
- focused profile unit/integration behavior is included in 42 tests across
  `test_parser_profile_engine.py`, `test_parser_profile_fingerprint.py` and
  `test_parser_profile_real_fixtures.py`;
- `ruff check src tests` passed;
- scoped `ruff format --check` passed for all 11 Task Python files (the older
  repository-wide formatter baseline still lists unrelated pre-existing files);
- scoped `mypy src/worker_python/parser_profiles` passed for 8 source files;
- `git diff --check` passed.

On the tracked CAAU fixture inside Docker, bounded inspection took 0.0765 s and
mapping (including its safety inspection) took 0.1811 s for 43 canonical lines,
three inspected sheets and 377
sampled cells. These timings are diagnostic rather than a cross-host SLA.

## Manual review steps

1. Call `inspect_workbook()` for the CAAU and Bestar fixtures and review sheet
   visibility, bounded dimensions, merged ranges, header/data candidates and
   structured issues.
2. Build the CAAU/DRYU fingerprint with the tracked test definition; verify the
   hashes match and the Bestar/moved-anchor variants return drift reasons.
3. Execute the tracked JSON profile definitions; follow first-row provenance
   back to the named workbook cells and confirm unknown columns remain raw.
4. Submit an unknown operation, path-like cell, nested-quantifier regex and
   constant container; verify stable validation codes and no execution.

## Boundaries and next Task

Legacy `.xls`, database/profile lifecycle, learning-case replay APIs, mapping
wizard UI, approval, evidence streaks and trusted auto-parse remain outside this
Task. The next supervised Task is only `PARSER-PROFILE-03Learning Case Preview
Replay and Candidate APIs.md`.
