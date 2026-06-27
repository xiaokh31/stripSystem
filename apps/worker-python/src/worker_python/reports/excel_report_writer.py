from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from worker_python.reports.cell_map import (
    COMPANY_VALUE_CELL,
    CONTAINER_VALUE_CELL,
    DATE_VALUE_CELL,
    DESTINATION_ROWS,
    SHEET_NAME,
    TIME_VALUE_CELL,
    TOTAL_CARTONS_CELL,
)


REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_TEMPLATE_PATH = REPO_ROOT / "samples" / "templates" / "卸柜报告-En.xlsx"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "storage" / "reports"
REPORT_MANIFEST_FILENAME = "report_manifest.json"


@dataclass(frozen=True)
class ExcelReportIssue:
    code: str
    message: str
    destinationCode: str | None = None


@dataclass(frozen=True)
class ExcelReportResult:
    outputPath: Path
    manifestPath: Path
    warnings: tuple[ExcelReportIssue, ...]
    errors: tuple[ExcelReportIssue, ...]
    writtenDestinationCount: int
    totalDestinationCount: int
    totalCartons: int


def write_excel_report(
    *,
    parsed_result: Any,
    pallet_result: Any,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    template_path: Path = DEFAULT_TEMPLATE_PATH,
    report_datetime: datetime | None = None,
    company: str = "Bestar",
) -> ExcelReportResult:
    warnings: list[ExcelReportIssue] = []
    errors: list[ExcelReportIssue] = []
    report_datetime = report_datetime or datetime.now()

    if not template_path.is_file():
        errors.append(
            ExcelReportIssue(
                code="MISSING_TEMPLATE",
                message=f"Excel report template does not exist: {template_path}",
            )
        )
        return _error_result(output_dir, warnings, errors)

    container_no = getattr(parsed_result, "containerNo", None)
    if not container_no:
        warnings.append(
            ExcelReportIssue(
                code="MISSING_CONTAINER_NO",
                message="Container number is missing; report filename uses UNKNOWN-CONTAINER.",
            )
        )
        container_no = "UNKNOWN-CONTAINER"

    plans = tuple(getattr(pallet_result, "plans", ()))
    if not plans:
        warnings.append(
            ExcelReportIssue(
                code="NO_DESTINATION_PLANS",
                message="No pallet plans were provided for report rows.",
            )
        )

    if len(plans) > len(DESTINATION_ROWS):
        warnings.append(
            ExcelReportIssue(
                code="DESTINATION_RANGE_EXCEEDED",
                message=(
                    f"Template supports {len(DESTINATION_ROWS)} destination rows; "
                    f"{len(plans) - len(DESTINATION_ROWS)} destination(s) were not written."
                ),
            )
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{_safe_filename(container_no)}卸柜报告-En.xlsx"
    manifest_path = output_dir / REPORT_MANIFEST_FILENAME

    workbook = load_workbook(template_path)
    try:
        worksheet = workbook[SHEET_NAME]
        _write_header(
            worksheet,
            report_datetime=report_datetime,
            container_no=container_no,
            company=company,
        )
        _write_destination_rows(worksheet, plans, warnings)
        total_cartons = sum(int(getattr(plan, "totalCartons", 0) or 0) for plan in plans)
        worksheet[TOTAL_CARTONS_CELL] = total_cartons
        workbook.save(output_path)
    finally:
        workbook.close()

    _append_manifest_record(
        manifest_path=manifest_path,
        output_path=output_path,
        template_path=template_path,
        container_no=container_no,
        report_datetime=report_datetime,
        company=company,
        warnings=warnings,
    )

    return ExcelReportResult(
        outputPath=output_path,
        manifestPath=manifest_path,
        warnings=tuple(warnings),
        errors=tuple(errors),
        writtenDestinationCount=min(len(plans), len(DESTINATION_ROWS)),
        totalDestinationCount=len(plans),
        totalCartons=total_cartons,
    )


def _write_header(
    worksheet: Any,
    *,
    report_datetime: datetime,
    container_no: str,
    company: str,
) -> None:
    worksheet[DATE_VALUE_CELL] = report_datetime.date().isoformat()
    worksheet[TIME_VALUE_CELL] = report_datetime.strftime("%H:%M")
    worksheet[CONTAINER_VALUE_CELL] = container_no
    worksheet[COMPANY_VALUE_CELL] = company


def _write_destination_rows(
    worksheet: Any,
    plans: tuple[Any, ...],
    warnings: list[ExcelReportIssue],
) -> None:
    for row_cells, plan in zip(DESTINATION_ROWS, plans):
        destination = getattr(plan, "destinationCode", None)
        if not destination:
            destination = "NEED_MANUAL_DESTINATION"
            warnings.append(
                ExcelReportIssue(
                    code="MISSING_DESTINATION",
                    message="Destination is missing; report row requires manual destination.",
                )
            )

        final_pallets = int(getattr(plan, "finalPallets", 0) or 0)
        total_cartons = int(getattr(plan, "totalCartons", 0) or 0)

        worksheet[row_cells.pallet_label_cell] = destination
        worksheet[row_cells.destination_cell] = destination
        worksheet[row_cells.pallet_count_cell] = final_pallets
        worksheet[row_cells.carton_count_cell] = total_cartons


def _append_manifest_record(
    *,
    manifest_path: Path,
    output_path: Path,
    template_path: Path,
    container_no: str,
    report_datetime: datetime,
    company: str,
    warnings: list[ExcelReportIssue],
) -> None:
    manifest = _load_manifest(manifest_path)
    record = {
        "generated_at": report_datetime.isoformat(),
        "container_no": container_no,
        "company": company,
        "output_path": str(output_path),
        "template_path": str(template_path),
        "warnings": [warning.message for warning in warnings],
    }
    manifest["records"] = [
        existing
        for existing in manifest["records"]
        if existing.get("output_path") != str(output_path)
    ]
    manifest["records"].append(record)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _load_manifest(manifest_path: Path) -> dict[str, Any]:
    if not manifest_path.exists():
        return {"schema_version": 1, "records": []}

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1:
        raise ValueError(f"Unsupported report manifest schema: {manifest_path}")
    if not isinstance(manifest.get("records"), list):
        raise ValueError(f"Report manifest records must be a list: {manifest_path}")
    return manifest


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-") or "UNKNOWN-CONTAINER"


def _error_result(
    output_dir: Path,
    warnings: list[ExcelReportIssue],
    errors: list[ExcelReportIssue],
) -> ExcelReportResult:
    return ExcelReportResult(
        outputPath=output_dir / "UNKNOWN-CONTAINER卸柜报告-En.xlsx",
        manifestPath=output_dir / REPORT_MANIFEST_FILENAME,
        warnings=tuple(warnings),
        errors=tuple(errors),
        writtenDestinationCount=0,
        totalDestinationCount=0,
        totalCartons=0,
    )
