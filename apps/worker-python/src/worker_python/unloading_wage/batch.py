from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from worker_python.batch import _json_ready
from worker_python.imports import ImportRegistry, ImportResult, compute_sha256
from worker_python.time_utils import operational_now
from worker_python.unloading_wage.report import (
    UnloadingWageTaskReportResult,
    generate_unloading_wage_html_report,
)
from worker_python.unloading_wage.settlement import (
    UnloadingWageIssue,
    UnloadingWageSettlementResult,
    load_unloading_wage_input,
    settle_unloading_wage_payload,
)


UNLOAD_WAGE_P0_BATCH_VERSION = "unload-wage-p0-batch-v1"


@dataclass(frozen=True)
class UnloadWageP0BatchResult:
    originalFilename: str
    sha256: str
    duplicate: bool
    taskStatus: str
    settlementJsonPath: Path
    taskReportPath: Path
    payContainerCount: int
    workerCount: int
    warningCount: int
    errorCount: int


def run_unload_wage_p0(
    *,
    input_file: Path,
    output_dir: Path,
    generated_at: datetime | None = None,
) -> UnloadWageP0BatchResult:
    input_file = input_file.resolve()
    output_dir = output_dir.resolve()
    generated_at = generated_at or operational_now()

    original_files_dir = output_dir / "original_files"
    settlement_json_dir = output_dir / "settlements"
    task_report_dir = output_dir / "task_reports"

    sha256 = compute_sha256(input_file)
    registry = ImportRegistry(
        original_files_dir,
        allowed_suffixes=(".json",),
        file_kind="unloading wage input files",
    )
    imported = registry.import_file(input_file)
    payload = load_unloading_wage_input(imported.stored_path)
    settlement_result = settle_unloading_wage_payload(payload)
    warnings = _warnings(imported, settlement_result)
    errors = settlement_result.errors
    task_status = "ERROR" if errors else "WARNING" if warnings else "SUCCESS"

    report_result = generate_unloading_wage_html_report(
        settlement_result=settlement_result,
        output_dir=task_report_dir,
        original_filename=input_file.name,
        sha256=sha256,
        generated_at=generated_at,
    )
    settlement_json_path = _write_settlement_json(
        settlement_json_dir=settlement_json_dir,
        input_file=input_file,
        sha256=sha256,
        imported=imported,
        settlement_result=settlement_result,
        report_result=report_result,
        task_status=task_status,
        warnings=warnings,
        errors=errors,
        generated_at=generated_at,
    )

    return UnloadWageP0BatchResult(
        originalFilename=input_file.name,
        sha256=sha256,
        duplicate=imported.duplicate,
        taskStatus=task_status,
        settlementJsonPath=settlement_json_path,
        taskReportPath=report_result.htmlPath,
        payContainerCount=len(settlement_result.payContainers),
        workerCount=len(settlement_result.workers),
        warningCount=len(warnings),
        errorCount=len(errors),
    )


def _warnings(
    imported: ImportResult,
    settlement_result: UnloadingWageSettlementResult,
) -> tuple[UnloadingWageIssue, ...]:
    warnings = list(settlement_result.warnings)
    if imported.duplicate:
        warnings.insert(
            0,
            UnloadingWageIssue(
                code="DUPLICATE_UNLOADING_WAGE_INPUT",
                message="Unloading wage input content already exists by SHA-256.",
            ),
        )
    return tuple(warnings)


def _write_settlement_json(
    *,
    settlement_json_dir: Path,
    input_file: Path,
    sha256: str,
    imported: ImportResult,
    settlement_result: UnloadingWageSettlementResult,
    report_result: UnloadingWageTaskReportResult,
    task_status: str,
    warnings: tuple[UnloadingWageIssue, ...],
    errors: tuple[UnloadingWageIssue, ...],
    generated_at: datetime,
) -> Path:
    settlement_json_dir.mkdir(parents=True, exist_ok=True)
    output_path = settlement_json_dir / _settlement_json_filename(input_file, sha256)
    payload = {
        "schema_version": 1,
        "batch_version": UNLOAD_WAGE_P0_BATCH_VERSION,
        "generated_at": generated_at.isoformat(),
        "source_file": str(input_file),
        "original_filename": input_file.name,
        "sha256": sha256,
        "import": _json_ready(imported),
        "settlement_result": _json_ready(settlement_result),
        "task_report": _json_ready(report_result),
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


def _settlement_json_filename(input_file: Path, sha256: str) -> str:
    return f"{_safe_filename(input_file.stem)}-{sha256[:12]}.json"


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "unnamed"
