from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

import pytest

from worker_python.imports import ImportRegistry
from worker_python.labels import generate_pallet_label_pdf
from worker_python.pallets import calculate_pallets, inputs_from_destination_summaries
from worker_python.parser import parse_bestar_receiving, parse_unloading_plan_cn


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
UNLOADING_PLAN_FIXTURE = FIXTURE_DIR / "CAAU8011090 UNLOADING PLAN.xlsx"
BESTAR_FIXTURE = FIXTURE_DIR / "137675 JXJU3246131  PO#3404  BESTAR.xlsx"
LABEL_TEMPLATE = (
    REPO_ROOT
    / "apps"
    / "worker-python"
    / "src"
    / "worker_python"
    / "labels"
    / "templates"
    / "label.html"
)
POINTS_PER_MM = 72 / 25.4


def test_pdf_label_generator_writes_multipage_150mm_by_100mm_pdf(
    tmp_path: Path,
) -> None:
    parsed, pallet_result = _parsed_and_pallets(UNLOADING_PLAN_FIXTURE, tmp_path)

    result = generate_pallet_label_pdf(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "labels",
        label_date=date(2026, 6, 25),
    )

    assert result.errors == ()
    assert result.outputPath.is_file()
    assert result.labelCount == pallet_result.totalFinalPallets
    assert result.labelCount > 1
    assert len(result.palletIds) == len(set(result.palletIds))
    assert all(payload.startswith("SSP1|PALLET|2026-06-25|") for payload in result.qrPayloads)

    text = result.outputPath.read_bytes().decode("latin1", errors="ignore")
    assert _page_count(text) == result.labelCount
    width, height = _first_media_box_size(text)
    assert width == pytest.approx(_mm_points(150), abs=0.01)
    assert height == pytest.approx(_mm_points(100), abs=0.01)


def test_pdf_label_generator_records_generated_labels(tmp_path: Path) -> None:
    parsed, pallet_result = _parsed_and_pallets(UNLOADING_PLAN_FIXTURE, tmp_path)

    result = generate_pallet_label_pdf(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "labels",
        label_date=date(2026, 6, 25),
    )

    manifest = json.loads(result.manifestPath.read_text(encoding="utf-8"))
    record = manifest["records"][0]
    assert record["container_no"] == parsed.containerNo
    assert record["label_count"] == result.labelCount
    assert record["pallet_ids"] == list(result.palletIds)


def test_pdf_label_generator_uses_manual_destination_for_missing_destination(
    tmp_path: Path,
) -> None:
    registry = ImportRegistry(tmp_path / "original_files")
    imported = registry.import_file(BESTAR_FIXTURE)
    parsed = parse_bestar_receiving(imported.stored_path)
    pallet_result = calculate_pallets(
        inputs_from_destination_summaries(parsed.destinationSummaries),
        container_no=parsed.containerNo,
    )

    result = generate_pallet_label_pdf(
        parsed_result=parsed,
        pallet_result=pallet_result,
        output_dir=tmp_path / "labels",
        label_date=date(2026, 6, 25),
    )

    assert any(warning.code == "MISSING_DESTINATION" for warning in result.warnings)
    assert "NEED_MANUAL_DESTINATION" in result.qrPayloads[0]
    assert parsed.containerNo in result.qrPayloads[0]


def test_label_template_keeps_qr_at_25mm_and_wraps_long_destination() -> None:
    template = LABEL_TEMPLATE.read_text(encoding="utf-8")

    assert "width: 25mm;" in template
    assert "height: 25mm;" in template
    assert "overflow-wrap: anywhere;" in template


def test_pdf_label_generator_returns_error_when_no_pallet_ids(tmp_path: Path) -> None:
    parsed, pallet_result = _parsed_and_pallets(UNLOADING_PLAN_FIXTURE, tmp_path)
    empty_result = type(
        "EmptyPalletResult",
        (),
        {"plans": (), "totalFinalPallets": 0},
    )()

    result = generate_pallet_label_pdf(
        parsed_result=parsed,
        pallet_result=empty_result,
        output_dir=tmp_path / "labels",
        label_date=date(2026, 6, 25),
    )

    assert any(error.code == "NO_PALLET_LABELS" for error in result.errors)
    assert result.labelCount == 0
    assert not result.outputPath.exists()


def _parsed_and_pallets(fixture_path: Path, tmp_path: Path):
    registry = ImportRegistry(tmp_path / "original_files")
    imported = registry.import_file(fixture_path)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    pallet_result = calculate_pallets(
        inputs_from_destination_summaries(parsed.destinationSummaries),
        container_no=parsed.containerNo,
    )
    return parsed, pallet_result


def _page_count(pdf_text: str) -> int:
    return len(re.findall(r"/Type\s*/Page\b", pdf_text))


def _first_media_box_size(pdf_text: str) -> tuple[float, float]:
    match = re.search(r"/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]", pdf_text)
    assert match is not None
    return float(match.group(1)), float(match.group(2))


def _mm_points(mm: int) -> float:
    return mm * POINTS_PER_MM
