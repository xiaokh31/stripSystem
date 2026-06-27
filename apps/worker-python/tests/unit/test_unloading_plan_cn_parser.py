from __future__ import annotations

import shutil
import warnings
from pathlib import Path

import pytest

from worker_python.imports import ImportRegistry
from worker_python.parser import FormatType, parse_unloading_plan_cn


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
CONTENT_CONTAINER_FIXTURE = FIXTURE_DIR / "CAAU8011090 UNLOADING PLAN.xlsx"
FILENAME_CONTAINER_FIXTURE = FIXTURE_DIR / "Unloading Plan SMCU1012780.xlsx"
CONDITIONAL_FORMATTING_FIXTURE = FIXTURE_DIR / "MATU2613753 UNLOADING PLAN.xlsx"
BESTAR_RECEIVING_FIXTURE = FIXTURE_DIR / "137675 JXJU3246131  PO#3404  BESTAR.xlsx"
NO_CONTENT_CONTAINER_FIXTURE = FIXTURE_DIR / "BEAU5601716 UNLOADING PLAN.xlsx"


def test_parse_delivery_plan_extracts_lines_and_destination_summaries(
    tmp_path: Path,
) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(CONTENT_CONTAINER_FIXTURE)

    result = parse_unloading_plan_cn(imported.stored_path)

    assert result.formatType == FormatType.UNLOADING_PLAN_CN
    assert result.containerNo == "CAAU8011090"
    assert result.rawMetadata["containerSource"] == "content"
    assert result.errors == ()
    assert len(result.lines) == 43

    first = result.lines[0]
    assert first.waybillNo == "SHCA2604056969"
    assert first.fbaNo == "FBA19CFWJ3YQ"
    assert first.poNumber is None
    assert first.cartons == 5
    assert first.weight == pytest.approx(87.37)
    assert first.volumeCbm == pytest.approx(0.59)
    assert first.destinationCode == "YEG1"
    assert first.deliveryMethod == "快递派送"
    assert "特殊指令/备注" in first.raw_json

    summaries = {summary.destinationCode: summary for summary in result.destinationSummaries}
    assert summaries["YEG2"].totalCartons == 130
    assert summaries["YEG2"].totalVolumeCbm == pytest.approx(13.236)
    assert summaries["YEG2"].lineCount == 14
    assert summaries["Private Address / QDCA2605058915"].totalCartons == 4
    assert summaries["Private Address / QDCA2605058915"].lineCount == 1
    assert summaries["Private Address / SZCA2604054725"].totalCartons == 81
    assert summaries["Private Address / SZCA2604054725"].lineCount == 1


def test_parse_standard_cn_uses_filename_container_and_keeps_raw_json(
    tmp_path: Path,
) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(FILENAME_CONTAINER_FIXTURE)

    result = parse_unloading_plan_cn(imported.stored_path)

    assert result.containerNo == "SMCU1012780"
    assert result.rawMetadata["containerSource"] == "filename"
    assert result.errors == ()
    assert len(result.lines) == 59

    first = result.lines[0]
    assert first.waybillNo == "JJT10039088"
    assert first.fbaNo == "FBA19BXGBMP9"
    assert first.poNumber == "2ZGRAQXF"
    assert first.cartons == 8
    assert first.destinationCode == "YYC4"
    assert first.deliveryMethod == "卡尔加里海卡"
    assert "材积重" in first.raw_json
    assert first.raw_json["体积(m³)"] == 0.629

    summaries = {summary.destinationCode: summary for summary in result.destinationSummaries}
    assert summaries["YYC4"].totalCartons == 693
    assert summaries["YYC4"].totalVolumeCbm == pytest.approx(56.819)
    assert summaries["YYC4"].lineCount == 35


def test_parse_standard_cn_warns_and_normalizes_zero_volume(tmp_path: Path) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(FILENAME_CONTAINER_FIXTURE)

    result = parse_unloading_plan_cn(imported.stored_path)

    zero_volume_warnings = [
        warning
        for warning in result.warnings
        if warning.code == "ZERO_VOLUME_WITH_CARTONS"
    ]
    zero_volume_rows = {warning.row_number for warning in zero_volume_warnings}
    normalized_rows = {
        line.rowNumber: line.volumeCbm for line in result.lines if line.rowNumber in zero_volume_rows
    }
    missing_destination_warnings = [
        warning for warning in result.warnings if warning.code == "MISSING_DESTINATION"
    ]
    skipped_summary_warnings = [
        warning for warning in result.warnings if warning.code == "NON_DETAIL_ROW_SKIPPED"
    ]

    assert len(zero_volume_warnings) == 6
    assert zero_volume_rows >= {13, 14}
    assert all("体积为0" in warning.message for warning in zero_volume_warnings)
    assert all(volume == pytest.approx(0.01) for volume in normalized_rows.values())
    assert missing_destination_warnings
    assert {warning.row_number for warning in missing_destination_warnings} >= {59, 60}
    assert skipped_summary_warnings


def test_parser_reports_missing_container_when_content_and_filename_have_none(
    tmp_path: Path,
) -> None:
    source_without_container_name = tmp_path / "unloading-plan.xlsx"
    shutil.copy2(NO_CONTENT_CONTAINER_FIXTURE, source_without_container_name)
    imported = ImportRegistry(tmp_path / "original_files").import_file(source_without_container_name)

    result = parse_unloading_plan_cn(imported.stored_path)

    assert result.formatType == FormatType.UNLOADING_PLAN_CN
    assert result.containerNo is None
    assert any(error.code == "MISSING_CONTAINER_NO" for error in result.errors)
    assert result.lines


def test_parser_ignores_openpyxl_conditional_formatting_warning_from_real_fixture() -> None:
    with warnings.catch_warnings():
        warnings.simplefilter("error")

        result = parse_unloading_plan_cn(CONDITIONAL_FORMATTING_FIXTURE)

    assert result.formatType == FormatType.UNLOADING_PLAN_CN
    assert result.containerNo == "MATU2613753"
    assert result.lines


def test_parser_does_not_implement_bestar_receiving(tmp_path: Path) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(BESTAR_RECEIVING_FIXTURE)

    result = parse_unloading_plan_cn(imported.stored_path)

    assert result.formatType == FormatType.BESTAR_RECEIVING
    assert result.lines == ()
    assert any(error.code == "UNSUPPORTED_FORMAT" for error in result.errors)
