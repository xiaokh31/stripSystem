from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from worker_python.cli import app


REPO_ROOT = Path(__file__).resolve().parents[4]
ATTENDANCE_FIXTURE = REPO_ROOT / "samples" / "wage" / "workAttendanceRecordForm_June.xls"
WAGE_TEMPLATE = REPO_ROOT / "samples" / "wage" / "20260601-0630_wageRecords.xls"


def test_wage_parse_file_cli_writes_parsed_json_and_task_report(tmp_path: Path) -> None:
    output_dir = tmp_path / "wage-api-parse"
    runner = CliRunner()

    result = runner.invoke(
        app,
        [
            "wage-parse-file",
            "--attendance-file",
            str(ATTENDANCE_FIXTURE),
            "--output-dir",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["task_status"] == "WARNING"
    assert payload["employee_count"] > 0
    assert payload["day_count"] > 0
    assert payload["parsed_result"]["parserVersion"] == "wage-attendance-v1"
    assert Path(payload["parsed_json_path"]).is_file()
    assert Path(payload["task_report_path"]).is_file()
    assert payload["wage_record_path"] is None


def test_wage_generate_record_cli_writes_wage_record(tmp_path: Path) -> None:
    output_dir = tmp_path / "wage-api-generate"
    runner = CliRunner()

    result = runner.invoke(
        app,
        [
            "wage-generate-record",
            "--attendance-file",
            str(ATTENDANCE_FIXTURE),
            "--wage-template",
            str(WAGE_TEMPLATE),
            "--output-dir",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["task_status"] == "WARNING"
    assert payload["parsed_json_path"] is None
    assert Path(payload["wage_record_path"]).is_file()
    assert Path(payload["task_report_path"]).is_file()
    assert payload["wage_record_result"]["writtenEmployeeCount"] > 0
