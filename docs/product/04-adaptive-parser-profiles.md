# Adaptive Parser Profiles

## Decision Status

- Product decision accepted: 2026-07-18.
- The first learned profile version requires explicit authorized approval.
- After approval, the profile remains review-required until three consecutive,
  distinct-SHA matching imports are accepted with no material parser correction.
- Reaching that three-import evidence streak promotes the exact profile version to
  trusted automatic parsing. A later profile version starts its own evidence
  count from zero.

## Problem

Customers supply unloading workbooks with different sheets, header rows,
column names, merged cells and summary layouts. The current detector and parser
contain fixed patterns and aliases, so unsupported customers either fail or can
be partially interpreted using the wrong assumptions.

Office staff can manually create an unloading report after a failed import, but
the current workflow does not retain a first-class relationship between the
original import and the manual outcome. A completed unloading report also
contains only aggregate warehouse values; it cannot uniquely prove which
source columns, rows or transformations produced them.

The system needs a safe way to convert real office corrections into reusable
parsing knowledge without allowing one mistaken manual report to corrupt future
imports.

## Actors

- **Office staff** uploads workbooks, opens learning cases, maps source fields,
  reviews previews and accepts or corrects review-required parses.
- **Parser-profile approver** reviews replay evidence and approves, pauses or
  retires profile versions. The default permission belongs to `ADMIN`; existing
  role management may delegate it without introducing an `OFFICE_MANAGER` role.
- **System worker** inspects workbooks, fingerprints structure, executes an
  approved declarative mapping and produces replay/diff evidence.
- **Warehouse staff** consumes the resulting report and inventory but does not
  approve parser profiles by default.

## Product Goals

1. Preserve every failed original workbook and link it to the manual outcome.
2. Let office staff teach a workbook layout through source-field mapping rather
   than source-code changes.
3. Produce deterministic, versioned, replayable parser profiles.
4. Require explicit approval before any learned profile processes later files.
5. Require three consecutive distinct-SHA no-material-correction acceptances before trusted
   automatic parsing.
6. Detect ambiguity and format drift and fall back to review/manual handling.
7. Preserve raw source columns, cell provenance, warnings, errors and audit
   history for every result.
8. Keep all user-visible states and errors under strict `en` / `zh-CN` i18n
   management.

## Non-Goals

- Do not train or fine-tune a machine-learning model in the first release.
- Do not send customer workbook content to an external AI service.
- Do not allow arbitrary Python, JavaScript, formulas or executable snippets in
  profile definitions.
- Do not infer mapping correctness solely from `UNLOADED`,
  `LOADING_IN_PROGRESS`, `LOADED`, report generation or label generation.
- Do not support legacy binary `.xls` or a workbook containing multiple
  independent containers unless a later requirement explicitly adds it.
- Do not replace current built-in parsers or regress their real fixtures.

## Canonical Parse Contract

Every profile execution produces the same normalized contract as a built-in
unloading parser, including:

- container number and source provenance;
- company when available;
- source detail row identity;
- destination code;
- cartons/piece count;
- volume CBM;
- waybill/reference/PO fields when available;
- delivery method and note when available;
- package evidence when explicit;
- destination summaries;
- warnings, errors and confidence/match evidence;
- all unknown source columns in `raw_json`;
- source sheet, row and cell/column provenance for each mapped field;
- immutable parser/profile version identity.

Missing required fields remain warnings/errors. A profile must never invent a
container number, destination, cartons or volume simply to make replay pass.

## End-To-End Workflow

### 1. Failed Import

1. Upload, SHA-256 duplicate detection and original-file preservation remain
   unchanged.
2. Built-in parsing and approved-profile matching return stable failure/match
   codes, not localized sentences.
3. An authorized office user starts a parser learning case from the failed
   import.
4. The learning case links the immutable import record to the manual container;
   the existing `Container.importFileId` meaning is not overloaded.
5. An import used by a learning case or profile evidence cannot be physically
   deleted while that evidence remains active.

### 2. Mapping And Manual Work

1. The system inspects workbook sheets, merged/header regions, candidate data
   ranges, normalized headers and a bounded sample of rows.
2. It may suggest candidate mappings, but suggestions are visibly unapproved.
3. Office staff confirms the source sheet, header area, data start/stop rules,
   field mappings, row filters and allowlisted transformations.
4. The same workflow creates or links the manual unloading report.
5. Every saved mapping and later correction records actor, timestamp, old/new
   value and reason without embedding localized UI text in API data.
6. Draft work is resumable. Closing a browser must not discard the mapping.

### 3. Completion Snapshot And Replay

1. The first durable unloading-completion event makes the case eligible for a
   final learning snapshot. Later loading states do not create duplicate cases
   or downgrade the container.
2. The snapshot contains only parser-relevant final facts and their audit
   history. Wage, scan and inventory statuses remain separate.
3. The worker replays the candidate profile against the preserved original
   workbook.
4. Replay compares canonical output with the approved manual snapshot and
   exposes field/destination differences.
5. Replay failure keeps the candidate in draft and gives actionable stable
   issue codes. It never activates the profile.

### 4. First Approval

1. Only a user with `parser_profiles.approve` can approve a replay-passed
   immutable profile version.
2. Approval requires a preserved original workbook, complete mapping,
   provenance, successful replay, no unresolved required-field errors and a
   human-readable profile name.
3. Approval records approver and timestamp and sets lifecycle `ACTIVE` with
   trust state `REVIEW_REQUIRED` and evidence count `0/3`.
4. Approval does not rewrite the original import, manual container or generated
   report.

### 5. Review-Required Evidence

1. A later distinct workbook matching an active review-required profile is
   parsed into a review result, not silently committed as trusted output.
2. Office staff compares source preview, normalized rows, destination summary,
   warnings and report preview.
3. Accepting without material parser correction records one evidence item.
4. Correcting a material parser field records the diff and resets the current
   consecutive trust streak to zero; history remains. Profile editing creates a
   new immutable version whose count also starts at zero.
5. Reparse of the same SHA-256, repeated acceptance of one import, report
   regeneration or another user accepting the same import cannot increase the
   count.
6. At three consecutive distinct-SHA valid evidence imports, the exact version automatically
   becomes `TRUSTED`, with an audit event. An approver may still pause it.

### 6. Trusted Automatic Parsing

1. Trusted automatic parsing is allowed only for one unique active profile
   whose required structural anchors and declared tolerances match.
2. An ambiguous match, missing required anchor, changed data region,
   incompatible type or unresolved required-field warning falls back to review
   or unsupported handling.
3. Filename and customer label can be display/search metadata but cannot be the
   sole matching evidence.
4. Every result stores profile family/version, matcher version, fingerprint,
   match reasons and parser version.
5. Paused or retired profiles are never selected for new imports.
6. A material parser correction to output produced by a trusted version
   immediately demotes that version to `REVIEW_REQUIRED`, resets its current
   streak to zero and writes an audit event; prior evidence remains visible.

## Structural Fingerprint And Match Rules

The fingerprint is deterministic and excludes cargo/customer values. It may
include:

- workbook type and visible sheet identities;
- normalized sheet/header anchors;
- one-to-three-row header structure and merged-cell relationships;
- relative mapped-column order and required-column presence;
- data-region start/stop markers;
- declared source value types and formula-cache availability;
- fingerprint algorithm version.

Row count, shipment values, container number and filename are not structural
identity. Optional-column changes may remain within a profile's explicit
tolerance. Required-anchor movement or conflicting profiles requires review.
The UI must show why a profile matched or failed instead of exposing only an
opaque percentage.

## Declarative Mapping Rules

Allowed operations are versioned and allowlisted:

- direct source column/cell mapping;
- trim, case normalization and blank/null normalization;
- decimal/integer parsing with explicit locale/group separator handling;
- `coalesce` across named sources;
- regular-expression extraction with bounded patterns;
- constant values and explicit lookup dictionaries;
- concatenate;
- multiply/divide and unit conversion for dimensions/volume;
- row include/exclude predicates;
- empty/summary/stop-row handling;
- canonical grouping after normalized row extraction.

Profiles cannot execute code, access files outside the selected workbook,
perform network calls or modify the workbook.

## Material Parser Corrections

The following reset or disqualify evidence for that import:

- container number/source selection;
- selected sheet, header/data range or row inclusion;
- destination code or destination grouping;
- cartons/piece count;
- volume or volume-unit conversion;
- mapped waybill/reference used to form a destination;
- delivery/package evidence that changes parser or pallet-rule outcome;
- adding/removing a parsed detail row;
- changing the profile mapping or transform definition.

The following do not by themselves disqualify parser evidence:

- dock number;
- unloading workers or wage classification;
- unloading/loading status after the snapshot;
- an audited manual pallet override caused by physical handling, provided no
  parser source field changed;
- report download/print history.

Cartons and destination identities compare exactly. Volume compares using the
canonical three-decimal CBM representation. If the manual outcome has no
verifiable volume while volume is required for the mapping, the case cannot
count as no-material-correction evidence.

## Profile Lifecycle

- `DRAFT`: editable candidate; never selected for normal imports.
- `ACTIVE`: approved immutable version eligible for matching.
- `PAUSED`: temporarily excluded from matching while evidence is retained.
- `RETIRED`: permanently excluded from new matching; history remains.

Trust is separate from lifecycle:

- `REVIEW_REQUIRED`: approved but every match requires office acceptance.
- `TRUSTED`: the current streak contains three consecutive distinct-SHA
  accepted no-material-correction imports.

Editing an active version creates a new draft version. History is never
overwritten. Trust does not transfer to the new version.

## Data Concepts

- **Profile family**: stable identity and display/customer metadata across
  versions.
- **Profile version**: immutable fingerprint, mapping and transform definition.
- **Learning case**: failed import, manual container, draft mapping, completion
  snapshot and replay state.
- **Field provenance**: canonical field to source sheet/row/cell relationship.
- **Replay result**: deterministic candidate output and diff against snapshot.
- **Profile evidence**: one distinct import acceptance/correction outcome.
- **Profile audit event**: create, edit, submit, replay, approve, accept, trust,
  pause and retire event with actor/time/reason.

## Permissions

Use stable permissions rather than role-name checks:

- `parser_profiles.read`: view profiles, matches and evidence;
- `parser_profiles.train`: create learning cases, edit mappings and submit
  candidates;
- `parser_profiles.review`: accept/correct review-required parses;
- `parser_profiles.approve`: approve, pause and retire profile versions.

Default grants:

- `ADMIN`: all four permissions;
- `OFFICE`: read, train and review;
- other roles: none by default.

Existing role management may delegate approval. API permission guards remain
authoritative; hiding a Web control is not sufficient.

## I18n Hard Gate

1. API and Worker return stable codes, enums, numeric/raw values, profile IDs
   and structured match reasons; they do not return localized UI sentences.
2. Profile lifecycle/trust states, learning-case states, mapping fields,
   suggestions, match/drift reasons, replay diffs, permissions, validation,
   empty/loading/error states, dialogs, tooltips, placeholders and ARIA text all
   live in typed `en` and `zh-CN` catalogs.
3. English shows only English and Chinese shows only Chinese. Raw enum/code may
   appear only in an explicitly diagnostic area, never as the primary label.
4. Locale switching, refresh, SSR and hydration must not flash the other
   language or concatenate bilingual fallback text.
5. Long English mapping labels and Chinese instructions must not overlap source
   preview, selectors, diff tables or approval controls at supported widths and
   200% zoom.

## Samples And Golden Pairs

Parser profiles still require real evidence. For a stable customer layout to
reach trusted auto-parse, collect at least four distinct-SHA pairs: one initial
learning/approval pair and three later evidence pairs. Each pair contains:

1. original workbook;
2. approved canonical mapping/snapshot;
3. corresponding final unloading report;
4. customer/layout label and known variation notes;
5. SHA-256 and de-identification statement when applicable.

Include a normal workbook, a multi-destination/complex workbook and a layout
edge case among those pairs. One source/report pair can create a draft
candidate, while two or three total pairs can only advance review evidence;
neither is enough for trusted auto-parse. A final report without its original
workbook and field mapping cannot establish a profile.

## Edge Cases

- Multiple profiles match: require selection/review; no automatic winner.
- Required header disappears or moves outside tolerance: drift warning and
  review/manual flow.
- Workbook formulas lack cached values: stable warning/error; do not calculate
  arbitrary Excel formulas in the server.
- Hidden/merged/multi-row headers: inspect and preserve structure; mapping must
  name the selected area.
- Duplicate SHA: return existing import/evidence; never increase trust count.
- Profile paused during a queued job: re-check active version before commit.
- Import deletion: block while referenced by a learning case/evidence; never
  leave a dangling profile proof.
- Profile edit during review: finish against the pinned version or restart
  explicitly; never mix versions.
- Replay mismatch after unloading completion: keep manual operational result
  intact and profile draft unapproved.
- Built-in parser fixture: preserve existing output unless an exact approved
  profile is intentionally pinned and produces equivalent canonical results.

## Delivery Tasks

1. `PARSER-PROFILE-01`: learning-case linkage, schema, permissions and audit
   foundation.
2. `PARSER-PROFILE-02`: deterministic workbook inspection, fingerprint and
   declarative mapping engine.
3. `PARSER-PROFILE-03`: learning-case preview, replay and candidate APIs.
4. `PARSER-PROFILE-04`: failed-import office mapping wizard.
5. `PARSER-PROFILE-05`: unloading-completion snapshot, approval and governance.
6. `PARSER-PROFILE-06`: review-required import evidence and three-acceptance
   trust gate.
7. `PARSER-PROFILE-07`: trusted automatic parsing, drift and fallback.
8. `PARSER-PROFILE-08`: real golden-pair onboarding and full-stack/i18n exit
   gate.

## Overall Acceptance Criteria

1. A failed import can be linked to one resumable learning case and manual
   container without losing original bytes or audit history.
2. A user can map a previously unsupported real workbook and produce canonical
   preview/replay output with cell provenance and unknown columns preserved.
3. Unloading completion freezes evidence but does not approve a mapping.
4. The first profile version cannot process future files until an authorized
   explicit approval succeeds.
5. An approved profile requires review for later imports and cannot become
   trusted before three consecutive distinct SHA-256 imports are accepted with no material
   correction.
6. Trusted matching parses future structurally compatible files; ambiguity or
   drift falls back without silently committing incorrect data.
7. Built-in parser, report, pallet, inventory, wage, loading and scan behavior
   remains intact.
8. Every state and action is auditable, permissioned and fully localized with
   no bilingual visible output.
