#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$REPO_ROOT/apps/worker-python"
INPUT_DIR="$REPO_ROOT/samples/unloading-plans"
TEMPLATE_PATH="$REPO_ROOT/samples/templates/卸柜报告-En.xlsx"

if [[ -n "${PHASE0_OUTPUT_DIR:-}" ]]; then
  OUTPUT_DIR="$PHASE0_OUTPUT_DIR/phase0-check-$(date +%Y%m%d%H%M%S)"
else
  OUTPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/phase0-check.XXXXXX")"
fi

mkdir -p "$OUTPUT_DIR"

cd "$WORKER_DIR"
uv run unloading-worker batch \
  --input-dir "$INPUT_DIR" \
  --template "$TEMPLATE_PATH" \
  --output-dir "$OUTPUT_DIR"

fixture_count="$(find "$INPUT_DIR" -maxdepth 1 -type f -name '*.xlsx' | wc -l | tr -d ' ')"
parsed_count="$(find "$OUTPUT_DIR/parsed_json" -maxdepth 1 -type f -name '*.json' | wc -l | tr -d ' ')"
report_count="$(find "$OUTPUT_DIR/reports" -maxdepth 1 -type f -name '*.xlsx' | wc -l | tr -d ' ')"
label_count="$(find "$OUTPUT_DIR/labels" -maxdepth 1 -type f -name '*.pdf' | wc -l | tr -d ' ')"
task_report_path="$(find "$OUTPUT_DIR/task_reports" -maxdepth 1 -type f -name 'task-report-*.html' -print -quit)"
corrections_path="$(find "$OUTPUT_DIR/corrections" -maxdepth 1 -type f -name 'corrections-*.json' -print -quit)"

if [[ "$parsed_count" -ne "$fixture_count" ]]; then
  echo "Expected $fixture_count parsed_json files, got $parsed_count" >&2
  exit 1
fi

if [[ "$report_count" -lt 1 ]]; then
  echo "Expected at least one generated Excel report" >&2
  exit 1
fi

if [[ "$label_count" -lt 1 ]]; then
  echo "Expected at least one generated PDF label file" >&2
  exit 1
fi

if [[ -z "$task_report_path" ]]; then
  echo "Expected task report HTML output" >&2
  exit 1
fi

if [[ -z "$corrections_path" ]]; then
  echo "Expected corrections JSON output" >&2
  exit 1
fi

while IFS= read -r fixture_path; do
  fixture_name="$(basename "$fixture_path")"
  if ! grep -Fq "$fixture_name" "$task_report_path"; then
    echo "Task report missing fixture: $fixture_name" >&2
    exit 1
  fi
done < <(find "$INPUT_DIR" -maxdepth 1 -type f -name '*.xlsx' | sort)

echo "Phase 0 check passed"
echo "Output directory: $OUTPUT_DIR"
echo "Parsed JSON files: $parsed_count"
echo "Excel report files: $report_count"
echo "PDF label files: $label_count"
echo "Task report: $task_report_path"
echo "Corrections JSON: $corrections_path"
