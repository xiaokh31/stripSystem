# POD Template and Document Management Plan

## Status

- Product requirement approved on 2026-07-25.
- Runtime implementation does not exist yet.
- Phase 0 is blocked until the office provides at least one real or explicitly
  sanitized POD template and one matching, business-approved completed/printed
  example.
- The first implementation supports only the template format and mapping
  profile proven by that fixture. It must not claim arbitrary Excel, Word or
  PDF compatibility.

## Problem Statement

Office staff currently need to prepare Proof of Delivery documents outside the
Bestar system. Different POD layouts may be needed for different customers or
operations. The office needs to upload and name reusable templates, maintain
their active versions, select a template when creating a POD, fill the
template-defined fields, save the completed document, print it directly, and
find the saved document later.

The workflow must preserve every original template and every saved POD
revision. Replacing a template or editing a saved POD must not silently
overwrite the bytes that were previously used or printed.

## Terminology

- **POD**: Proof of Delivery document. The visible Web menu is exactly `POD` in
  both supported locales.
- **Template**: the office-facing named POD definition.
- **Template version**: immutable uploaded source bytes plus SHA-256, detected
  file profile, field mapping and print settings.
- **Field mapping**: a version-bound list of stable field keys, data types,
  validation rules and approved targets in the source template.
- **POD document**: the stable business record and system-generated POD number.
- **POD revision**: immutable saved input snapshot and its generated artifacts.
- **Archive**: the searchable history of saved POD documents and revisions. It
  does not mean moving files outside managed storage.
- **Print request**: an audited request to open/print one saved revision. A Web
  application cannot truthfully prove that the operating system printer
  completed the physical print.

## Actors and Permissions

The first release uses explicit permissions:

- `pod.template.read`
- `pod.template.manage`
- `pod.document.read`
- `pod.document.create`
- `pod.document.update`
- `pod.document.print`
- `pod.document.void`

Default role proposal:

| Role | Template management | Create/update POD | View/print archive |
| --- | --- | --- | --- |
| `ADMIN` | Yes | Yes | Yes |
| `OFFICE` | Yes | Yes | Yes |
| `WAREHOUSE_MANAGER` | No | No | No |
| `HR_MANAGER` | No | No | No |
| `WAREHOUSE` | No | No | No |

The seed permission matrix must be explicit and additive. Existing users must
not gain POD access from unrelated container, wage, inventory or report
permissions.

## User Stories

1. As office staff, I can upload a POD template, give it a unique business
   name and validate its field/print profile.
2. As office staff, I can see active and inactive templates and their version
   history without exposing storage paths.
3. As office staff, I can replace a template with a new version without
   changing POD documents created from the old version.
4. As office staff, I can select an active template and fill only the fields
   defined by that exact version.
5. As office staff, I can save the POD and receive a stable POD number and
   generated print artifact.
6. As office staff, I can print the latest saved revision with one action.
7. As office staff, I can search the POD archive, open an older revision and
   reprint the exact archived artifact.
8. As an auditor, I can identify who uploaded/renamed/activated a template and
   who created/updated/voided/requested print for a POD.

## Workflow

### Template Onboarding

1. Open `POD` and select the Templates view.
2. Upload one supported source template and enter a required template name.
3. The backend stores the original bytes, calculates SHA-256, validates magic
   bytes/extension/size and runs bounded structural inspection.
4. Configure or confirm the version's field mapping against stable field keys.
5. Generate a deterministic preview with non-sensitive fixture values.
6. Review the source-format output and print-ready PDF.
7. Activate the version only after validation succeeds.

An unsupported, encrypted, macro-enabled, externally linked or structurally
unsafe file fails closed with a stable code. The exact first-release accepted
format is decided by POD-00 from the real fixture.

### Template Maintenance

- Template names are required, trimmed and unique among non-voided templates
  using a documented case-normalization rule.
- Rename changes template metadata and is audited.
- Replacing source bytes creates a new immutable version. It never edits the
  old version in place.
- Inactivation hides a template from new POD creation but preserves it for old
  records and reprints.
- A version referenced by a POD revision cannot be physically deleted.
- Duplicate SHA uploads are detected and shown as a stable conflict rather
  than silently storing another indistinguishable version.

### Create, Save and Print

1. Open the `POD` menu and choose New POD.
2. Select one active template version.
3. The Web form renders the exact mapped fields and validation rules returned
   by the API. The browser cannot submit arbitrary worksheet/cell targets.
4. Enter values and save.
5. The backend validates the values, allocates a unique POD number, creates an
   immutable revision and queues/generates its artifacts.
6. The saved view shows the generated status and Print action.
7. Print opens the saved print-ready PDF and invokes the browser print dialog
   after the PDF is loaded. Silent printing is not promised.

Printing is always based on a persisted revision, never unsaved browser state.
If a user edits a saved POD, the next save creates another immutable revision;
old generated bytes and print history remain available.

### Archive and Reprint

- The default archive lists saved POD documents with POD number, template
  name/version, relevant business reference, created/updated time and actor.
- Search/filter supports POD number, template, date range, business reference
  and active/voided status.
- Opening a record shows revision history and audit events.
- Reprint downloads/opens the exact artifact from the selected revision. It
  does not regenerate using the newest template.
- Voiding requires a reason and permission; it does not delete revisions or
  files. A voided watermark/print rule is a separate approved decision and
  must not be invented.

## Business Rules

1. Original uploaded template files are always preserved.
2. Each template version has immutable SHA-256, media type, file size, storage
   key, structural profile, field mapping, print profile, actor and time.
3. Template source storage and generated POD storage use root-containment
   checks. API responses never expose internal absolute paths.
4. Template source files are not modified in place. Generation always starts
   from a copied version.
5. Every saved revision stores the exact template-version id, template SHA,
   validated input JSON, actor, generated-file ids and generation result.
6. Every generated source-format file and PDF is recorded through the existing
   generated-file/audit conventions.
7. Saving/generation uses idempotency and transaction boundaries so retries do
   not allocate two POD numbers or duplicate revisions.
8. A generation error keeps the saved revision and stable failure status for
   review; it is not silently swallowed.
9. Unknown template fields, missing required inputs, values over limits and
   invalid date/number types return stable validation codes with field keys.
10. User-supplied template names, template document text and configured field
    labels are business data, not localization catalog entries. System shell,
    actions, statuses, errors, aria text and help text remain localized.
11. Generated POD language and layout come from the selected template version,
    not from the current Web locale.
12. POD records do not change container status, pallet inventory, loading scan,
    unloading wage or work-hours state.

## Data Concepts

### POD Template

- id
- business name and normalized name
- active/inactive status
- current version id
- created/updated actor and timestamps

### POD Template Version

- template id and monotonically increasing version
- original file storage key, SHA-256, size and detected media/profile
- immutable field-schema/mapping JSON
- immutable print-profile JSON
- validation status and stable issues
- uploaded/approved actor and timestamps

### POD Field Definition

- stable field key
- type: text, multiline text, date, number or boolean as proven by the fixture
- required flag
- maximum length/range
- target sheet/range/named target or equivalent profile-specific locator
- output format and wrapping rule
- user-configured business label data

The implementation must not allow executable formulas, arbitrary filesystem
paths, script expressions or browser-supplied cell coordinates.

### POD Document and Revision

- stable document id and unique POD number
- active/voided status and optional business reference
- current revision id
- immutable revisions containing template-version snapshot, validated values,
  generated artifacts, generation status, actor and time
- immutable void and print-request events

## Print Contract

1. The POD-00 fixture defines paper size, orientation, margins, print area,
   page count, scaling and minimum readable output.
2. The generated source document preserves untouched values, formulas,
   formatting, merged ranges, images and print settings supported by the
   approved profile.
3. Generated visible values wrap or expand according to the mapping contract
   and cannot be clipped in normal view or print output.
4. A print-ready PDF is generated from the same saved revision in a
   reproducible Docker worker path.
5. Automated checks compare source-template SHA, generated package structure,
   PDF page geometry, text presence and visual crops.
6. Target Windows/Microsoft print preview and the office printer remain
   external acceptance evidence before production sign-off.

## I18n Management

Strict i18n is a release gate for every POD task:

- API/Worker return stable codes, enums, field keys, timestamps and raw
  user-supplied business data, not localized UI sentences.
- The Web menu label is `POD` in both locales.
- All system-visible template/document statuses, buttons, confirmation dialogs,
  validation summaries, empty/loading/error states, tooltips, placeholders,
  table headers, accessibility names and print actions live in the typed
  `en`/`zh-CN` catalogs.
- English mode shows only English system UI; Chinese mode shows only Chinese
  system UI. No bilingual concatenation or raw enum/code is permitted.
- A Chinese direct refresh starts in Chinese before hydration; locale switching
  preserves the selected template and unsaved field values.
- Template names/content and configured field labels are user data and are not
  machine-translated or concatenated with a catalog fallback.
- Generated document language is template-owned and must not change when the
  Web locale changes.

## Delivery Phases

1. `POD-00`: real template fixture, field/print contract and Worker proof.
2. `POD-01`: versioned template registry, storage, API, RBAC and audit.
3. `POD-02`: POD template-management Web workspace.
4. `POD-03`: POD document/revision/generation/archive API and Worker pipeline.
5. `POD-04`: POD composer, saved view, archive, revision and print Web workflow.
6. `POD-05`: full-stack RBAC/i18n/security/visual/print/archive exit gate.

POD-01 must not begin until POD-00 has one approved fixture/profile. Later
tasks execute in order and one fresh supervised Session per Task.

## Acceptance Criteria

1. An authorized office user can upload, name, validate, activate, replace and
   inactivate a supported POD template.
2. The original template and every version remain byte-for-byte preserved and
   auditable.
3. An active template can create a saved POD revision from mapped fields.
4. Save generates a source-format artifact when applicable and a print-ready
   PDF, both tied to the exact template version and actor.
5. Print uses only a saved revision and opens the correct archived PDF.
6. Archive search finds records and displays immutable revision/print history.
7. Replacing/inactivating a template does not change or break old reprints.
8. Unauthorized roles cannot discover or invoke template/document APIs or UI.
9. Invalid, duplicate and unsafe uploads fail with stable codes and no orphan
   files/rows.
10. English and Chinese UI pass direct-refresh, switch, unknown-code and
    no-mixed-language checks.
11. Real fixture package and Docker-rendered PDF preserve required content,
    layout, page geometry and readable printing.
12. Database migrations work on existing and empty databases; backup, storage
    and generated-file conventions remain intact.

## Test Decisions

- Worker unit/package tests use the approved real or explicitly sanitized
  fixture and assert the template SHA never changes.
- Security tests cover MIME/extension mismatch, encrypted/unsafe package,
  external links/macros where relevant, path traversal, oversized upload,
  duplicate SHA and malformed mapping.
- API unit/E2E tests cover permissions, versioning, immutable references,
  idempotency, concurrent save, generation failure, voiding, archive filters,
  exact revision download and audit attribution.
- Web unit/E2E tests cover upload/maintenance, template selection, typed form,
  required/invalid inputs, save, generation states, print action, archive,
  revision/reprint and access denial.
- Locale tests cover `en` and `zh-CN`, direct refresh, locale switch with form
  state retained, no raw code and no bilingual UI.
- Docker visual checks cover desktop/mobile, light/dark, zoom, long field
  values and the generated PDF at original resolution.
- Tests create uniquely prefixed fixtures and remove their database/storage
  artifacts in `finally`/trap cleanup without touching business records.

## Required Inputs and Open Decisions

Before POD-00 can reach a deliverable terminal state, the business must provide:

1. One real or explicitly sanitized blank POD template.
2. One matching completed POD that represents the approved printed result.
3. The field list, required fields and expected example values.
4. Required paper size, orientation, copy count and whether a fixed one-page
   result is mandatory.
5. Confirmation of the source format and whether macros/external links exist.

Still open and excluded until explicitly approved:

- handwritten or electronic signatures;
- customer signature capture, photos or attachments;
- email/SMS delivery;
- automatic relation to container, load job, shipment or inventory;
- bulk POD generation;
- OCR or automatic learning of arbitrary templates;
- silent/background printing or a local print agent;
- digital certificate signing;
- hard deletion of templates, revisions or print history.

## Out of Scope

- Replacing the existing unloading report, pallet label or wage generators.
- Letting browsers write arbitrary cell addresses or formulas.
- Editing the uploaded source template bytes in place.
- Claiming successful physical printing from a browser print request.
- Supporting every Office/PDF format without a fixture-backed profile.
