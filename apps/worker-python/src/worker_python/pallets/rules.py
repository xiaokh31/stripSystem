from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class PalletConfig:
    pallet_length_m: Decimal = Decimal("1.2192")
    pallet_width_m: Decimal = Decimal("1.016")
    utilization_ratio: Decimal = Decimal("1.0")
    amazon_height_limit_m: Decimal = Decimal("1.8")
    parcel_private_height_limit_m: Decimal = Decimal("2.0")
    unknown_height_limit_m: Decimal = Decimal("2.0")


@dataclass(frozen=True)
class DestinationClassification:
    destination_type: str
    height_limit_m: Decimal
    needs_confirmation: bool


DEFAULT_PALLET_CONFIG = PalletConfig()
AMAZON_FBA = "AMAZON_FBA"
PARCEL_PRIVATE = "PARCEL_PRIVATE"
UNKNOWN = "UNKNOWN"

PARCEL_PRIVATE_TERMS = ("UPS", "PUROLATOR", "PURO", "P/A", "PRIVATE", "PRIVATE ADDRESS")
AMAZON_CODE_PATTERN = re.compile(r"\b[A-Z]{3}\d\b")


def classify_destination(
    destination_code: str | None,
    config: PalletConfig = DEFAULT_PALLET_CONFIG,
) -> DestinationClassification:
    normalized = _normalize_destination(destination_code)

    if "AMAZON" in normalized or "FBA" in normalized or AMAZON_CODE_PATTERN.search(normalized):
        return DestinationClassification(
            destination_type=AMAZON_FBA,
            height_limit_m=config.amazon_height_limit_m,
            needs_confirmation=False,
        )

    if any(_normalize_destination(term) in normalized for term in PARCEL_PRIVATE_TERMS):
        return DestinationClassification(
            destination_type=PARCEL_PRIVATE,
            height_limit_m=config.parcel_private_height_limit_m,
            needs_confirmation=False,
        )

    return DestinationClassification(
        destination_type=UNKNOWN,
        height_limit_m=config.unknown_height_limit_m,
        needs_confirmation=True,
    )


def _normalize_destination(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", value.strip().upper())
