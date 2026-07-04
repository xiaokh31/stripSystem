from __future__ import annotations

import html
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from worker_python.time_utils import operational_now
from worker_python.wage.attendance import AttendanceParseResult, WageIssue
from worker_python.wage.generator import WageRecordGenerationResult


@dataclass(frozen=True)
class WageTaskReportResult:
    htmlPath: Path
    recordCount: int
    warningCount: int
    errorCount: int


def generate_wage_html_task_report(
    *,
    attendance_result: AttendanceParseResult,
    generation_result: WageRecordGenerationResult | None,
    output_dir: Path,
    original_filename: str,
    sha256: str,
    generated_at: datetime | None = None,
) -> WageTaskReportResult:
    generated_at = generated_at or operational_now()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"wage-task-report-{generated_at.date().isoformat()}.html"
    warnings = list(attendance_result.warnings)
    errors = list(attendance_result.errors)
    if generation_result is not None:
        warnings.extend(generation_result.warnings)
        errors.extend(generation_result.errors)

    output_path.write_text(
        _render_html(
            attendance_result=attendance_result,
            generation_result=generation_result,
            original_filename=original_filename,
            sha256=sha256,
            generated_at=generated_at,
            warnings=tuple(warnings),
            errors=tuple(errors),
        ),
        encoding="utf-8",
    )

    return WageTaskReportResult(
        htmlPath=output_path,
        recordCount=len(attendance_result.employees),
        warningCount=len(warnings),
        errorCount=len(errors),
    )


def _render_html(
    *,
    attendance_result: AttendanceParseResult,
    generation_result: WageRecordGenerationResult | None,
    original_filename: str,
    sha256: str,
    generated_at: datetime,
    warnings: tuple[WageIssue, ...],
    errors: tuple[WageIssue, ...],
) -> str:
    employee_rows = "\n".join(
        _employee_row(employee) for employee in attendance_result.employees
    )
    warning_rows = "\n".join(_issue_row(issue) for issue in warnings[:300])
    error_rows = "\n".join(_issue_row(issue) for issue in errors)
    wage_record_path = (
        str(generation_result.outputPath)
        if generation_result and not generation_result.errors
        else "Not generated"
    )
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>WAGE-P0 Task Report</title>
    <style>
      body {{ font-family: Arial, sans-serif; margin: 24px; color: #111; }}
      table {{ border-collapse: collapse; width: 100%; margin: 16px 0; }}
      th, td {{ border: 1px solid #bbb; padding: 6px; vertical-align: top; }}
      th {{ background: #eee; }}
      .meta {{ margin: 4px 0; }}
    </style>
  </head>
  <body>
    <h1>WAGE-P0 Task Report</h1>
    <p class="meta">Generated: {html.escape(generated_at.isoformat())}</p>
    <p class="meta">Attendance file: {html.escape(original_filename)}</p>
    <p class="meta">SHA-256: {html.escape(sha256)}</p>
    <p class="meta">Period: {html.escape(str(attendance_result.periodStart))}
      to {html.escape(str(attendance_result.periodEnd))}</p>
    <p class="meta">Generated wage record: {html.escape(wage_record_path)}</p>

    <h2>Employee Hours</h2>
    <table>
      <thead>
        <tr>
          <th>Employee ID</th>
          <th>Name</th>
          <th>Department</th>
          <th>Days</th>
          <th>Worked days</th>
          <th>Review days</th>
          <th>Total calculated hours</th>
        </tr>
      </thead>
      <tbody>{employee_rows}</tbody>
    </table>

    <h2>Warnings</h2>
    <table>
      <thead>
        <tr>
          <th>Code</th>
          <th>Employee</th>
          <th>Date</th>
          <th>Row</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>{warning_rows}</tbody>
    </table>

    <h2>Errors</h2>
    <table>
      <thead>
        <tr>
          <th>Code</th>
          <th>Employee</th>
          <th>Date</th>
          <th>Row</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>{error_rows}</tbody>
    </table>
  </body>
</html>
"""


def _employee_row(employee) -> str:
    return f"""<tr>
  <td>{html.escape(str(employee.employeeId or ""))}</td>
  <td>{html.escape(str(employee.employeeName or ""))}</td>
  <td>{html.escape(str(employee.department or ""))}</td>
  <td>{employee.dayCount}</td>
  <td>{employee.workedDayCount}</td>
  <td>{employee.reviewDayCount}</td>
  <td>{employee.totalCalculatedHours:.2f}</td>
</tr>"""


def _issue_row(issue: WageIssue) -> str:
    employee = " ".join(
        part for part in (issue.employeeId, issue.employeeName) if part
    )
    return f"""<tr>
  <td>{html.escape(issue.code)}</td>
  <td>{html.escape(employee)}</td>
  <td>{html.escape(str(issue.workDate or ""))}</td>
  <td>{html.escape(str(issue.rowNumber or ""))}</td>
  <td>{html.escape(issue.message)}</td>
</tr>"""
