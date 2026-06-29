from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, is_dataclass
from datetime import date, datetime
from enum import Enum
from pathlib import Path
from typing import Any

from worker_python.imports import ImportRegistry, ImportResult, compute_sha256
from worker_python.labels import LabelGenerationResult, generate_pallet_label_pdf
from worker_python.pallets import PalletCalculationResult, calculate_pallets, inputs_from_destination_summaries
from worker_python.parser import (
    DetectionResult,
    FormatType,
    detect_excel_format,
    parse_bestar_receiving,
    parse_unloading_plan_cn,
)
from worker_python.reports import ExcelReportResult, write_excel_report
from worker_python.task_reports import (
    TaskIssue,
    TaskReportRecord,
    TaskReportResult,
    generate_html_task_report,
    record_from_detection,
    record_from_parsed_result,
)
from worker_python.time_utils import operational_now


BATCH_VERSION = "phase0-batch-v1"


@dataclass(frozen=True)
class BatchFileResult:
    originalFilename: str
    sha256: str | None
    detectedFormat: str
    parseStatus: str
    parsedJsonPath: Path | None
    reportPath: Path | None
    labelPath: Path | None
    warningCount: int
    errorCount: int


@dataclass(frozen=True)
class BatchResult:
    inputDir: Path
    outputDir: Path
    parsedJsonDir: Path
    reportDir: Path
    labelDir: Path
    taskReport: TaskReportResult
    files: tuple[BatchFileResult, ...]

    @property
    def processedCount(self) -> int:
        return len(self.files)

    @property
    def successCount(self) -> int:
        return sum(file.parseStatus != "ERROR" for file in self.files)

    @property
    def warningFileCount(self) -> int:
        return sum(file.parseStatus == "WARNING" for file in self.files)

    @property
    def failedCount(self) -> int:
        return sum(file.parseStatus == "ERROR" for file in self.files)


def run_batch(
    *,
    input_dir: Path,
    template_path: Path,
    output_dir: Path,
    generated_at: datetime | None = None,
) -> BatchResult:
    input_dir = input_dir.resolve()
    template_path = template_path.resolve()
    output_dir = output_dir.resolve()
    generated_at = generated_at or operational_now()

    if not input_dir.is_dir():
        raise NotADirectoryError(f"Batch input directory does not exist: {input_dir}")
    if not template_path.is_file():
        raise FileNotFoundError(f"Excel report template does not exist: {template_path}")

    original_files_dir = output_dir / "original_files"
    parsed_json_dir = output_dir / "parsed_json"
    report_dir = output_dir / "reports"
    label_dir = output_dir / "labels"
    task_report_dir = output_dir / "task_reports"
    corrections_dir = output_dir / "corrections"

    parsed_json_dir.mkdir(parents=True, exist_ok=True)
    registry = ImportRegistry(original_files_dir)
    task_records: list[TaskReportRecord] = []
    file_results: list[BatchFileResult] = []

    for source_path in sorted(input_dir.glob("*.xlsx")):
        file_result, task_record = _process_file(
            source_path=source_path,
            registry=registry,
            parsed_json_dir=parsed_json_dir,
            report_dir=report_dir,
            label_dir=label_dir,
            template_path=template_path,
            generated_at=generated_at,
        )
        file_results.append(file_result)
        task_records.append(task_record)

    task_report = generate_html_task_report(
        tuple(task_records),
        output_dir=task_report_dir,
        corrections_dir=corrections_dir,
        generated_at=generated_at,
    )

    return BatchResult(
        inputDir=input_dir,
        outputDir=output_dir,
        parsedJsonDir=parsed_json_dir,
        reportDir=report_dir,
        labelDir=label_dir,
        taskReport=task_report,
        files=tuple(file_results),
    )


def _process_file(
    *,
    source_path: Path,
    registry: ImportRegistry,
    parsed_json_dir: Path,
    report_dir: Path,
    label_dir: Path,
    template_path: Path,
    generated_at: datetime,
) -> tuple[BatchFileResult, TaskReportRecord]:
    sha256: str | None = None
    imported: ImportResult | None = None
    detection: DetectionResult | None = None
    parsed_result: Any | None = None
    pallet_result: PalletCalculationResult | None = None
    report_result: ExcelReportResult | None = None
    label_result: LabelGenerationResult | None = None
    parsed_json_path: Path | None = None

    try:
        sha256 = compute_sha256(source_path)
        imported = registry.import_file(source_path)
        detection = detect_excel_format(imported.stored_path)

        if detection.format_type == FormatType.UNKNOWN:
            task_record = record_from_detection(source_path, detection)
        else:
            parsed_result = _parse_detected_file(imported.stored_path, detection)
            pallet_result = calculate_pallets(
                inputs_from_destination_summaries(parsed_result.destinationSummaries),
                container_no=parsed_result.containerNo,
                pallet_id_namespace=sha256[:12] if sha256 else None,
            )

            if not parsed_result.errors and not pallet_result.errors:
                report_result = write_excel_report(
                    parsed_result=parsed_result,
                    pallet_result=pallet_result,
                    output_dir=report_dir,
                    template_path=template_path,
                    report_datetime=generated_at,
                )
                label_result = generate_pallet_label_pdf(
                    parsed_result=parsed_result,
                    pallet_result=pallet_result,
                    output_dir=label_dir,
                    label_date=generated_at.date(),
                )

            task_record = record_from_parsed_result(
                original_file=source_path,
                parsed_result=parsed_result,
                pallet_result=pallet_result,
                report_result=report_result,
                label_result=label_result,
            )

        parsed_json_path = _write_parsed_json(
            parsed_json_dir=parsed_json_dir,
            source_path=source_path,
            sha256=sha256,
            imported=imported,
            detection=detection,
            parsed_result=parsed_result,
            pallet_result=pallet_result,
            report_result=report_result,
            label_result=label_result,
            task_record=task_record,
            generated_at=generated_at,
        )

        return _file_result(source_path, sha256, task_record, parsed_json_path), task_record
    except Exception as exc:
        task_record = _exception_record(source_path, detection, exc)
        parsed_json_path = _write_parsed_json(
            parsed_json_dir=parsed_json_dir,
            source_path=source_path,
            sha256=sha256,
            imported=imported,
            detection=detection,
            parsed_result=parsed_result,
            pallet_result=pallet_result,
            report_result=report_result,
            label_result=label_result,
            task_record=task_record,
            generated_at=generated_at,
            exception=exc,
        )
        return _file_result(source_path, sha256, task_record, parsed_json_path), task_record


def _parse_detected_file(path: Path, detection: DetectionResult) -> Any:
    if detection.format_type == FormatType.UNLOADING_PLAN_CN:
        return parse_unloading_plan_cn(path)
    if detection.format_type == FormatType.BESTAR_RECEIVING:
        return parse_bestar_receiving(path)
    raise ValueError(f"Unsupported detected format: {detection.format_type}")


def _write_parsed_json(
    *,
    parsed_json_dir: Path,
    source_path: Path,
    sha256: str | None,
    imported: ImportResult | None,
    detection: DetectionResult | None,
    parsed_result: Any | None,
    pallet_result: PalletCalculationResult | None,
    report_result: ExcelReportResult | None,
    label_result: LabelGenerationResult | None,
    task_record: TaskReportRecord,
    generated_at: datetime,
    exception: Exception | None = None,
) -> Path:
    parsed_json_dir.mkdir(parents=True, exist_ok=True)
    output_path = parsed_json_dir / _parsed_json_filename(source_path, sha256)
    payload = {
        "schema_version": 1,
        "batch_version": BATCH_VERSION,
        "generated_at": generated_at.isoformat(),
        "source_file": str(source_path),
        "original_filename": source_path.name,
        "sha256": sha256,
        "import": _json_ready(imported),
        "detection": _json_ready(detection),
        "parsed_result": _json_ready(parsed_result),
        "pallet_result": _json_ready(pallet_result),
        "report_result": _json_ready(report_result),
        "label_result": _json_ready(label_result),
        "task_status": task_record.parseStatus,
        "warnings": _json_ready(task_record.warnings),
        "errors": _json_ready(task_record.errors),
        "exception": _exception_payload(exception),
    }
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return output_path


def _parsed_json_filename(source_path: Path, sha256: str | None) -> str:
    suffix = sha256[:12] if sha256 else "no-sha256"
    return f"{_safe_filename(source_path.stem)}-{suffix}.json"


def _file_result(
    source_path: Path,
    sha256: str | None,
    task_record: TaskReportRecord,
    parsed_json_path: Path | None,
) -> BatchFileResult:
    return BatchFileResult(
        originalFilename=source_path.name,
        sha256=sha256,
        detectedFormat=task_record.detectedFormat,
        parseStatus=task_record.parseStatus,
        parsedJsonPath=parsed_json_path,
        reportPath=Path(task_record.reportFileLink) if task_record.reportFileLink else None,
        labelPath=Path(task_record.labelFileLink) if task_record.labelFileLink else None,
        warningCount=len(task_record.warnings),
        errorCount=len(task_record.errors),
    )


def _exception_record(
    source_path: Path,
    detection: DetectionResult | None,
    exc: Exception,
) -> TaskReportRecord:
    detected_format = detection.format_type.value if detection else FormatType.UNKNOWN.value
    confidence = detection.confidence if detection else 0.0
    return TaskReportRecord(
        originalFilename=source_path.name,
        detectedFormat=detected_format,
        containerNo=None,
        parseStatus="ERROR",
        confidence=confidence,
        destinationSummaries=(),
        totalCartons=0,
        totalVolumeCbm=0.0,
        calculatedPallets=0,
        reportFileLink=None,
        labelFileLink=None,
        warnings=(),
        errors=(
            TaskIssue(
                code="BATCH_FILE_FAILED",
                message=f"{type(exc).__name__}: {exc}",
            ),
        ),
    )


def _exception_payload(exc: Exception | None) -> dict[str, str] | None:
    if exc is None:
        return None
    return {"type": type(exc).__name__, "message": str(exc)}


def _json_ready(value: Any) -> Any:
    if value is None:
        return None
    if is_dataclass(value) and not isinstance(value, type):
        return _json_ready(asdict(value))
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_ready(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "unnamed"
