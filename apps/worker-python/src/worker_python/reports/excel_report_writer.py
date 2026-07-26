from __future__ import annotations

import json
import math
import re
from copy import copy
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins

from worker_python.reports.cell_map import (
    COMPANY_VALUE_CELL,
    CONTAINER_VALUE_CELL,
    DATE_VALUE_CELL,
    DESTINATION_ROWS,
    SHEET_NAME,
    TIME_VALUE_CELL,
    TOTAL_CARTONS_CELL,
)
from worker_python.reports.row_layout import (
    MAX_ROW_HEIGHT_POINTS,
    CellLayoutInput,
    TextRun,
    calculate_cell_layout,
    calculate_row_layout,
    excel_column_width_to_points,
)
from worker_python.time_utils import operational_now


REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_TEMPLATE_PATH = REPO_ROOT / "samples" / "templates" / "卸柜报告-En.xlsx"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "storage" / "reports"
REPORT_MANIFEST_FILENAME = "report_manifest.json"
DEFAULT_REPORT_ROW_HEIGHT = 16.5
CELL_HORIZONTAL_PADDING_POINTS = 8.0
REPORT_PRINT_AREA = "B1:P25"
A4_LANDSCAPE_HEIGHT_POINTS = 595.2756
MINIMUM_PRINT_SCALE_PERCENT = 78
# Keep one half-line of unscaled vertical slack for Excel/LibreOffice rounding
# while preserving the template's established 78% readable print scale.
PRINTABLE_HEIGHT_GUARD_POINTS = 8.0
STANDARDS_CELL = "C21"
# Office renderers reserve additional non-cell page bands that are not fully
# represented by pageMargins. The calibrated ceiling keeps the 78% template
# scale readable and leaves the merged Standards band inside the physical page.
MAX_REPORT_SHEET_HEIGHT_POINTS = 570.0


@dataclass(frozen=True)
class ExcelReportIssue:
    code: str
    message: str
    destinationCode: str | None = None
    sheet: str | None = None
    row: int | None = None
    requiredHeightPoints: float | None = None
    availableHeightPoints: float | None = None


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
        first_sheet = workbook[SHEET_NAME]
        _prepare_report_sheet(
            first_sheet,
            report_datetime=report_datetime,
            container_no=container_no,
            company=company,
        )
        page_plans, layout_error = _plan_report_pages(first_sheet, plans)
        if layout_error is not None:
            errors.append(layout_error)
            return _error_result(output_dir, warnings, errors)

        worksheets = _report_worksheets(workbook, len(page_plans))
        for worksheet, plans_for_sheet in zip(worksheets, page_plans):
            _configure_page_contract(worksheet)
            _write_destination_rows(worksheet, plans_for_sheet, warnings)
            worksheet[TOTAL_CARTONS_CELL] = sum(
                int(getattr(plan, "totalCartons", 0) or 0) for plan in plans_for_sheet
            )
            _apply_written_row_layout(
                worksheet,
                row=worksheet[TOTAL_CARTONS_CELL].row,
                coordinates=(TOTAL_CARTONS_CELL,),
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


def _prepare_report_sheet(
    worksheet: Any,
    *,
    report_datetime: datetime,
    container_no: str,
    company: str,
) -> None:
    _configure_page_contract(worksheet)
    _write_header(
        worksheet,
        report_datetime=report_datetime,
        container_no=container_no,
        company=company,
    )
    _apply_written_row_layout(
        worksheet,
        row=1,
        coordinates=(DATE_VALUE_CELL, TIME_VALUE_CELL, CONTAINER_VALUE_CELL),
    )
    _apply_written_row_layout(
        worksheet,
        row=2,
        coordinates=(COMPANY_VALUE_CELL,),
    )
    _ensure_merged_cell_height(worksheet, STANDARDS_CELL)


def _report_worksheets(workbook: Any, page_count: int) -> list[Any]:
    page_count = max(1, page_count)
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


def _plan_report_pages(
    worksheet: Any,
    plans: tuple[Any, ...],
) -> tuple[tuple[tuple[Any, ...], ...], ExcelReportIssue | None]:
    if not plans:
        return ((),), None

    pages: list[tuple[Any, ...]] = []
    current_page: list[Any] = []
    plan_index = 0
    while plan_index < len(plans):
        plan = plans[plan_index]
        if len(current_page) >= len(DESTINATION_ROWS):
            pages.append(tuple(current_page))
            current_page = []
            continue

        candidate = (*current_page, plan)
        required_height = _required_sheet_height(worksheet, candidate)
        available_height = _printable_raw_height_points(worksheet)
        if required_height <= available_height:
            current_page.append(plan)
            plan_index += 1
            continue

        if current_page:
            pages.append(tuple(current_page))
            current_page = []
            continue

        destination = str(getattr(plan, "destinationCode", "") or "")
        row = DESTINATION_ROWS[0].row
        return (), ExcelReportIssue(
            code="REPORT_CONTENT_TOO_TALL",
            message="REPORT_CONTENT_TOO_TALL",
            destinationCode=destination or None,
            sheet=worksheet.title,
            row=row,
            requiredHeightPoints=required_height,
            availableHeightPoints=available_height,
        )

    if current_page:
        pages.append(tuple(current_page))
    return tuple(pages), None


def _required_sheet_height(worksheet: Any, plans: tuple[Any, ...]) -> float:
    heights = {
        row: _row_height(worksheet, row) for row in range(1, worksheet.max_row + 1)
    }
    for row_cells, plan in zip(DESTINATION_ROWS, plans):
        destination = str(
            getattr(plan, "destinationCode", None) or "NEED_MANUAL_DESTINATION"
        )
        row_height = _destination_row_height(
            worksheet,
            row_cells,
            destination=destination,
            final_pallets=int(getattr(plan, "finalPallets", 0) or 0),
            total_cartons=int(getattr(plan, "totalCartons", 0) or 0),
        )
        heights[row_cells.row] = max(heights[row_cells.row], row_height)
    return math.ceil(sum(heights.values()) * 4.0) / 4.0


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
        _apply_destination_row_layout(
            worksheet,
            row_cells,
            destination,
            final_pallets=final_pallets,
            total_cartons=total_cartons,
        )


def _apply_destination_row_layout(
    worksheet: Any,
    row_cells: Any,
    destination: str,
    *,
    final_pallets: int,
    total_cartons: int,
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

    worksheet.row_dimensions[row_cells.row].height = _destination_row_height(
        worksheet,
        row_cells,
        destination=destination,
        final_pallets=final_pallets,
        total_cartons=total_cartons,
    )


def _destination_row_height(
    worksheet: Any,
    row_cells: Any,
    *,
    destination: str,
    final_pallets: int,
    total_cartons: int,
) -> float:
    coordinates_and_values = (
        (row_cells.pallet_label_cell, destination),
        (row_cells.destination_cell, destination),
        (row_cells.pallet_count_cell, str(final_pallets)),
        (row_cells.carton_count_cell, str(total_cartons)),
    )
    cells = tuple(
        _cell_layout_input(
            worksheet,
            coordinate,
            visible_value=value,
            force_wrap=coordinate
            in {row_cells.pallet_label_cell, row_cells.destination_cell},
        )
        for coordinate, value in coordinates_and_values
    )
    result = calculate_row_layout(
        cells,
        template_height_points=_row_height(worksheet, row_cells.row),
        maximum_height_points=MAX_ROW_HEIGHT_POINTS,
    )
    return max(
        result.required_height_points,
        *(cell.required_height_points for cell in result.cell_results),
    )


def _apply_written_row_layout(
    worksheet: Any,
    *,
    row: int,
    coordinates: tuple[str, ...],
) -> None:
    cells = tuple(
        _cell_layout_input(worksheet, coordinate) for coordinate in coordinates
    )
    worksheet.row_dimensions[row].height = calculate_row_layout(
        cells,
        template_height_points=_row_height(worksheet, row),
        maximum_height_points=MAX_ROW_HEIGHT_POINTS,
    ).required_height_points


def _ensure_merged_cell_height(worksheet: Any, coordinate: str) -> None:
    cell = worksheet[coordinate]
    alignment = copy(cell.alignment)
    alignment.vertical = "top"
    cell.alignment = alignment

    merged_range = _merged_range_for_coordinate(worksheet, coordinate)
    if merged_range is None:
        _apply_written_row_layout(
            worksheet,
            row=cell.row,
            coordinates=(coordinate,),
        )
        return

    rows = tuple(range(merged_range.min_row, merged_range.max_row + 1))
    existing_height = sum(_row_height(worksheet, row) for row in rows)
    required_height = calculate_cell_layout(
        _cell_layout_input(worksheet, coordinate)
    ).required_height_points
    if required_height <= existing_height:
        return

    # Excel and LibreOffice both calculate the printable text box for a
    # vertically merged cell from the participating rows. Concentrating the
    # complete growth in the final row can leave the text box at its old
    # height in Print Preview even though the worksheet reports a larger
    # aggregate height. Grow every row in the merge so both renderers observe
    # the same physical note region.
    growth_per_row = (required_height - existing_height) / len(rows)
    for row in rows:
        worksheet.row_dimensions[row].height = (
            math.ceil((_row_height(worksheet, row) + growth_per_row) * 4.0) / 4.0
        )


def _cell_layout_input(
    worksheet: Any,
    coordinate: str,
    *,
    visible_value: str | None = None,
    force_wrap: bool = False,
) -> CellLayoutInput:
    cell = worksheet[coordinate]
    if force_wrap:
        alignment = copy(cell.alignment)
        alignment.wrap_text = True
        alignment.vertical = "center"
        cell.alignment = alignment
    value = cell.value if visible_value is None else visible_value
    font_size = float(cell.font.sz or 11.0)
    return CellLayoutInput(
        visible_value="" if value is None else str(value),
        printable_width_points=_cell_printable_width_points(worksheet, coordinate),
        font_name=cell.font.name,
        font_size=font_size,
        bold=bool(cell.font.bold),
        wrap_text=bool(cell.alignment.wrap_text or force_wrap),
        indent=float(cell.alignment.indent or 0.0),
        rotation=int(cell.alignment.textRotation or 0),
        runs=_rich_text_runs(cell.value, cell),
    )


def _rich_text_runs(value: Any, cell: Any) -> tuple[TextRun, ...]:
    if not isinstance(value, CellRichText):
        return ()
    runs: list[TextRun] = []
    for item in value:
        if isinstance(item, TextBlock):
            font = item.font
            runs.append(
                TextRun(
                    text=item.text,
                    font_name=font.rFont or cell.font.name,
                    font_size=float(font.sz or cell.font.sz or 11.0),
                    bold=bool(font.b),
                )
            )
        else:
            runs.append(
                TextRun(
                    text=str(item),
                    font_name=cell.font.name,
                    font_size=float(cell.font.sz or 11.0),
                    bold=bool(cell.font.bold),
                )
            )
    return tuple(runs)


def _cell_printable_width_points(worksheet: Any, coordinate: str) -> float:
    cell = worksheet[coordinate]
    merged_range = _merged_range_for_coordinate(worksheet, coordinate)
    if merged_range is None:
        columns = (cell.column,)
    else:
        columns = range(merged_range.min_col, merged_range.max_col + 1)
    width = sum(
        excel_column_width_to_points(
            float(
                worksheet.column_dimensions[get_column_letter(column)].width
                or worksheet.sheet_format.defaultColWidth
                or 8.43
            )
        )
        for column in columns
    )
    return max(width - CELL_HORIZONTAL_PADDING_POINTS, 1.0)


def _merged_range_for_coordinate(worksheet: Any, coordinate: str) -> Any | None:
    for merged_range in worksheet.merged_cells.ranges:
        if coordinate in merged_range:
            return merged_range
    return None


def _row_height(worksheet: Any, row: int) -> float:
    return float(
        worksheet.row_dimensions[row].height
        or worksheet.sheet_format.defaultRowHeight
        or DEFAULT_REPORT_ROW_HEIGHT
    )


def _configure_page_contract(worksheet: Any) -> None:
    worksheet.page_setup.paperSize = worksheet.PAPERSIZE_A4
    worksheet.page_setup.orientation = worksheet.ORIENTATION_LANDSCAPE
    worksheet.page_setup.scale = MINIMUM_PRINT_SCALE_PERCENT
    worksheet.page_setup.fitToWidth = 1
    worksheet.page_setup.fitToHeight = 1
    worksheet.sheet_properties.pageSetUpPr.fitToPage = True
    worksheet.sheet_properties.pageSetUpPr.autoPageBreaks = False
    worksheet.print_area = REPORT_PRINT_AREA
    worksheet.row_breaks = worksheet.row_breaks.__class__()
    worksheet.col_breaks = worksheet.col_breaks.__class__()


def _printable_raw_height_points(worksheet: Any) -> float:
    margins: PageMargins = worksheet.page_margins
    printable_points = (
        A4_LANDSCAPE_HEIGHT_POINTS
        - (float(margins.top or 0.0) + float(margins.bottom or 0.0)) * 72.0
    )
    scale = max(
        float(worksheet.page_setup.scale or MINIMUM_PRINT_SCALE_PERCENT),
        MINIMUM_PRINT_SCALE_PERCENT,
    )
    calculated_height = (
        math.floor(
            (printable_points * 100.0 / scale - PRINTABLE_HEIGHT_GUARD_POINTS) * 4.0
        )
        / 4.0
    )
    return min(calculated_height, MAX_REPORT_SHEET_HEIGHT_POINTS)


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
