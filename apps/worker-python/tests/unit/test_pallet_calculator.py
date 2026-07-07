from __future__ import annotations

from pathlib import Path

import pytest

from worker_python.imports import ImportRegistry
from worker_python.pallets import (
    PalletCalculationInput,
    calculate_pallets,
    inputs_from_destination_summaries,
)
from worker_python.parser import parse_bestar_receiving, parse_unloading_plan_cn


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
UNLOADING_PLAN_FIXTURE = FIXTURE_DIR / "CAAU8011090 UNLOADING PLAN.xlsx"
ZERO_VOLUME_FIXTURE = FIXTURE_DIR / "Unloading Plan SMCU1012780.xlsx"
BESTAR_FIXTURE = FIXTURE_DIR / "137675 JXJU3246131  PO#3404  BESTAR.xlsx"


@pytest.mark.parametrize(
    ("destination_code", "volume", "cartons", "expected", "rule_code", "divisor"),
    [
        ("YYC4", 3.39, 1, 2, "VOLUME_1_7", 1.7),
        ("YYC4", 3.41, 1, 3, "VOLUME_1_7", 1.7),
        ("YYC6", 1.70, 1, 1, "VOLUME_1_7", 1.7),
        ("YEG2", 13.236, 1, 8, "VOLUME_1_7", 1.7),
        ("YVR2", 4.39, 1, 2, "VOLUME_2_2", 2.2),
        ("YVR3", 4.41, 1, 3, "VOLUME_2_2", 2.2),
        ("YVR4", 0.5, 1, 1, "VOLUME_2_2", 2.2),
    ],
)
def test_pallet_calculator_uses_destination_divisor_rules(
    destination_code: str,
    volume: float,
    cartons: int,
    expected: int,
    rule_code: str,
    divisor: float,
) -> None:
    result = calculate_pallets(
        (
            PalletCalculationInput(
                destinationCode=destination_code,
                totalCartons=cartons,
                totalVolumeCbm=volume,
                lineCount=1,
            ),
        )
    )

    plan = result.plans[0]
    assert plan.ruleCode == rule_code
    assert plan.volumeDivisorCbm == pytest.approx(divisor)
    assert plan.calculatedPallets == expected
    assert plan.finalPallets == expected
    assert len(plan.palletIds) == expected


def test_pallet_calculator_adds_yeg1_extra_pallets() -> None:
    result = calculate_pallets(
        (
            PalletCalculationInput(
                destinationCode="YEG1",
                totalCartons=1,
                totalVolumeCbm=3.4,
                lineCount=1,
            ),
        )
    )

    plan = result.plans[0]
    assert plan.ruleCode == "YEG1_VOLUME_1_7_PLUS_5"
    assert plan.calculatedPallets == 7


def test_pallet_calculator_adds_yeg1_extra_pallets_after_zero_volume_minimum() -> None:
    result = calculate_pallets(
        (
            PalletCalculationInput(
                destinationCode="YEG1",
                totalCartons=6,
                totalVolumeCbm=0,
                lineCount=1,
            ),
        )
    )

    plan = result.plans[0]
    assert plan.totalVolumeCbm == pytest.approx(0.01)
    assert plan.calculatedPallets == 6
    assert any(warning.code == "ZERO_VOLUME_WITH_CARTONS" for warning in result.warnings)


@pytest.mark.parametrize(
    ("volume", "expected"),
    [
        (3.59, 2),
        (3.61, 3),
    ],
)
def test_pallet_calculator_uses_address_carton_volume_rule(volume: float, expected: int) -> None:
    result = calculate_pallets(
        (
            PalletCalculationInput(
                destinationCode="Private Address / TEST",
                packageType="CARTON",
                totalCartons=12,
                totalVolumeCbm=volume,
                lineCount=1,
            ),
        )
    )

    plan = result.plans[0]
    assert plan.ruleCode == "ADDRESS_CARTON_VOLUME_1_8"
    assert plan.packageType == "CARTON"
    assert plan.volumeDivisorCbm == pytest.approx(1.8)
    assert plan.calculatedPallets == expected


def test_pallet_calculator_uses_address_wooden_crate_piece_count() -> None:
    result = calculate_pallets(
        (
            PalletCalculationInput(
                destinationCode="Commercial Address / TEST",
                packageType="WOODEN_CRATE",
                totalCartons=7,
                totalVolumeCbm=3.0,
                lineCount=1,
            ),
        )
    )

    plan = result.plans[0]
    assert plan.ruleCode == "ADDRESS_WOODEN_CRATE_PIECE_COUNT"
    assert plan.packageType == "WOODEN_CRATE"
    assert plan.volumeDivisorCbm is None
    assert plan.calculatedPallets == 7


def test_pallet_calculator_keeps_mixed_address_packages_in_separate_rule_buckets() -> None:
    result = calculate_pallets(
        (
            PalletCalculationInput(
                destinationCode="Private Address / MIXED",
                packageType="CARTON",
                totalCartons=10,
                totalVolumeCbm=3.59,
                lineCount=1,
            ),
            PalletCalculationInput(
                destinationCode="Private Address / MIXED",
                packageType="WOODEN_CRATE",
                totalCartons=7,
                totalVolumeCbm=0.1,
                lineCount=1,
            ),
        )
    )

    assert [plan.ruleCode for plan in result.plans] == [
        "ADDRESS_CARTON_VOLUME_1_8",
        "ADDRESS_WOODEN_CRATE_PIECE_COUNT",
    ]
    assert [plan.calculatedPallets for plan in result.plans] == [2, 7]
    assert result.totalFinalPallets == 9


def test_pallet_calculator_warns_and_uses_carton_rule_for_unknown_address_package() -> None:
    result = calculate_pallets(
        (
            PalletCalculationInput(
                destinationCode="Private Address / UNKNOWN",
                packageType=None,
                totalCartons=10,
                totalVolumeCbm=3.61,
                lineCount=1,
            ),
        )
    )

    plan = result.plans[0]
    assert plan.ruleCode == "ADDRESS_CARTON_VOLUME_1_8"
    assert plan.packageType == "UNKNOWN"
    assert plan.calculatedPallets == 3
    assert any(
        warning.code == "PACKAGE_TYPE_CONFIRMATION_REQUIRED"
        and warning.destinationCode == "Private Address / UNKNOWN"
        for warning in result.warnings
    )


def test_pallet_calculator_uses_destination_rules_for_real_fba_warehouse(tmp_path: Path) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(UNLOADING_PLAN_FIXTURE)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    inputs = inputs_from_destination_summaries(parsed.destinationSummaries)

    result = calculate_pallets(inputs, container_no=parsed.containerNo)

    plan = _plan(result, "YEG2")
    assert plan.ruleCode == "VOLUME_1_7"
    assert plan.volumeDivisorCbm == pytest.approx(1.7)
    assert plan.calculatedPallets == 8
    assert plan.finalPallets == 8
    assert len(plan.palletIds) == 8
    assert len(set(plan.palletIds)) == 8


def test_pallet_calculator_warns_for_real_private_address_without_package_type(tmp_path: Path) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(UNLOADING_PLAN_FIXTURE)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    inputs = inputs_from_destination_summaries(parsed.destinationSummaries)

    result = calculate_pallets(inputs, container_no=parsed.containerNo)

    plan = _plan(result, "Private Address / SZCA2604054725")
    assert plan.ruleCode == "ADDRESS_CARTON_VOLUME_1_8"
    assert plan.packageType == "UNKNOWN"
    assert plan.calculatedPallets == 4
    assert any(
        warning.code == "PACKAGE_TYPE_CONFIRMATION_REQUIRED"
        and warning.destinationCode == "Private Address / SZCA2604054725"
        for warning in result.warnings
    )


def test_pallet_calculator_floors_small_positive_volume_to_one_pallet(
    tmp_path: Path,
) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(UNLOADING_PLAN_FIXTURE)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    inputs = inputs_from_destination_summaries(parsed.destinationSummaries)

    result = calculate_pallets(inputs, container_no=parsed.containerNo)

    plan = _plan(result, "YVR2")
    assert plan.totalCartons == 8
    assert plan.totalVolumeCbm == pytest.approx(0.442)
    assert plan.calculatedPallets == 1


def test_pallet_calculator_treats_parser_normalized_zero_volume_as_minimum_volume(
    tmp_path: Path,
) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(ZERO_VOLUME_FIXTURE)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    zero_volume_line = next(line for line in parsed.lines if line.rowNumber == 13)

    result = calculate_pallets(
        (
            PalletCalculationInput(
                destinationCode=zero_volume_line.destinationCode,
                totalCartons=zero_volume_line.cartons or 0,
                totalVolumeCbm=zero_volume_line.volumeCbm or 0,
                lineCount=1,
            ),
        ),
        container_no=parsed.containerNo,
    )

    assert result.plans[0].calculatedPallets == 1
    assert result.plans[0].totalVolumeCbm == pytest.approx(0.01)
    assert not any(warning.code == "ZERO_VOLUME_WITH_CARTONS" for warning in result.warnings)


def test_pallet_calculator_warns_when_destination_type_is_unknown(tmp_path: Path) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(UNLOADING_PLAN_FIXTURE)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    inputs = inputs_from_destination_summaries(parsed.destinationSummaries)

    result = calculate_pallets(inputs, container_no=parsed.containerNo)

    plan = _plan(result, "贵司卡尔加里仓")
    assert plan.destinationType == "UNKNOWN"
    assert plan.calculatedPallets == 1
    assert any(
        warning.code == "NEED_CONFIRM_DESTINATION_TYPE"
        and warning.destinationCode == "贵司卡尔加里仓"
        for warning in result.warnings
    )


def test_pallet_calculator_supports_manual_pallet_override_from_real_summary(
    tmp_path: Path,
) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(UNLOADING_PLAN_FIXTURE)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    yeg2_summary = next(summary for summary in parsed.destinationSummaries if summary.destinationCode == "YEG2")

    result = calculate_pallets(
        (
            PalletCalculationInput(
                destinationCode=yeg2_summary.destinationCode,
                totalCartons=yeg2_summary.totalCartons,
                totalVolumeCbm=yeg2_summary.totalVolumeCbm,
                lineCount=yeg2_summary.lineCount,
                manualPallets=9,
            ),
        ),
        container_no=parsed.containerNo,
    )

    plan = result.plans[0]
    assert plan.calculatedPallets == 8
    assert plan.manualPallets == 9
    assert plan.finalPallets == 9
    assert len(plan.palletIds) == 9


def test_pallet_calculator_preserves_bestar_missing_destination_warning(
    tmp_path: Path,
) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(BESTAR_FIXTURE)
    parsed = parse_bestar_receiving(imported.stored_path)
    inputs = inputs_from_destination_summaries(parsed.destinationSummaries)

    result = calculate_pallets(inputs, container_no=parsed.containerNo)

    assert result.plans[0].destinationCode is None
    assert result.plans[0].calculatedPallets == 1
    warning_codes = {warning.code for warning in result.warnings}
    assert warning_codes >= {"NEED_CONFIRM_DESTINATION_TYPE", "ZERO_VOLUME_WITH_CARTONS"}


def _plan(result, destination_code: str):  # noqa: ANN001, ANN202
    return next(plan for plan in result.plans if plan.destinationCode == destination_code)
