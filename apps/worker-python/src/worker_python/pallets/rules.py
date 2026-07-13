from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable


POLICY_VERSION = "pallet-footprint-v1"
RULE_VERSION = "pallet-footprint-height-v2"
DESTINATION_ALIAS_VERSION = "destination-aliases-v1"

LOW_HEIGHT_DESTINATIONS = ("YYC4", "YYC6", "YEG1", "YEG2")
OTHER_DESTINATION_ALIASES = (
    "YVR2",
    "YVR3",
    "YVR4",
    "UPS",
    "PUROLATOR",
    "PURLATOR",
    "PURO",
    "P/A",
    "GOODCANG",
    "GOOD CANG",
    "PRIVATE",
    "PRIVATE ADDRESS",
    "COMMERCIAL",
    "COMMERCIAL ADDRESS",
    "BUSINESS",
    "BUSINESS ADDRESS",
    "私人",
    "私人地址",
    "商业",
    "商业地址",
    "商業",
    "商業地址",
)


def _default_settings_revision() -> str:
    canonical = json.dumps(
        {
            "policyVersion": POLICY_VERSION,
            "palletLengthM": "1.0",
            "palletWidthM": "1.2",
            "updatedAt": [],
        },
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class PalletConfig:
    pallet_length_m: Decimal = Decimal("1.0")
    pallet_width_m: Decimal = Decimal("1.2")
    low_height_limit_m: Decimal = Decimal("1.7")
    other_height_limit_m: Decimal = Decimal("2.2")
    yeg1_extra_pallets: int = 4
    policy_version: str = POLICY_VERSION
    rule_version: str = RULE_VERSION
    settings_revision: str = _default_settings_revision()
    low_height_destination_codes: tuple[str, ...] = LOW_HEIGHT_DESTINATIONS
    other_destination_aliases: tuple[str, ...] = OTHER_DESTINATION_ALIASES
    destination_alias_version: str = DESTINATION_ALIAS_VERSION

    @property
    def low_capacity_cbm(self) -> Decimal:
        return self.pallet_length_m * self.pallet_width_m * self.low_height_limit_m

    @property
    def other_capacity_cbm(self) -> Decimal:
        return self.pallet_length_m * self.pallet_width_m * self.other_height_limit_m

    @classmethod
    def from_policy(cls, policy: dict[str, object]) -> PalletConfig:
        return cls(
            pallet_length_m=Decimal(str(policy.get("palletLengthM", "1.0"))),
            pallet_width_m=Decimal(str(policy.get("palletWidthM", "1.2"))),
            low_height_limit_m=Decimal(str(policy.get("lowHeightM", "1.7"))),
            other_height_limit_m=Decimal(str(policy.get("otherHeightM", "2.2"))),
            yeg1_extra_pallets=int(policy.get("yeg1ExtraPallets", 4)),
            policy_version=str(policy.get("policyVersion", POLICY_VERSION)),
            settings_revision=str(
                policy.get("settingsRevision", _default_settings_revision())
            ),
            low_height_destination_codes=_string_tuple(
                policy.get("lowHeightDestinationCodes"),
                LOW_HEIGHT_DESTINATIONS,
            ),
            other_destination_aliases=_string_tuple(
                policy.get("otherDestinationAliases"),
                OTHER_DESTINATION_ALIASES,
            ),
            destination_alias_version=str(
                policy.get("destinationAliasVersion", DESTINATION_ALIAS_VERSION)
            ),
        )


@dataclass(frozen=True)
class DestinationClassification:
    destination_type: str
    destination_group: str
    height_limit_m: Decimal
    needs_confirmation: bool
    rule_code: str
    capacity_cbm: Decimal
    extra_pallets: int = 0


DEFAULT_PALLET_CONFIG = PalletConfig()
AMAZON_FBA = "AMAZON_FBA"
PARCEL_PRIVATE = "PARCEL_PRIVATE"
UNKNOWN = "UNKNOWN"
PACKAGE_CARTON = "CARTON"
PACKAGE_WOODEN_CRATE = "WOODEN_CRATE"
PACKAGE_UNKNOWN = "UNKNOWN"
RULE_VOLUME_1_7 = "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7"
RULE_VOLUME_2_2 = "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2"
RULE_YEG1 = "YEG1_FOOTPRINT_HEIGHT_PLUS_4"
RULE_WOODEN_CRATE = "WOODEN_CRATE_PIECE_COUNT"
RULE_OVERSIZE = "OVERSIZE_PIECE_COUNT"
RULE_MIXED = "MIXED_PALLET_CALCULATION"

CTN_PATTERN = re.compile(r"\bCTNS?\b")
WOOD_PACKAGE_TERMS = ("木箱", "木架", "木托", "WOOD", "WOODEN", "CRATE")
CARTON_PACKAGE_TERMS = ("纸箱", "紙箱", "CARTON")
ALIAS_SEPARATOR = r"[\s/|,;:()\[\]{}\-]"


def classify_destination(
    destination_code: str | None,
    config: PalletConfig = DEFAULT_PALLET_CONFIG,
) -> DestinationClassification:
    normalized = normalize_destination(destination_code)
    if contains_destination_alias(normalized, "YEG1"):
        return DestinationClassification(
            destination_type=AMAZON_FBA,
            destination_group="YEG1_1_7_PLUS_4",
            height_limit_m=config.low_height_limit_m,
            needs_confirmation=False,
            rule_code=RULE_YEG1,
            capacity_cbm=config.low_capacity_cbm,
            extra_pallets=config.yeg1_extra_pallets,
        )

    low_height_codes = tuple(
        code
        for code in config.low_height_destination_codes
        if normalize_destination(code) != "YEG1"
    )
    if any(contains_destination_alias(normalized, code) for code in low_height_codes):
        return DestinationClassification(
            destination_type=AMAZON_FBA,
            destination_group="LOW_HEIGHT_1_7",
            height_limit_m=config.low_height_limit_m,
            needs_confirmation=False,
            rule_code=RULE_VOLUME_1_7,
            capacity_cbm=config.low_capacity_cbm,
        )

    if any(
        contains_destination_alias(normalized, alias)
        for alias in config.other_destination_aliases
    ):
        return DestinationClassification(
            destination_type=PARCEL_PRIVATE,
            destination_group="OTHER_DESTINATION_2_2",
            height_limit_m=config.other_height_limit_m,
            needs_confirmation=False,
            rule_code=RULE_VOLUME_2_2,
            capacity_cbm=config.other_capacity_cbm,
        )

    return DestinationClassification(
        destination_type=UNKNOWN,
        destination_group="OTHER_DESTINATION_2_2",
        height_limit_m=config.other_height_limit_m,
        needs_confirmation=bool(normalized),
        rule_code=RULE_VOLUME_2_2,
        capacity_cbm=config.other_capacity_cbm,
    )


def detect_package_type_from_values(values: Iterable[object]) -> str | None:
    text = " ".join(str(value) for value in values if value is not None).upper()
    if any(term in text for term in WOOD_PACKAGE_TERMS):
        return PACKAGE_WOODEN_CRATE
    if any(term in text for term in CARTON_PACKAGE_TERMS) or CTN_PATTERN.search(text):
        return PACKAGE_CARTON
    return None


def normalize_package_type(value: str | None) -> str | None:
    normalized = normalize_destination(value)
    if normalized in {PACKAGE_CARTON, "CTN", "CTNS"}:
        return PACKAGE_CARTON
    if normalized in {
        PACKAGE_WOODEN_CRATE,
        "WOODEN CRATE",
        "WOOD",
        "WOODEN",
        "CRATE",
    }:
        return PACKAGE_WOODEN_CRATE
    if normalized == PACKAGE_UNKNOWN:
        return PACKAGE_UNKNOWN
    return None


def contains_destination_alias(normalized: str, alias: str) -> bool:
    normalized_alias = normalize_destination(alias)
    if not normalized or not normalized_alias:
        return False
    return bool(
        re.search(
            rf"(?:^|{ALIAS_SEPARATOR}){re.escape(normalized_alias)}"
            rf"(?:$|{ALIAS_SEPARATOR})",
            normalized,
        )
    )


def normalize_destination(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().upper())


def _string_tuple(value: object, fallback: tuple[str, ...]) -> tuple[str, ...]:
    if not isinstance(value, list | tuple):
        return fallback
    result = tuple(str(item) for item in value if str(item).strip())
    return result or fallback
