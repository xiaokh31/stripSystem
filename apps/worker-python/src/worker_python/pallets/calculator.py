from __future__ import annotations

import math
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

from worker_python.pallets.rules import (
    DEFAULT_PALLET_CONFIG,
    PalletConfig,
    classify_destination,
    normalize_package_type,
)

MIN_VOLUME_CBM = Decimal("0.01")


@dataclass(frozen=True)
class PalletCalculationIssue:
    code: str
    message: str
    destinationCode: str | None = None


@dataclass(frozen=True)
class PalletCalculationInput:
    destinationCode: str | None
    totalCartons: int
    totalVolumeCbm: float
    lineCount: int
    packageType: str | None = None
    manualPallets: int | None = None


@dataclass(frozen=True)
class PalletPlan:
    destinationCode: str | None
    destinationType: str
    packageType: str | None
    ruleCode: str
    totalCartons: int
    totalVolumeCbm: float
    lineCount: int
    heightLimitM: float
    palletCapacityCbm: float
    volumeDivisorCbm: float | None
    calculationBasisCbm: float | None
    roundingMode: str
    calculatedPallets: int
    manualPallets: int | None
    finalPallets: int
    palletIds: tuple[str, ...]
    warnings: tuple[PalletCalculationIssue, ...]


@dataclass(frozen=True)
class PalletCalculationResult:
    plans: tuple[PalletPlan, ...]
    warnings: tuple[PalletCalculationIssue, ...]
    errors: tuple[PalletCalculationIssue, ...]
    totalCalculatedPallets: int
    totalFinalPallets: int


def calculate_pallets(
    inputs: Iterable[PalletCalculationInput],
    *,
    container_no: str | None = None,
    pallet_id_namespace: str | None = None,
    config: PalletConfig = DEFAULT_PALLET_CONFIG,
) -> PalletCalculationResult:
    errors = _validate_config(config)
    if errors:
        return PalletCalculationResult(
            plans=(),
            warnings=(),
            errors=tuple(errors),
            totalCalculatedPallets=0,
            totalFinalPallets=0,
        )

    plans: list[PalletPlan] = []
    all_warnings: list[PalletCalculationIssue] = []

    for plan_index, item in enumerate(inputs, start=1):
        plan, warnings = _calculate_one(
            item,
            plan_index=plan_index,
            container_no=container_no,
            pallet_id_namespace=pallet_id_namespace,
            config=config,
        )
        plans.append(plan)
        all_warnings.extend(warnings)

    return PalletCalculationResult(
        plans=tuple(plans),
        warnings=tuple(all_warnings),
        errors=(),
        totalCalculatedPallets=sum(plan.calculatedPallets for plan in plans),
        totalFinalPallets=sum(plan.finalPallets for plan in plans),
    )


def inputs_from_destination_summaries(
    summaries: Iterable[Any],
) -> tuple[PalletCalculationInput, ...]:
    inputs: list[PalletCalculationInput] = []

    for summary in summaries:
        inputs.append(
            PalletCalculationInput(
                destinationCode=getattr(summary, "destinationCode", None),
                totalCartons=int(getattr(summary, "totalCartons", 0) or 0),
                totalVolumeCbm=float(getattr(summary, "totalVolumeCbm", 0) or 0),
                lineCount=int(getattr(summary, "lineCount", 0) or 0),
                packageType=getattr(summary, "packageType", None),
                manualPallets=getattr(summary, "manualPallets", None),
            )
        )

    return tuple(inputs)


def _calculate_one(
    item: PalletCalculationInput,
    *,
    plan_index: int,
    container_no: str | None,
    pallet_id_namespace: str | None,
    config: PalletConfig,
) -> tuple[PalletPlan, list[PalletCalculationIssue]]:
    warnings: list[PalletCalculationIssue] = []
    package_type = normalize_package_type(item.packageType)
    classification = classify_destination(item.destinationCode, package_type, config)
    effective_package_type = classification.package_type or package_type
    capacity = classification.volume_divisor_cbm or Decimal("0")
    volume = _decimal(item.totalVolumeCbm)

    if classification.needs_confirmation:
        warnings.append(
            PalletCalculationIssue(
                code="NEED_CONFIRM_DESTINATION_TYPE",
                message="Destination type was not recognized; pallet rule needs confirmation.",
                destinationCode=item.destinationCode,
            )
        )

    if item.totalCartons > 0 and volume == 0:
        destination = item.destinationCode or "未识别目的仓"
        warnings.append(
            PalletCalculationIssue(
                code="ZERO_VOLUME_WITH_CARTONS",
                message=f"{destination} 体积为0的有{item.totalCartons}箱，已按0.01 CBM参与托盘计算。",
                destinationCode=item.destinationCode,
            )
        )
        volume = MIN_VOLUME_CBM

    calculated_pallets = _calculated_pallet_count(
        total_cartons=item.totalCartons,
        total_volume=volume,
        volume_divisor=classification.volume_divisor_cbm,
        extra_pallets=classification.extra_pallets,
        uses_piece_count=classification.uses_piece_count,
    )
    final_pallets = item.manualPallets if item.manualPallets is not None else calculated_pallets

    if item.manualPallets is not None and item.manualPallets < 0:
        warnings.append(
            PalletCalculationIssue(
                code="INVALID_MANUAL_PALLETS",
                message="manualPallets is negative; calculated pallet count was used instead.",
                destinationCode=item.destinationCode,
            )
        )
        final_pallets = calculated_pallets

    return (
        PalletPlan(
            destinationCode=item.destinationCode,
            destinationType=classification.destination_type,
            packageType=effective_package_type,
            ruleCode=classification.rule_code,
            totalCartons=item.totalCartons,
            totalVolumeCbm=float(volume),
            lineCount=item.lineCount,
            heightLimitM=float(classification.height_limit_m),
            palletCapacityCbm=float(capacity),
            volumeDivisorCbm=float(classification.volume_divisor_cbm)
            if classification.volume_divisor_cbm is not None
            else None,
            calculationBasisCbm=float(classification.volume_divisor_cbm)
            if classification.volume_divisor_cbm is not None
            else None,
            roundingMode="PIECE_COUNT" if classification.uses_piece_count else "CEIL",
            calculatedPallets=calculated_pallets,
            manualPallets=item.manualPallets,
            finalPallets=final_pallets,
            palletIds=_pallet_ids(
                container_no=container_no,
                pallet_id_namespace=pallet_id_namespace,
                destination_code=item.destinationCode,
                plan_index=plan_index,
                count=final_pallets,
            ),
            warnings=tuple(warnings),
        ),
        warnings,
    )


def _calculated_pallet_count(
    *,
    total_cartons: int,
    total_volume: Decimal,
    volume_divisor: Decimal | None,
    extra_pallets: int,
    uses_piece_count: bool,
) -> int:
    if total_cartons <= 0 and total_volume <= 0:
        return 0

    if uses_piece_count:
        return max(total_cartons, 0)

    if volume_divisor is None or volume_divisor <= 0:
        return 0

    calculated = math.ceil(total_volume / volume_divisor) if total_volume > 0 else 0
    if total_cartons > 0 and calculated < 1:
        calculated = 1
    return calculated + extra_pallets


def _pallet_ids(
    *,
    container_no: str | None,
    pallet_id_namespace: str | None,
    destination_code: str | None,
    plan_index: int,
    count: int,
) -> tuple[str, ...]:
    namespace = f"{_slug(pallet_id_namespace)}-" if pallet_id_namespace else ""
    prefix = (
        f"{_slug(container_no or 'UNKNOWN')}-"
        f"{namespace}"
        f"D{plan_index:03d}-"
        f"{_slug(destination_code or 'UNKNOWN')}"
    )
    return tuple(f"{prefix}-P{index:03d}" for index in range(1, count + 1))


def _slug(value: str) -> str:
    slug = re.sub(r"[^A-Z0-9]+", "-", value.upper()).strip("-")
    return slug or "UNKNOWN"


def _decimal(value: float | int | str | Decimal) -> Decimal:
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return Decimal("0")


def _validate_config(config: PalletConfig) -> list[PalletCalculationIssue]:
    errors: list[PalletCalculationIssue] = []
    if config.pallet_length_m <= 0:
        errors.append(PalletCalculationIssue(code="INVALID_CONFIG", message="pallet_length_m must be positive."))
    if config.pallet_width_m <= 0:
        errors.append(PalletCalculationIssue(code="INVALID_CONFIG", message="pallet_width_m must be positive."))
    if config.utilization_ratio <= 0:
        errors.append(PalletCalculationIssue(code="INVALID_CONFIG", message="utilization_ratio must be positive."))
    if config.volume_rule_1_7_divisor_cbm <= 0:
        errors.append(
            PalletCalculationIssue(code="INVALID_CONFIG", message="volume_rule_1_7_divisor_cbm must be positive.")
        )
    if config.volume_rule_2_2_divisor_cbm <= 0:
        errors.append(
            PalletCalculationIssue(code="INVALID_CONFIG", message="volume_rule_2_2_divisor_cbm must be positive.")
        )
    if config.address_carton_divisor_cbm <= 0:
        errors.append(
            PalletCalculationIssue(code="INVALID_CONFIG", message="address_carton_divisor_cbm must be positive.")
        )
    if config.yeg1_extra_pallets < 0:
        errors.append(PalletCalculationIssue(code="INVALID_CONFIG", message="yeg1_extra_pallets cannot be negative."))
    return errors
