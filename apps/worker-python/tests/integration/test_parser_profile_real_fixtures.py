from __future__ import annotations

import json
from pathlib import Path

import pytest

from worker_python.imports import compute_sha256
from worker_python.parser import parse_bestar_receiving, parse_unloading_plan_cn
from worker_python.parser_profiles import execute_mapping


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
PROFILE_DIR = (
    REPO_ROOT / "apps" / "worker-python" / "tests" / "fixtures" / "parser_profiles"
)
UNLOADING_FIXTURE = FIXTURE_DIR / "CAAU8011090 UNLOADING PLAN.xlsx"
BESTAR_FIXTURE = FIXTURE_DIR / "137675 JXJU3246131  PO#3404  BESTAR.xlsx"
STANDARD_FIXTURE = FIXTURE_DIR / "Unloading Plan SMCU1012780.xlsx"


def test_real_unloading_plan_profile_reconciles_with_builtin_canonical_contract() -> (
    None
):
    assert (
        compute_sha256(UNLOADING_FIXTURE)
        == "a30b0373c0dbcd46ab55fe98016058e6479aea7c6bb12a4bc4e5766f1f89450e"
    )
    definition = _definition("unloading-plan-sheet1-v1.json")
    profile = execute_mapping(
        UNLOADING_FIXTURE,
        definition,
        replay_input_hash=compute_sha256(UNLOADING_FIXTURE),
    )
    built_in = parse_unloading_plan_cn(UNLOADING_FIXTURE)

    assert profile.errors == ()
    assert profile.containerNo == built_in.containerNo
    assert len(profile.lines) == len(built_in.lines) == 43
    assert [line.cartons for line in profile.lines] == [
        line.cartons for line in built_in.lines
    ]
    assert [line.volumeCbm for line in profile.lines] == pytest.approx(
        [line.volumeCbm for line in built_in.lines]
    )
    assert [line.destinationCode for line in profile.lines] == [
        line.destinationCode for line in built_in.lines
    ]
    assert sum(summary.totalCartons for summary in profile.destinationSummaries) == sum(
        summary.totalCartons for summary in built_in.destinationSummaries
    )


def test_real_bestar_profile_reconciles_cartons_and_preserves_unknown_source_columns() -> (
    None
):
    assert (
        compute_sha256(BESTAR_FIXTURE)
        == "c468e29e37fcbd250f1611777c6bb3b6a3f2b9d6c73f560866c171cea7034da4"
    )
    definition = _definition("bestar-receiving-v1.json")
    profile = execute_mapping(
        BESTAR_FIXTURE,
        definition,
        replay_input_hash=compute_sha256(BESTAR_FIXTURE),
    )
    built_in = parse_bestar_receiving(BESTAR_FIXTURE)

    assert profile.errors == ()
    assert profile.containerNo == built_in.containerNo
    assert profile.company == "BESTAR"
    assert profile.poNumber == built_in.poNumber
    assert profile.customer == built_in.customer
    assert profile.clearOrderNo == built_in.clearOrderNo
    assert [line.cartons for line in profile.lines] == [
        line.totalCartons for line in built_in.lines
    ]
    assert [line.itemNo for line in profile.lines] == [
        line.itemNo for line in built_in.lines
    ]
    assert profile.lines[0].raw_json["PIECES PER CARTON"] == 6
    assert profile.lines[0].raw_json["TOTAL # OF PCS"] == 1602
    assert profile.lines[0].provenance["cartons"].sourceRefs[0].cell == "E12"
    assert profile.provenance["company"].sourceRefs[0].cell == "D2"
    assert profile.provenance["poNumber"].sourceRefs[0].cell == "H3"
    assert [
        (
            summary.destinationCode,
            summary.status,
            summary.totalCartons,
            summary.totalSkidCount,
            summary.lineCount,
        )
        for summary in profile.destinationSummaries
    ] == [
        (
            summary.destinationCode,
            summary.status,
            summary.totalCartons,
            summary.totalSkidCount,
            summary.lineCount,
        )
        for summary in built_in.destinationSummaries
    ]
    assert any(issue.code == "NEED_MANUAL_DESTINATION" for issue in profile.warnings)


def test_real_standard_plan_with_missing_dimensions_stays_bounded_and_uses_filename_container_fallback() -> (
    None
):
    definition = _definition("standard-cn-sheet1-v1.json")
    profile = execute_mapping(
        STANDARD_FIXTURE,
        definition,
        replay_input_hash=compute_sha256(STANDARD_FIXTURE),
    )
    built_in = parse_unloading_plan_cn(STANDARD_FIXTURE)

    assert not any(issue.code == "MISSING_CONTAINER_NO" for issue in profile.errors)
    assert profile.containerNo == built_in.containerNo == "SMCU1012780"
    assert profile.provenance["containerNo"].sourceRefs[0].sheet == "<filename>"
    assert profile.provenance["containerNo"].transformChain == (
        "filename_container_fallback",
    )
    assert len(profile.lines) == len(built_in.lines) == 59
    assert [line.cartons for line in profile.lines] == [
        line.cartons for line in built_in.lines
    ]
    assert [line.volumeCbm for line in profile.lines] == pytest.approx(
        [line.volumeCbm for line in built_in.lines]
    )
    assert profile.lines[0].raw_json["材积重"] == 104.8


def _definition(filename: str) -> dict:
    return json.loads((PROFILE_DIR / filename).read_text(encoding="utf-8"))
