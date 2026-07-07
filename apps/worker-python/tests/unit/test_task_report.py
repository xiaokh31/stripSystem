from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from worker_python.imports import ImportRegistry
from worker_python.pallets import calculate_pallets, inputs_from_destination_summaries
from worker_python.parser import (
    FormatType,
    detect_excel_format,
    parse_bestar_receiving,
    parse_unloading_plan_cn,
)
from worker_python.task_reports import (
    correction_draft_from_records,
    generate_html_task_report,
    record_from_detection,
    record_from_parsed_result,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"


def test_task_report_generates_html_for_every_real_fixture(tmp_path: Path) -> None:
    records = _records_from_all_fixtures(tmp_path)

    result = generate_html_task_report(
        records,
        output_dir=tmp_path / "task_reports",
        corrections_dir=tmp_path / "corrections",
        generated_at=datetime(2026, 6, 25, 10, 0),
    )

    html = result.htmlPath.read_text(encoding="utf-8")
    assert result.recordCount == 28
    for fixture in FIXTURE_DIR.glob("*.xlsx"):
        assert fixture.name in html
    assert "SUCCESS" in html
    assert "WARNING" in html
    assert "ERROR" in html
    assert "Original filename" in html
    assert "Report file link" in html
    assert "Label file link" in html
    assert "correctedContainerNo" in html
    assert "correctedDestinationCode" in html
    assert "correctedPallets" in html
    assert "correctionNote" in html


def test_task_report_displays_warnings_errors_and_totals_from_real_results(
    tmp_path: Path,
) -> None:
    records = _records_from_all_fixtures(tmp_path)

    result = generate_html_task_report(
        records,
        output_dir=tmp_path / "task_reports",
        corrections_dir=tmp_path / "corrections",
        generated_at=datetime(2026, 6, 25, 10, 0),
    )

    html = result.htmlPath.read_text(encoding="utf-8")
    assert "ZERO_VOLUME_WITH_CARTONS" not in html
    assert "体积为0" in html
    assert "Destination type was not recognized" in html
    assert "Unsupported Excel format for Phase 0 parser detector." in html
    assert "CAAU8011090" in html
    assert "896" in html
    assert "rule VOLUME_1_7" in html
    assert "basis 1.700 cbm" in html
    assert "rounding CEIL" in html
    assert "package UNKNOWN" in html
    assert "Private or commercial address package type was not recognized" in html
    assert result.warningCount > 0
    assert result.errorCount > 0


def test_corrections_json_schema_contains_manual_fields(tmp_path: Path) -> None:
    records = _records_from_all_fixtures(tmp_path)

    result = generate_html_task_report(
        records,
        output_dir=tmp_path / "task_reports",
        corrections_dir=tmp_path / "corrections",
        generated_at=datetime(2026, 6, 25, 10, 0),
    )

    draft = json.loads(result.correctionsPath.read_text(encoding="utf-8"))
    first = draft["corrections"][0]
    assert draft["schema_version"] == 1
    assert len(draft["corrections"]) == 28
    assert {
        "correctionId",
        "originalFilename",
        "detectedFormat",
        "containerNo",
        "correctedContainerNo",
        "correctedDestinationCode",
        "correctedPallets",
        "correctionNote",
        "auditEvents",
    } <= set(first)
    assert first["correctedContainerNo"] is None
    assert first["auditEvents"] == []


def test_correction_draft_can_be_created_without_writing_files(tmp_path: Path) -> None:
    records = _records_from_all_fixtures(tmp_path)

    draft = correction_draft_from_records(records, generated_at=datetime(2026, 6, 25, 10, 0))

    assert draft["generated_at"] == "2026-06-25T10:00:00"
    assert len(draft["corrections"]) == 28


def _records_from_all_fixtures(tmp_path: Path):
    registry = ImportRegistry(tmp_path / "original_files")
    records = []

    for fixture in sorted(FIXTURE_DIR.glob("*.xlsx")):
        imported = registry.import_file(fixture)
        detection = detect_excel_format(imported.stored_path)

        if detection.format_type == FormatType.UNLOADING_PLAN_CN:
            parsed = parse_unloading_plan_cn(imported.stored_path)
            pallet_result = calculate_pallets(
                inputs_from_destination_summaries(parsed.destinationSummaries),
                container_no=parsed.containerNo,
            )
            records.append(
                record_from_parsed_result(
                    original_file=fixture,
                    parsed_result=parsed,
                    pallet_result=pallet_result,
                )
            )
        elif detection.format_type == FormatType.BESTAR_RECEIVING:
            parsed = parse_bestar_receiving(imported.stored_path)
            pallet_result = calculate_pallets(
                inputs_from_destination_summaries(parsed.destinationSummaries),
                container_no=parsed.containerNo,
            )
            records.append(
                record_from_parsed_result(
                    original_file=fixture,
                    parsed_result=parsed,
                    pallet_result=pallet_result,
                )
            )
        else:
            records.append(record_from_detection(fixture, detection))

    return tuple(records)
