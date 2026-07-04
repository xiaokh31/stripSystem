from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from worker_python.batch import _json_ready
from worker_python.imports import compute_sha256
from worker_python.time_utils import operational_now
from worker_python.wage.attendance import (
    AttendanceParseResult,
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
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    attendance_file = attendance_file.resolve()
    template_path = template_path.resolve()
    output_dir = output_dir.resolve()
    generated_at = generated_at or operational_now()

    parsed_result = parse_attendance_workbook(attendance_file)
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
        "schema_version": 1,
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
        "wage_record_path": str(wage_result.outputPath),
        "task_report_path": str(task_report.htmlPath),
        "employee_count": len(parsed_result.employees),
        "day_count": len(parsed_result.days),
        "warning_count": len(warnings),
        "error_count": len(errors),
        "warnings": _json_ready(warnings),
        "errors": _json_ready(errors),
        "exception": None,
    }


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
    output_path = output_dir / f"{_safe_filename(attendance_file.stem)}-{sha256[:12]}.json"
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
