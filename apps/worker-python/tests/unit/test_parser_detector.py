from __future__ import annotations

from pathlib import Path

from worker_python.imports import ImportRegistry
from worker_python.parser import FormatType, detect_excel_format


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
STANDARD_CN_FIXTURE = FIXTURE_DIR / "Unloading Plan SMCU1012780.xlsx"
DELIVERY_PLAN_CN_FIXTURE = FIXTURE_DIR / "BEAU5601716 UNLOADING PLAN.xlsx"
BESTAR_RECEIVING_FIXTURE = FIXTURE_DIR / "137675 JXJU3246131  PO#3404  BESTAR.xlsx"
UNKNOWN_FIXTURE = FIXTURE_DIR / "CA-卡尔加里分仓单-CAIU9927541(1).xlsx"


def test_detector_identifies_standard_chinese_unloading_plan_from_registry(
    tmp_path: Path,
) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(STANDARD_CN_FIXTURE)

    result = detect_excel_format(imported.stored_path)

    assert result.format_type == FormatType.UNLOADING_PLAN_CN
    assert result.confidence > 0.75
    assert result.warnings == ()
    assert result.errors == ()
    assert "运单号" in result.matched_headers
    assert "件数" in result.matched_headers
    assert "体积" in result.matched_headers


def test_detector_identifies_delivery_plan_chinese_unloading_plan_from_registry(
    tmp_path: Path,
) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(DELIVERY_PLAN_CN_FIXTURE)

    result = detect_excel_format(imported.stored_path)

    assert result.format_type == FormatType.UNLOADING_PLAN_CN
    assert result.confidence >= 0.75
    assert result.warnings == ()
    assert result.errors == ()
    assert "箱数/件数" in result.matched_headers
    assert "派送目的地" in result.matched_headers


def test_detector_identifies_bestar_receiving_report_from_registry(tmp_path: Path) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(BESTAR_RECEIVING_FIXTURE)

    result = detect_excel_format(imported.stored_path)

    assert result.format_type == FormatType.BESTAR_RECEIVING
    assert result.confidence > 0.75
    assert result.warnings == ()
    assert result.errors == ()
    assert "CONTAINER #" in result.matched_headers
    assert "TOTAL # OF CARTONS" in result.matched_headers


def test_detector_returns_unknown_with_warning_for_unsupported_real_fixture(
    tmp_path: Path,
) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(UNKNOWN_FIXTURE)

    result = detect_excel_format(imported.stored_path)

    assert result.format_type == FormatType.UNKNOWN
    assert result.confidence == 0.0
    assert result.warnings
    assert result.reason
    assert result.errors == ()


def test_detector_reads_all_registered_real_fixtures_without_parse_errors(
    tmp_path: Path,
) -> None:
    registry = ImportRegistry(tmp_path / "original_files")

    for fixture_path in sorted(FIXTURE_DIR.glob("*.xlsx")):
        imported = registry.import_file(fixture_path)

        result = detect_excel_format(imported.stored_path)

        assert result.format_type in FormatType
        assert result.reason
        assert result.errors == ()
