from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from worker_python.cli import app


REPO_ROOT = Path(__file__).resolve().parents[4]
WAGE_DIR = REPO_ROOT / "samples" / "wage"
ATTENDANCE_FIXTURE = WAGE_DIR / "workAttendanceRecordForm_June.xls"
WAGE_TEMPLATE = WAGE_DIR / "20260601-0630_wageRecords.xls"


def test_wage_p0_parse_cli_generates_attendance_hours_json_only(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "wage-p0-parse"
    runner = CliRunner()

    result = runner.invoke(
        app,
        [
            "wage-p0-parse",
            "--attendance-file",
            str(ATTENDANCE_FIXTURE),
            "--output-dir",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["originalFilename"] == ATTENDANCE_FIXTURE.name
    assert payload["sha256"] == (
        "4c3a5c0750e04f99cd614da033d54d948b5fd1b72e0ffec4f19a3d35c9f682b3"
    )
    assert payload["taskStatus"] == "WARNING"
    assert payload["duplicate"] is False
    assert payload["employeeCount"] == 13
    assert payload["dayCount"] == 390
    assert payload["warningCount"] > 0
    assert payload["errorCount"] == 0
    assert Path(payload["parsedJsonPath"]).is_file()
    assert not (output_dir / "wage_records").exists()
    assert not (output_dir / "task_reports").exists()

    parsed_payload = json.loads(Path(payload["parsedJsonPath"]).read_text(encoding="utf-8"))
    assert parsed_payload["batch_version"] == "wage-p0-02-parse-v1"
    assert parsed_payload["parse_scope"] == "attendance-parser-hours-json"
    assert parsed_payload["wage_record_result"] is None
    assert parsed_payload["task_report"] is None
    assert parsed_payload["detection"]["format_type"] == "WAGE_ATTENDANCE"
    assert parsed_payload["parsed_result"]["parserVersion"] == "wage-attendance-v2"
    assert parsed_payload["parsed_result"]["periodStart"] == "2026-06-01"
    assert parsed_payload["parsed_result"]["periodEnd"] == "2026-06-30"
    assert len(parsed_payload["parsed_result"]["employees"]) == 13
    assert len(parsed_payload["parsed_result"]["days"]) == 390
    assert parsed_payload["parsed_result"]["rawRows"]
    assert parsed_payload["errors"] == []
    assert any(
        warning["code"] == "ODD_PUNCH_COUNT"
        for warning in parsed_payload["warnings"]
    )

    deng_june_1 = next(
        day
        for day in parsed_payload["parsed_result"]["days"]
        if day["employeeName"] == "deng wei" and day["workDate"] == "2026-06-01"
    )
    assert deng_june_1["punchTimes"] == ["08:36", "17:52"]
    assert deng_june_1["calculationMethod"] == "PAIRED_INTERVALS"
    assert deng_june_1["workIntervals"] == [
        {"start": "08:36", "end": "17:52", "minutes": 556, "hours": 9.27}
    ]
    assert deng_june_1["pairedGrossHours"] == 9.27
    assert deng_june_1["lunchHours"] == 0.5
    assert deng_june_1["calculatedHours"] == 8.77
    assert deng_june_1["rawCellValues"] == ["08:36\n17:52"]

    import_manifest = json.loads(
        (output_dir / "original_files" / "import_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert len(import_manifest["records"]) == 1
    assert import_manifest["records"][0]["sha256"] == payload["sha256"]


def test_wage_p0_cli_generates_parsed_json_wage_record_and_task_report(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "wage-p0"
    runner = CliRunner()

    result = runner.invoke(
        app,
        [
            "wage-p0",
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
    assert payload["originalFilename"] == ATTENDANCE_FIXTURE.name
    assert payload["sha256"] == (
        "4c3a5c0750e04f99cd614da033d54d948b5fd1b72e0ffec4f19a3d35c9f682b3"
    )
    assert payload["taskStatus"] == "WARNING"
    assert payload["duplicate"] is False
    assert payload["employeeCount"] == 13
    assert payload["dayCount"] == 390
    assert payload["warningCount"] > 0
    assert payload["errorCount"] == 0
    assert Path(payload["parsedJsonPath"]).is_file()
    assert Path(payload["wageRecordPath"]).is_file()
    assert Path(payload["wageRecordManifestPath"]).is_file()
    assert Path(payload["taskReportPath"]).is_file()

    parsed_payload = json.loads(Path(payload["parsedJsonPath"]).read_text(encoding="utf-8"))
    assert parsed_payload["parsed_result"]["periodStart"] == "2026-06-01"
    assert parsed_payload["parsed_result"]["periodEnd"] == "2026-06-30"
    assert (
        "Lunch hours are fixed at 0.5 hours once after gross calculation when at least two punch boundaries exist."
        in parsed_payload["parsed_result"]["assumptions"]
    )
    assert parsed_payload["parsed_result"]["employees"]
    assert parsed_payload["parsed_result"]["days"]
    deng_june_1 = next(
        day
        for day in parsed_payload["parsed_result"]["days"]
        if day["employeeName"] == "deng wei" and day["workDate"] == "2026-06-01"
    )
    assert deng_june_1["pairedGrossHours"] == 9.27
    assert deng_june_1["lunchHours"] == 0.5
    assert deng_june_1["calculatedHours"] == 8.77
    assert parsed_payload["wage_record_result"]["writtenEmployeeCount"] >= 6
    assert parsed_payload["wage_record_result"]["manifestPath"] == payload[
        "wageRecordManifestPath"
    ]

    wage_manifest = json.loads(
        Path(payload["wageRecordManifestPath"]).read_text(encoding="utf-8")
    )
    wage_record = wage_manifest["records"][0]
    assert wage_record["path"] == payload["wageRecordPath"]
    assert wage_record["sha256"] == parsed_payload["wage_record_result"]["outputSha256"]
    assert wage_record["size_bytes"] == Path(payload["wageRecordPath"]).stat().st_size
    assert wage_record["type"] == "wage_record_xls"
    assert wage_record["template_path"] == str(WAGE_TEMPLATE)

    import_manifest = json.loads(
        (output_dir / "original_files" / "import_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert len(import_manifest["records"]) == 1
    assert import_manifest["records"][0]["sha256"] == payload["sha256"]

    html = Path(payload["taskReportPath"]).read_text(encoding="utf-8")
    assert "WAGE-P0 Task Report" in html
    assert ATTENDANCE_FIXTURE.name in html
    assert "Parse status: WARNING" in html
    assert "Employee count: 13" in html
    assert "Total calculated hours:" in html
    assert "Generated wage record:" in html
    assert payload["wageRecordPath"] in html
    assert "ODD_PUNCH_COUNT" in html


def test_wage_p0_cli_detects_duplicate_attendance_import(tmp_path: Path) -> None:
    output_dir = tmp_path / "wage-p0"
    runner = CliRunner()
    args = [
        "wage-p0",
        "--attendance-file",
        str(ATTENDANCE_FIXTURE),
        "--wage-template",
        str(WAGE_TEMPLATE),
        "--output-dir",
        str(output_dir),
    ]

    first = runner.invoke(app, args)
    second = runner.invoke(app, args)

    assert first.exit_code == 0
    assert second.exit_code == 0
    payload = json.loads(second.output)
    assert payload["duplicate"] is True
    assert payload["taskStatus"] == "WARNING"

    import_manifest = json.loads(
        (output_dir / "original_files" / "import_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert len(import_manifest["records"]) == 1
    assert [attempt["duplicate"] for attempt in import_manifest["attempts"]] == [
        False,
        True,
    ]
