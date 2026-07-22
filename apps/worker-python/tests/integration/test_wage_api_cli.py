from __future__ import annotations

import json
from pathlib import Path

import xlrd
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


def test_wage_generate_record_uses_server_controlled_active_rows(tmp_path: Path) -> None:
    output_dir = tmp_path / "wage-api-active-only"
    normalized_path = tmp_path / "active-rows.json"
    normalized_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "source": "PERSISTED_ACTIVE_ATTENDANCE_ROWS",
                "attendanceImportId": "test-import",
                "dataRevision": 2,
                "parsedResult": {
                    "formatType": "WAGE_ATTENDANCE",
                    "parserVersion": "wage-attendance-v2",
                    "sourceSheet": "Sheet1",
                    "periodStart": "2026-06-01",
                    "periodEnd": "2026-06-30",
                    "confidence": 1,
                    "employees": [],
                    "days": [],
                    "warnings": [],
                    "errors": [],
                    "assumptions": ["active rows only"],
                },
            }
        ),
        encoding="utf-8",
    )
    result = CliRunner().invoke(
        app,
        [
            "wage-generate-record",
            "--attendance-file",
            str(ATTENDANCE_FIXTURE),
            "--wage-template",
            str(WAGE_TEMPLATE),
            "--output-dir",
            str(output_dir),
            "--normalized-attendance-json",
            str(normalized_path),
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["generation_input_source"] == "PERSISTED_ACTIVE_ATTENDANCE_ROWS"
    assert payload["day_count"] == 0
    assert payload["wage_record_result"]["writtenDayCount"] == 0
    assert Path(payload["wage_record_path"]).is_file()


def test_active_row_overlay_excludes_one_real_employee_day_without_changing_other_sheets(
    tmp_path: Path,
) -> None:
    runner = CliRunner()
    parsed_cli = runner.invoke(
        app,
        [
            "wage-parse-file",
            "--attendance-file",
            str(ATTENDANCE_FIXTURE),
            "--output-dir",
            str(tmp_path / "parse"),
        ],
    )
    assert parsed_cli.exit_code == 0
    parsed_payload = json.loads(parsed_cli.output)
    parsed_result = parsed_payload["parsed_result"]
    source_book = xlrd.open_workbook(WAGE_TEMPLATE)
    source_lay = source_book.sheet_by_name("FANGLEI XIAO (lay)")
    target = next(
        day
        for day in parsed_result["days"]
        if day["employeeName"] == "lay"
        and day["calculatedHours"] is not None
        and source_lay.cell_value(3 + day["dayNumber"] - 1, 2)
        != day["calculatedHours"]
    )
    active_result = {
        **parsed_result,
        "days": [
            day
            for day in parsed_result["days"]
            if not (
                day["employeeId"] == target["employeeId"]
                and day["workDate"] == target["workDate"]
            )
        ],
    }
    full_input = tmp_path / "full-active-rows.json"
    deleted_input = tmp_path / "deleted-active-rows.json"
    for path, result in (
        (full_input, parsed_result),
        (deleted_input, active_result),
    ):
        path.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "source": "PERSISTED_ACTIVE_ATTENDANCE_ROWS",
                    "attendanceImportId": "fixture-import",
                    "dataRevision": 3,
                    "parsedResult": result,
                }
            ),
            encoding="utf-8",
        )

    full_cli = runner.invoke(
        app,
        [
            "wage-generate-record",
            "--attendance-file",
            str(ATTENDANCE_FIXTURE),
            "--wage-template",
            str(WAGE_TEMPLATE),
            "--output-dir",
            str(tmp_path / "full-output"),
            "--normalized-attendance-json",
            str(full_input),
        ],
    )
    deleted_cli = runner.invoke(
        app,
        [
            "wage-generate-record",
            "--attendance-file",
            str(ATTENDANCE_FIXTURE),
            "--wage-template",
            str(WAGE_TEMPLATE),
            "--output-dir",
            str(tmp_path / "deleted-output"),
            "--normalized-attendance-json",
            str(deleted_input),
        ],
    )
    assert full_cli.exit_code == deleted_cli.exit_code == 0
    full_payload = json.loads(full_cli.output)
    deleted_payload = json.loads(deleted_cli.output)
    assert deleted_payload["generation_input_source"] == (
        "PERSISTED_ACTIVE_ATTENDANCE_ROWS"
    )
    assert deleted_payload["day_count"] == full_payload["day_count"] - 1
    assert deleted_payload["wage_record_result"]["writtenDayCount"] == (
        full_payload["wage_record_result"]["writtenDayCount"] - 1
    )

    full_book = xlrd.open_workbook(full_payload["wage_record_path"])
    deleted_book = xlrd.open_workbook(deleted_payload["wage_record_path"])
    target_row = 3 + target["dayNumber"] - 1
    assert full_book.sheet_by_name("FANGLEI XIAO (lay)").cell_value(
        target_row, 2
    ) == target["calculatedHours"]
    assert deleted_book.sheet_by_name("FANGLEI XIAO (lay)").row_values(
        target_row, 2, 6
    ) == ["/", "/", "/", "/"]

    control = next(
        day
        for day in parsed_result["days"]
        if day["employeeName"] == "hao" and day["calculatedHours"] is not None
    )
    control_row = 3 + control["dayNumber"] - 1
    assert full_book.sheet_by_name("HAO LIU").row_values(control_row) == (
        deleted_book.sheet_by_name("HAO LIU").row_values(control_row)
    )
    source_driver = source_book.sheet_by_name("司机WeiSheng Hong")
    deleted_driver = deleted_book.sheet_by_name("司机WeiSheng Hong")
    assert [source_driver.row_values(index) for index in range(source_driver.nrows)] == [
        deleted_driver.row_values(index) for index in range(deleted_driver.nrows)
    ]


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
