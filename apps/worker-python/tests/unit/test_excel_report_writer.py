from __future__ import annotations

import hashlib
import json
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile

from openpyxl import load_workbook
from openpyxl.cell.rich_text import CellRichText

from worker_python.imports import ImportRegistry
from worker_python.pallets import calculate_pallets, inputs_from_destination_summaries
from worker_python.parser import parse_bestar_receiving, parse_unloading_plan_cn
from worker_python.reports.cell_map import DESTINATION_ROWS
from worker_python.reports.excel_report_writer import (
    DEFAULT_TEMPLATE_PATH,
    write_excel_report,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
STANDARD_FIXTURE = FIXTURE_DIR / "CAAU8011090 UNLOADING PLAN.xlsx"
OVERFLOW_FIXTURE = FIXTURE_DIR / "ZCSU9025988B unloading plan.xlsx"
BESTAR_FIXTURE = FIXTURE_DIR / "137675 JXJU3246131  PO#3404  BESTAR.xlsx"
EXPECTED_TEMPLATE_SHA256 = (
    "31a613e86a76447bfcbb308f1a23f6072dd1a5381f1992fbc0757a2735c92027"
)
SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
XML_NS = {"m": SPREADSHEET_NS}


def test_excel_report_writer_generates_openable_report_from_real_parsed_result(
    tmp_path: Path,
) -> None:
    parsed, pallet_result = _parsed_and_pallets(STANDARD_FIXTURE, tmp_path)

    result = write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    assert result.errors == ()
    assert result.outputPath.is_file()
    assert parsed.containerNo in result.outputPath.name
    assert result.totalCartons == 896
    assert result.writtenDestinationCount == 9

    workbook = load_workbook(result.outputPath, data_only=False)
    worksheet = workbook["Sheet1"]
    assert worksheet["D1"].value == "2026-06-25"
    assert worksheet["H1"].value == "09:30"
    assert worksheet["K1"].value == "CAAU8011090"
    assert worksheet["D2"].value == "Bestar"
    assert worksheet["N4"].value == "Private Address / QDCA2605058915"
    assert worksheet["N6"].value == "Private Address / SZCA2604054725"
    assert worksheet["N10"].value == "YEG2"
    assert worksheet["O10"].value == 7
    assert worksheet["P10"].value == 130
    assert worksheet["P20"].value == 896
    assert _populated_sheet_names(workbook) == ["Sheet1"]
    assert worksheet["N5"].value == "贵司卡尔加里仓"
    assert worksheet["O5"].value == 1
    assert worksheet["P5"].value == 22
    assert (
        sum(
            int(sheet[row_cells.pallet_count_cell].value or 0)
            for sheet in workbook.worksheets
            for row_cells in DESTINATION_ROWS
        )
        == pallet_result.totalFinalPallets
    )
    workbook.close()


def test_excel_report_writer_does_not_modify_template_file(tmp_path: Path) -> None:
    before = _sha256(DEFAULT_TEMPLATE_PATH)
    assert before == EXPECTED_TEMPLATE_SHA256
    parsed, pallet_result = _parsed_and_pallets(STANDARD_FIXTURE, tmp_path)

    write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    assert _sha256(DEFAULT_TEMPLATE_PATH) == before


def test_excel_report_writer_preserves_palletizing_standards_rich_text(
    tmp_path: Path,
) -> None:
    parsed, pallet_result = _parsed_and_pallets(STANDARD_FIXTURE, tmp_path)
    result = write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    template = load_workbook(DEFAULT_TEMPLATE_PATH, rich_text=True)
    generated = load_workbook(result.outputPath, rich_text=True)
    try:
        template_sheet = template["Sheet1"]
        generated_sheet = generated["Sheet1"]
        template_value = template_sheet["C21"].value
        generated_value = generated_sheet["C21"].value
        assert isinstance(template_value, CellRichText)
        assert isinstance(generated_value, CellRichText)
        template_runs = _standards_runs(DEFAULT_TEMPLATE_PATH)
        generated_runs = _standards_runs(result.outputPath)
        assert generated_runs == template_runs
        assert len(generated_runs) > 1
        assert "".join(run.text for run in generated_runs) == str(template_value)
        assert "".join(run.text for run in generated_runs).endswith("when stored.")
        assert "\n" in "".join(run.text for run in generated_runs)
        assert {run.font_size for run in generated_runs} == {"10", "11"}
        assert {run.font_name for run in generated_runs} == {"Arial", "宋体"}
        assert all(run.bold for run in generated_runs)

        generated_cell_xml = _standards_cell_xml(result.outputPath)
        assert generated_cell_xml.find(".//m:r", XML_NS) is not None
        assert generated_cell_xml.find(".//m:rPr", XML_NS) is not None

        assert template_sheet.calculate_dimension() == "B1:P25"
        assert (
            generated_sheet.calculate_dimension()
            == template_sheet.calculate_dimension()
        )
        assert {str(item) for item in generated_sheet.merged_cells.ranges} == {
            str(item) for item in template_sheet.merged_cells.ranges
        }
        assert "C21:I25" in {str(item) for item in generated_sheet.merged_cells.ranges}
        assert {
            row: generated_sheet.row_dimensions[row].height for row in range(21, 26)
        } == {row: template_sheet.row_dimensions[row].height for row in range(21, 26)}
        assert {
            column: generated_sheet.column_dimensions[column].width
            for column in "CDEFGHI"
        } == {
            column: template_sheet.column_dimensions[column].width
            for column in "CDEFGHI"
        }
        assert _page_layout(generated_sheet) == _page_layout(template_sheet)

        # Business cells are still written while the untouched rich-text cell survives.
        assert generated_sheet["D1"].value == "2026-06-25"
        assert generated_sheet["H1"].value == "09:30"
        assert generated_sheet["K1"].value == "CAAU8011090"
        assert generated_sheet["N4"].value == "Private Address / QDCA2605058915"
        assert generated_sheet["P20"].value == 896
    finally:
        template.close()
        generated.close()


def test_excel_report_writer_records_generated_report(tmp_path: Path) -> None:
    parsed, pallet_result = _parsed_and_pallets(STANDARD_FIXTURE, tmp_path)

    result = write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    assert result.manifestPath.is_file()
    manifest_text = result.manifestPath.read_text(encoding="utf-8")
    assert "CAAU8011090" in manifest_text
    assert str(result.outputPath) in manifest_text


def test_excel_report_writer_overwrites_same_container_report(
    tmp_path: Path,
) -> None:
    parsed, pallet_result = _parsed_and_pallets(STANDARD_FIXTURE, tmp_path)

    first = write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )
    second = write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 31),
    )

    assert first.outputPath == second.outputPath
    assert first.outputPath.is_file()
    manifest = json.loads(second.manifestPath.read_text(encoding="utf-8"))
    assert len(manifest["records"]) == 1
    assert manifest["records"][0]["generated_at"] == "2026-06-25T09:31:00"


def test_excel_report_writer_uses_existing_white_rows_before_overflow_sheets(
    tmp_path: Path,
) -> None:
    parsed, pallet_result = _parsed_and_pallets(OVERFLOW_FIXTURE, tmp_path)

    result = write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    assert result.totalDestinationCount == result.writtenDestinationCount
    assert result.writtenDestinationCount > 8
    assert not any(
        warning.code == "DESTINATION_RANGE_EXCEEDED" for warning in result.warnings
    )
    assert result.outputPath.is_file()
    workbook = load_workbook(result.outputPath, data_only=False, rich_text=True)
    try:
        assert _populated_sheet_names(workbook) == ["Sheet1"]
        assert workbook["Sheet1"]["N5"].value == "YVR4"
        assert workbook["Sheet1"]["N13"].value == "YYZ7"
        written_pallets = sum(
            int(sheet[row_cells.pallet_count_cell].value or 0)
            for sheet in workbook.worksheets
            for row_cells in DESTINATION_ROWS
        )
        assert written_pallets == pallet_result.totalFinalPallets
    finally:
        workbook.close()


def test_excel_report_writer_adds_a_sheet_only_after_all_white_rows_are_used(
    tmp_path: Path,
) -> None:
    plans = tuple(
        SimpleNamespace(
            destinationCode=f"EDGE-{index:02d}",
            finalPallets=index,
            totalCartons=index * 10,
        )
        for index in range(1, len(DESTINATION_ROWS) + 2)
    )

    result = write_excel_report(
        parsed_result=SimpleNamespace(containerNo="OVERFLOW17"),
        pallet_result=SimpleNamespace(plans=plans),
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    workbook = load_workbook(result.outputPath, data_only=False, rich_text=True)
    try:
        assert _populated_sheet_names(workbook) == ["Sheet1", "Sheet2"]
        assert workbook["Sheet1"]["N19"].value == "EDGE-16"
        assert workbook["Sheet2"]["N4"].value == "EDGE-17"
        assert isinstance(workbook["Sheet2"]["C21"].value, CellRichText)
        assert "C21:I25" in {
            str(item) for item in workbook["Sheet2"].merged_cells.ranges
        }
    finally:
        workbook.close()


def test_excel_report_writer_marks_missing_bestar_destination_for_manual_entry(
    tmp_path: Path,
) -> None:
    registry = ImportRegistry(tmp_path / "original_files")
    imported = registry.import_file(BESTAR_FIXTURE)
    parsed = parse_bestar_receiving(imported.stored_path)
    pallet_result = calculate_pallets(
        inputs_from_destination_summaries(parsed.destinationSummaries),
        container_no=parsed.containerNo,
    )

    result = write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    workbook = load_workbook(result.outputPath, data_only=False)
    worksheet = workbook["Sheet1"]
    assert worksheet["N4"].value == "NEED_MANUAL_DESTINATION"
    assert any(warning.code == "MISSING_DESTINATION" for warning in result.warnings)
    workbook.close()


def test_excel_report_writer_auto_expands_destination_row_height(
    tmp_path: Path,
) -> None:
    long_destination = "Private Address / SZCA2604054725 / Surrey"
    parsed = SimpleNamespace(containerNo="AUTOROW123")
    pallet_result = SimpleNamespace(
        plans=(
            SimpleNamespace(
                destinationCode=long_destination,
                finalPallets=1,
                totalCartons=12,
            ),
        )
    )

    result = write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    template = load_workbook(DEFAULT_TEMPLATE_PATH, data_only=False)
    template_height = template["Sheet1"].row_dimensions[4].height
    template.close()

    workbook = load_workbook(result.outputPath, data_only=False)
    worksheet = workbook["Sheet1"]
    assert worksheet["N4"].value == long_destination
    assert worksheet["C4"].value == long_destination
    assert worksheet["N4"].alignment.wrap_text is True
    assert worksheet["C4"].alignment.wrap_text is True
    assert worksheet.row_dimensions[4].height > (template_height or 0)
    workbook.close()


def test_excel_report_writer_wraps_long_destination_in_white_overflow_row(
    tmp_path: Path,
) -> None:
    long_destination = "Private Address / SZCA2604054725 / Surrey Receiving Door"
    plans = tuple(
        SimpleNamespace(
            destinationCode=(long_destination if index == 9 else f"DEST-{index}"),
            finalPallets=1,
            totalCartons=12,
        )
        for index in range(1, 10)
    )

    result = write_excel_report(
        parsed_result=SimpleNamespace(containerNo="WHITEOVERFLOW9"),
        pallet_result=SimpleNamespace(plans=plans),
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    workbook = load_workbook(result.outputPath, data_only=False)
    try:
        worksheet = workbook["Sheet1"]
        assert _populated_sheet_names(workbook) == ["Sheet1"]
        assert worksheet["N5"].value == long_destination
        assert worksheet["C5"].value == long_destination
        assert worksheet["N5"].alignment.wrap_text is True
        assert worksheet["C5"].alignment.wrap_text is True
        assert worksheet.row_dimensions[5].height > 16
        assert worksheet["C21"].value is not None
    finally:
        workbook.close()


def test_excel_report_writer_preserves_line_break_and_expands_white_row(
    tmp_path: Path,
) -> None:
    destination = "YYC4\nDoor A"
    plans = tuple(
        SimpleNamespace(
            destinationCode=(destination if index == 9 else f"DEST-{index}"),
            finalPallets=1,
            totalCartons=12,
        )
        for index in range(1, 10)
    )

    result = write_excel_report(
        parsed_result=SimpleNamespace(containerNo="LINEBREAK9"),
        pallet_result=SimpleNamespace(plans=plans),
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    workbook = load_workbook(result.outputPath, data_only=False)
    try:
        worksheet = workbook["Sheet1"]
        assert worksheet["N5"].value == destination
        assert worksheet["C5"].value == destination
        assert worksheet.row_dimensions[5].height >= 33
    finally:
        workbook.close()


def _parsed_and_pallets(fixture_path: Path, tmp_path: Path):
    registry = ImportRegistry(tmp_path / "original_files")
    imported = registry.import_file(fixture_path)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    pallet_result = calculate_pallets(
        inputs_from_destination_summaries(parsed.destinationSummaries),
        container_no=parsed.containerNo,
    )
    return parsed, pallet_result


def _populated_sheet_names(workbook) -> list[str]:
    return [
        worksheet.title
        for worksheet in workbook.worksheets
        if worksheet.calculate_dimension() not in {"A1", "A1:A1"}
    ]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class _NormalizedRun(SimpleNamespace):
    text: str
    font_name: str | None
    font_size: str | None
    bold: bool
    properties: tuple[tuple[str, tuple[tuple[str, str], ...], str], ...]

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _NormalizedRun) and vars(self) == vars(other)


def _standards_runs(path: Path) -> tuple[_NormalizedRun, ...]:
    with ZipFile(path) as archive:
        cell = _standards_cell_xml_from_archive(archive)
        string_node = cell.find("m:is", XML_NS)
        if cell.attrib.get("t") == "s":
            value = cell.find("m:v", XML_NS)
            assert value is not None and value.text is not None
            shared_strings = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            string_node = shared_strings.findall("m:si", XML_NS)[int(value.text)]
        assert string_node is not None

        runs = string_node.findall("m:r", XML_NS)
        assert runs, "Standards cell must contain rich-text runs"
        normalized: list[_NormalizedRun] = []
        for run in runs:
            properties = run.find("m:rPr", XML_NS)
            assert properties is not None
            font_name = properties.find("m:rFont", XML_NS)
            font_size = properties.find("m:sz", XML_NS)
            bold = properties.find("m:b", XML_NS)
            normalized.append(
                _NormalizedRun(
                    text="".join(
                        node.text or "" for node in run.findall("m:t", XML_NS)
                    ),
                    font_name=font_name.attrib.get("val")
                    if font_name is not None
                    else None,
                    font_size=font_size.attrib.get("val")
                    if font_size is not None
                    else None,
                    bold=bold is not None
                    and bold.attrib.get("val", "1") not in {"0", "false"},
                    properties=tuple(
                        sorted(_normalized_run_property(child) for child in properties)
                    ),
                )
            )
        return tuple(normalized)


def _standards_cell_xml(path: Path) -> ET.Element:
    with ZipFile(path) as archive:
        return ET.fromstring(ET.tostring(_standards_cell_xml_from_archive(archive)))


def _standards_cell_xml_from_archive(archive: ZipFile) -> ET.Element:
    worksheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    cell = worksheet.find(".//m:c[@r='C21']", XML_NS)
    assert cell is not None
    return cell


def _normalized_run_property(
    child: ET.Element,
) -> tuple[str, tuple[tuple[str, str], ...], str]:
    name = child.tag.rsplit("}", 1)[-1]
    attributes = dict(child.attrib)
    if name == "b" and "val" not in attributes:
        attributes["val"] = "1"
    return name, tuple(sorted(attributes.items())), child.text or ""


def _page_layout(worksheet) -> dict[str, object]:
    setup = worksheet.page_setup
    margins = worksheet.page_margins
    setup_properties = worksheet.sheet_properties.pageSetUpPr
    return {
        "paperSize": setup.paperSize,
        "orientation": setup.orientation,
        "scale": setup.scale,
        "fitToWidth": setup.fitToWidth,
        "fitToHeight": setup.fitToHeight,
        "fitToPage": setup_properties.fitToPage if setup_properties else None,
        "autoPageBreaks": setup_properties.autoPageBreaks if setup_properties else None,
        "margins": (
            margins.left,
            margins.right,
            margins.top,
            margins.bottom,
            margins.header,
            margins.footer,
        ),
        "printArea": str(worksheet.print_area),
    }
