from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import xlrd  # type: ignore[import-untyped]
from xlutils.copy import copy as copy_workbook  # type: ignore[import-untyped]

from worker_python.time_utils import operational_now
from worker_python.wage.attendance import AttendanceDay, AttendanceParseResult, WageIssue


@dataclass(frozen=True)
class WageRecordGenerationResult:
    outputPath: Path
    templatePath: Path
    generatedFilename: str
    writtenEmployeeCount: int
    writtenDayCount: int
    unmatchedEmployees: tuple[str, ...]
    matchedSheets: tuple[str, ...]
    warnings: tuple[WageIssue, ...]
    errors: tuple[WageIssue, ...]


def generate_wage_record(
    *,
    attendance_result: AttendanceParseResult,
    template_path: Path,
    output_dir: Path,
    generated_at: datetime | None = None,
) -> WageRecordGenerationResult:
    generated_at = generated_at or operational_now()
    output_dir.mkdir(parents=True, exist_ok=True)

    if attendance_result.periodStart is None or attendance_result.periodEnd is None:
        return _generation_error(
            template_path=template_path,
            output_dir=output_dir,
            message="Attendance period is missing; wage record was not generated.",
        )
    if attendance_result.errors:
        return _generation_error(
            template_path=template_path,
            output_dir=output_dir,
            message="Attendance parser has errors; wage record was not generated.",
        )
    if not template_path.is_file():
        return _generation_error(
            template_path=template_path,
            output_dir=output_dir,
            message=f"Wage template does not exist: {template_path}",
        )

    warnings: list[WageIssue] = [
        WageIssue(
            code="WAGE_GENERATOR_ASSUMPTION",
            message=(
                "Generated workbook writes paired-punch work hours without lunch "
                "deduction because the payroll rule is not confirmed."
            ),
        )
    ]
    errors: list[WageIssue] = []

    try:
        readable = xlrd.open_workbook(template_path, formatting_info=True)
        writable = copy_workbook(readable)
    except Exception as exc:
        return _generation_error(
            template_path=template_path,
            output_dir=output_dir,
            message=f"Unable to open wage template: {type(exc).__name__}: {exc}",
        )

    days_by_employee = _days_by_employee(attendance_result.days)
    matched_employee_keys: set[tuple[str | None, str | None]] = set()
    matched_sheets: list[str] = []
    written_day_count = 0

    for sheet_index, readable_sheet in enumerate(readable.sheets()):
        candidate = _match_sheet_to_employee(readable_sheet, days_by_employee)
        if candidate is None:
            continue

        employee_key, employee_days = candidate
        date_rows = _date_rows(readable_sheet)
        if not date_rows:
            warnings.append(
                WageIssue(
                    code="WAGE_TEMPLATE_DATE_ROWS_NOT_FOUND",
                    message=f"No DATE rows found in template sheet: {readable_sheet.name}",
                    employeeId=employee_key[0],
                    employeeName=employee_key[1],
                )
            )
            continue

        writable_sheet = writable.get_sheet(sheet_index)
        written_day_count += _write_employee_sheet(
            writable_sheet,
            date_rows=date_rows,
            employee_days=employee_days,
            period_start=attendance_result.periodStart,
            period_end=attendance_result.periodEnd,
        )
        matched_employee_keys.add(employee_key)
        matched_sheets.append(readable_sheet.name)

    unmatched_employees = tuple(
        _employee_label(employee_id, employee_name)
        for employee_id, employee_name in days_by_employee
        if (employee_id, employee_name) not in matched_employee_keys
    )
    for employee in unmatched_employees:
        warnings.append(
            WageIssue(
                code="WAGE_TEMPLATE_EMPLOYEE_NOT_MATCHED",
                message=f"Attendance employee was not matched to a wage template sheet: {employee}",
            )
        )

    output_path = output_dir / _output_filename(
        attendance_result.periodStart,
        attendance_result.periodEnd,
        generated_at,
    )
    writable.save(output_path)

    return WageRecordGenerationResult(
        outputPath=output_path,
        templatePath=template_path,
        generatedFilename=output_path.name,
        writtenEmployeeCount=len(matched_employee_keys),
        writtenDayCount=written_day_count,
        unmatchedEmployees=unmatched_employees,
        matchedSheets=tuple(matched_sheets),
        warnings=tuple(warnings),
        errors=tuple(errors),
    )


def _write_employee_sheet(
    writable_sheet,
    *,
    date_rows: list[int],
    employee_days: list[AttendanceDay],
    period_start: date,
    period_end: date,
) -> int:
    days_by_date = {day.workDate: day for day in employee_days}
    period_dates = _period_dates(period_start, period_end)
    written = 0

    for row_offset, row_index in enumerate(date_rows):
        if row_offset >= len(period_dates):
            _write_empty_day(writable_sheet, row_index)
            continue

        work_date = period_dates[row_offset]
        attendance_day = days_by_date.get(work_date)
        writable_sheet.write(row_index, 0, work_date.strftime("%a").upper())
        writable_sheet.write(row_index, 1, _date_text(work_date))

        if attendance_day is None or not attendance_day.punchTimes:
            _write_empty_values(writable_sheet, row_index)
            continue
        if attendance_day.calculatedHours is None:
            _write_review_values(writable_sheet, row_index)
            continue

        writable_sheet.write(row_index, 2, attendance_day.calculatedHours)
        writable_sheet.write(row_index, 3, "/")
        writable_sheet.write(row_index, 4, _excel_time_fraction(attendance_day.firstPunch))
        writable_sheet.write(row_index, 5, _excel_time_fraction(attendance_day.lastPunch))
        written += 1

    total_row = date_rows[-1] + 1
    total_hours = round(
        sum(
            day.calculatedHours or 0.0
            for day in employee_days
            if day.calculatedHours is not None and day.punchTimes
        ),
        2,
    )
    writable_sheet.write(total_row, 0, "TOTAL HOURS")
    writable_sheet.write(total_row, 2, total_hours)
    return written


def _write_empty_day(writable_sheet, row_index: int) -> None:
    writable_sheet.write(row_index, 0, "")
    writable_sheet.write(row_index, 1, "")
    _write_empty_values(writable_sheet, row_index)


def _write_empty_values(writable_sheet, row_index: int) -> None:
    for column_index in range(2, 6):
        writable_sheet.write(row_index, column_index, "/")


def _write_review_values(writable_sheet, row_index: int) -> None:
    writable_sheet.write(row_index, 2, "REVIEW")
    for column_index in range(3, 6):
        writable_sheet.write(row_index, column_index, "/")


def _generation_error(
    *,
    template_path: Path,
    output_dir: Path,
    message: str,
) -> WageRecordGenerationResult:
    output_path = output_dir / "wage-record-not-generated.xls"
    return WageRecordGenerationResult(
        outputPath=output_path,
        templatePath=template_path,
        generatedFilename=output_path.name,
        writtenEmployeeCount=0,
        writtenDayCount=0,
        unmatchedEmployees=(),
        matchedSheets=(),
        warnings=(),
        errors=(WageIssue(code="WAGE_RECORD_GENERATION_FAILED", message=message),),
    )


def _days_by_employee(
    days: tuple[AttendanceDay, ...],
) -> dict[tuple[str | None, str | None], list[AttendanceDay]]:
    grouped: dict[tuple[str | None, str | None], list[AttendanceDay]] = {}
    for day in days:
        key = (day.employeeId, day.employeeName)
        grouped.setdefault(key, []).append(day)
    return grouped


def _match_sheet_to_employee(
    sheet,
    days_by_employee: dict[tuple[str | None, str | None], list[AttendanceDay]],
) -> tuple[tuple[str | None, str | None], list[AttendanceDay]] | None:
    sheet_text = " ".join(
        filter(None, [sheet.name, _cell_text(sheet.cell_value(0, 0) if sheet.nrows else "")])
    )
    scored: list[tuple[int, tuple[str | None, str | None]]] = []

    for employee_key in days_by_employee:
        score = _employee_match_score(employee_key[1], sheet_text)
        if score > 0:
            scored.append((score, employee_key))

    if not scored:
        return None

    scored.sort(key=lambda item: item[0], reverse=True)
    best_score, best_key = scored[0]
    if len(scored) > 1 and scored[1][0] == best_score:
        return None
    return best_key, days_by_employee[best_key]


def _employee_match_score(employee_name: str | None, sheet_text: str) -> int:
    employee_tokens = _tokens(employee_name or "")
    sheet_tokens = _tokens(sheet_text)
    if not employee_tokens or not sheet_tokens:
        return 0
    if len(employee_tokens) > 1 and set(employee_tokens) == set(sheet_tokens):
        return 100
    if all(token in sheet_tokens for token in employee_tokens):
        return 90
    if any(token in sheet_tokens for token in employee_tokens if len(token) >= 3):
        return 70
    if any(
        token in sheet_token
        for token in employee_tokens
        for sheet_token in sheet_tokens
        if len(token) >= 3
    ):
        return 40
    return 0


def _date_rows(sheet) -> list[int]:
    header_row_index = None
    for row_index in range(sheet.nrows):
        row_values = [_cell_text(sheet.cell_value(row_index, col)) for col in range(sheet.ncols)]
        if "DATE" in row_values and "HOURS" in row_values:
            header_row_index = row_index
            break
    if header_row_index is None:
        return []

    rows: list[int] = []
    for row_index in range(header_row_index + 1, sheet.nrows):
        first_cell = _cell_text(sheet.cell_value(row_index, 0))
        if first_cell.upper().startswith("TOTAL HOURS"):
            break
        rows.append(row_index)
    return rows


def _period_dates(period_start: date, period_end: date) -> list[date]:
    dates: list[date] = []
    current = period_start
    while current <= period_end:
        dates.append(current)
        current = date.fromordinal(current.toordinal() + 1)
    return dates


def _date_text(value: date) -> str:
    return f"{value.year}.{value.month}.{value.day}"


def _excel_time_fraction(value: str | None) -> float | str:
    if not value:
        return "/"
    hour, minute = value.split(":", 1)
    return (int(hour) * 60 + int(minute)) / (24 * 60)


def _employee_label(employee_id: str | None, employee_name: str | None) -> str:
    if employee_id and employee_name:
        return f"{employee_id} {employee_name}"
    return employee_id or employee_name or "UNKNOWN"


def _output_filename(
    period_start: date,
    period_end: date,
    generated_at: datetime,
) -> str:
    timestamp = generated_at.strftime("%Y%m%d%H%M%S")
    return f"wage-record-{period_start.isoformat()}-{period_end.isoformat()}-{timestamp}.xls"


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", value.lower()))


def _cell_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()
