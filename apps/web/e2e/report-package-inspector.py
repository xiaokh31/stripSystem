from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
DESTINATION_ROWS = (4, 6, 8, 10, 12, 14, 16, 18, 5, 7, 9, 11, 13, 15, 17, 19)


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def normalized_properties(properties: ET.Element) -> list[object]:
    result: list[object] = []
    for child in properties:
        attributes = dict(child.attrib)
        if local_name(child.tag) == "b" and "val" not in attributes:
            attributes["val"] = "1"
        result.append(
            [local_name(child.tag), sorted(attributes.items()), child.text or ""]
        )
    return sorted(result)


def normalized_attribute_items(attributes: dict[str, str]) -> list[object]:
    result: list[object] = []
    for name, value in sorted(attributes.items()):
        try:
            normalized: object = round(float(value), 12)
        except ValueError:
            normalized = value
        result.append([name, normalized])
    return result


def standards_runs(archive: ZipFile, sheet: ET.Element) -> list[object]:
    cell = sheet.find(".//m:c[@r='C21']", NS)
    if cell is None:
        raise AssertionError("Missing Standards cell C21")
    string_node = cell.find("m:is", NS)
    if cell.attrib.get("t") == "s":
        value = cell.find("m:v", NS)
        if value is None or value.text is None:
            raise AssertionError("Missing shared-string index for Standards cell")
        shared_strings = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        string_node = shared_strings.findall("m:si", NS)[int(value.text)]
    if string_node is None:
        raise AssertionError("Missing rich-text node for Standards cell")

    runs: list[object] = []
    for run in string_node.findall("m:r", NS):
        properties = run.find("m:rPr", NS)
        if properties is None:
            raise AssertionError("Standards run is missing rPr")
        runs.append(
            [
                "".join(node.text or "" for node in run.findall("m:t", NS)),
                normalized_properties(properties),
            ]
        )
    if not runs:
        raise AssertionError("Standards cell is not stored as rich-text runs")
    return runs


def cell_text(archive: ZipFile, sheet: ET.Element, coordinate: str) -> str:
    cell = sheet.find(f".//m:c[@r='{coordinate}']", NS)
    if cell is None:
        return ""
    inline = cell.find("m:is", NS)
    if inline is not None:
        return "".join(node.text or "" for node in inline.findall(".//m:t", NS))
    value = cell.find("m:v", NS)
    if value is None or value.text is None:
        return ""
    if cell.attrib.get("t") != "s":
        return value.text
    shared_strings = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    shared = shared_strings.findall("m:si", NS)[int(value.text)]
    return "".join(node.text or "" for node in shared.findall(".//m:t", NS))


def column_widths(sheet: ET.Element) -> dict[str, float | None]:
    widths: dict[str, float | None] = {}
    for column_index, column_name in enumerate("BCDEFGHIJKLMNOP", start=2):
        width = None
        for column in sheet.findall("m:cols/m:col", NS):
            if int(column.attrib["min"]) <= column_index <= int(column.attrib["max"]):
                raw_width = column.attrib.get("width")
                width = round(float(raw_width), 12) if raw_width is not None else None
                break
        widths[column_name] = width
    return widths


def sheet_layout(sheet: ET.Element) -> dict[str, object]:
    dimension = sheet.find("m:dimension", NS)
    setup = sheet.find("m:pageSetup", NS)
    setup_properties = sheet.find("m:sheetPr/m:pageSetUpPr", NS)
    margins = sheet.find("m:pageMargins", NS)
    row_heights = {
        row.attrib["r"]: row.attrib.get("ht")
        for row in sheet.findall("m:sheetData/m:row", NS)
        if 1 <= int(row.attrib["r"]) <= 25
    }
    row_breaks = sheet.findall("m:rowBreaks/m:brk", NS)
    column_breaks = sheet.findall("m:colBreaks/m:brk", NS)
    return {
        "columnWidths": column_widths(sheet),
        "dimension": dimension.attrib.get("ref") if dimension is not None else None,
        "margins": (
            normalized_attribute_items(margins.attrib) if margins is not None else []
        ),
        "merges": sorted(
            item.attrib["ref"]
            for item in sheet.findall("m:mergeCells/m:mergeCell", NS)
        ),
        "pageSetup": (
            normalized_attribute_items(setup.attrib) if setup is not None else []
        ),
        "pageSetupProperties": (
            normalized_attribute_items(setup_properties.attrib)
            if setup_properties is not None
            else []
        ),
        "rowHeights": {
            row: round(float(height), 12) if height is not None else None
            for row, height in row_heights.items()
        },
        "manualBreakCount": len(row_breaks) + len(column_breaks),
    }


def attribute_dict(items: list[object]) -> dict[str, object]:
    return {str(item[0]): item[1] for item in items}  # type: ignore[index]


def rows_never_shrink(
    expected: dict[str, object],
    generated: dict[str, object],
) -> bool:
    expected_heights = expected["rowHeights"]
    generated_heights = generated["rowHeights"]
    if not isinstance(expected_heights, dict) or not isinstance(
        generated_heights, dict
    ):
        return False
    return all(
        float(generated_heights.get(row) or 0) >= float(height or 0)
        for row, height in expected_heights.items()
    )


def page_contract_matches(layout: dict[str, object]) -> bool:
    setup_items = layout["pageSetup"]
    properties_items = layout["pageSetupProperties"]
    if not isinstance(setup_items, list) or not isinstance(properties_items, list):
        return False
    setup = attribute_dict(setup_items)
    properties = attribute_dict(properties_items)
    return (
        setup.get("paperSize") == 9.0
        and setup.get("orientation") == "landscape"
        and setup.get("scale") == 78.0
        and setup.get("fitToWidth") == 1.0
        and setup.get("fitToHeight") == 1.0
        and properties.get("fitToPage") == 1.0
        and properties.get("autoPageBreaks") == 0.0
        and layout.get("printArea") == "$B$1:$P$25"
        and layout.get("manualBreakCount") == 0
    )


def immutable_layout_matches(
    expected: dict[str, object],
    generated: dict[str, object],
) -> bool:
    return (
        generated.get("columnWidths") == expected.get("columnWidths")
        and generated.get("dimension") == expected.get("dimension")
        and generated.get("margins") == expected.get("margins")
        and generated.get("merges") == expected.get("merges")
        and rows_never_shrink(expected, generated)
        and page_contract_matches(generated)
    )


def populated_sheets(archive: ZipFile) -> list[ET.Element]:
    sheets: list[ET.Element] = []
    for name in sorted(archive.namelist()):
        if not re.fullmatch(r"xl/worksheets/sheet[0-9]+\.xml", name):
            continue
        sheet = ET.fromstring(archive.read(name))
        dimension = sheet.find("m:dimension", NS)
        if dimension is not None and dimension.attrib.get("ref") not in {"A1", "A1:A1"}:
            sheets.append(sheet)
    return sheets


def print_areas(archive: ZipFile, sheet_count: int) -> list[str | None]:
    areas: list[str | None] = [None] * sheet_count
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    for defined_name in workbook.findall("m:definedNames/m:definedName", NS):
        if defined_name.attrib.get("name") != "_xlnm.Print_Area":
            continue
        local_sheet_id = int(defined_name.attrib["localSheetId"])
        if local_sheet_id >= sheet_count or defined_name.text is None:
            continue
        areas[local_sheet_id] = defined_name.text.split("!", 1)[-1]
    return areas


def inspect(generated_path: Path, template_path: Path) -> dict[str, object]:
    with ZipFile(template_path) as template_archive:
        template_sheets = populated_sheets(template_archive)
        template_sheet = template_sheets[0]
        expected_runs = standards_runs(template_archive, template_sheet)
        expected_layout = sheet_layout(template_sheet)
        expected_layout["printArea"] = print_areas(
            template_archive, len(template_sheets)
        )[0]

    with ZipFile(generated_path) as generated_archive:
        generated_sheets = populated_sheets(generated_archive)
        runs = [standards_runs(generated_archive, sheet) for sheet in generated_sheets]
        layouts = [sheet_layout(sheet) for sheet in generated_sheets]
        destinations = [
            [
                {
                    "cell": f"N{row}",
                    "value": cell_text(generated_archive, sheet, f"N{row}"),
                }
                for row in DESTINATION_ROWS
                if cell_text(generated_archive, sheet, f"N{row}")
            ]
            for sheet in generated_sheets
        ]
        generated_print_areas = print_areas(
            generated_archive, len(generated_sheets)
        )
        for layout, print_area in zip(layouts, generated_print_areas):
            layout["printArea"] = print_area

    text = "".join(run[0] for run in expected_runs)
    font_names = sorted(
        {
            attribute[1]
            for _, properties in expected_runs
            for name, attributes, _ in properties
            if name == "rFont"
            for attribute in attributes
            if attribute[0] == "val"
        }
    )
    font_sizes = sorted(
        {
            attribute[1]
            for _, properties in expected_runs
            for name, attributes, _ in properties
            if name == "sz"
            for attribute in attributes
            if attribute[0] == "val"
        },
        key=float,
    )
    rows_safe = [rows_never_shrink(expected_layout, layout) for layout in layouts]
    page_contracts = [page_contract_matches(layout) for layout in layouts]
    immutable_layouts = [
        immutable_layout_matches(expected_layout, layout) for layout in layouts
    ]
    expected_row_heights = expected_layout["rowHeights"]
    expected_standards_height = sum(
        float(expected_row_heights.get(str(row)) or 0)  # type: ignore[union-attr]
        for row in range(21, 26)
    )
    standards_heights = []
    for layout in layouts:
        row_heights = layout["rowHeights"]
        standards_heights.append(
            sum(
                float(row_heights.get(str(row)) or 0)  # type: ignore[union-attr]
                for row in range(21, 26)
            )
        )
    return {
        "allLayoutsMatchTemplate": all(immutable_layouts),
        "allPageContractsMatch": all(page_contracts),
        "allRowsNeverShrink": all(rows_safe),
        "allRunSequencesMatchTemplate": all(run == expected_runs for run in runs),
        "dimension": expected_layout["dimension"],
        "destinations": destinations,
        "endsWithWhenStored": text.endswith("when stored."),
        "fontNames": font_names,
        "fontSizes": font_sizes,
        "newlineCount": text.count("\n"),
        "runCount": len(expected_runs),
        "standardsHeightAtLeastTemplate": all(
            height >= expected_standards_height for height in standards_heights
        ),
        "standardsHeights": standards_heights,
        "templateStandardsHeight": expected_standards_height,
        "worksheetCount": len(generated_sheets),
    }


if __name__ == "__main__":
    generated, template = (Path(argument) for argument in sys.argv[1:3])
    print(json.dumps(inspect(generated, template), ensure_ascii=False))
