import json
from decimal import Decimal
from pathlib import Path

import pytest

from worker_python.pallets import (
    PalletCalculationInput,
    PalletConfig,
    calculate_pallets,
)


def calculate(
    destination: str | None,
    volume: str,
    cartons: object = 10,
    package: str | None = None,
    **extra: object,
):
    result = calculate_pallets(
        (
            PalletCalculationInput(
                destination,
                cartons,  # type: ignore[arg-type]
                Decimal(volume),
                1,
                package,
                **extra,  # type: ignore[arg-type]
            ),
        )
    )
    assert result.errors == ()
    return result.plans[0]


@pytest.mark.parametrize(
    ("destination", "volume", "expected", "rule", "capacity"),
    [
        ("YYC4", "2.04", 1, "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7", "2.04"),
        ("YYC4", "2.05", 2, "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7", "2.04"),
        ("YYC4", "4.08", 2, "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7", "2.04"),
        ("YYC4", "4.09", 3, "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7", "2.04"),
        ("YYC6", "2.04", 1, "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7", "2.04"),
        ("YEG2", "13.236", 7, "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7", "2.04"),
        ("YVR2", "2.64", 1, "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2", "2.64"),
        ("YVR3", "2.65", 2, "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2", "2.64"),
        ("YVR4", "5.29", 3, "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2", "2.64"),
        ("UPS", "5.40", 3, "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2", "2.64"),
        (
            "Private Address",
            "3.61",
            2,
            "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2",
            "2.64",
        ),
    ],
)
def test_footprint_height_capacity_matrix(
    destination: str,
    volume: str,
    expected: int,
    rule: str,
    capacity: str,
) -> None:
    plan = calculate(destination, volume)
    assert plan.calculatedPallets == expected
    assert plan.finalPallets == expected
    assert plan.ruleCode == rule
    assert plan.palletCapacityCbm == Decimal(capacity)
    assert plan.policySnapshot["capacityCbm"] == capacity


@pytest.mark.parametrize(
    "destination",
    [
        "PUROLATOR",
        "PURLATOR",
        "PURO",
        "P/A",
        "GOODCANG",
        "GOOD CANG",
        "Private Address / WB-1",
        "Commercial Address / WB-2",
        "Business Address / WB-3",
        "私人地址 / WB-4",
        "商業地址 / WB-5",
    ],
)
def test_other_destination_aliases_use_exact_boundaries(destination: str) -> None:
    plan = calculate(destination, "2.64")
    assert plan.destinationGroup == "OTHER_DESTINATION_2_2"
    assert plan.finalPallets == 1
    assert "NEED_CONFIRM_DESTINATION_TYPE" not in {
        warning.code for warning in plan.warnings
    }


@pytest.mark.parametrize("destination", ["NOTUPS", "YEG10", "PRIVATEER"])
def test_destination_codes_do_not_match_loose_substrings(destination: str) -> None:
    plan = calculate(destination, "1")
    assert "NEED_CONFIRM_DESTINATION_TYPE" in {
        warning.code for warning in plan.warnings
    }


def test_yeg1_plus_four_and_zero_volume_warning() -> None:
    assert calculate("YEG1", "4.08").calculatedPallets == 6
    plan = calculate("YEG1", "0", cartons=3)
    assert plan.calculatedPallets == 5
    assert {issue.code for issue in plan.warnings} == {"ZERO_VOLUME_WITH_CARTONS"}
    assert plan.policySnapshot["appliedExtraPallets"] == 4


def test_piece_count_precedence_and_unreliable_count_warnings() -> None:
    wooden = calculate("YVR2", "9", cartons=7, package="WOODEN_CRATE")
    assert wooden.ruleCode == "WOODEN_CRATE_PIECE_COUNT"
    assert wooden.finalPallets == 7
    assert wooden.packageType == "WOODEN_CRATE"

    oversize = calculate("OTHER", "5.60", cartons=2)
    assert (oversize.ruleCode, oversize.finalPallets) == (
        "OVERSIZE_PIECE_COUNT",
        2,
    )
    assert oversize.packageType == "CARTON"

    missing = calculate("OTHER", "5.60", cartons=0)
    assert missing.finalPallets == 3
    assert "OVERSIZE_PIECE_COUNT_REQUIRED" in {
        issue.code for issue in missing.warnings
    }

    wooden_missing = calculate(
        "OTHER",
        "5.60",
        cartons=7,
        package="WOODEN_CRATE",
        actualCartons=0,
    )
    assert wooden_missing.finalPallets == 3
    assert "WOODEN_CRATE_PIECE_COUNT_REQUIRED" in {
        issue.code for issue in wooden_missing.warnings
    }


def test_audited_piece_count_precedes_parser_count_without_reclassifying_package() -> None:
    plan = calculate("OTHER", "5.60", cartons=10, actualCartons=2)
    assert plan.ruleCode == "OVERSIZE_PIECE_COUNT"
    assert plan.calculatedPallets == 2
    assert plan.packageType == "CARTON"
    bucket = plan.policySnapshot["calculationBuckets"][0]  # type: ignore[index]
    assert bucket["pieceCountSources"] == ["ACTUAL_CARTONS"]  # type: ignore[index]


def test_normal_carton_lines_aggregate_before_volume_ceiling() -> None:
    result = calculate_pallets(
        (
            PalletCalculationInput("YVR2", 10, Decimal("0.90"), 1),
            PalletCalculationInput("YVR2", 10, Decimal("0.90"), 1),
        )
    )
    assert len(result.plans) == 1
    assert result.plans[0].calculatedPallets == 1
    assert result.plans[0].ruleCode == "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2"


def test_mixed_normal_oversize_and_wooden_buckets_aggregate_after_classification() -> None:
    result = calculate_pallets(
        (
            PalletCalculationInput("OTHER", 10, Decimal("0.90"), 1, "CARTON"),
            PalletCalculationInput("OTHER", 2, Decimal("5.60"), 1, "CARTON"),
            PalletCalculationInput(
                "OTHER",
                3,
                Decimal("9.00"),
                1,
                "WOODEN_CRATE",
            ),
        )
    )
    plans = {plan.packageType: plan for plan in result.plans}
    assert plans["CARTON"].calculatedPallets == 3
    assert plans["CARTON"].ruleCode == "MIXED_PALLET_CALCULATION"
    assert len(plans["CARTON"].policySnapshot["calculationBuckets"]) == 2  # type: ignore[arg-type]
    assert plans["WOODEN_CRATE"].calculatedPallets == 3
    assert result.totalCalculatedPallets == 6


def test_manual_override_snapshot_and_custom_width_are_exact() -> None:
    plan = calculate("YYC4", "2.04", manualPallets=4)
    assert plan.finalPallets == 4
    assert len(plan.palletIds) == 4
    assert plan.policySnapshot["manualPallets"] == 4

    custom = calculate_pallets(
        (PalletCalculationInput("YYC4", 10, Decimal("2.05"), 1),),
        config=PalletConfig(pallet_width_m=Decimal("1.1")),
    ).plans[0]
    assert custom.palletCapacityCbm == Decimal("1.870")
    assert custom.calculatedPallets == 2
    assert custom.policySnapshot["palletWidthM"] == "1.1"


def test_zero_manual_override_is_ignored_and_warned() -> None:
    plan = calculate("YYC4", "2.05", manualPallets=0)
    assert plan.calculatedPallets == 2
    assert plan.manualPallets is None
    assert plan.finalPallets == 2
    assert "INVALID_MANUAL_PALLETS" in {
        warning.code for warning in plan.warnings
    }


def test_unmatched_and_missing_destinations_do_not_become_zero() -> None:
    unmatched = calculate("Unlisted destination", "1", 1)
    assert "NEED_CONFIRM_DESTINATION_TYPE" in {
        warning.code for warning in unmatched.warnings
    }
    assert unmatched.finalPallets == 1

    missing = calculate(None, "1", 1)
    assert missing.finalPallets == 1
    assert "MISSING_DESTINATION" in {warning.code for warning in missing.warnings}


def test_invalid_policy_returns_explicit_error() -> None:
    result = calculate_pallets(
        (PalletCalculationInput("YYC4", 1, Decimal("1"), 1),),
        config=PalletConfig(pallet_width_m=Decimal("0")),
    )
    assert result.plans == ()
    assert [error.code for error in result.errors] == ["INVALID_CONFIG"]


def test_cross_language_contract_fixture_matches_complete_policy_snapshots() -> None:
    fixture_path = (
        Path(__file__).resolve().parents[4]
        / "samples"
        / "contracts"
        / "pallet-calculation-v2.json"
    )
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

    for contract_case in fixture["cases"]:
        policy = {**fixture["policy"], **contract_case.get("policyOverrides", {})}
        input_data = contract_case["input"]
        result = calculate_pallets(
            (
                PalletCalculationInput(
                    destinationCode=input_data["destinationCode"],
                    totalCartons=input_data["cartons"],
                    totalVolumeCbm=Decimal(input_data["volumeCbm"]),
                    lineCount=1,
                    packageType=input_data["packageType"],
                    manualPallets=input_data["manualPallets"],
                ),
            ),
            config=PalletConfig.from_policy(policy),
        )
        assert result.errors == (), contract_case["name"]
        plan = result.plans[0]
        actual = {
            "ruleCode": plan.ruleCode,
            "capacityCbm": plan.policySnapshot["capacityCbm"],
            "roundingMode": plan.roundingMode,
            "calculatedPallets": plan.calculatedPallets,
            "finalPallets": plan.finalPallets,
            "warningCodes": [warning.code for warning in plan.warnings],
            "policySnapshot": plan.policySnapshot,
        }
        assert actual == contract_case["expected"], contract_case["name"]
