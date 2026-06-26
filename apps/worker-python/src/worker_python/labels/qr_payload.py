from __future__ import annotations

from datetime import date


def build_qr_payload(
    *,
    label_date: date,
    container_no: str,
    destination: str,
    pallet_no: str,
    pallet_id: str,
) -> str:
    return "|".join(
        (
            "SSP1",
            "PALLET",
            label_date.isoformat(),
            _payload_part(container_no),
            _payload_part(destination),
            _payload_part(pallet_no),
            _payload_part(pallet_id),
        )
    )


def _payload_part(value: str) -> str:
    return value.replace("|", "/").strip()
