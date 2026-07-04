from __future__ import annotations

import copy
from pathlib import Path

from worker_python.unloading_wage import (
    ContainerPayClassification,
    load_unloading_wage_input,
    settle_unloading_wage_payload,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE = REPO_ROOT / "samples" / "unloading-wage" / "unload_wage_p0.json"


def test_unloading_wage_settlement_groups_containers_and_calculates_worker_totals() -> None:
    payload = load_unloading_wage_input(FIXTURE)

    result = settle_unloading_wage_payload(payload)

    assert result.settlementMonth == "2026-06"
    assert result.currency == "CAD"
    assert result.errors == ()
    assert len(result.payContainers) == 3
    assert result.totalAmount == 960.0
    assert {rate.classification for rate in result.ratesSnapshot} == {
        ContainerPayClassification.OCEAN_CONTAINER,
        ContainerPayClassification.US_TO_CANADA_TRANSFER,
    }

    ocean = next(
        item for item in result.payContainers if item.payContainerId == "PC-OCEAN-CAAU8011090"
    )
    assert ocean.classification == ContainerPayClassification.OCEAN_CONTAINER
    assert ocean.containerNumbers == ("CAAU8011090",)
    assert ocean.rateAmount == 300.0
    assert ocean.allocationMethod == "EQUAL_SPLIT"
    assert [(item.workerId, item.amount) for item in ocean.allocations] == [
        ("P0-WORKER-A", 150.0),
        ("P0-WORKER-B", 150.0),
    ]

    trailer = next(
        item for item in result.payContainers if item.payContainerId == "PC-TRAILER-TR-P0-0604"
    )
    assert trailer.trailerNumber == "TR-P0-0604"
    assert trailer.containerNumbers == ("ZCSU9025988B", "TXGU5580229")
    assert trailer.rateAmount == 360.0
    assert [(item.workerId, item.amount) for item in trailer.allocations] == [
        ("P0-WORKER-A", 180.0),
        ("P0-WORKER-C", 180.0),
    ]

    manual = next(
        item for item in result.payContainers if item.payContainerId == "PC-OCEAN-CSNU8877228"
    )
    assert manual.allocationMethod == "MANUAL_AMOUNT"
    assert [(item.workerId, item.amount) for item in manual.allocations] == [
        ("P0-WORKER-B", 175.0),
        ("P0-WORKER-C", 125.0),
    ]
    assert any(
        warning.code == "MANUAL_ALLOCATION_REQUIRES_AUDIT_IN_P1"
        for warning in result.warnings
    )

    totals = {worker.workerId: worker.totalAmount for worker in result.workers}
    assert totals == {
        "P0-WORKER-A": 330.0,
        "P0-WORKER-B": 325.0,
        "P0-WORKER-C": 305.0,
    }


def test_unloading_wage_settlement_preserves_raw_json_for_review() -> None:
    payload = load_unloading_wage_input(FIXTURE)
    payload["work_items"][0]["review_note"] = "kept in raw json"

    result = settle_unloading_wage_payload(payload)

    first_item = next(item for item in result.workItems if item.workItemId == "UW-P0-001")
    assert first_item.rawJson["review_note"] == "kept in raw json"


def test_unloading_wage_settlement_reports_validation_errors() -> None:
    payload = load_unloading_wage_input(FIXTURE)
    invalid = copy.deepcopy(payload)
    invalid["work_items"][1]["trailer_number"] = ""
    invalid["work_items"][2]["unloaders"] = []
    invalid["work_items"][3]["manual_allocations"][0]["amount"] = 100.0

    result = settle_unloading_wage_payload(invalid)

    error_codes = {error.code for error in result.errors}
    assert "MISSING_TRAILER_NUMBER" in error_codes
    assert "MISSING_UNLOADER_ASSIGNMENT" in error_codes
    assert "MANUAL_ALLOCATION_TOTAL_MISMATCH" in error_codes
    assert all(
        item.payContainerId != "PC-TRAILER-TR-P0-0604"
        for item in result.payContainers
    )


def test_unloading_wage_settlement_requires_completion_user_and_valid_rows() -> None:
    payload = load_unloading_wage_input(FIXTURE)
    invalid = copy.deepcopy(payload)
    invalid["work_items"][0]["completed_by"] = ""
    invalid["work_items"][1]["unloaders"] = ["bad row"]
    invalid["work_items"][3]["manual_allocations"].append("bad allocation")

    result = settle_unloading_wage_payload(invalid)

    error_codes = {error.code for error in result.errors}
    assert "MISSING_COMPLETED_BY" in error_codes
    assert "INVALID_UNLOADER" in error_codes
    assert "INVALID_MANUAL_ALLOCATION" in error_codes
    assert all(
        item.payContainerId != "PC-OCEAN-CAAU8011090"
        for item in result.payContainers
    )
