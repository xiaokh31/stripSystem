from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


@dataclass(frozen=True)
class DestinationRowCells:
    row: int
    pallet_label_cell: str
    destination_cell: str
    pallet_count_cell: str
    carton_count_cell: str


SHEET_NAME = "Sheet1"
DATE_VALUE_CELL = "D1"
TIME_VALUE_CELL = "H1"
CONTAINER_VALUE_CELL = "K1"
COMPANY_VALUE_CELL = "D2"
TOTAL_CARTONS_CELL = "P20"


def _destination_row(row: int) -> DestinationRowCells:
    return DestinationRowCells(
        row=row,
        pallet_label_cell=f"C{row}",
        destination_cell=f"N{row}",
        pallet_count_cell=f"O{row}",
        carton_count_cell=f"P{row}",
    )


PRIMARY_DESTINATION_ROWS = tuple(
    _destination_row(row) for row in (4, 6, 8, 10, 12, 14, 16, 18)
)

ADDITIONAL_DESTINATION_ROWS = tuple(
    _destination_row(row) for row in (5, 7, 9, 11, 13, 15, 17, 19)
)

EXPANDED_DESTINATION_ROWS = tuple(
    sorted(
        PRIMARY_DESTINATION_ROWS + ADDITIONAL_DESTINATION_ROWS,
        key=lambda row: row.row,
    )
)

# Compatibility name for the complete physical destination table. It defines
# capacity and inspection scope, not the write order for every page.
DESTINATION_ROWS = EXPANDED_DESTINATION_ROWS


class DestinationLayoutMode(str, Enum):
    PRIMARY_ONLY = "PRIMARY_ONLY"
    EXPANDED = "EXPANDED"


def layout_mode_for_page_count(count: int) -> DestinationLayoutMode:
    if count < 0 or count > len(EXPANDED_DESTINATION_ROWS):
        raise ValueError(
            f"Destination page count must be between 0 and "
            f"{len(EXPANDED_DESTINATION_ROWS)}: {count}"
        )
    if count <= len(PRIMARY_DESTINATION_ROWS):
        return DestinationLayoutMode.PRIMARY_ONLY
    return DestinationLayoutMode.EXPANDED


def rows_for_page_count(count: int) -> tuple[DestinationRowCells, ...]:
    mode = layout_mode_for_page_count(count)
    rows = (
        PRIMARY_DESTINATION_ROWS
        if mode is DestinationLayoutMode.PRIMARY_ONLY
        else EXPANDED_DESTINATION_ROWS
    )
    return rows[:count]
