from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from worker_python.batch import _json_ready
from worker_python.imports import ImportRegistry, ImportResult, compute_sha256
from worker_python.time_utils import operational_now
from worker_python.wage.attendance import (
    AttendanceParseResult,
    WageDetectionResult,
    WageIssue,
    detect_attendance_workbook,
    parse_attendance_workbook,
)
from worker_python.wage.generator import (
    WageRecordGenerationResult,
    generate_wage_record,
)
from worker_python.wage.report import WageTaskReportResult, generate_wage_html_task_report


WAGE_P0_BATCH_VERSION = "wage-p0-batch-v1"


@dataclass(frozen=True)
class WageP0BatchResult:
    originalFilename: str
    sha256: str
    duplicate: bool
    taskStatus: str
    parsedJsonPath: Path
    wageRecordPath: Path | None
    taskReportPath: Path
    employeeCount: int
    dayCount: int
    warningCount: int
    errorCount: int


def run_wage_p0(
    *,
    attendance_file: Path,
    template_path: Path,
    output_dir: Path,
    generated_at: datetime | None = None,
) -> WageP0BatchResult:
    attendance_file = attendance_file.resolve()
    template_path = template_path.resolve()
    output_dir = output_dir.resolve()
    generated_at = generated_at or operational_now()

    original_files_dir = output_dir / "original_files"
    parsed_json_dir = output_dir / "parsed_json"
    wage_record_dir = output_dir / "wage_records"
    task_report_dir = output_dir / "task_reports"

    sha256 = compute_sha256(attendance_file)
    registry = ImportRegistry(
        original_files_dir,
        allowed_suffixes=(".xls",),
        file_kind="wage attendance files",
    )
    imported = registry.import_file(attendance_file)
    detection = detect_attendance_workbook(imported.stored_path)
    parsed_result = parse_attendance_workbook(imported.stored_path)
    wage_result = generate_wage_record(
        attendance_result=parsed_result,
        template_path=template_path,
        output_dir=wage_record_dir,
        generated_at=generated_at,
    )
    task_report = generate_wage_html_task_report(
        attendance_result=parsed_result,
        generation_result=wage_result,
        output_dir=task_report_dir,
        original_filename=attendance_file.name,
        sha256=sha256,
        generated_at=generated_at,
    )

    warnings = _warnings(imported, parsed_result, wage_result)
    errors = tuple(parsed_result.errors) + tuple(wage_result.errors)
    task_status = "ERROR" if errors else "WARNING" if warnings else "SUCCESS"
    parsed_json_path = _write_parsed_json(
        parsed_json_dir=parsed_json_dir,
        attendance_file=attendance_file,
        sha256=sha256,
        imported=imported,
        detection=detection,
        parsed_result=parsed_result,
        wage_result=wage_result,
        task_report=task_report,
        task_status=task_status,
        warnings=warnings,
        errors=errors,
        generated_at=generated_at,
    )

    return WageP0BatchResult(
        originalFilename=attendance_file.name,
        sha256=sha256,
        duplicate=imported.duplicate,
        taskStatus=task_status,
        parsedJsonPath=parsed_json_path,
        wageRecordPath=wage_result.outputPath if not wage_result.errors else None,
        taskReportPath=task_report.htmlPath,
        employeeCount=len(parsed_result.employees),
        dayCount=len(parsed_result.days),
        warningCount=len(warnings),
        errorCount=len(errors),
    )


def _warnings(
    imported: ImportResult,
    parsed_result: AttendanceParseResult,
    wage_result: WageRecordGenerationResult,
) -> tuple[WageIssue, ...]:
    warnings = list(parsed_result.warnings) + list(wage_result.warnings)
    if imported.duplicate:
        warnings.insert(
            0,
            WageIssue(
                code="DUPLICATE_ATTENDANCE_IMPORT",
                message="Attendance import content already exists by SHA-256.",
            ),
        )
    return tuple(warnings)


def _write_parsed_json(
    *,
    parsed_json_dir: Path,
    attendance_file: Path,
    sha256: str,
    imported: ImportResult,
    detection: WageDetectionResult,
    parsed_result: AttendanceParseResult,
    wage_result: WageRecordGenerationResult,
    task_report: WageTaskReportResult,
    task_status: str,
    warnings: tuple[WageIssue, ...],
    errors: tuple[WageIssue, ...],
    generated_at: datetime,
) -> Path:
    parsed_json_dir.mkdir(parents=True, exist_ok=True)
    output_path = parsed_json_dir / _parsed_json_filename(attendance_file, sha256)
    payload = {
        "schema_version": 1,
        "batch_version": WAGE_P0_BATCH_VERSION,
        "generated_at": generated_at.isoformat(),
        "source_file": str(attendance_file),
        "original_filename": attendance_file.name,
        "sha256": sha256,
        "import": _json_ready(imported),
        "detection": _json_ready(detection),
        "parsed_result": _json_ready(parsed_result),
        "wage_record_result": _json_ready(wage_result),
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


def _parsed_json_filename(attendance_file: Path, sha256: str) -> str:
    return f"{_safe_filename(attendance_file.stem)}-{sha256[:12]}.json"


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "unnamed"
