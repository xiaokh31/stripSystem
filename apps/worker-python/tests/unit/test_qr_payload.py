from __future__ import annotations

from datetime import date
from pathlib import Path

from worker_python.imports import ImportRegistry
from worker_python.labels import build_qr_payload
from worker_python.pallets import calculate_pallets, inputs_from_destination_summaries
from worker_python.parser import parse_unloading_plan_cn


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE = REPO_ROOT / "samples" / "unloading-plans" / "CAAU8011090 UNLOADING PLAN.xlsx"


def test_qr_payload_contains_unique_real_pallet_id(tmp_path: Path) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(FIXTURE)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    pallet_result = calculate_pallets(
        inputs_from_destination_summaries(parsed.destinationSummaries),
        container_no=parsed.containerNo,
    )
    pallet_id = pallet_result.plans[0].palletIds[0]

    payload = build_qr_payload(
        label_date=date(2026, 6, 25),
        container_no=parsed.containerNo or "",
        destination=pallet_result.plans[0].destinationCode or "",
        pallet_no="1/1",
        pallet_id=pallet_id,
    )

    assert payload == (
        "SSP1|PALLET|2026-06-25|"
        f"{parsed.containerNo}|{pallet_result.plans[0].destinationCode}|1/1|{pallet_id}"
    )
    assert payload.endswith(pallet_id)
