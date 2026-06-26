from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook

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
    assert worksheet["N8"].value == "YEG2"
    assert worksheet["O8"].value == 6
    assert worksheet["P8"].value == 130
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
