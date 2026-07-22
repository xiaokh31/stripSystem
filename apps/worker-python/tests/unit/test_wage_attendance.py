from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import xlrd
import xlwt

from worker_python.imports import compute_sha256
from worker_python.wage import (
    AttendanceCalculationMethod,
    WageFormatType,
    calculate_attendance_hours,
    calculate_paired_work_hours,
    calculate_work_hours_after_lunch,
    detect_attendance_workbook,
    generate_wage_record,
    parse_attendance_workbook,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
WAGE_DIR = REPO_ROOT / "samples" / "wage"
ATTENDANCE_FIXTURE = WAGE_DIR / "workAttendanceRecordForm_June.xls"
WAGE_TEMPLATE = WAGE_DIR / "20260601-0630_wageRecords.xls"


def test_wage_attendance_detector_identifies_real_time_clock_workbook() -> None:
    result = detect_attendance_workbook(ATTENDANCE_FIXTURE)

    assert result.format_type == WageFormatType.WAGE_ATTENDANCE
    assert result.confidence >= 0.95
    assert result.matched_sheet == "员工刷卡记录表"
    assert result.period_start == date(2026, 6, 1)
    assert result.period_end == date(2026, 6, 30)
    assert "工号" in result.matched_headers
    assert "姓名" in result.matched_headers


def test_wage_attendance_parser_outputs_employee_days_hours_and_raw_rows() -> None:
    result = parse_attendance_workbook(ATTENDANCE_FIXTURE)

    assert result.formatType == WageFormatType.WAGE_ATTENDANCE
    assert result.parserVersion == "wage-attendance-v2"
    assert result.periodStart == date(2026, 6, 1)
    assert result.periodEnd == date(2026, 6, 30)
    assert len(result.employees) == 13
    assert len(result.days) == 13 * 30
    assert result.rawRows
    assert any("工号" in cell.value for row in result.rawRows for cell in row.cells)
    assert any("制表时间" in cell.value for row in result.rawRows for cell in row.cells)
    assert any("部门" in cell.value for row in result.rawRows for cell in row.cells)

    deng_june_1 = next(
        day
        for day in result.days
        if day.employeeName == "deng wei" and day.workDate == date(2026, 6, 1)
    )
    assert deng_june_1.punchTimes == ("08:36", "17:52")
    assert deng_june_1.calculationMethod == AttendanceCalculationMethod.PAIRED_INTERVALS
    assert deng_june_1.workIntervals[0].minutes == 556
    assert deng_june_1.pairedGrossHours == 9.27
    assert deng_june_1.lunchHours == 0.5
    assert deng_june_1.calculatedHours == 8.77
    assert deng_june_1.rawCellValues == ("08:36\n17:52",)

    ray_june_1 = next(
        day
        for day in result.days
        if day.employeeName == "ray" and day.workDate == date(2026, 6, 1)
    )
    assert ray_june_1.calculationMethod == AttendanceCalculationMethod.FIRST_LAST_FALLBACK
    assert ray_june_1.pairedGrossHours == 0.0
    assert ray_june_1.lunchHours == 0.0
    assert ray_june_1.calculatedHours == 0.0
    assert ray_june_1.workIntervals[0].start == ray_june_1.workIntervals[0].end
    assert ray_june_1.warnings[0].code == "ODD_PUNCH_COUNT"

    anita_june_1 = next(
        day
        for day in result.days
        if day.employeeName == "anita" and day.workDate == date(2026, 6, 1)
    )
    assert anita_june_1.punchTimes == ()
    assert anita_june_1.calculationMethod == AttendanceCalculationMethod.NO_PUNCHES
    assert anita_june_1.workIntervals == ()
    assert anita_june_1.lunchHours == 0.0
    assert anita_june_1.calculatedHours == 0.0
    assert anita_june_1.warnings[0].code == "MISSING_PUNCH_TIMES"

    deng_summary = next(
        employee for employee in result.employees if employee.employeeName == "deng wei"
    )
    assert deng_summary.totalCalculatedHours > 0
    assert any(issue.code == "ODD_PUNCH_COUNT" for issue in result.warnings)

    punch_count_histogram = {
        count: sum(1 for day in result.days if len(day.punchTimes) == count)
        for count in (0, 1, 2, 3)
    }
    assert punch_count_histogram == {0: 271, 1: 25, 2: 93, 3: 1}
    three_punch_day = next(day for day in result.days if len(day.punchTimes) == 3)
    assert three_punch_day.punchTimes == ("09:00", "17:09", "17:10")
    assert three_punch_day.calculationMethod == AttendanceCalculationMethod.FIRST_LAST_FALLBACK
    assert three_punch_day.workIntervals[0].minutes == 490
    assert three_punch_day.pairedGrossHours == 8.17
    assert three_punch_day.lunchHours == 0.5
    assert three_punch_day.calculatedHours == 7.67
    assert three_punch_day.warnings[0].code == "ODD_PUNCH_COUNT"


def test_wage_attendance_calculates_four_punch_day_by_pairing() -> None:
    assert calculate_paired_work_hours(("08:00", "12:00", "13:00", "17:30")) == 8.5
    assert (
        calculate_work_hours_after_lunch(("08:00", "12:00", "13:00", "17:30")) == 8.0
    )


def test_wage_attendance_calculation_contract_covers_parity_lunch_and_rounding() -> None:
    no_punches = calculate_attendance_hours(())
    assert no_punches.calculationMethod == AttendanceCalculationMethod.NO_PUNCHES
    assert no_punches.workIntervals == ()
    assert (no_punches.grossHours, no_punches.lunchHours, no_punches.calculatedHours) == (
        0.0,
        0.0,
        0.0,
    )

    one_punch = calculate_attendance_hours(("08:00",))
    assert one_punch.calculationMethod == AttendanceCalculationMethod.FIRST_LAST_FALLBACK
    assert one_punch.workIntervals[0].start == "08:00"
    assert one_punch.workIntervals[0].end == "08:00"
    assert (one_punch.grossHours, one_punch.lunchHours, one_punch.calculatedHours) == (
        0.0,
        0.0,
        0.0,
    )

    two_punches = calculate_attendance_hours(("17:00", "08:00"))
    assert two_punches.calculationMethod == AttendanceCalculationMethod.PAIRED_INTERVALS
    assert (two_punches.grossHours, two_punches.lunchHours, two_punches.calculatedHours) == (
        9.0,
        0.5,
        8.5,
    )

    three_punches = calculate_attendance_hours(("17:10", "09:00", "17:09"))
    assert three_punches.calculationMethod == AttendanceCalculationMethod.FIRST_LAST_FALLBACK
    assert len(three_punches.workIntervals) == 1
    assert three_punches.workIntervals[0].minutes == 490
    assert (three_punches.grossHours, three_punches.lunchHours, three_punches.calculatedHours) == (
        8.17,
        0.5,
        7.67,
    )

    four_punches = calculate_attendance_hours(("13:00", "17:30", "08:00", "12:00"))
    assert [interval.minutes for interval in four_punches.workIntervals] == [240, 270]
    assert (four_punches.grossHours, four_punches.lunchHours, four_punches.calculatedHours) == (
        8.5,
        0.5,
        8.0,
    )

    six_punches = calculate_attendance_hours(
        ("17:00", "08:00", "12:00", "10:00", "13:00", "10:00")
    )
    assert [interval.minutes for interval in six_punches.workIntervals] == [120, 120, 240]
    assert (six_punches.grossHours, six_punches.lunchHours, six_punches.calculatedHours) == (
        8.0,
        0.5,
        7.5,
    )

    repeated = calculate_attendance_hours(("17:00", "08:00", "17:00", "08:00"))
    assert [interval.minutes for interval in repeated.workIntervals] == [0, 0]
    assert repeated.grossHours == 0.0
    assert repeated.lunchHours == 0.5
    assert repeated.calculatedHours == 0.0

    accumulated_before_rounding = calculate_attendance_hours(
        ("08:00", "08:01", "09:00", "09:01")
    )
    assert [interval.hours for interval in accumulated_before_rounding.workIntervals] == [
        0.02,
        0.02,
    ]
    assert accumulated_before_rounding.grossHours == 0.03
    assert accumulated_before_rounding.calculatedHours == 0.0


def test_wage_attendance_parser_filters_invalid_times_and_preserves_raw_evidence(
    tmp_path: Path,
) -> None:
    path = tmp_path / "invalid-and-unsorted-times.xls"
    _write_xls(
        path,
        [
            ["员 工 刷 卡 记 录 表"],
            ["考勤日期：2026-06-01 至 2026-06-01"],
            ["工号：", "42", "姓名：", "edge", "部门：", "公司"],
            [1],
            ["17:00\ninvalid\n25:61\n08:00"],
        ],
    )

    parsed = parse_attendance_workbook(path)
    day = parsed.days[0]

    assert day.punchTimes == ("08:00", "17:00")
    assert day.rawCellValues == ("17:00\ninvalid\n25:61\n08:00",)
    assert day.rowNumbers == (5,)
    assert day.calculationMethod == AttendanceCalculationMethod.PAIRED_INTERVALS
    assert day.calculatedHours == 8.5


def test_wage_attendance_detector_returns_error_for_unsupported_xls(
    tmp_path: Path,
) -> None:
    unsupported_path = tmp_path / "unsupported.xls"
    _write_xls(
        unsupported_path,
        [
            ["not an attendance workbook"],
            ["DATE", "HOURS"],
        ],
    )

    detection = detect_attendance_workbook(unsupported_path)
    parsed = parse_attendance_workbook(unsupported_path)

    assert detection.format_type == WageFormatType.UNKNOWN
    assert detection.reason == "Unsupported wage attendance workbook layout."
    assert "Missing wage attendance title row." in detection.errors
    assert "Missing wage attendance employee headers." in detection.errors
    assert parsed.errors
    assert parsed.errors[0].code == "DETECTOR_ERROR"
    assert "Missing wage attendance title row." in parsed.errors[0].message


def test_wage_attendance_parser_errors_when_attendance_period_is_missing(
    tmp_path: Path,
) -> None:
    missing_period_path = tmp_path / "missing-period.xls"
    _write_xls(
        missing_period_path,
        [
            ["员 工 刷 卡 记 录 表"],
            ["工号：", "42", "姓名：", "manual edge", "部门：", "公司"],
            [1, 2],
            ["08:00\n17:00", ""],
        ],
    )

    detection = detect_attendance_workbook(missing_period_path)
    parsed = parse_attendance_workbook(missing_period_path)

    assert detection.format_type == WageFormatType.WAGE_ATTENDANCE
    assert "Attendance period was not found in the workbook." in detection.warnings
    assert parsed.days == ()
    assert parsed.rawRows
    assert parsed.errors[0].code == "ATTENDANCE_PERIOD_MISSING"


def test_wage_record_generator_copies_template_and_writes_matched_employee_hours(
    tmp_path: Path,
) -> None:
    template_sha_before = compute_sha256(WAGE_TEMPLATE)
    parsed = parse_attendance_workbook(ATTENDANCE_FIXTURE)

    result = generate_wage_record(
        attendance_result=parsed,
        template_path=WAGE_TEMPLATE,
        output_dir=tmp_path,
    )

    assert result.errors == ()
    assert result.outputPath.is_file()
    assert compute_sha256(WAGE_TEMPLATE) == template_sha_before
    assert result.manifestPath.is_file()
    assert result.outputSha256 == compute_sha256(result.outputPath)
    assert result.outputSizeBytes == result.outputPath.stat().st_size
    assert result.fileType == "wage_record_xls"
    assert "FANGLEI XIAO (lay)" in result.matchedSheets
    assert "Wei Deng" in result.matchedSheets
    assert any(employee.endswith("ray") for employee in result.unmatchedEmployees)

    manifest = json.loads(result.manifestPath.read_text(encoding="utf-8"))
    assert manifest["schema_version"] == 1
    manifest_record = manifest["records"][0]
    assert manifest_record["path"] == str(result.outputPath)
    assert manifest_record["sha256"] == result.outputSha256
    assert manifest_record["size_bytes"] == result.outputSizeBytes
    assert manifest_record["type"] == "wage_record_xls"
    assert manifest_record["template_path"] == str(WAGE_TEMPLATE)
    assert manifest_record["template_sha256"] == template_sha_before

    workbook = xlrd.open_workbook(result.outputPath)
    lay_sheet = workbook.sheet_by_name("FANGLEI XIAO (lay)")
    assert lay_sheet.cell_value(3, 1) == "2026.6.1"
    assert lay_sheet.cell_value(3, 2) == 6.73
    assert lay_sheet.cell_value(3, 3) == 0.5
    assert round(lay_sheet.cell_value(3, 4) * 24 * 60) == 664
    assert round(lay_sheet.cell_value(3, 5) * 24 * 60) == 1098
    assert lay_sheet.cell_value(34, 0) == "TOTAL HOURS"
    assert lay_sheet.cell_value(34, 2) > 0


def _write_xls(path: Path, rows: list[list[object]]) -> None:
    workbook = xlwt.Workbook()
    sheet = workbook.add_sheet("Sheet1")
    for row_index, row in enumerate(rows):
        for column_index, value in enumerate(row):
            sheet.write(row_index, column_index, value)
    workbook.save(str(path))
