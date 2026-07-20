from __future__ import annotations

from worker_python.parser_profiles.contracts import (
    ColumnSource,
    MappingSuggestion,
    SuggestionEvidence,
    WorkbookInspection,
)
from worker_python.parser_profiles.normalization import normalize_header as _normalize


HEADER_ALIASES = {
    "waybillNo": ("运单号", "SO"),
    "fbaNo": ("FBA NO.", "FBA", "客户单号"),
    "poNumber": ("PO#", "PO NUMBER", "REFERENCE ID"),
    "itemNo": ("ITEM#", "ITEM #"),
    "description": ("DESCRIPTION",),
    "cartons": ("箱数/件数", "件数", "TOTAL # OF CARTONS"),
    "weight": ("重量", "实际重量(KG)"),
    "volumeCbm": ("体积", "体积(M³)", "体积(M3)"),
    "destinationCode": ("派送目的地", "仓库代码", "地址类型"),
    "deliveryMethod": ("派送方式", "服务名称"),
    "note": ("备注", "特殊指令/备注", "内部备注"),
    "totalSkidCount": ("TOTAL SKID COUNT",),
}


def suggest_mappings(inspection: WorkbookInspection) -> tuple[MappingSuggestion, ...]:
    normalized_aliases = {
        field: {_normalize(alias) for alias in aliases}
        for field, aliases in HEADER_ALIASES.items()
    }
    suggestions: list[MappingSuggestion] = []
    seen: set[tuple[str, str, int, int]] = set()
    for sheet in inspection.sheets:
        for header_area in sheet.candidateHeaderAreas:
            for cell in header_area.cells:
                normalized = _normalize(cell.value)
                for field, aliases in normalized_aliases.items():
                    if normalized not in aliases:
                        continue
                    key = (field, sheet.name, cell.row, cell.column)
                    if key in seen:
                        continue
                    seen.add(key)
                    suggestions.append(
                        MappingSuggestion(
                            canonicalField=field,
                            source=ColumnSource(
                                kind="column", header=str(cell.value).strip()
                            ),
                            certainty=1.0,
                            evidence=SuggestionEvidence(
                                sheet=sheet.name,
                                row=cell.row,
                                column=cell.column,
                                cell=cell.cell,
                                rawHeader=str(cell.value),
                                normalizedHeader=normalized,
                            ),
                        )
                    )
    return tuple(
        sorted(
            suggestions,
            key=lambda item: (
                item.canonicalField,
                item.evidence.sheet,
                item.evidence.row,
                item.evidence.column,
            ),
        )
    )
