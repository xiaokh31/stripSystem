# Phase 0 Task Ledger

Phase 0 is a Python batch-processing prototype. Do not build UI, API,
database, queue, or mobile scan features before these tasks are accepted.

## Status

| Task ID | Status | Agent | Objective | Tests |
| --- | --- | --- | --- | --- |
| P0-01 | Done | Orchestrator Agent + Parser Agent | Register real Excel fixtures and validate SHA-256 coverage. | `cd apps/worker-python && uv run pytest tests/unit/test_fixtures.py` |
| P0-02 | Done | Parser Agent | Preserve imported original files and detect duplicate imports by SHA-256. | `cd apps/worker-python && uv run pytest tests/unit/test_import_registry.py` |
| P0-03 | Done | Parser Agent | Detect real Excel unloading-plan format variants. | `cd apps/worker-python && uv run pytest tests/unit/test_parser_detector.py` |
| P0-04 | Done | Parser Agent | Emit normalized parsed JSON with raw_json, warnings, and errors. | `cd apps/worker-python && uv run pytest tests/unit/test_unloading_plan_cn_parser.py` |
| P0-05 | Done | Parser Agent | Parse Bestar receiving report rows and preserve missing destination warnings. | `cd apps/worker-python && uv run pytest tests/unit/test_bestar_receiving_parser.py` |
| P0-06 | Done | Pallet Calculation Agent | Aggregate by destination and calculate pallet count. | `cd apps/worker-python && uv run pytest tests/unit/test_pallet_calculator.py` |
| P0-07 | Done | Report Generator Agent | Generate unloading report Excel from parsed data and pallet plans. | `cd apps/worker-python && uv run pytest tests/unit/test_excel_report_writer.py` |
| P0-08 | Done | Label Generator Agent | Generate 150mm x 100mm pallet label PDF with 25mm QR target. | `cd apps/worker-python && uv run pytest tests/unit/test_pdf_label_generator.py tests/unit/test_qr_payload.py` |
| P0-09 | Done | Report Generator Agent + Correction Agent | Generate HTML task report and corrections JSON draft. | `cd apps/worker-python && uv run pytest tests/unit/test_task_report.py` |
| P0-10 | Done | Batch CLI Agent | Run Phase 0 batch CLI from real Excel files to parsed JSON, reports, labels, and task report. | `cd apps/worker-python && uv run pytest tests/integration/test_batch_cli.py` |

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

- Parser only accepts files detected as BESTAR_RECEIVING.
- Header metadata includes container number, PO number, customer, and clear
  order number.
- Item rows include item number, description, total cartons, total skid count,
  and raw_json.
- Missing destination is not fabricated and creates NEED_MANUAL_DESTINATION.
- Total rows are not counted as duplicate item rows.

### P0-06

- Rows aggregate by destination.
- Pallet IDs are unique.
- Pallet calculation warnings/errors remain traceable to parsed input.

### P0-07

- Excel unloading report is copied from `samples/templates/卸柜报告-En.xlsx`.
- Generated reports are written under `storage/reports` by default.
- Template file is not modified.
- Report includes date, time, container number, company, destination, pallet
  count, carton count, and total carton count.
- Destination overflow beyond template rows creates a warning.
- Generated report is recorded in a report manifest.

### P0-08

- PDF labels are exactly 150mm x 100mm.
- QR physical size target is 25mm x 25mm.
- QR payload contains a unique pallet ID.
- Every generated label is recorded.
- Long destination text wraps without changing QR dimensions.

### P0-09

- HTML task report is generated under `storage/task_reports` by default.
- Corrections JSON draft is generated under `storage/corrections` by default.
- Every input fixture can be represented in the report, including unsupported
  or failed files.
- Report displays filename, detected format, container number, parse status,
  confidence, destination summaries, totals, pallet count, report/label links,
  warnings, and errors.
- Corrections JSON includes correctedContainerNo, correctedDestinationCode,
  correctedPallets, and correctionNote placeholders.

### P0-10

- `unloading-worker batch` accepts input directory, Excel report template, and
  output directory arguments.
- The batch runner imports and preserves original `.xlsx` files, records
  SHA-256, detects format, parses supported files, calculates pallets, writes
  parsed JSON, and generates reports and labels for successful files.
- Batch output includes `parsed_json`, `reports`, `labels`, `task_reports`, and
  `corrections` directories under the selected output directory.
- A failed file does not stop the batch and is included in parsed JSON and the
  HTML task report with an explicit error reason.
- The CLI prints a terminal summary with processed, success, warning, and failed
  counts plus output paths.
