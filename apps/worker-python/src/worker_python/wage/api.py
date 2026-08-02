from __future__ import annotations

import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from worker_python.batch import _json_ready
from worker_python.imports import compute_sha256
from worker_python.time_utils import operational_now
from worker_python.wage.attendance import (
    AttendanceCalculationMethod,
    AttendanceDay,
    AttendanceEmployeeSummary,
    AttendanceParseResult,
    AttendanceWorkInterval,
    WageFormatType,
    WageIssue,
    detect_attendance_workbook,
    parse_attendance_workbook,
)
from worker_python.wage.generator import (
    WageRecordGenerationResult,
    generate_wage_record,
)
from worker_python.wage.report import generate_wage_html_task_report


WAGE_API_BATCH_VERSION = "wage-p1-api-v1"
PERSISTED_ATTENDANCE_SCHEMA_VERSION = 2
PERSISTED_ATTENDANCE_PARSER_VERSION = "wage-attendance-v2"


class PersistedAttendanceContractError(ValueError):
    pass


def run_wage_parse_api(
    *,
    attendance_file: Path,
    output_dir: Path,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    attendance_file = attendance_file.resolve()
    output_dir = output_dir.resolve()
    generated_at = generated_at or operational_now()

    parsed_result = parse_attendance_workbook(attendance_file)
    task_report = generate_wage_html_task_report(
        attendance_result=parsed_result,
        generation_result=None,
        output_dir=output_dir / "task_reports",
        original_filename=attendance_file.name,
        sha256=compute_sha256(attendance_file),
        generated_at=generated_at,
    )
    warnings = tuple(parsed_result.warnings)
    errors = tuple(parsed_result.errors)
    task_status = _task_status(warnings, errors)
    parsed_json_path = _write_wage_payload_json(
        output_dir=output_dir / "parsed_json",
        attendance_file=attendance_file,
        parsed_result=parsed_result,
        wage_result=None,
        task_report=task_report,
        task_status=task_status,
        warnings=warnings,
        errors=errors,
        generated_at=generated_at,
    )

    return {
        "schema_version": 1,
        "batch_version": WAGE_API_BATCH_VERSION,
        "generated_at": generated_at.isoformat(),
        "source_file": str(attendance_file),
        "original_filename": attendance_file.name,
        "sha256": compute_sha256(attendance_file),
        "detection": _json_ready(detect_attendance_workbook(attendance_file)),
        "parsed_result": _json_ready(parsed_result),
        "wage_record_result": None,
        "task_report": _json_ready(task_report),
        "task_status": task_status,
        "parsed_json_path": str(parsed_json_path),
        "wage_record_path": None,
        "task_report_path": str(task_report.htmlPath),
        "employee_count": len(parsed_result.employees),
        "day_count": len(parsed_result.days),
        "warning_count": len(warnings),
        "error_count": len(errors),
        "warnings": _json_ready(warnings),
        "errors": _json_ready(errors),
        "exception": None,
    }


def run_wage_generate_record_api(
    *,
    attendance_file: Path,
    template_path: Path,
    output_dir: Path,
    normalized_attendance_json: Path | None = None,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    attendance_file = attendance_file.resolve()
    template_path = template_path.resolve()
    output_dir = output_dir.resolve()
    generated_at = generated_at or operational_now()

    try:
        parsed_result = (
            _persisted_attendance_result(normalized_attendance_json)
            if normalized_attendance_json is not None
            else parse_attendance_workbook(attendance_file)
        )
    except (
        json.JSONDecodeError,
        PersistedAttendanceContractError,
        TypeError,
        ValueError,
    ):
        issue = WageIssue(
            code="WAGE_GENERATION_INPUT_SCHEMA_INVALID",
            message="Persisted attendance generation input does not match the supported schema.",
        )
        return {
            "schema_version": 2,
            "batch_version": WAGE_API_BATCH_VERSION,
            "generated_at": generated_at.isoformat(),
            "source_file": str(attendance_file),
            "original_filename": attendance_file.name,
            "sha256": compute_sha256(attendance_file),
            "parsed_result": None,
            "wage_record_result": None,
            "task_report": None,
            "task_status": "ERROR",
            "parsed_json_path": None,
            "wage_record_path": None,
            "task_report_path": None,
            "employee_count": 0,
            "day_count": 0,
            "warning_count": 0,
            "error_count": 1,
            "warnings": [],
            "errors": _json_ready((issue,)),
            "exception": None,
            "generation_stage": "NORMALIZED_INPUT",
            "generation_error_code": issue.code,
            "generation_input_source": "PERSISTED_ACTIVE_ATTENDANCE_ROWS",
        }
    wage_result = generate_wage_record(
        attendance_result=parsed_result,
        template_path=template_path,
        output_dir=output_dir / "wage_records",
        generated_at=generated_at,
    )
    task_report = generate_wage_html_task_report(
        attendance_result=parsed_result,
        generation_result=wage_result,
        output_dir=output_dir / "task_reports",
        original_filename=attendance_file.name,
        sha256=compute_sha256(attendance_file),
        generated_at=generated_at,
    )
    warnings = tuple(parsed_result.warnings) + tuple(wage_result.warnings)
    errors = tuple(parsed_result.errors) + tuple(wage_result.errors)
    task_status = _task_status(warnings, errors)

    return {
        "schema_version": 2,
        "batch_version": WAGE_API_BATCH_VERSION,
        "generated_at": generated_at.isoformat(),
        "source_file": str(attendance_file),
        "original_filename": attendance_file.name,
        "sha256": compute_sha256(attendance_file),
        "parsed_result": _json_ready(parsed_result),
        "wage_record_result": _json_ready(wage_result),
        "task_report": _json_ready(task_report),
        "task_status": task_status,
        "parsed_json_path": None,
        "wage_record_path": str(wage_result.outputPath)
        if not wage_result.errors and wage_result.validated
        else None,
        "task_report_path": str(task_report.htmlPath),
        "employee_count": len(parsed_result.employees),
        "day_count": len(parsed_result.days),
        "warning_count": len(warnings),
        "error_count": len(errors),
        "warnings": _json_ready(warnings),
        "errors": _json_ready(errors),
        "exception": None,
        "generation_stage": wage_result.generationStage,
        "generation_error_code": wage_result.errorCode,
        "generation_input_source": (
            "PERSISTED_ACTIVE_ATTENDANCE_ROWS"
            if normalized_attendance_json is not None
            else "ORIGINAL_ATTENDANCE_WORKBOOK"
        ),
    }


def _persisted_attendance_result(path: Path) -> AttendanceParseResult:
    payload = json.loads(path.resolve().read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != PERSISTED_ATTENDANCE_SCHEMA_VERSION:
        raise PersistedAttendanceContractError(
            "Normalized attendance input schema version is unsupported."
        )
    if payload.get("source") != "PERSISTED_ACTIVE_ATTENDANCE_ROWS":
        raise PersistedAttendanceContractError(
            "Normalized attendance input has an unsupported source."
        )
    parsed = payload.get("parsedResult")
    if not isinstance(parsed, dict):
        raise PersistedAttendanceContractError(
            "Normalized attendance input is missing parsedResult."
        )
    if parsed.get("parserVersion") != PERSISTED_ATTENDANCE_PARSER_VERSION:
        raise PersistedAttendanceContractError(
            "Normalized attendance parser version is unsupported."
        )
    for key in ("employees", "days", "warnings", "errors", "assumptions"):
        if not isinstance(parsed.get(key), list):
            raise PersistedAttendanceContractError(
                f"Normalized attendance {key} must be an array."
            )
    days = tuple(_persisted_day(day) for day in parsed["days"])
    employees = tuple(
        AttendanceEmployeeSummary(
            employeeId=item.get("employeeId"),
            employeeName=item.get("employeeName"),
            department=item.get("department"),
            dayCount=int(item.get("dayCount", 0)),
            workedDayCount=int(item.get("workedDayCount", 0)),
            reviewDayCount=int(item.get("reviewDayCount", 0)),
            totalCalculatedHours=float(item.get("totalCalculatedHours", 0)),
        )
        for item in parsed["employees"]
    )
    return AttendanceParseResult(
        formatType=WageFormatType(str(parsed.get("formatType", "WAGE_ATTENDANCE"))),
        parserVersion=str(parsed["parserVersion"]),
        sourceSheet=parsed.get("sourceSheet"),
        periodStart=_date_or_none(parsed.get("periodStart")),
        periodEnd=_date_or_none(parsed.get("periodEnd")),
        confidence=float(parsed.get("confidence", 1)),
        employees=employees,
        days=days,
        rawRows=(),
        warnings=tuple(_persisted_issue(issue) for issue in parsed.get("warnings", [])),
        errors=tuple(_persisted_issue(issue) for issue in parsed.get("errors", [])),
        assumptions=tuple(str(item) for item in parsed.get("assumptions", [])),
    )


def _persisted_day(value: dict[str, Any]) -> AttendanceDay:
    if not isinstance(value, dict):
        raise PersistedAttendanceContractError(
            "Persisted attendance day must be an object."
        )
    work_date = _date_or_none(value.get("workDate"))
    if work_date is None:
        raise PersistedAttendanceContractError(
            "Persisted attendance day is missing workDate."
        )
    calculation_method = value.get("calculationMethod")
    if calculation_method not in {
        "NO_PUNCHES",
        "FIRST_LAST_FALLBACK",
        "PAIRED_INTERVALS",
    }:
        raise PersistedAttendanceContractError(
            "Persisted attendance calculation method is unsupported."
        )
    if not isinstance(value.get("workIntervals"), list):
        raise PersistedAttendanceContractError(
            "Persisted attendance workIntervals must be an array."
        )
    return AttendanceDay(
        employeeId=value.get("employeeId"),
        employeeName=value.get("employeeName"),
        department=value.get("department"),
        workDate=work_date,
        dayNumber=int(value.get("dayNumber", work_date.day)),
        punchTimes=tuple(str(item) for item in value.get("punchTimes", [])),
        calculationMethod=AttendanceCalculationMethod(str(calculation_method)),
        workIntervals=tuple(
            AttendanceWorkInterval(
                start=str(item.get("start", "")),
                end=str(item.get("end", "")),
                minutes=int(item.get("minutes", 0)),
                hours=float(item.get("hours", 0)),
            )
            for item in value.get("workIntervals", [])
        ),
        pairedGrossHours=_float_or_none(value.get("pairedGrossHours")),
        lunchHours=float(value.get("lunchHours") or 0),
        calculatedHours=_float_or_none(value.get("calculatedHours")),
        firstPunch=value.get("firstPunch"),
        lastPunch=value.get("lastPunch"),
        rawCellValues=tuple(str(item) for item in value.get("rawCellValues", [])),
        rowNumbers=tuple(int(item) for item in value.get("rowNumbers", [])),
        warnings=tuple(_persisted_issue(issue) for issue in value.get("warnings", [])),
        errors=tuple(_persisted_issue(issue) for issue in value.get("errors", [])),
    )


def _persisted_issue(value: dict[str, Any]) -> WageIssue:
    return WageIssue(
        code=str(value.get("code", "ATTENDANCE_REVIEW_REQUIRED")),
        message=str(value.get("message", value.get("code", "Review required"))),
        rowNumber=int(value["rowNumber"])
        if value.get("rowNumber") is not None
        else None,
        field=value.get("field"),
        employeeId=value.get("employeeId"),
        employeeName=value.get("employeeName"),
        workDate=_date_or_none(value.get("workDate")),
    )


def _date_or_none(value: Any) -> date | None:
    if value in (None, ""):
        return None
    return datetime.fromisoformat(str(value)[:10]).date()


def _float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def _write_wage_payload_json(
    *,
    output_dir: Path,
    attendance_file: Path,
    parsed_result: AttendanceParseResult,
    wage_result: WageRecordGenerationResult | None,
    task_report,
    task_status: str,
    warnings: tuple[WageIssue, ...],
    errors: tuple[WageIssue, ...],
    generated_at: datetime,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    sha256 = compute_sha256(attendance_file)
    output_path = (
        output_dir / f"{_safe_filename(attendance_file.stem)}-{sha256[:12]}.json"
    )
    payload = {
        "schema_version": 1,
        "batch_version": WAGE_API_BATCH_VERSION,
        "generated_at": generated_at.isoformat(),
        "source_file": str(attendance_file),
        "original_filename": attendance_file.name,
        "sha256": sha256,
        "detection": _json_ready(detect_attendance_workbook(attendance_file)),
        "parsed_result": _json_ready(parsed_result),
        "wage_record_result": _json_ready(wage_result) if wage_result else None,
        "task_report": _json_ready(task_report),
        "task_status": task_status,
        "warnings": _json_ready(warnings),
        "errors": _json_ready(errors),
        "exception": None,
    }
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return output_path


def _task_status(
    warnings: tuple[WageIssue, ...],
    errors: tuple[WageIssue, ...],
) -> str:
    if errors:
        return "ERROR"
    if warnings:
        return "WARNING"
    return "SUCCESS"


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "unnamed"
