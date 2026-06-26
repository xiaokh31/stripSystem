# Phase 0 Task Ledger

Phase 0 is a Python batch-processing prototype. Do not build UI, API,
database, queue, or mobile scan features before these tasks are accepted.

## Status

| Task ID | Status | Agent | Objective | Tests |
| --- | --- | --- | --- | --- |
| P0-01 | Done | Orchestrator Agent + Parser Agent | Register real Excel fixtures and validate SHA-256 coverage. | `cd apps/worker-python && uv run pytest tests/unit/test_fixtures.py` |
| P0-02 | Done | Parser Agent | Preserve imported original files and detect duplicate imports by SHA-256. | `cd apps/worker-python && uv run pytest tests/unit/test_import_registry.py` |
| P0-03 | Done | Parser Agent | Detect real Excel unloading-plan format variants. | `cd apps/worker-python && uv run pytest tests/unit/test_parser_detector.py` |
| P0-04 | Planned | Parser Agent | Emit normalized parsed JSON with raw_json, warnings, and errors. | `cd apps/worker-python && uv run pytest tests/unit/test_parsed_json.py` |
| P0-05 | Planned | Pallet Calculation Agent | Aggregate by destination and calculate pallet count. | `cd apps/worker-python && uv run pytest tests/unit/test_pallet_calculation.py` |
| P0-06 | Planned | Report Generator Agent | Generate unloading report Excel from parsed JSON. | `cd apps/worker-python && uv run pytest tests/unit/test_excel_report.py` |
| P0-07 | Planned | Label Generator Agent | Generate 150mm x 100mm pallet label PDF with 25mm QR target. | `cd apps/worker-python && uv run pytest tests/unit/test_label_pdf.py` |
| P0-08 | Planned | Report Generator Agent + Correction Agent | Generate HTML task report with warnings and auditable corrections. | `cd apps/worker-python && uv run pytest tests/unit/test_task_report.py` |
| P0-09 | Planned | Orchestrator Agent + QA Regression Agent | Run end-to-end batch CLI from real Excel to all Phase 0 outputs. | `cd apps/worker-python && uv run pytest` |

## Acceptance Criteria

### P0-01

- The fixture source of truth is `samples/unloading-plans`.
- All 28 real `.xlsx` files are registered in `docs/fixtures.md`.
- Every registered file has a SHA-256 hash and byte size.
- SHA-256 values are unique.
- No mock spreadsheet is used as a real fixture.

### P0-02

- Importing a real Excel file copies the original bytes into the configured
  original-file storage directory.
- A local manifest records SHA-256, original filename, byte size, stored path,
  and import attempts.
- Importing the same file content again is reported as a duplicate by SHA-256.
- Duplicate imports do not overwrite the first stored original file.
- No parser, UI, API, database, or queue work is introduced.

### P0-03

- Detector identifies known real fixture layout variants.
- Unknown formats return explicit errors.
- Parser errors are not silently swallowed.

### P0-04

- Parsed JSON includes container number, destination, cartons, volume,
  parser_version, raw_json, warnings, and errors.
- Unknown columns are preserved in raw_json.
- Missing container number is an error.
- Missing destination, cartons, or volume creates warning/error records.
- Volume `0` with cartons greater than `0` creates a warning.

### P0-05

- Rows aggregate by destination.
- Pallet IDs are unique.
- Pallet calculation warnings/errors remain traceable to parsed input.

### P0-06

- Excel unloading report is generated from parsed JSON.
- Every generated report is recorded.
- Original uploaded Excel files are not modified.

### P0-07

- PDF labels are exactly 150mm x 100mm.
- QR physical size target is 25mm x 25mm.
- QR payload contains a unique pallet ID.
- Every generated label is recorded.

### P0-08

- HTML task report summarizes parsed data, warnings, errors, reports, labels,
  and corrections.
- Corrections are append-only and auditable.

### P0-09

- One batch command generates parsed JSON, Excel report, label PDF, and HTML
  task report from a real fixture.
- Failures return explicit errors.
- UI/API/database/mobile scan remain out of scope.
