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


def test_pallet_calculator_uses_amazon_height_for_fba_warehouse(tmp_path: Path) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(UNLOADING_PLAN_FIXTURE)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    inputs = inputs_from_destination_summaries(parsed.destinationSummaries)

    result = calculate_pallets(inputs, container_no=parsed.containerNo)

    plan = _plan(result, "YEG2")
    assert plan.heightLimitM == pytest.approx(1.8)
    assert plan.palletCapacityCbm == pytest.approx(1.2192 * 1.016 * 1.8)
    assert plan.calculatedPallets == 6
    assert plan.finalPallets == 6
    assert len(plan.palletIds) == 6
    assert len(set(plan.palletIds)) == 6


def test_pallet_calculator_uses_private_height_for_private_address(tmp_path: Path) -> None:
    imported = ImportRegistry(tmp_path / "original_files").import_file(UNLOADING_PLAN_FIXTURE)
    parsed = parse_unloading_plan_cn(imported.stored_path)
    inputs = inputs_from_destination_summaries(parsed.destinationSummaries)

    result = calculate_pallets(inputs, container_no=parsed.containerNo)

    plan = _plan(result, "Private Address")
    assert plan.heightLimitM == pytest.approx(2.0)
    assert plan.palletCapacityCbm == pytest.approx(1.2192 * 1.016 * 2.0)
    assert plan.calculatedPallets == 3


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


def test_pallet_calculator_warns_for_zero_volume_with_cartons_from_real_line(
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
    assert any(warning.code == "ZERO_VOLUME_WITH_CARTONS" for warning in result.warnings)


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
    assert plan.calculatedPallets == 6
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
    assert {warning.code for warning in result.warnings} >= {
        "NEED_CONFIRM_DESTINATION_TYPE",
        "ZERO_VOLUME_WITH_CARTONS",
    }


def _plan(result, destination_code: str):  # noqa: ANN001, ANN202
    return next(plan for plan in result.plans if plan.destinationCode == destination_code)
