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
from worker_python.labels import (
    generate_pallet_label_pdf,
    generate_print_calibration_pdf,
)
from worker_python.pallets import (
    PalletConfig,
    calculate_pallets,
    inputs_from_parsed_result,
)
from worker_python.parser import FormatType, detect_excel_format
from worker_python.parser_profiles import (
    FINGERPRINT_ALGORITHM_VERSION,
    MAPPING_SCHEMA_VERSION,
    PROFILE_PARSER_VERSION,
    FingerprintDefinition,
    MappingDefinition,
    ProfileDefinitionError,
    WorkbookInspectionError,
    execute_mapping,
    inspect_workbook,
    rank_profile_matches,
    suggest_mappings,
)
from worker_python.reports import write_excel_report
from worker_python.task_reports import record_from_detection, record_from_parsed_result
from worker_python.time_utils import operational_now
from worker_python.unloading_summary import (
    result_payload as unloading_summary_result_payload,
    write_unloading_summary_workbook,
)
from worker_python.unloading_wage import run_unload_wage_p0
from worker_python.wage import (
    run_wage_generate_record_api,
    run_wage_p0,
    run_wage_p0_parse,
    run_wage_parse_api,
)


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


@app.command("wage-p0")
def wage_p0(
    attendance_file: Path = typer.Option(
        ...,
        "--attendance-file",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Legacy .xls wage attendance workbook to parse.",
    ),
    wage_template: Path = typer.Option(
        ...,
        "--wage-template",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Legacy .xls wage record template workbook.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="WAGE-P0 output storage directory.",
    ),
) -> None:
    result = run_wage_p0(
        attendance_file=attendance_file,
        template_path=wage_template,
        output_dir=output_dir,
    )
    typer.echo(
        json.dumps(
            _json_ready(result),
            ensure_ascii=False,
            sort_keys=True,
        )
    )


@app.command("wage-p0-parse")
def wage_p0_parse(
    attendance_file: Path = typer.Option(
        ...,
        "--attendance-file",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Legacy .xls wage attendance workbook to parse for WAGE-P0-02.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="WAGE-P0-02 parsed JSON output directory.",
    ),
) -> None:
    result = run_wage_p0_parse(
        attendance_file=attendance_file,
        output_dir=output_dir,
    )
    typer.echo(
        json.dumps(
            _json_ready(result),
            ensure_ascii=False,
            sort_keys=True,
        )
    )


@app.command("wage-parse-file")
def wage_parse_file(
    attendance_file: Path = typer.Option(
        ...,
        "--attendance-file",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Legacy .xls wage attendance workbook to parse for API persistence.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="Wage parse output directory.",
    ),
) -> None:
    result = run_wage_parse_api(
        attendance_file=attendance_file,
        output_dir=output_dir,
    )
    typer.echo(
        json.dumps(
            _json_ready(result),
            ensure_ascii=False,
            sort_keys=True,
        )
    )


@app.command("wage-generate-record")
def wage_generate_record(
    attendance_file: Path = typer.Option(
        ...,
        "--attendance-file",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Legacy .xls wage attendance workbook to generate a wage record from.",
    ),
    wage_template: Path = typer.Option(
        ...,
        "--wage-template",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Legacy .xls wage record template workbook.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="Wage record output directory.",
    ),
    normalized_attendance_json: Path | None = typer.Option(
        None,
        "--normalized-attendance-json",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Server-controlled persisted active attendance-row JSON.",
    ),
) -> None:
    result = run_wage_generate_record_api(
        attendance_file=attendance_file,
        template_path=wage_template,
        output_dir=output_dir,
        normalized_attendance_json=normalized_attendance_json,
    )
    typer.echo(
        json.dumps(
            _json_ready(result),
            ensure_ascii=False,
            sort_keys=True,
        )
    )


@app.command("unload-wage-p0")
def unload_wage_p0(
    input_file: Path = typer.Option(
        ...,
        "--input-file",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="UNLOAD-WAGE-P0 JSON input file.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="UNLOAD-WAGE-P0 output storage directory.",
    ),
) -> None:
    result = run_unload_wage_p0(
        input_file=input_file,
        output_dir=output_dir,
    )
    typer.echo(
        json.dumps(
            _json_ready(result),
            ensure_ascii=False,
            sort_keys=True,
        )
    )


@app.command("write-unloading-summary")
def write_unloading_summary(
    payload: Path = typer.Option(
        ...,
        "--payload",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Monthly unloading summary JSON payload.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="Monthly unloading summary workbook output directory.",
    ),
) -> None:
    request = json.loads(payload.read_text(encoding="utf-8"))
    result = write_unloading_summary_workbook(
        payload=request,
        output_dir=output_dir,
    )
    typer.echo(
        json.dumps(
            unloading_summary_result_payload(result),
            ensure_ascii=False,
            sort_keys=True,
        )
    )


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
    pallet_policy_json: str | None = typer.Option(
        None,
        "--pallet-policy-json",
        help="API-resolved pallet policy snapshot for this parse; retained with the worker payload.",
    ),
) -> None:
    generated_at = operational_now()
    source_path = input_file.resolve()
    sha256 = compute_sha256(source_path) if source_path.is_file() else None
    detection = None
    parsed_result = None
    pallet_result = None
    pallet_policy: dict[str, object] | None = None

    if pallet_policy_json:
        try:
            candidate = json.loads(pallet_policy_json)
        except json.JSONDecodeError as exc:
            raise typer.BadParameter("must be valid pallet policy JSON") from exc
        if not isinstance(candidate, dict):
            raise typer.BadParameter("must be a pallet policy object")
        pallet_policy = candidate

    try:
        detection = detect_excel_format(source_path)

        if detection.format_type == FormatType.UNKNOWN:
            task_record = record_from_detection(source_path, detection)
        else:
            parsed_result = _parse_detected_file(source_path, detection)
            pallet_result = calculate_pallets(
                inputs_from_parsed_result(parsed_result),
                container_no=parsed_result.containerNo,
                pallet_id_namespace=sha256[:12] if sha256 else None,
                config=PalletConfig.from_policy(pallet_policy)
                if pallet_policy
                else PalletConfig(),
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
                    pallet_policy=pallet_policy,
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
                    pallet_policy=pallet_policy,
                    exception=exc,
                ),
                ensure_ascii=False,
                sort_keys=True,
            )
        )


@app.command("profile-inspect")
def profile_inspect(
    input_file: Path = typer.Option(
        ...,
        "--input-file",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Preserved OOXML workbook selected by the API.",
    ),
) -> None:
    try:
        inspection = inspect_workbook(input_file)
        payload: dict[str, object] = {
            "contractVersion": inspection.contractVersion,
            "workerVersion": PROFILE_PARSER_VERSION,
            "inspection": inspection.model_dump(mode="json"),
            "candidateMappings": [
                item.model_dump(mode="json") for item in suggest_mappings(inspection)
            ],
            "issues": [],
        }
    except WorkbookInspectionError as exc:
        payload = {
            "contractVersion": "workbook-inspection-v1",
            "workerVersion": PROFILE_PARSER_VERSION,
            "inspection": None,
            "candidateMappings": [],
            "issues": [item.model_dump(mode="json") for item in exc.issues],
        }
    typer.echo(json.dumps(payload, ensure_ascii=False, sort_keys=True))


@app.command("profile-validate")
def profile_validate(
    mapping_definition_json: str = typer.Option(
        ...,
        "--mapping-definition-json",
        help="Declarative parser-profile mapping JSON.",
    ),
    fingerprint_definition_json: str = typer.Option(
        ...,
        "--fingerprint-definition-json",
        help="Declarative structural fingerprint JSON.",
    ),
) -> None:
    issues: list[dict[str, object]] = []
    try:
        mapping_payload = _profile_json_object(mapping_definition_json)
        MappingDefinition.validate_definition(mapping_payload)
    except ProfileDefinitionError as exc:
        issues.extend(item.model_dump(mode="json") for item in exc.issues)
    except ValueError:
        issues.append(
            {"code": "PROFILE_DEFINITION_JSON_INVALID", "path": "mappingDefinition"}
        )

    try:
        fingerprint_payload = _profile_json_object(fingerprint_definition_json)
        FingerprintDefinition.validate_definition(fingerprint_payload)
    except ProfileDefinitionError as exc:
        issues.extend(item.model_dump(mode="json") for item in exc.issues)
    except ValueError:
        issues.append(
            {"code": "PROFILE_DEFINITION_JSON_INVALID", "path": "fingerprintDefinition"}
        )

    typer.echo(
        json.dumps(
            {
                "valid": not issues,
                "mappingSchemaVersion": MAPPING_SCHEMA_VERSION,
                "fingerprintVersion": FINGERPRINT_ALGORITHM_VERSION,
                "workerVersion": PROFILE_PARSER_VERSION,
                "issues": issues,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


@app.command("profile-match")
def profile_match(
    input_file: Path = typer.Option(
        ...,
        "--input-file",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Preserved OOXML workbook selected by the API.",
    ),
    fingerprint_definitions_json: str = typer.Option(
        ...,
        "--fingerprint-definitions-json",
        help="Active parser-profile fingerprint definitions JSON array.",
    ),
) -> None:
    issues: list[dict[str, object]] = []
    definitions: list[FingerprintDefinition] = []
    try:
        raw_definitions = json.loads(fingerprint_definitions_json)
        if not isinstance(raw_definitions, list):
            raise ValueError("fingerprint definitions must be an array")
        for index, candidate in enumerate(raw_definitions):
            try:
                definitions.append(FingerprintDefinition.validate_definition(candidate))
            except ProfileDefinitionError as exc:
                issues.extend(
                    {
                        **item.model_dump(mode="json"),
                        "path": f"fingerprintDefinitions.{index}.{item.path or ''}".rstrip("."),
                    }
                    for item in exc.issues
                )
    except (json.JSONDecodeError, ValueError):
        issues.append(
            {
                "code": "PROFILE_DEFINITION_JSON_INVALID",
                "path": "fingerprintDefinitions",
            }
        )

    try:
        inspection = inspect_workbook(input_file)
    except WorkbookInspectionError as exc:
        typer.echo(
            json.dumps(
                {
                    "workerVersion": PROFILE_PARSER_VERSION,
                    "inspection": None,
                    "selectedProfileId": None,
                    "issueCode": "FINGERPRINT_INSPECTION_FAILED",
                    "candidates": [],
                    "issues": [
                        *issues,
                        *(item.model_dump(mode="json") for item in exc.issues),
                    ],
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return

    ranked = rank_profile_matches(inspection, definitions)
    typer.echo(
        json.dumps(
            {
                "workerVersion": PROFILE_PARSER_VERSION,
                "inspection": inspection.model_dump(mode="json"),
                "selectedProfileId": ranked.selectedProfileId,
                "issueCode": ranked.issueCode,
                "candidates": [
                    candidate.model_dump(mode="json")
                    for candidate in ranked.candidates
                ],
                "issues": issues,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


@app.command("profile-execute")
def profile_execute(
    input_file: Path = typer.Option(
        ...,
        "--input-file",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Preserved OOXML workbook selected by the API.",
    ),
    mapping_definition_json: str = typer.Option(
        ...,
        "--mapping-definition-json",
        help="Validated declarative parser-profile mapping JSON.",
    ),
    replay_input_hash: str = typer.Option(
        ...,
        "--replay-input-hash",
        help="API-pinned replay input hash.",
    ),
) -> None:
    try:
        definition = MappingDefinition.validate_definition(
            _profile_json_object(mapping_definition_json)
        )
    except ProfileDefinitionError as exc:
        typer.echo(
            json.dumps(
                {
                    "workerVersion": PROFILE_PARSER_VERSION,
                    "result": None,
                    "issues": [item.model_dump(mode="json") for item in exc.issues],
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return
    except ValueError:
        typer.echo(
            json.dumps(
                {
                    "workerVersion": PROFILE_PARSER_VERSION,
                    "result": None,
                    "issues": [
                        {
                            "code": "PROFILE_DEFINITION_JSON_INVALID",
                            "path": "mappingDefinition",
                        }
                    ],
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return

    result = execute_mapping(
        input_file,
        definition,
        replay_input_hash=replay_input_hash,
    )
    typer.echo(
        json.dumps(
            {
                "workerVersion": PROFILE_PARSER_VERSION,
                "result": result.model_dump(mode="json"),
                "issues": [],
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


def _profile_json_object(value: str) -> dict[str, Any]:
    try:
        candidate = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError("invalid profile JSON") from exc
    if not isinstance(candidate, dict):
        raise ValueError("profile JSON must be an object")
    return candidate


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
    pallet_policy: dict[str, object] | None = None,
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
        "pallet_policy": pallet_policy,
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
