#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date, datetime, timedelta
from pathlib import Path

import xlrd


WEEKDAY_XF_INDEX = 83
WEEKEND_XF_INDEX = 87


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", required=True, type=Path)
    parser.add_argument("--template", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--period-start", required=True, type=date.fromisoformat)
    parser.add_argument("--period-end", required=True, type=date.fromisoformat)
    args = parser.parse_args()

    workbook_path = args.workbook.resolve()
    template_path = args.template.resolve()
    if not workbook_path.is_file() or workbook_path.stat().st_size <= 0:
        raise SystemExit("generated workbook is missing or empty")
    generated = xlrd.open_workbook(workbook_path, formatting_info=True)
    template = xlrd.open_workbook(template_path, formatting_info=True)
    if generated.nsheets != template.nsheets:
        raise SystemExit("generated workbook changed template sheet count")
    if "ADJUSTMENTS" not in generated.sheet_names():
        raise SystemExit("generated workbook removed the protected adjustment sheet")

    expected_date_list = period_dates(args.period_start, args.period_end)
    weekday_fill = xf_fill(template, WEEKDAY_XF_INDEX)
    weekend_fill = xf_fill(template, WEEKEND_XF_INDEX)
    if weekday_fill == weekend_fill or xf_without_fill(
        template, WEEKDAY_XF_INDEX
    ) != xf_without_fill(template, WEEKEND_XF_INDEX):
        raise SystemExit("approved weekday style contract is unsafe")

    complete_period_sheets = 0
    audited_period_sheets = 0
    period_date_cells = 0
    positive_hour_cells = 0
    weekend_cells = 0
    weekday_cells = 0
    blank_slot_cells = 0
    date_mismatches = 0
    weekday_text_mismatches = 0
    weekend_style_mismatches = 0
    weekday_style_mismatches = 0
    blank_slot_mismatches = 0
    non_fill_style_mismatches = 0
    non_weekday_column_style_mismatches = 0
    for sheet_index, sheet in enumerate(generated.sheets()):
        if sheet.name == "ADJUSTMENTS":
            continue
        header = standard_header(sheet)
        if header is None:
            continue
        _, weekday_column, date_column, hours_column = header
        template_sheet = template.sheet_by_index(sheet_index)
        rows = template_date_rows(template_sheet, weekday_column, date_column)
        actual_dates = [
            cell_date(sheet.cell_value(row, date_column), generated.datemode)
            for row in rows[: len(expected_date_list)]
        ]
        # Approved employee slots that were not assigned retain their template
        # name and DATE_SLOT placeholders. Ignore only those proven-unused slots;
        # every renamed/written sheet must contribute semantic mismatches instead
        # of disappearing from the audit when one of its dates is corrupt.
        if sheet.name == template_sheet.name and actual_dates != expected_date_list:
            continue
        audited_period_sheets += 1
        if actual_dates == expected_date_list:
            complete_period_sheets += 1
        for offset, row in enumerate(rows):
            if offset >= len(expected_date_list):
                blank_slot_cells += 1
                if (
                    str(sheet.cell_value(row, weekday_column)).strip()
                    or str(sheet.cell_value(row, date_column)).strip()
                    or cell_fill(generated, sheet, row, weekday_column) != weekday_fill
                ):
                    blank_slot_mismatches += 1
                continue

            expected_date = expected_date_list[offset]
            period_date_cells += 1
            actual_date = cell_date(
                sheet.cell_value(row, date_column), generated.datemode
            )
            if actual_date != expected_date:
                date_mismatches += 1
            if (
                str(sheet.cell_value(row, weekday_column)).strip().upper()
                != expected_date.strftime("%a").upper()
            ):
                weekday_text_mismatches += 1
            actual_fill = cell_fill(generated, sheet, row, weekday_column)
            if expected_date.weekday() >= 5:
                weekend_cells += 1
                if actual_fill != weekend_fill:
                    weekend_style_mismatches += 1
            else:
                weekday_cells += 1
                if actual_fill != weekday_fill:
                    weekday_style_mismatches += 1
            if cell_style_without_fill(
                generated, sheet, row, weekday_column
            ) != cell_style_without_fill(
                template, template_sheet, row, weekday_column
            ):
                non_fill_style_mismatches += 1
            hours = sheet.cell_value(row, hours_column)
            if isinstance(hours, (int, float)) and hours > 0:
                positive_hour_cells += 1

        for row in range(min(sheet.nrows, template_sheet.nrows)):
            for column in range(weekday_column + 1, min(sheet.ncols, template_sheet.ncols)):
                if cell_style(generated, sheet, row, column) != cell_style(
                    template, template_sheet, row, column
                ):
                    non_weekday_column_style_mismatches += 1

    if audited_period_sheets <= 0:
        raise SystemExit("no generated sheet contains the target period")
    if positive_hour_cells <= 0:
        raise SystemExit("generated workbook contains no positive period hours")
    special_sheet_unchanged = complete_sheet_inventory(
        generated, generated.sheet_by_name("ADJUSTMENTS")
    ) == complete_sheet_inventory(template, template.sheet_by_name("ADJUSTMENTS"))
    mismatch_total = sum(
        (
            date_mismatches,
            weekday_text_mismatches,
            weekend_style_mismatches,
            weekday_style_mismatches,
            blank_slot_mismatches,
            non_fill_style_mismatches,
            non_weekday_column_style_mismatches,
            0 if special_sheet_unchanged else 1,
        )
    )
    evidence = {
        "schemaVersion": 2,
        "result": "PASS" if mismatch_total == 0 else "FAIL",
        "sha256": sha256(workbook_path),
        "sizeBytes": workbook_path.stat().st_size,
        "periodStart": args.period_start.isoformat(),
        "periodEnd": args.period_end.isoformat(),
        "sheetCount": generated.nsheets,
        "completePeriodSheetCount": complete_period_sheets,
        "auditedPeriodSheetCount": audited_period_sheets,
        "periodDateCellCount": period_date_cells,
        "positiveHourCellCount": positive_hour_cells,
        "validDateCellCount": period_date_cells - date_mismatches,
        "weekendCellCount": weekend_cells,
        "weekdayCellCount": weekday_cells,
        "blankSlotCellCount": blank_slot_cells,
        "dateMismatchCount": date_mismatches,
        "weekdayTextMismatchCount": weekday_text_mismatches,
        "weekendStyleMismatchCount": weekend_style_mismatches,
        "weekdayStyleMismatchCount": weekday_style_mismatches,
        "blankSlotMismatchCount": blank_slot_mismatches,
        "nonFillStyleMismatchCount": non_fill_style_mismatches,
        "nonWeekdayColumnStyleMismatchCount": non_weekday_column_style_mismatches,
        "specialSheetUnchanged": special_sheet_unchanged,
        "styleMismatchCount": mismatch_total,
        "templateSha256": sha256(template_path),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(evidence, ensure_ascii=False, sort_keys=True))
    if mismatch_total:
        raise SystemExit(1)


def period_dates(start: date, end: date) -> list[date]:
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def standard_header(sheet) -> tuple[int, int, int, int] | None:
    for row in range(min(sheet.nrows, 20)):
        values = {
            str(sheet.cell_value(row, column)).strip().upper(): column
            for column in range(sheet.ncols)
        }
        if "DATE" in values and "HOURS" in values:
            if values["DATE"] <= 0:
                return None
            return row, values["DATE"] - 1, values["DATE"], values["HOURS"]
    return None


def cell_date(value: object, datemode: int) -> date | None:
    if isinstance(value, (int, float)) and value > 1:
        try:
            return xlrd.xldate_as_datetime(value, datemode).date()
        except (ValueError, OverflowError):
            return None
    text = str(value).strip()
    for pattern in ("%Y.%m.%d", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    return None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def template_date_rows(sheet, weekday_column: int, date_column: int) -> tuple[int, ...]:
    rows = tuple(
        row
        for row in range(sheet.nrows)
        if str(sheet.cell_value(row, weekday_column)).strip().upper() == "WEEKDAY_SLOT"
        and str(sheet.cell_value(row, date_column)).strip().upper() == "DATE_SLOT"
    )
    if len(rows) != 31:
        raise SystemExit("approved template date-slot contract changed")
    return rows


def xf_fill(workbook, xf_index: int):
    if not 0 <= xf_index < len(workbook.xf_list):
        raise SystemExit("approved weekday XF is out of range")
    return tuple(sorted(vars(workbook.xf_list[xf_index].background).items()))


def xf_without_fill(workbook, xf_index: int):
    xf = workbook.xf_list[xf_index]
    font = workbook.font_list[xf.font_index]
    return (
        tuple(sorted((key, value) for key, value in vars(font).items() if key != "font_index")),
        tuple(sorted(vars(xf.border).items())),
        tuple(sorted(vars(xf.alignment).items())),
        tuple(sorted(vars(xf.protection).items())),
        workbook.format_map[xf.format_key].format_str,
    )


def cell_fill(workbook, sheet, row: int, column: int):
    return xf_fill(workbook, sheet.cell_xf_index(row, column))


def cell_style_without_fill(workbook, sheet, row: int, column: int):
    return xf_without_fill(workbook, sheet.cell_xf_index(row, column))


def cell_style(workbook, sheet, row: int, column: int):
    xf_index = sheet.cell_xf_index(row, column)
    return xf_without_fill(workbook, xf_index), xf_fill(workbook, xf_index)


def complete_sheet_inventory(workbook, sheet):
    return {
        "values": tuple(
            tuple(sheet.cell_value(row, column) for column in range(sheet.ncols))
            for row in range(sheet.nrows)
        ),
        "styles": tuple(
            tuple(cell_style(workbook, sheet, row, column) for column in range(sheet.ncols))
            for row in range(sheet.nrows)
        ),
        "merges": tuple(sorted(tuple(value) for value in sheet.merged_cells)),
        "rows": tuple(
            sorted((row, tuple(sorted(vars(info).items()))) for row, info in sheet.rowinfo_map.items())
        ),
        "columns": tuple(
            sorted(
                (column, tuple(sorted(vars(info).items())))
                for column, info in sheet.colinfo_map.items()
            )
        ),
    }


if __name__ == "__main__":
    main()
