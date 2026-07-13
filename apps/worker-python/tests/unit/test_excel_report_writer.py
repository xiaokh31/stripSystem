from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

from openpyxl import load_workbook
from openpyxl.cell.rich_text import CellRichText

from worker_python.imports import ImportRegistry
from worker_python.pallets import calculate_pallets, inputs_from_destination_summaries
from worker_python.parser import parse_bestar_receiving, parse_unloading_plan_cn
from worker_python.reports.excel_report_writer import DEFAULT_TEMPLATE_PATH, write_excel_report


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
STANDARD_FIXTURE = FIXTURE_DIR / "CAAU8011090 UNLOADING PLAN.xlsx"
OVERFLOW_FIXTURE = FIXTURE_DIR / "ZCSU9025988B unloading plan.xlsx"
BESTAR_FIXTURE = FIXTURE_DIR / "137675 JXJU3246131  PO#3404  BESTAR.xlsx"


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
    assert result.writtenDestinationCount == 8

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
    workbook.close()


def test_excel_report_writer_does_not_modify_template_file(tmp_path: Path) -> None:
    before = _sha256(DEFAULT_TEMPLATE_PATH)
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
        assert str(generated_value) == str(template_value)
        assert str(generated_value).endswith("when stored.")
        assert len(generated_value) == len(template_value)
        assert "C21:I25" in {str(item) for item in generated_sheet.merged_cells.ranges}
        assert generated_sheet.page_setup.paperSize == template_sheet.page_setup.paperSize
        assert generated_sheet.page_setup.orientation == template_sheet.page_setup.orientation
        assert generated_sheet.page_setup.scale == template_sheet.page_setup.scale
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


def test_excel_report_writer_warns_when_destinations_exceed_template_range(
    tmp_path: Path,
) -> None:
    parsed, pallet_result = _parsed_and_pallets(OVERFLOW_FIXTURE, tmp_path)

    result = write_excel_report(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "reports",
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )

    assert result.totalDestinationCount > result.writtenDestinationCount
    assert result.writtenDestinationCount == 8
    assert any(warning.code == "DESTINATION_RANGE_EXCEEDED" for warning in result.warnings)
    assert result.outputPath.is_file()


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


def _parsed_and_pallets(fixture_path: Path, tmp_path: Path):
    registry = ImportRegistry(tmp_path / "original_files")
    imported = registry.import_file(fixture_path)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    pallet_result = calculate_pallets(
        inputs_from_destination_summaries(parsed.destinationSummaries),
        container_no=parsed.containerNo,
    )
    return parsed, pallet_result


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
