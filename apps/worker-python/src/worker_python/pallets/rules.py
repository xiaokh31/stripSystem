from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable


@dataclass(frozen=True)
class PalletConfig:
    pallet_length_m: Decimal = Decimal("1.2192")
    pallet_width_m: Decimal = Decimal("1.016")
    utilization_ratio: Decimal = Decimal("1.0")
    amazon_height_limit_m: Decimal = Decimal("1.8")
    parcel_private_height_limit_m: Decimal = Decimal("2.0")
    unknown_height_limit_m: Decimal = Decimal("2.0")
    volume_rule_1_7_divisor_cbm: Decimal = Decimal("1.7")
    volume_rule_2_2_divisor_cbm: Decimal = Decimal("2.2")
    address_carton_divisor_cbm: Decimal = Decimal("1.8")
    yeg1_extra_pallets: int = 5


@dataclass(frozen=True)
class DestinationClassification:
    destination_type: str
    height_limit_m: Decimal
    needs_confirmation: bool
    rule_code: str
    volume_divisor_cbm: Decimal | None
    package_type: str | None = None
    extra_pallets: int = 0
    uses_piece_count: bool = False


DEFAULT_PALLET_CONFIG = PalletConfig()
AMAZON_FBA = "AMAZON_FBA"
PARCEL_PRIVATE = "PARCEL_PRIVATE"
UNKNOWN = "UNKNOWN"
PACKAGE_CARTON = "CARTON"
PACKAGE_WOODEN_CRATE = "WOODEN_CRATE"
PACKAGE_UNKNOWN = "UNKNOWN"
RULE_VOLUME_1_7 = "VOLUME_1_7"
RULE_VOLUME_2_2 = "VOLUME_2_2"
RULE_YEG1 = "YEG1_VOLUME_1_7_PLUS_5"
RULE_ADDRESS_CARTON = "ADDRESS_CARTON_VOLUME_1_8"
RULE_ADDRESS_WOODEN_CRATE = "ADDRESS_WOODEN_CRATE_PIECE_COUNT"
RULE_UNKNOWN_DESTINATION = "UNKNOWN_DESTINATION_VOLUME_1_7"

VOLUME_1_7_DESTINATIONS = frozenset(("YYC4", "YYC6", "YEG2"))
VOLUME_2_2_DESTINATIONS = frozenset(("YVR2", "YVR3", "YVR4"))

PARCEL_PRIVATE_TERMS = (
    "UPS",
    "PUROLATOR",
    "PURO",
    "P/A",
    "PRIVATE",
    "PRIVATE ADDRESS",
    "COMMERCIAL",
    "COMMERCIAL ADDRESS",
    "BUSINESS ADDRESS",
    "私人",
    "私人地址",
    "商业",
    "商业地址",
    "商業",
    "商業地址",
)
AMAZON_CODE_PATTERN = re.compile(r"\b[A-Z]{3}\d\b")
CTN_PATTERN = re.compile(r"\bCTNS?\b")
WOOD_PACKAGE_TERMS = (
    "木箱",
    "木架",
    "木托",
    "WOOD",
    "WOODEN",
    "CRATE",
)
CARTON_PACKAGE_TERMS = (
    "纸箱",
    "紙箱",
    "CARTON",
)


def classify_destination(
    destination_code: str | None,
    package_type: str | None = None,
    config: PalletConfig = DEFAULT_PALLET_CONFIG,
) -> DestinationClassification:
    normalized = _normalize_destination(destination_code)
    normalized_package_type = normalize_package_type(package_type)

    if _contains_destination_code(normalized, ("YEG1",)):
        return DestinationClassification(
            destination_type=AMAZON_FBA,
            height_limit_m=config.amazon_height_limit_m,
            needs_confirmation=False,
            rule_code=RULE_YEG1,
            volume_divisor_cbm=config.volume_rule_1_7_divisor_cbm,
            extra_pallets=config.yeg1_extra_pallets,
        )

    if _contains_destination_code(normalized, VOLUME_1_7_DESTINATIONS):
        return DestinationClassification(
            destination_type=AMAZON_FBA,
            height_limit_m=config.amazon_height_limit_m,
            needs_confirmation=False,
            rule_code=RULE_VOLUME_1_7,
            volume_divisor_cbm=config.volume_rule_1_7_divisor_cbm,
        )

    if _contains_destination_code(normalized, VOLUME_2_2_DESTINATIONS):
        return DestinationClassification(
            destination_type=AMAZON_FBA,
            height_limit_m=config.amazon_height_limit_m,
            needs_confirmation=False,
            rule_code=RULE_VOLUME_2_2,
            volume_divisor_cbm=config.volume_rule_2_2_divisor_cbm,
        )

    if any(_normalize_destination(term) in normalized for term in PARCEL_PRIVATE_TERMS):
        if normalized_package_type == PACKAGE_WOODEN_CRATE:
            return DestinationClassification(
                destination_type=PARCEL_PRIVATE,
                height_limit_m=config.parcel_private_height_limit_m,
                needs_confirmation=False,
                rule_code=RULE_ADDRESS_WOODEN_CRATE,
                volume_divisor_cbm=None,
                package_type=PACKAGE_WOODEN_CRATE,
                uses_piece_count=True,
            )

        return DestinationClassification(
            destination_type=PARCEL_PRIVATE,
            height_limit_m=config.parcel_private_height_limit_m,
            needs_confirmation=False,
            rule_code=RULE_ADDRESS_CARTON,
            volume_divisor_cbm=config.address_carton_divisor_cbm,
            package_type=normalized_package_type or PACKAGE_UNKNOWN,
        )

    if "AMAZON" in normalized or "FBA" in normalized or AMAZON_CODE_PATTERN.search(normalized):
        return DestinationClassification(
            destination_type=AMAZON_FBA,
            height_limit_m=config.amazon_height_limit_m,
            needs_confirmation=False,
            rule_code=RULE_VOLUME_1_7,
            volume_divisor_cbm=config.volume_rule_1_7_divisor_cbm,
        )

    return DestinationClassification(
        destination_type=UNKNOWN,
        height_limit_m=config.unknown_height_limit_m,
        needs_confirmation=True,
        rule_code=RULE_UNKNOWN_DESTINATION,
        volume_divisor_cbm=config.volume_rule_1_7_divisor_cbm,
    )


def detect_package_type_from_values(values: Iterable[object]) -> str | None:
    text = " ".join(str(value) for value in values if value is not None).upper()
    if not text:
        return None

    if any(term in text for term in WOOD_PACKAGE_TERMS):
        return PACKAGE_WOODEN_CRATE

    if any(term in text for term in CARTON_PACKAGE_TERMS) or CTN_PATTERN.search(text):
        return PACKAGE_CARTON

    return None


def normalize_package_type(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = _normalize_destination(value)
    if normalized in {PACKAGE_CARTON, "CTN", "CTNS"}:
        return PACKAGE_CARTON
    if normalized in {PACKAGE_WOODEN_CRATE, "WOOD", "WOODEN", "CRATE"}:
        return PACKAGE_WOODEN_CRATE
    if normalized == PACKAGE_UNKNOWN:
        return PACKAGE_UNKNOWN
    return None


def _contains_destination_code(normalized_destination: str, codes: Iterable[str]) -> bool:
    return any(re.search(rf"\b{re.escape(code)}\b", normalized_destination) for code in codes)


def _normalize_destination(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", value.strip().upper())
