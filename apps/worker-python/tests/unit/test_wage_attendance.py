from __future__ import annotations

from datetime import date
from pathlib import Path

import xlrd

from worker_python.imports import compute_sha256
from worker_python.wage import (
    WageFormatType,
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
    assert result.parserVersion == "wage-attendance-v1"
    assert result.periodStart == date(2026, 6, 1)
    assert result.periodEnd == date(2026, 6, 30)
    assert len(result.employees) == 13
    assert len(result.days) == 13 * 30
    assert result.rawRows
    assert any("工号" in cell.value for row in result.rawRows for cell in row.cells)

    deng_june_1 = next(
        day
        for day in result.days
        if day.employeeName == "deng wei" and day.workDate == date(2026, 6, 1)
    )
    assert deng_june_1.punchTimes == ("08:36", "17:52")
    assert deng_june_1.pairedGrossHours == 9.27
    assert deng_june_1.lunchHours == 0.5
    assert deng_june_1.calculatedHours == 8.77
    assert deng_june_1.rawCellValues == ("08:36\n17:52",)

    ray_june_1 = next(
        day
        for day in result.days
        if day.employeeName == "ray" and day.workDate == date(2026, 6, 1)
    )
    assert ray_june_1.calculatedHours is None
    assert ray_june_1.warnings[0].code == "ODD_PUNCH_COUNT"

    anita_june_1 = next(
        day
        for day in result.days
        if day.employeeName == "anita" and day.workDate == date(2026, 6, 1)
    )
    assert anita_june_1.punchTimes == ()
    assert anita_june_1.lunchHours == 0.0
    assert anita_june_1.calculatedHours == 0.0
    assert anita_june_1.warnings[0].code == "MISSING_PUNCH_TIMES"

    deng_summary = next(
        employee for employee in result.employees if employee.employeeName == "deng wei"
    )
    assert deng_summary.totalCalculatedHours > 0
    assert any(issue.code == "ODD_PUNCH_COUNT" for issue in result.warnings)


def test_wage_attendance_calculates_four_punch_day_by_pairing() -> None:
    assert calculate_paired_work_hours(("08:00", "12:00", "13:00", "17:30")) == 8.5
    assert (
        calculate_work_hours_after_lunch(("08:00", "12:00", "13:00", "17:30")) == 8.0
    )


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
    assert "FANGLEI XIAO (lay)" in result.matchedSheets
    assert "Wei Deng" in result.matchedSheets
    assert any(employee.endswith("ray") for employee in result.unmatchedEmployees)

    workbook = xlrd.open_workbook(result.outputPath)
    lay_sheet = workbook.sheet_by_name("FANGLEI XIAO (lay)")
    assert lay_sheet.cell_value(3, 1) == "2026.6.1"
    assert lay_sheet.cell_value(3, 2) == 6.73
    assert lay_sheet.cell_value(3, 3) == 0.5
    assert round(lay_sheet.cell_value(3, 4) * 24 * 60) == 664
    assert round(lay_sheet.cell_value(3, 5) * 24 * 60) == 1098
    assert lay_sheet.cell_value(34, 0) == "TOTAL HOURS"
    assert lay_sheet.cell_value(34, 2) > 0
