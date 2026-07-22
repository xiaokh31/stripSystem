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
    assert payload["parsed_result"]["parserVersion"] == "wage-attendance-v2"
    assert {
        day["calculationMethod"] for day in payload["parsed_result"]["days"]
    } == {"NO_PUNCHES", "FIRST_LAST_FALLBACK", "PAIRED_INTERVALS"}
    assert all("workIntervals" in day for day in payload["parsed_result"]["days"])
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


def test_wage_api_parse_and_generate_task_reports_do_not_overwrite(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "wage-api-shared-output"
    runner = CliRunner()

    parse_result = runner.invoke(
        app,
        [
            "wage-parse-file",
            "--attendance-file",
            str(ATTENDANCE_FIXTURE),
            "--output-dir",
            str(output_dir),
        ],
    )
    generate_result = runner.invoke(
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

    assert parse_result.exit_code == 0
    assert generate_result.exit_code == 0
    parse_payload = json.loads(parse_result.output)
    generate_payload = json.loads(generate_result.output)
    assert parse_payload["task_report_path"] != generate_payload["task_report_path"]
    assert Path(parse_payload["task_report_path"]).is_file()
    assert Path(generate_payload["task_report_path"]).is_file()
