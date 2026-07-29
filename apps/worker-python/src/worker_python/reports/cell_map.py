from __future__ import annotations

from dataclasses import dataclass


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

# The template's alternating white rows are part of the same business table.
# Keep the named groups for template-contract checks, but write the combined
# business slots in printed top-to-bottom order. Reading primary rows first and
# white rows second would make the paper report display 1, 9, 2, 10, ... even
# though a validator using that same artificial order could appear to pass.
ADDITIONAL_DESTINATION_ROWS = tuple(
    _destination_row(row) for row in (5, 7, 9, 11, 13, 15, 17, 19)
)

DESTINATION_ROWS = tuple(
    sorted(
        PRIMARY_DESTINATION_ROWS + ADDITIONAL_DESTINATION_ROWS,
        key=lambda row: row.row,
    )
)
