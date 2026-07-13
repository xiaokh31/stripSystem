from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_CEILING
from typing import Any, Iterable

from worker_python.pallets.rules import (
    DEFAULT_PALLET_CONFIG,
    PACKAGE_CARTON,
    PACKAGE_WOODEN_CRATE,
    RULE_MIXED,
    RULE_OVERSIZE,
    RULE_WOODEN_CRATE,
    DestinationClassification,
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
    totalCartons: int | float | None
    totalVolumeCbm: Decimal | float | str
    lineCount: int
    packageType: str | None = None
    manualPallets: int | None = None
    actualCartons: int | float | None = None
    sourceLineNumber: int | None = None


@dataclass(frozen=True)
class PalletPlan:
    destinationCode: str | None
    destinationType: str
    destinationGroup: str
    packageType: str
    ruleCode: str
    totalCartons: int | float | None
    totalVolumeCbm: Decimal
    lineCount: int
    heightLimitM: Decimal
    palletCapacityCbm: Decimal
    volumeDivisorCbm: Decimal | None
    calculationBasisCbm: Decimal | None
    roundingMode: str
    calculationMode: str
    calculatedPallets: int
    manualPallets: int | None
    finalPallets: int
    palletIds: tuple[str, ...]
    policySnapshot: dict[str, object]
    warnings: tuple[PalletCalculationIssue, ...]


@dataclass(frozen=True)
class PalletCalculationResult:
    plans: tuple[PalletPlan, ...]
    warnings: tuple[PalletCalculationIssue, ...]
    errors: tuple[PalletCalculationIssue, ...]
    totalCalculatedPallets: int
    totalFinalPallets: int


@dataclass(frozen=True)
class _PreparedInput:
    source: PalletCalculationInput
    classification: DestinationClassification
    package_type: str
    volume: Decimal
    numeric_cartons: Decimal | None
    reliable_piece_count: int | None
    piece_count_source: str | None
    calculation_mode: str
    rule_code: str
    warnings: tuple[PalletCalculationIssue, ...]


def calculate_pallets(
    inputs: Iterable[PalletCalculationInput],
    *,
    container_no: str | None = None,
    pallet_id_namespace: str | None = None,
    config: PalletConfig = DEFAULT_PALLET_CONFIG,
) -> PalletCalculationResult:
    config_error = _validate_config(config)
    if config_error is not None:
        return PalletCalculationResult((), (), (config_error,), 0, 0)

    grouped: dict[tuple[str | None, str], list[_PreparedInput]] = {}
    for item in inputs:
        prepared = _prepare_input(item, config)
        key = (item.destinationCode, prepared.package_type)
        grouped.setdefault(key, []).append(prepared)

    plans = tuple(
        _aggregate_group(
            items,
            index=index,
            container_no=container_no,
            namespace=pallet_id_namespace,
            config=config,
        )
        for index, items in enumerate(grouped.values(), 1)
    )
    warnings = tuple(warning for plan in plans for warning in plan.warnings)
    return PalletCalculationResult(
        plans=plans,
        warnings=warnings,
        errors=(),
        totalCalculatedPallets=sum(plan.calculatedPallets for plan in plans),
        totalFinalPallets=sum(plan.finalPallets for plan in plans),
    )


def inputs_from_parsed_result(parsed_result: Any) -> tuple[PalletCalculationInput, ...]:
    lines = tuple(getattr(parsed_result, "lines", ()) or ())
    if not lines:
        return inputs_from_destination_summaries(
            getattr(parsed_result, "destinationSummaries", ())
        )

    return tuple(
        PalletCalculationInput(
            destinationCode=getattr(line, "destinationCode", None),
            totalCartons=getattr(
                line,
                "cartons",
                getattr(line, "totalCartons", None),
            ),
            totalVolumeCbm=getattr(line, "volumeCbm", 0) or 0,
            lineCount=1,
            packageType=getattr(line, "packageType", None),
            sourceLineNumber=getattr(line, "rowNumber", None),
        )
        for line in lines
    )


def inputs_from_destination_summaries(
    summaries: Iterable[Any],
) -> tuple[PalletCalculationInput, ...]:
    return tuple(
        PalletCalculationInput(
            destinationCode=getattr(summary, "destinationCode", None),
            totalCartons=getattr(summary, "totalCartons", 0),
            totalVolumeCbm=getattr(summary, "totalVolumeCbm", 0),
            lineCount=int(getattr(summary, "lineCount", 0) or 0),
            packageType=getattr(summary, "packageType", None),
            manualPallets=getattr(summary, "manualPallets", None),
            actualCartons=getattr(summary, "actualCartons", None),
        )
        for summary in summaries
    )


def _validate_config(config: PalletConfig) -> PalletCalculationIssue | None:
    values = (
        config.pallet_length_m,
        config.pallet_width_m,
        config.low_height_limit_m,
        config.other_height_limit_m,
        config.low_capacity_cbm,
        config.other_capacity_cbm,
    )
    if any(not value.is_finite() or value <= 0 for value in values):
        return PalletCalculationIssue(
            "INVALID_CONFIG",
            "Pallet policy dimensions, heights, and capacities must be positive finite decimals.",
        )
    if config.yeg1_extra_pallets < 0:
        return PalletCalculationIssue(
            "INVALID_CONFIG",
            "YEG1 extra pallets must not be negative.",
        )
    return None


def _prepare_input(item: PalletCalculationInput, config: PalletConfig) -> _PreparedInput:
    classification = classify_destination(item.destinationCode, config)
    warnings: list[PalletCalculationIssue] = []
    destination = item.destinationCode

    if not (destination or "").strip():
        warnings.append(
            PalletCalculationIssue(
                "MISSING_DESTINATION",
                "Destination is required for pallet calculation.",
                destination,
            )
        )
    elif classification.needs_confirmation:
        warnings.append(
            PalletCalculationIssue(
                "NEED_CONFIRM_DESTINATION_TYPE",
                "Destination type was not recognized; other-destination capacity was used and requires review.",
                destination,
            )
        )

    volume = _decimal(item.totalVolumeCbm)
    numeric_cartons = _numeric_count(item.totalCartons)
    reliable_piece_count, piece_count_source = _piece_count(item)
    if numeric_cartons is not None and numeric_cartons > 0 and volume == 0:
        warnings.append(
            PalletCalculationIssue(
                "ZERO_VOLUME_WITH_CARTONS",
                "Volume is zero while pieces exist; 0.01 CBM was used for pallet calculation.",
                destination,
            )
        )
        volume = MIN_VOLUME_CBM

    package_type = normalize_package_type(item.packageType) or PACKAGE_CARTON
    calculation_mode = "VOLUME"
    rule_code = classification.rule_code
    if package_type == PACKAGE_WOODEN_CRATE:
        if reliable_piece_count is not None:
            calculation_mode = "PIECE_COUNT"
            rule_code = RULE_WOODEN_CRATE
        else:
            warnings.append(
                PalletCalculationIssue(
                    "WOODEN_CRATE_PIECE_COUNT_REQUIRED",
                    "A reliable wooden-crate piece count is required; volume calculation was retained.",
                    destination,
                )
            )
    elif reliable_piece_count is not None:
        average_piece_volume = volume / Decimal(reliable_piece_count)
        if average_piece_volume > classification.capacity_cbm:
            calculation_mode = "OVERSIZE_PIECE_COUNT"
            rule_code = RULE_OVERSIZE
    elif volume > classification.capacity_cbm:
        warnings.append(
            PalletCalculationIssue(
                "OVERSIZE_PIECE_COUNT_REQUIRED",
                "A reliable piece count is required to confirm oversize cargo; volume calculation was retained.",
                destination,
            )
        )

    if item.manualPallets is not None and _manual_pallets(item.manualPallets) is None:
        warnings.append(
            PalletCalculationIssue(
                "INVALID_MANUAL_PALLETS",
                "Invalid manual pallet override was ignored.",
                destination,
            )
        )

    return _PreparedInput(
        source=item,
        classification=classification,
        package_type=package_type,
        volume=volume,
        numeric_cartons=numeric_cartons,
        reliable_piece_count=reliable_piece_count,
        piece_count_source=piece_count_source,
        calculation_mode=calculation_mode,
        rule_code=rule_code,
        warnings=tuple(warnings),
    )


def _aggregate_group(
    items: list[_PreparedInput],
    *,
    index: int,
    container_no: str | None,
    namespace: str | None,
    config: PalletConfig,
) -> PalletPlan:
    first = items[0]
    classification = first.classification
    volume_items = [item for item in items if item.calculation_mode == "VOLUME"]
    wooden_items = [item for item in items if item.calculation_mode == "PIECE_COUNT"]
    oversize_items = [
        item for item in items if item.calculation_mode == "OVERSIZE_PIECE_COUNT"
    ]
    bucket_snapshots: list[dict[str, object]] = []
    calculated = 0
    applied_extra_pallets = 0

    if volume_items:
        total_volume = sum((item.volume for item in volume_items), Decimal("0"))
        has_pieces = any(
            item.numeric_cartons is not None and item.numeric_cartons > 0
            for item in volume_items
        )
        base_pallets = _volume_pallets(
            total_volume,
            has_pieces=has_pieces,
            capacity=classification.capacity_cbm,
        )
        applied_extra_pallets = classification.extra_pallets if base_pallets > 0 else 0
        volume_calculated = base_pallets + applied_extra_pallets
        calculated += volume_calculated
        bucket_snapshots.append(
            _bucket_snapshot(
                volume_items,
                calculation_mode="VOLUME",
                rule_code=classification.rule_code,
                calculated_pallets=volume_calculated,
                base_pallets=base_pallets,
                extra_pallets=applied_extra_pallets,
                capacity=classification.capacity_cbm,
            )
        )

    if wooden_items:
        wooden_pallets = sum(item.reliable_piece_count or 0 for item in wooden_items)
        calculated += wooden_pallets
        bucket_snapshots.append(
            _bucket_snapshot(
                wooden_items,
                calculation_mode="PIECE_COUNT",
                rule_code=RULE_WOODEN_CRATE,
                calculated_pallets=wooden_pallets,
                base_pallets=wooden_pallets,
                extra_pallets=0,
                capacity=classification.capacity_cbm,
            )
        )

    if oversize_items:
        oversize_pallets = sum(item.reliable_piece_count or 0 for item in oversize_items)
        calculated += oversize_pallets
        bucket_snapshots.append(
            _bucket_snapshot(
                oversize_items,
                calculation_mode="OVERSIZE_PIECE_COUNT",
                rule_code=RULE_OVERSIZE,
                calculated_pallets=oversize_pallets,
                base_pallets=oversize_pallets,
                extra_pallets=0,
                capacity=classification.capacity_cbm,
            )
        )

    warnings = tuple(warning for item in items for warning in item.warnings)
    manual = _group_manual_pallets(items)
    final = manual if manual is not None else calculated
    rule_codes = {str(bucket["ruleCode"]) for bucket in bucket_snapshots}
    modes = {str(bucket["calculationMode"]) for bucket in bucket_snapshots}
    rule_code = next(iter(rule_codes)) if len(rule_codes) == 1 else RULE_MIXED
    calculation_mode = next(iter(modes)) if len(modes) == 1 else "MIXED"
    rounding_mode = "CEIL" if calculation_mode == "VOLUME" else "PIECE_COUNT"
    if calculation_mode == "MIXED":
        rounding_mode = "MIXED"

    total_volume = sum((item.volume for item in items), Decimal("0"))
    total_cartons = _summed_cartons(items)
    line_count = sum(max(1, item.source.lineCount) for item in items)
    capacity = classification.capacity_cbm
    basis = capacity if volume_items else None
    policy_snapshot: dict[str, object] = {
        "policyVersion": config.policy_version,
        "ruleVersion": config.rule_version,
        "settingsRevision": config.settings_revision,
        "destinationAliasVersion": config.destination_alias_version,
        "palletLengthM": str(config.pallet_length_m),
        "palletWidthM": str(config.pallet_width_m),
        "destinationHeightM": str(classification.height_limit_m),
        "destinationGroup": classification.destination_group,
        "capacityCbm": _decimal_string(capacity),
        "packageType": first.package_type,
        "ruleCode": rule_code,
        "calculationMode": calculation_mode,
        "roundingMode": rounding_mode,
        "yeg1ExtraPallets": config.yeg1_extra_pallets,
        "appliedExtraPallets": applied_extra_pallets,
        "calculatedPallets": calculated,
        "manualPallets": manual,
        "finalPallets": final,
        "warningCodes": [warning.code for warning in warnings],
        "calculationBuckets": bucket_snapshots,
    }

    return PalletPlan(
        destinationCode=first.source.destinationCode,
        destinationType=classification.destination_type,
        destinationGroup=classification.destination_group,
        packageType=first.package_type,
        ruleCode=rule_code,
        totalCartons=total_cartons,
        totalVolumeCbm=total_volume,
        lineCount=line_count,
        heightLimitM=classification.height_limit_m,
        palletCapacityCbm=capacity,
        volumeDivisorCbm=basis,
        calculationBasisCbm=basis,
        roundingMode=rounding_mode,
        calculationMode=calculation_mode,
        calculatedPallets=calculated,
        manualPallets=manual,
        finalPallets=final,
        palletIds=_pallet_ids(
            container_no,
            namespace,
            first.source.destinationCode,
            index,
            final,
        ),
        policySnapshot=policy_snapshot,
        warnings=warnings,
    )


def _bucket_snapshot(
    items: list[_PreparedInput],
    *,
    calculation_mode: str,
    rule_code: str,
    calculated_pallets: int,
    base_pallets: int,
    extra_pallets: int,
    capacity: Decimal,
) -> dict[str, object]:
    piece_sources = sorted(
        {item.piece_count_source for item in items if item.piece_count_source}
    )
    return {
        "sourceLineNumbers": [
            item.source.sourceLineNumber
            for item in items
            if item.source.sourceLineNumber is not None
        ],
        "totalCartons": _summed_cartons(items),
        "totalVolumeCbm": _decimal_string(
            sum((item.volume for item in items), Decimal("0"))
        ),
        "reliablePieceCount": sum(
            item.reliable_piece_count or 0 for item in items
        )
        or None,
        "pieceCountSources": piece_sources,
        "capacityCbm": _decimal_string(capacity),
        "ruleCode": rule_code,
        "calculationMode": calculation_mode,
        "roundingMode": "CEIL" if calculation_mode == "VOLUME" else "PIECE_COUNT",
        "basePallets": base_pallets,
        "extraPallets": extra_pallets,
        "calculatedPallets": calculated_pallets,
        "warningCodes": [warning.code for item in items for warning in item.warnings],
    }


def _volume_pallets(
    volume: Decimal,
    *,
    has_pieces: bool,
    capacity: Decimal,
) -> int:
    if not has_pieces and volume <= 0:
        return 0
    calculated = (
        int((volume / capacity).to_integral_value(rounding=ROUND_CEILING))
        if volume > 0
        else 0
    )
    return max(calculated, 1) if has_pieces else calculated


def _piece_count(item: PalletCalculationInput) -> tuple[int | None, str | None]:
    if item.actualCartons is not None:
        return _reliable_count(item.actualCartons), "ACTUAL_CARTONS"
    return _reliable_count(item.totalCartons), "PARSER_NORMALIZED_CARTONS"


def _numeric_count(value: object) -> Decimal | None:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return number if number.is_finite() and number >= 0 else None


def _reliable_count(value: object) -> int | None:
    number = _numeric_count(value)
    if number is None or number <= 0 or number != number.to_integral_value():
        return None
    return int(number)


def _manual_pallets(value: object) -> int | None:
    number = _numeric_count(value)
    if number is None or number <= 0 or number != number.to_integral_value():
        return None
    return int(number)


def _group_manual_pallets(items: list[_PreparedInput]) -> int | None:
    values = {
        manual
        for item in items
        if item.source.manualPallets is not None
        if (manual := _manual_pallets(item.source.manualPallets)) is not None
    }
    return next(iter(values)) if len(values) == 1 else None


def _summed_cartons(items: list[_PreparedInput]) -> int | float | None:
    values = [item.numeric_cartons for item in items if item.numeric_cartons is not None]
    if not values:
        return None
    total = sum(values, Decimal("0"))
    return int(total) if total == total.to_integral_value() else float(total)


def _decimal(value: object) -> Decimal:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return Decimal("0")
    if not number.is_finite() or number < 0:
        return Decimal("0")
    return number


def _decimal_string(value: Decimal) -> str:
    text = format(value, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def _pallet_ids(
    container_no: str | None,
    namespace: str | None,
    destination_code: str | None,
    index: int,
    count: int,
) -> tuple[str, ...]:
    container = _slug(container_no or "UNKNOWN")
    prefix = f"{container}-{_slug(namespace)}-" if namespace else f"{container}-"
    prefix += f"D{index:03d}-{_slug(destination_code or 'UNKNOWN')}"
    return tuple(f"{prefix}-P{number:03d}" for number in range(1, count + 1))


def _slug(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "-", value.upper()).strip("-") or "UNKNOWN"
