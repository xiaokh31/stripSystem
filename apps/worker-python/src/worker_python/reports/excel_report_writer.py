from __future__ import annotations

import json
import re
from copy import copy
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
from worker_python.time_utils import operational_now


REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_TEMPLATE_PATH = REPO_ROOT / "samples" / "templates" / "卸柜报告-En.xlsx"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "storage" / "reports"
REPORT_MANIFEST_FILENAME = "report_manifest.json"
DEFAULT_REPORT_ROW_HEIGHT = 16.5
MIN_REPORT_ROW_WIDTH = 8.0


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
    report_datetime = report_datetime or operational_now()

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

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{_safe_filename(container_no)}卸柜报告-En.xlsx"
    manifest_path = output_dir / REPORT_MANIFEST_FILENAME

    # Preserve every untouched rich-text template cell when saving the report.
    workbook = load_workbook(template_path, rich_text=True)
    try:
        worksheets = _report_worksheets(workbook, len(plans))
        for page_index, worksheet in enumerate(worksheets):
            page_plans = plans[
                page_index * len(DESTINATION_ROWS) :
                (page_index + 1) * len(DESTINATION_ROWS)
            ]
            _write_header(
                worksheet,
                report_datetime=report_datetime,
                container_no=container_no,
                company=company,
            )
            _write_destination_rows(worksheet, page_plans, warnings)
            worksheet[TOTAL_CARTONS_CELL] = sum(
                int(getattr(plan, "totalCartons", 0) or 0)
                for plan in page_plans
            )
        total_cartons = sum(
            int(getattr(plan, "totalCartons", 0) or 0) for plan in plans
        )
        worksheets[0][TOTAL_CARTONS_CELL] = total_cartons
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
        writtenDestinationCount=len(plans),
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


def _report_worksheets(workbook: Any, plan_count: int) -> list[Any]:
    page_count = max(1, (plan_count + len(DESTINATION_ROWS) - 1) // len(DESTINATION_ROWS))
    first_sheet = workbook[SHEET_NAME]
    if page_count == 1:
        return [first_sheet]

    for worksheet in list(workbook.worksheets):
        if worksheet is not first_sheet:
            workbook.remove(worksheet)

    worksheets = [first_sheet]
    for page_number in range(2, page_count + 1):
        copied = workbook.copy_worksheet(first_sheet)
        copied.title = f"Sheet{page_number}"
        worksheets.append(copied)
    return worksheets


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
        _apply_destination_row_layout(worksheet, row_cells, destination)


def _apply_destination_row_layout(
    worksheet: Any,
    row_cells: Any,
    destination: str,
) -> None:
    wrapped_cells = (
        worksheet[row_cells.pallet_label_cell],
        worksheet[row_cells.destination_cell],
    )
    for cell in wrapped_cells:
        alignment = copy(cell.alignment)
        alignment.wrap_text = True
        alignment.vertical = "center"
        cell.alignment = alignment

    line_count = max(
        _estimated_excel_line_count(
            destination,
            _column_width(worksheet, cell.column_letter),
        )
        for cell in wrapped_cells
    )
    current_height = worksheet.row_dimensions[row_cells.row].height
    base_height = current_height or DEFAULT_REPORT_ROW_HEIGHT
    worksheet.row_dimensions[row_cells.row].height = max(
        base_height,
        DEFAULT_REPORT_ROW_HEIGHT * line_count,
    )


def _estimated_excel_line_count(value: str, column_width: float) -> int:
    max_width = max(column_width - 1, MIN_REPORT_ROW_WIDTH)
    line_count = 1
    current_width = 0.0

    for token in value.split(" "):
        token_width = _estimated_excel_text_width(token)
        separator_width = 0.35 if current_width else 0.0
        if current_width and current_width + separator_width + token_width > max_width:
            line_count += 1
            current_width = token_width
        else:
            current_width += separator_width + token_width

        while current_width > max_width:
            line_count += 1
            current_width -= max_width

    return max(1, line_count)


def _estimated_excel_text_width(value: str) -> float:
    width = 0.0
    for character in value:
        if character.isspace():
            width += 0.35
        elif character.isascii():
            width += 1.0
        else:
            width += 1.8
    return width


def _column_width(worksheet: Any, column_letter: str) -> float:
    return float(worksheet.column_dimensions[column_letter].width or MIN_REPORT_ROW_WIDTH)


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
