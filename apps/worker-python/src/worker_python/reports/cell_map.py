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
DESTINATION_ROWS = (
    DestinationRowCells(row=4, pallet_label_cell="C4", destination_cell="N4", pallet_count_cell="O4", carton_count_cell="P4"),
    DestinationRowCells(row=6, pallet_label_cell="C6", destination_cell="N6", pallet_count_cell="O6", carton_count_cell="P6"),
    DestinationRowCells(row=8, pallet_label_cell="C8", destination_cell="N8", pallet_count_cell="O8", carton_count_cell="P8"),
    DestinationRowCells(row=10, pallet_label_cell="C10", destination_cell="N10", pallet_count_cell="O10", carton_count_cell="P10"),
    DestinationRowCells(row=12, pallet_label_cell="C12", destination_cell="N12", pallet_count_cell="O12", carton_count_cell="P12"),
    DestinationRowCells(row=14, pallet_label_cell="C14", destination_cell="N14", pallet_count_cell="O14", carton_count_cell="P14"),
    DestinationRowCells(row=16, pallet_label_cell="C16", destination_cell="N16", pallet_count_cell="O16", carton_count_cell="P16"),
    DestinationRowCells(row=18, pallet_label_cell="C18", destination_cell="N18", pallet_count_cell="O18", carton_count_cell="P18"),
)
