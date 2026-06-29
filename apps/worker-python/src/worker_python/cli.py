from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import typer

from worker_python.batch import (
    BATCH_VERSION,
    _exception_payload,
    _exception_record,
    _json_ready,
    _parse_detected_file,
    run_batch,
)
from worker_python.imports import compute_sha256
from worker_python.labels import generate_pallet_label_pdf, generate_print_calibration_pdf
from worker_python.pallets import calculate_pallets, inputs_from_destination_summaries
from worker_python.parser import FormatType, detect_excel_format
from worker_python.reports import write_excel_report
from worker_python.task_reports import record_from_detection, record_from_parsed_result
from worker_python.time_utils import operational_now


app = typer.Typer(no_args_is_help=True)


@app.callback()
def root() -> None:
    pass


@app.command()
def batch(
    input_dir: Path = typer.Option(
        ...,
        "--input-dir",
        file_okay=False,
        dir_okay=True,
        readable=True,
        help="Directory containing .xlsx unloading files.",
    ),
    template: Path = typer.Option(
        ...,
        "--template",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Excel unloading report template path.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="Batch output storage directory.",
    ),
) -> None:
    result = run_batch(
        input_dir=input_dir,
        template_path=template,
        output_dir=output_dir,
    )
    typer.echo("Batch completed")
    typer.echo(f"Processed: {result.processedCount}")
    typer.echo(f"Success: {result.successCount}")
    typer.echo(f"Warnings: {result.warningFileCount}")
    typer.echo(f"Failed: {result.failedCount}")
    typer.echo(f"Parsed JSON: {result.parsedJsonDir}")
    typer.echo(f"Reports: {result.reportDir}")
    typer.echo(f"Labels: {result.labelDir}")
    typer.echo(f"Task report: {result.taskReport.htmlPath}")
    typer.echo(f"Corrections JSON: {result.taskReport.correctionsPath}")


@app.command("parse-file")
def parse_file(
    input_file: Path = typer.Option(
        ...,
        "--input-file",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Single .xlsx unloading file to parse without generating reports or labels.",
    ),
) -> None:
    generated_at = operational_now()
    source_path = input_file.resolve()
    sha256 = compute_sha256(source_path) if source_path.is_file() else None
    detection = None
    parsed_result = None
    pallet_result = None

    try:
        detection = detect_excel_format(source_path)

        if detection.format_type == FormatType.UNKNOWN:
            task_record = record_from_detection(source_path, detection)
        else:
            parsed_result = _parse_detected_file(source_path, detection)
            pallet_result = calculate_pallets(
                inputs_from_destination_summaries(parsed_result.destinationSummaries),
                container_no=parsed_result.containerNo,
                pallet_id_namespace=sha256[:12] if sha256 else None,
            )
            task_record = record_from_parsed_result(
                original_file=source_path,
                parsed_result=parsed_result,
                pallet_result=pallet_result,
            )

        typer.echo(
            json.dumps(
                _parse_payload(
                    source_path=source_path,
                    sha256=sha256,
                    generated_at=generated_at,
                    detection=detection,
                    parsed_result=parsed_result,
                    pallet_result=pallet_result,
                    task_status=task_record.parseStatus,
                    warnings=task_record.warnings,
                    errors=task_record.errors,
                ),
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    except Exception as exc:
        task_record = _exception_record(source_path, detection, exc)
        typer.echo(
            json.dumps(
                _parse_payload(
                    source_path=source_path,
                    sha256=sha256,
                    generated_at=generated_at,
                    detection=detection,
                    parsed_result=parsed_result,
                    pallet_result=pallet_result,
                    task_status=task_record.parseStatus,
                    warnings=task_record.warnings,
                    errors=task_record.errors,
                    exception=exc,
                ),
                ensure_ascii=False,
                sort_keys=True,
            )
        )


def _parse_payload(
    *,
    source_path: Path,
    sha256: str | None,
    generated_at: datetime,
    detection: object | None,
    parsed_result: object | None,
    pallet_result: object | None,
    task_status: str,
    warnings: object,
    errors: object,
    exception: Exception | None = None,
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "batch_version": BATCH_VERSION,
        "generated_at": generated_at.isoformat(),
        "source_file": str(source_path),
        "original_filename": source_path.name,
        "sha256": sha256,
        "parse_scope": "parser-only",
        "detection": _json_ready(detection),
        "parsed_result": _json_ready(parsed_result),
        "pallet_result": _json_ready(pallet_result),
        "report_result": None,
        "label_result": None,
        "task_status": task_status,
        "warnings": _json_ready(warnings),
        "errors": _json_ready(errors),
        "exception": _exception_payload(exception),
    }


@app.command("write-report")
def write_report(
    payload: Path = typer.Option(
        ...,
        "--payload",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="JSON payload containing parsed_result and pallet_result for report generation.",
    ),
    template: Path = typer.Option(
        ...,
        "--template",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Excel unloading report template path.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="Report output directory.",
    ),
) -> None:
    generated_at = operational_now()
    try:
        report_payload = json.loads(payload.read_text(encoding="utf-8"))
        parsed_result = _namespace_from_json(report_payload["parsed_result"])
        pallet_result = _namespace_from_json(report_payload["pallet_result"])
        company = str(report_payload.get("company") or "Bestar")
        result = write_excel_report(
            parsed_result=parsed_result,
            pallet_result=pallet_result,
            output_dir=output_dir.resolve(),
            template_path=template.resolve(),
            report_datetime=generated_at,
            company=company,
        )
        task_status = (
            "ERROR" if result.errors else "WARNING" if result.warnings else "SUCCESS"
        )
        typer.echo(
            json.dumps(
                {
                    "schema_version": 1,
                    "generated_at": generated_at.isoformat(),
                    "task_status": task_status,
                    "report_result": _json_ready(result),
                    "warnings": _json_ready(result.warnings),
                    "errors": _json_ready(result.errors),
                    "exception": None,
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    except Exception as exc:
        typer.echo(
            json.dumps(
                {
                    "schema_version": 1,
                    "generated_at": generated_at.isoformat(),
                    "task_status": "ERROR",
                    "report_result": None,
                    "warnings": [],
                    "errors": [
                        {
                            "code": "REPORT_GENERATION_FAILED",
                            "message": f"{type(exc).__name__}: {exc}",
                        }
                    ],
                    "exception": _exception_payload(exc),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )


@app.command("write-labels")
def write_labels(
    payload: Path = typer.Option(
        ...,
        "--payload",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="JSON payload containing parsed_result and pallet_result for label generation.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="Label PDF output directory.",
    ),
    label_date: str | None = typer.Option(
        None,
        "--label-date",
        help="Label date in YYYY-MM-DD format. Defaults to today.",
    ),
) -> None:
    generated_at = operational_now()
    try:
        label_payload = json.loads(payload.read_text(encoding="utf-8"))
        parsed_result = _namespace_from_json(label_payload["parsed_result"])
        pallet_result = _namespace_from_json(label_payload["pallet_result"])
        label_day = (
            date.fromisoformat(label_date) if label_date else generated_at.date()
        )
        result = generate_pallet_label_pdf(
            parsed_result=parsed_result,
            pallet_result=pallet_result,
            output_dir=output_dir.resolve(),
            label_date=label_day,
        )
        task_status = (
            "ERROR" if result.errors else "WARNING" if result.warnings else "SUCCESS"
        )
        typer.echo(
            json.dumps(
                {
                    "schema_version": 1,
                    "generated_at": generated_at.isoformat(),
                    "task_status": task_status,
                    "label_result": _json_ready(result),
                    "warnings": _json_ready(result.warnings),
                    "errors": _json_ready(result.errors),
                    "exception": None,
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    except Exception as exc:
        typer.echo(
            json.dumps(
                {
                    "schema_version": 1,
                    "generated_at": generated_at.isoformat(),
                    "task_status": "ERROR",
                    "label_result": None,
                    "warnings": [],
                    "errors": [
                        {
                            "code": "LABEL_GENERATION_FAILED",
                            "message": f"{type(exc).__name__}: {exc}",
                        }
                    ],
                    "exception": _exception_payload(exc),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )


@app.command("write-print-calibration")
def write_print_calibration(
    output_dir: Path = typer.Option(
        Path("storage/labels"),
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="Label output directory. Defaults to storage/labels.",
    ),
) -> None:
    generated_at = operational_now()
    try:
        result = generate_print_calibration_pdf(output_dir=output_dir.resolve())
        typer.echo(
            json.dumps(
                {
                    "schema_version": 1,
                    "generated_at": generated_at.isoformat(),
                    "task_status": "SUCCESS",
                    "print_calibration_result": _json_ready(result),
                    "warnings": [],
                    "errors": [],
                    "exception": None,
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    except Exception as exc:
        typer.echo(
            json.dumps(
                {
                    "schema_version": 1,
                    "generated_at": generated_at.isoformat(),
                    "task_status": "ERROR",
                    "print_calibration_result": None,
                    "warnings": [],
                    "errors": [
                        {
                            "code": "PRINT_CALIBRATION_GENERATION_FAILED",
                            "message": f"{type(exc).__name__}: {exc}",
                        }
                    ],
                    "exception": _exception_payload(exc),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )


def _namespace_from_json(value: Any) -> Any:
    if isinstance(value, dict):
        return SimpleNamespace(
            **{str(key): _namespace_from_json(item) for key, item in value.items()}
        )
    if isinstance(value, list):
        return tuple(_namespace_from_json(item) for item in value)
    return value


def main() -> None:
    app()
