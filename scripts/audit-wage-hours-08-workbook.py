#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date, datetime, timedelta
from pathlib import Path

import xlrd


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

    expected_dates = set(period_dates(args.period_start, args.period_end))
    complete_period_sheets = 0
    period_date_cells = 0
    positive_hour_cells = 0
    for sheet in generated.sheets():
        header = standard_header(sheet)
        if header is None:
            continue
        header_row, date_column, hours_column = header
        found_dates: set[date] = set()
        for row in range(header_row + 1, sheet.nrows):
            work_date = cell_date(
                sheet.cell_value(row, date_column), generated.datemode
            )
            if work_date not in expected_dates:
                continue
            found_dates.add(work_date)
            period_date_cells += 1
            hours = sheet.cell_value(row, hours_column)
            if isinstance(hours, (int, float)) and hours > 0:
                positive_hour_cells += 1
        if found_dates == expected_dates:
            complete_period_sheets += 1

    if complete_period_sheets <= 0:
        raise SystemExit("no generated sheet contains the complete target period")
    if positive_hour_cells <= 0:
        raise SystemExit("generated workbook contains no positive period hours")
    evidence = {
        "schemaVersion": 1,
        "result": "PASS",
        "sha256": sha256(workbook_path),
        "sizeBytes": workbook_path.stat().st_size,
        "periodStart": args.period_start.isoformat(),
        "periodEnd": args.period_end.isoformat(),
        "sheetCount": generated.nsheets,
        "completePeriodSheetCount": complete_period_sheets,
        "periodDateCellCount": period_date_cells,
        "positiveHourCellCount": positive_hour_cells,
        "templateSha256": sha256(template_path),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(evidence, ensure_ascii=False, sort_keys=True))


def period_dates(start: date, end: date) -> list[date]:
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def standard_header(sheet) -> tuple[int, int, int] | None:
    for row in range(min(sheet.nrows, 20)):
        values = {
            str(sheet.cell_value(row, column)).strip().upper(): column
            for column in range(sheet.ncols)
        }
        if "DATE" in values and "HOURS" in values:
            return row, values["DATE"], values["HOURS"]
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


if __name__ == "__main__":
    main()
