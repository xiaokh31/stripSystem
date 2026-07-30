#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export REPORT_TASK_ID="UNLOAD-REPORT-05"
export REPORT_TASK_SLUG="unload-report-05"
export REPORT_VISUAL_RUN_ID="${REPORT_VISUAL_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
export REPORT_VISUAL_SERVICE="unload-report-05-visual-test"
export REPORT_FIXTURE_GENERATOR="generate_report_05_visual_workbooks.py"
export E2E_REPORT_SPEC="e2e/adaptive-report-layout.spec.ts"
export E2E_REPORT_FAILURE_PROBE="1"
export E2E_REPORT_CONSERVATION_PROBE="1"

exec "$repo_root/scripts/verify-unload-report-02.sh"
