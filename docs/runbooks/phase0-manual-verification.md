# Phase 0 Manual Verification

Use this runbook to verify the Phase 0 batch workflow against the real Excel
fixtures in `samples/unloading-plans`.

## Scope

This verifies the Python batch prototype only:
- Excel import and SHA-256 registry
- format detector
- supported parsers
- pallet calculation
- Excel unloading report generation
- PDF pallet label generation
- HTML task report
- corrections JSON draft
- batch CLI

It does not verify database, API, web, login, or mobile scan behavior.

## Automated Check

From the worker directory:

```bash
cd apps/worker-python
uv run pytest
bash ../../scripts/check-phase0.sh
```

The script writes output to a temporary directory by default. To choose a parent
directory for the generated run:

```bash
cd apps/worker-python
PHASE0_OUTPUT_DIR=/private/tmp/phase0-manual bash ../../scripts/check-phase0.sh
```

## Manual Batch Run

To inspect outputs directly:

```bash
cd apps/worker-python
uv run unloading-worker batch \
  --input-dir ../../samples/unloading-plans \
  --template ../../samples/templates/卸柜报告-En.xlsx \
  --output-dir ../../storage
```

Expected terminal output includes processed, success, warning, and failed
counts plus paths for parsed JSON, reports, labels, task report, and corrections
JSON.

## Files To Inspect

After the manual run, check:
- `storage/original_files/import_manifest.json` records every real fixture with
  SHA-256.
- `storage/parsed_json/` contains one JSON file for every `.xlsx` fixture.
- At least one generated workbook exists under `storage/reports/` and opens in
  Excel or openpyxl.
- At least one generated PDF exists under `storage/labels/`.
- `storage/task_reports/task-report-YYYY-MM-DD.html` contains every input
  filename, warnings, errors, totals, and report/label links.
- `storage/corrections/corrections-YYYY-MM-DD.json` contains manual correction
  placeholders.

## Failure Expectations

A failed or unsupported file must not stop the batch. It must appear in both
`parsed_json` and the HTML task report with an explicit error reason.

As of Phase 0, the real fixture set may include unsupported or warning files.
That is acceptable only when they are visible in the task report and do not hide
successful files.
