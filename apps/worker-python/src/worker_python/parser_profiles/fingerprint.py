from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from worker_python.parser_profiles.contracts import (
    FingerprintDefinition,
    FingerprintReason,
    InspectedCell,
    RankedMatches,
    SheetInspection,
    StructuralFingerprint,
    WorkbookInspection,
)
from worker_python.parser_profiles.normalization import normalize_header as _normalize


def build_structural_fingerprint(
    inspection: WorkbookInspection,
    definition: FingerprintDefinition,
) -> StructuralFingerprint:
    reasons: list[FingerprintReason] = []
    structural_evidence: dict[str, Any] = {
        "workbookType": inspection.workbookType,
        "sheet": definition.sheet.model_dump(mode="json"),
        "anchors": [],
        "requiredRelativeColumns": [],
        "dataStart": definition.dataStart.model_dump(mode="json"),
        "dataStop": definition.dataStop.model_dump(mode="json")
        if definition.dataStop
        else None,
    }

    if inspection.workbookType != definition.workbookType:
        reasons.append(
            FingerprintReason(
                code="FINGERPRINT_WORKBOOK_TYPE_MISMATCH",
                matched=False,
                params={
                    "expected": definition.workbookType,
                    "observed": inspection.workbookType,
                },
            )
        )

    sheet = _selected_sheet(inspection, definition)
    if sheet is None:
        reasons.append(
            FingerprintReason(
                code="FINGERPRINT_SHEET_MISSING",
                matched=False,
                params=definition.sheet.model_dump(mode="json"),
            )
        )
        return _result(definition, reasons, structural_evidence)

    structural_evidence["sheet"] = {
        "name": sheet.name,
        "index": sheet.index,
        "visibility": sheet.visibility,
        "headerMergedRanges": _header_merged_ranges(sheet, definition),
    }
    anchor_cells: dict[str, InspectedCell] = {}
    for anchor in definition.anchors:
        match = _find_anchor(
            sheet,
            anchor.value,
            anchor.row,
            anchor.column,
            anchor.rowTolerance,
            anchor.columnTolerance,
        )
        if match is None:
            if anchor.required:
                reasons.append(
                    FingerprintReason(
                        code="FINGERPRINT_REQUIRED_ANCHOR_MISSING",
                        matched=False,
                        params={
                            "anchor": _normalize(anchor.value),
                            "row": anchor.row,
                            "column": anchor.column,
                            "rowTolerance": anchor.rowTolerance,
                            "columnTolerance": anchor.columnTolerance,
                        },
                    )
                )
            continue
        normalized = _normalize(anchor.value)
        anchor_cells[normalized] = match
        structural_evidence["anchors"].append(
            {"value": normalized, "row": match.row, "column": match.column}
        )
        reasons.append(
            FingerprintReason(
                code="FINGERPRINT_ANCHOR_MATCHED",
                matched=True,
                params={"anchor": normalized, "cell": match.cell},
            )
        )

    for relative in definition.requiredRelativeColumns:
        anchor_cell = anchor_cells.get(_normalize(relative.anchor))
        target = _find_header_on_row(
            sheet,
            relative.header,
            anchor_cell.row if anchor_cell else None,
        )
        observed_offset = (
            target.column - anchor_cell.column
            if target is not None and anchor_cell is not None
            else None
        )
        matched = observed_offset == relative.offset
        sampled_values = _column_value_evidence(
            sheet,
            column=target.column if target is not None else None,
            start_row=(
                target.row + definition.dataStart.rowOffsetFromHeader
                if target is not None
                else None
            ),
        )
        observed_types = sorted(
            {
                (
                    (cell.cachedValueType or "unknown")
                    if cell.isFormula and cell.hasCachedValue
                    else "formula_cache_missing"
                    if cell.isFormula
                    else cell.valueType
                )
                for cell in sampled_values
                if cell.valueType != "blank"
            }
        )
        missing_formula_cache = any(
            cell.isFormula and not cell.hasCachedValue for cell in sampled_values
        )
        structural_evidence["requiredRelativeColumns"].append(
            {
                "anchor": _normalize(relative.anchor),
                "header": _normalize(relative.header),
                "offset": observed_offset,
                "expectedValueTypes": sorted(relative.expectedValueTypes),
                "observedValueTypes": observed_types,
                "requireCachedFormula": relative.requireCachedFormula,
                "formulaCacheMissing": missing_formula_cache,
            }
        )
        if not matched:
            reasons.append(
                FingerprintReason(
                    code="FINGERPRINT_RELATIVE_COLUMN_MISMATCH",
                    matched=False,
                    params={
                        "anchor": _normalize(relative.anchor),
                        "header": _normalize(relative.header),
                        "expectedOffset": relative.offset,
                        "observedOffset": observed_offset,
                    },
                )
            )
            continue
        if relative.expectedValueTypes and (
            not observed_types
            or any(
                observed not in relative.expectedValueTypes
                for observed in observed_types
                if observed != "formula_cache_missing"
            )
        ):
            reasons.append(
                FingerprintReason(
                    code="FINGERPRINT_COLUMN_TYPE_MISMATCH",
                    matched=False,
                    params={
                        "header": _normalize(relative.header),
                        "expected": sorted(relative.expectedValueTypes),
                        "observed": observed_types,
                    },
                )
            )
        if relative.requireCachedFormula and missing_formula_cache:
            reasons.append(
                FingerprintReason(
                    code="FINGERPRINT_FORMULA_CACHE_MISSING",
                    matched=False,
                    params={"header": _normalize(relative.header)},
                )
            )

    header_row = max((cell.row for cell in anchor_cells.values()), default=None)
    expected_data_start_row = (
        header_row + definition.dataStart.rowOffsetFromHeader
        if header_row is not None
        else None
    )
    data_start_matched = expected_data_start_row is not None and any(
        cell.row == expected_data_start_row for cell in sheet.sampleCells
    )
    structural_evidence["dataStart"] = {
        "rowOffsetFromHeader": definition.dataStart.rowOffsetFromHeader,
        "matched": data_start_matched,
    }
    if not data_start_matched:
        reasons.append(
            FingerprintReason(
                code="FINGERPRINT_DATA_START_MISMATCH",
                matched=False,
                params={"expectedRow": expected_data_start_row},
            )
        )

    if definition.dataStop is not None:
        stop_header = _find_header_on_row(sheet, definition.dataStop.header, header_row)
        stop_cell = next(
            (
                cell
                for cell in sheet.sampleCells
                if stop_header is not None
                and expected_data_start_row is not None
                and cell.column == stop_header.column
                and cell.row >= expected_data_start_row
                and _normalize(cell.value) == _normalize(definition.dataStop.value)
            ),
            None,
        )
        structural_evidence["dataStop"] = {
            "header": _normalize(definition.dataStop.header),
            "value": _normalize(definition.dataStop.value),
            "matched": stop_cell is not None,
        }
        if stop_cell is None:
            reasons.append(
                FingerprintReason(
                    code="FINGERPRINT_DATA_STOP_MISMATCH",
                    matched=False,
                    params={
                        "header": _normalize(definition.dataStop.header),
                        "value": _normalize(definition.dataStop.value),
                    },
                )
            )

    structural_evidence["anchors"] = sorted(
        structural_evidence["anchors"],
        key=lambda item: (item["row"], item["column"], item["value"]),
    )
    structural_evidence["requiredRelativeColumns"] = sorted(
        structural_evidence["requiredRelativeColumns"],
        key=lambda item: (item["anchor"], item["header"]),
    )
    return _result(definition, reasons, structural_evidence)


def rank_profile_matches(
    inspection: WorkbookInspection,
    definitions: list[FingerprintDefinition] | tuple[FingerprintDefinition, ...],
) -> RankedMatches:
    candidates = [
        build_structural_fingerprint(inspection, definition)
        for definition in definitions
    ]
    candidates.sort(
        key=lambda item: (
            not item.matched,
            -sum(reason.matched for reason in item.reasons),
            item.profileId,
        )
    )
    matched = [candidate for candidate in candidates if candidate.matched]
    if not matched:
        return RankedMatches(
            candidates=tuple(candidates),
            selectedProfileId=None,
            issueCode="FINGERPRINT_NO_MATCH",
        )
    if len(matched) > 1:
        return RankedMatches(
            candidates=tuple(candidates),
            selectedProfileId=None,
            issueCode="FINGERPRINT_PROFILE_COLLISION",
        )
    return RankedMatches(
        candidates=tuple(candidates),
        selectedProfileId=matched[0].profileId,
        issueCode=None,
    )


def _selected_sheet(
    inspection: WorkbookInspection,
    definition: FingerprintDefinition,
) -> SheetInspection | None:
    if definition.sheet.name is not None:
        return next(
            (
                sheet
                for sheet in inspection.sheets
                if sheet.name == definition.sheet.name
            ),
            None,
        )
    return next(
        (sheet for sheet in inspection.sheets if sheet.index == definition.sheet.index),
        None,
    )


def _find_anchor(
    sheet: SheetInspection,
    value: str,
    row: int,
    column: int,
    row_tolerance: int,
    column_tolerance: int,
) -> InspectedCell | None:
    normalized = _normalize(value)
    candidates = [
        cell
        for cell in sheet.sampleCells
        if _normalize(cell.value) == normalized
        and abs(cell.row - row) <= row_tolerance
        and abs(cell.column - column) <= column_tolerance
    ]
    return min(
        candidates,
        key=lambda cell: (
            abs(cell.row - row) + abs(cell.column - column),
            cell.row,
            cell.column,
        ),
        default=None,
    )


def _find_header_on_row(
    sheet: SheetInspection,
    value: str,
    row: int | None,
) -> InspectedCell | None:
    if row is None:
        return None
    normalized = _normalize(value)
    return next(
        (
            cell
            for cell in sheet.sampleCells
            if cell.row == row and _normalize(cell.value) == normalized
        ),
        None,
    )


def _column_value_evidence(
    sheet: SheetInspection,
    *,
    column: int | None,
    start_row: int | None,
) -> tuple[InspectedCell, ...]:
    if column is None or start_row is None:
        return ()
    return tuple(
        cell
        for cell in sheet.sampleCells
        if cell.column == column and cell.row >= start_row
    )[:20]


def _header_merged_ranges(
    sheet: SheetInspection,
    definition: FingerprintDefinition,
) -> list[str]:
    last_header_row = max(
        anchor.row + anchor.rowTolerance for anchor in definition.anchors
    )
    result: list[str] = []
    for merged_range in sheet.mergedRanges:
        row_numbers = [int(value) for value in re.findall(r"\d+", merged_range)]
        if row_numbers and min(row_numbers) <= last_header_row:
            result.append(merged_range)
    return sorted(result)


def _result(
    definition: FingerprintDefinition,
    reasons: list[FingerprintReason],
    structural_evidence: dict[str, Any],
) -> StructuralFingerprint:
    required_failures = any(not reason.matched for reason in reasons)
    canonical = json.dumps(
        {
            "algorithmVersion": definition.algorithmVersion,
            "workbookType": structural_evidence.get("workbookType"),
            "sheet": structural_evidence.get("sheet"),
            "anchors": structural_evidence.get("anchors", []),
            "requiredRelativeColumns": structural_evidence.get(
                "requiredRelativeColumns", []
            ),
            "dataStart": structural_evidence.get("dataStart"),
            "dataStop": structural_evidence.get("dataStop"),
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return StructuralFingerprint(
        profileId=definition.profileId,
        algorithmVersion=definition.algorithmVersion,
        hash=f"sha256:{digest}",
        matched=not required_failures,
        reasons=tuple(reasons),
        structuralEvidence=structural_evidence,
    )
