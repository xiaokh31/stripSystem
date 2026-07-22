#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import Any

import xlrd
from xlrd.compdoc import CompDoc


STANDARD_HEADERS = {"DATE", "HOURS", "LUNCH HOURS", "START TIME", "END TIME"}
EXPECTED_SHEET_ORDER = [
    "Rui Zhou",
    "FANGLEI XIAO (lay)",
    "MANDEEP KAUR",
    "HAO LIU",
    "SIMRAN",
    "司机WeiSheng Hong",
    "BALIHAR SINGH(年轻印)",
    "CHUNYAN LIANG",
    "JIANMING ZHANG",
    "Wei Deng",
]
SHEET_TARGET_STATUS = {
    "FANGLEI XIAO (lay)": "MATCHED",
    "Rui Zhou": "UNMATCHED",
    "MANDEEP KAUR": "MATCHED",
    "HAO LIU": "MATCHED",
    "SIMRAN": "MATCHED",
    "BALIHAR SINGH(年轻印)": "MATCHED",
    "CHUNYAN LIANG": "MATCHED",
    "司机WeiSheng Hong": "UNSUPPORTED_CONTRACT",
    "JIANMING ZHANG": "UNMATCHED",
    "Wei Deng": "MATCHED",
}
REQUIRED_FILES = {
    "template": "template.xls",
    "worker": "worker-generated-wage-record.xls",
    "api": "api-downloaded-wage-record.xls",
    "afterDelete": "api-downloaded-after-delete.xls",
}
PRINT_RECORD_IDS = {
    "HEADER": 0x0014,
    "FOOTER": 0x0015,
    "DEFINED_NAME": 0x0018,
    "VERTICAL_PAGE_BREAKS": 0x001A,
    "HORIZONTAL_PAGE_BREAKS": 0x001B,
    "LEFT_MARGIN": 0x0026,
    "RIGHT_MARGIN": 0x0027,
    "TOP_MARGIN": 0x0028,
    "BOTTOM_MARGIN": 0x0029,
    "HCENTER": 0x0083,
    "VCENTER": 0x0084,
    "SETUP": 0x00A1,
}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: audit-wage-workbooks SOURCE_DIR OUTPUT_JSON")
    source_dir = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    paths = {name: source_dir / filename for name, filename in REQUIRED_FILES.items()}
    for path in paths.values():
        if not path.is_file() or path.stat().st_size == 0:
            raise SystemExit(f"missing required workbook: {path}")

    workbooks = {
        name: xlrd.open_workbook(path, formatting_info=True)
        for name, path in paths.items()
    }
    template = workbooks["template"]
    expected_sheet_names = EXPECTED_SHEET_ORDER
    if template.sheet_names() != expected_sheet_names:
        raise AssertionError(
            f"unexpected template sheet order: {template.sheet_names()}"
        )
    for name, workbook in workbooks.items():
        if workbook.sheet_names() != expected_sheet_names:
            raise AssertionError(f"{name} changed sheet count/order")

    report: dict[str, Any] = {
        "schemaVersion": 1,
        "result": "PASS",
        "comparisonContract": (
            "Every cell on every sheet compares normalized font/fill/border/"
            "alignment/number-format/protection; raw XF ids are not compared."
        ),
        "files": {},
        "sheetOrder": expected_sheet_names,
        "sheetClassifications": SHEET_TARGET_STATUS,
        "printMetadata": {},
        "sheets": [],
    }

    for name, path in paths.items():
        report["files"][name] = {
            "filename": path.name,
            "sha256": _sha256(path),
            "sizeBytes": path.stat().st_size,
            "sheetCount": workbooks[name].nsheets,
        }
        report["printMetadata"][name] = _print_record_inventory(path)

    if report["files"]["worker"]["sha256"] != report["files"]["api"]["sha256"]:
        raise AssertionError("API download bytes differ from the Worker-created file")
    report["workerApiByteIdentical"] = True

    template_print = report["printMetadata"]["template"]
    for name in ("worker", "api", "afterDelete"):
        if report["printMetadata"][name] != template_print:
            raise AssertionError(f"{name} changed print/page BIFF metadata")

    unchanged_sheets = {
        name for name, status in SHEET_TARGET_STATUS.items() if status != "MATCHED"
    }
    for sheet_name in expected_sheet_names:
        source_sheet = template.sheet_by_name(sheet_name)
        source_style_hash = _style_grid_hash(template, source_sheet)
        source_structure = _structure(source_sheet)
        source_values_hash = _value_grid_hash(source_sheet)
        comparisons: dict[str, Any] = {}
        for workbook_name in ("worker", "api", "afterDelete"):
            workbook = workbooks[workbook_name]
            sheet = workbook.sheet_by_name(sheet_name)
            style_differences = _style_differences(
                template, source_sheet, workbook, sheet
            )
            structure = _structure(sheet)
            if style_differences:
                raise AssertionError(
                    f"{workbook_name}/{sheet_name} changed normalized styles: "
                    f"{style_differences[:10]}"
                )
            if structure != source_structure:
                raise AssertionError(
                    f"{workbook_name}/{sheet_name} changed sheet dimensions/structure"
                )
            values_hash = _value_grid_hash(sheet)
            if sheet_name in unchanged_sheets and values_hash != source_values_hash:
                raise AssertionError(
                    f"{workbook_name}/{sheet_name} changed an unmatched/special sheet"
                )
            comparisons[workbook_name] = {
                "normalizedStyleGridSha256": _style_grid_hash(workbook, sheet),
                "normalizedStyleDifferences": [],
                "structureMatchesTemplate": True,
                "valueGridSha256": values_hash,
                "unchangedValuesRequired": sheet_name in unchanged_sheets,
                "unchangedValuesVerified": (
                    values_hash == source_values_hash
                    if sheet_name in unchanged_sheets
                    else None
                ),
            }
        report["sheets"].append(
            {
                "name": sheet_name,
                "targetStatus": SHEET_TARGET_STATUS[sheet_name],
                "headers": _headers(source_sheet),
                "structure": source_structure,
                "styleCellCount": source_sheet.nrows * source_sheet.ncols,
                "templateNormalizedStyleGridSha256": source_style_hash,
                "templateValueGridSha256": source_values_hash,
                "comparisons": comparisons,
            }
        )

    worker = workbooks["worker"]
    after_delete = workbooks["afterDelete"]
    deletion_differences: list[dict[str, Any]] = []
    changed_sheets: set[str] = set()
    for sheet_name in expected_sheet_names:
        before_sheet = worker.sheet_by_name(sheet_name)
        after_sheet = after_delete.sheet_by_name(sheet_name)
        for row_index in range(before_sheet.nrows):
            for column_index in range(before_sheet.ncols):
                before_value = before_sheet.cell_value(row_index, column_index)
                after_value = after_sheet.cell_value(row_index, column_index)
                if before_value != after_value:
                    changed_sheets.add(sheet_name)
                    deletion_differences.append(
                        {
                            "sheet": sheet_name,
                            "row": row_index + 1,
                            "column": column_index + 1,
                            "before": _jsonable(before_value),
                            "after": _jsonable(after_value),
                        }
                    )
    if len(changed_sheets) != 1:
        raise AssertionError(
            f"one deleted employee-day must affect exactly one sheet: {changed_sheets}"
        )
    changed_sheet = next(iter(changed_sheets))
    if SHEET_TARGET_STATUS[changed_sheet] != "MATCHED":
        raise AssertionError("deleted row changed a non-eligible sheet")
    if len(deletion_differences) < 2:
        raise AssertionError("deleted row did not change day values and total")
    report["deletedRowWorkbookDelta"] = {
        "changedSheets": sorted(changed_sheets),
        "changedCellCount": len(deletion_differences),
        "changedCells": deletion_differences,
        "otherSheetsUnchanged": True,
    }

    source_deng = template.sheet_by_name("Wei Deng")
    for name in ("worker", "api", "afterDelete"):
        generated_deng = workbooks[name].sheet_by_name("Wei Deng")
        if generated_deng.row_values(3) != source_deng.row_values(3):
            raise AssertionError(f"{name} overwrote the Wei Deng adjustment row")
    report["weiDengAdjustmentRowPreserved"] = True

    evidence_manifest_path = source_dir.parent / "evidence-manifest.json"
    if not evidence_manifest_path.is_file():
        raise AssertionError("missing real API evidence manifest")
    evidence_manifest = json.loads(evidence_manifest_path.read_text(encoding="utf-8"))
    if evidence_manifest.get("fixture", {}).get("employeeCount") != 13:
        raise AssertionError("evidence manifest does not prove 13 employees")
    if evidence_manifest.get("fixture", {}).get("rowCount") != 390:
        raise AssertionError("evidence manifest does not prove 390 rows")
    if evidence_manifest.get("deletion", {}).get("activeRowCount") != 389:
        raise AssertionError("evidence manifest does not prove one soft deletion")
    report["apiEvidenceManifestVerified"] = True

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "result": "PASS",
        "sheetCount": len(expected_sheet_names),
        "matchedSheetCount": sum(
            status == "MATCHED" for status in SHEET_TARGET_STATUS.values()
        ),
        "styleDifferences": 0,
        "deletedRowChangedSheet": changed_sheet,
        "output": str(output_path),
    }, ensure_ascii=False))


def _headers(sheet: Any) -> list[dict[str, Any]]:
    return [
        {"row": row + 1, "column": column + 1, "value": str(value)}
        for row in range(sheet.nrows)
        for column in range(sheet.ncols)
        if (value := sheet.cell_value(row, column))
        and str(value).strip().upper() in STANDARD_HEADERS
    ]


def _structure(sheet: Any) -> dict[str, Any]:
    return {
        "rows": sheet.nrows,
        "columns": sheet.ncols,
        "mergedRanges": [list(item) for item in sorted(sheet.merged_cells)],
        "rowDimensions": {
            str(index + 1): {
                "heightTwips": info.height,
                "hidden": bool(info.hidden),
                "outlineLevel": info.outline_level,
            }
            for index, info in sorted(sheet.rowinfo_map.items())
        },
        "columnDimensions": {
            str(index + 1): {
                "widthUnits": info.width,
                "hidden": bool(info.hidden),
                "outlineLevel": info.outline_level,
                "collapsed": bool(info.collapsed),
            }
            for index, info in sorted(sheet.colinfo_map.items())
        },
        "visibility": sheet.visibility,
        "horizontalPageBreaks": _jsonable(sheet.horizontal_page_breaks),
        "verticalPageBreaks": _jsonable(sheet.vertical_page_breaks),
        "panesFrozen": bool(sheet.panes_are_frozen),
        "horizontalSplit": sheet.horz_split_pos,
        "verticalSplit": sheet.vert_split_pos,
    }


def _style_differences(
    left_workbook: Any,
    left_sheet: Any,
    right_workbook: Any,
    right_sheet: Any,
) -> list[dict[str, int]]:
    differences: list[dict[str, int]] = []
    for row in range(left_sheet.nrows):
        for column in range(left_sheet.ncols):
            if _normalized_style(left_workbook, left_sheet, row, column) != _normalized_style(
                right_workbook, right_sheet, row, column
            ):
                differences.append({"row": row + 1, "column": column + 1})
    return differences


def _style_grid_hash(workbook: Any, sheet: Any) -> str:
    values = [
        _normalized_style(workbook, sheet, row, column)
        for row in range(sheet.nrows)
        for column in range(sheet.ncols)
    ]
    return _canonical_hash(values)


def _value_grid_hash(sheet: Any) -> str:
    return _canonical_hash(
        [
            [_jsonable(sheet.cell_value(row, column)) for column in range(sheet.ncols)]
            for row in range(sheet.nrows)
        ]
    )


def _normalized_style(workbook: Any, sheet: Any, row: int, column: int) -> Any:
    xf = workbook.xf_list[sheet.cell_xf_index(row, column)]
    font = workbook.font_list[xf.font_index]
    return _jsonable(
        {
            "font": {key: value for key, value in vars(font).items() if key != "font_index"},
            "fontColor": workbook.colour_map.get(font.colour_index),
            "fill": vars(xf.background),
            "patternColor": workbook.colour_map.get(
                xf.background.pattern_colour_index
            ),
            "backgroundColor": workbook.colour_map.get(
                xf.background.background_colour_index
            ),
            "border": vars(xf.border),
            "alignment": vars(xf.alignment),
            "numberFormat": workbook.format_map[xf.format_key].format_str,
            "protection": vars(xf.protection),
        }
    )


def _print_record_inventory(path: Path) -> dict[str, Any]:
    stream = _workbook_stream(path)
    records: dict[str, list[str]] = {name: [] for name in PRINT_RECORD_IDS}
    position = 0
    by_id = {record_id: name for name, record_id in PRINT_RECORD_IDS.items()}
    while position + 4 <= len(stream):
        record_id, payload_size = struct.unpack_from("<HH", stream, position)
        payload = stream[position + 4 : position + 4 + payload_size]
        if record_id in by_id:
            records[by_id[record_id]].append(hashlib.sha256(payload).hexdigest())
        position += 4 + payload_size
    return records


def _workbook_stream(path: Path) -> bytes:
    document = CompDoc(path.read_bytes(), logfile=open("/dev/null", "w"))
    stream, _, _ = document.locate_named_stream("Workbook")
    return bytes(stream)


def _canonical_hash(value: Any) -> str:
    payload = json.dumps(
        _jsonable(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in sorted(value.items(), key=lambda item: str(item[0]))}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, bytes):
        return value.hex()
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


if __name__ == "__main__":
    main()
