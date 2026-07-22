from __future__ import annotations

import struct
from dataclasses import replace
from datetime import datetime
from pathlib import Path

import xlrd
import xlwt
from xlrd.compdoc import CompDoc

from worker_python.imports import compute_sha256
from worker_python.wage import generate_wage_record, parse_attendance_workbook
from worker_python.wage.legacy_xls import (
    MAX_COLUMN_WIDTH_CHARS,
    MAX_ROW_HEIGHT_TWIPS,
    XLS_COLUMN_WIDTH_UNIT,
    LegacyXlsTemplateEditor,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
WAGE_DIR = REPO_ROOT / "samples" / "wage"
ATTENDANCE_FIXTURE = WAGE_DIR / "workAttendanceRecordForm_June.xls"
WAGE_TEMPLATE = WAGE_DIR / "20260601-0630_wageRecords.xls"
STANDARD_HEADERS = {"DATE", "HOURS", "LUNCH HOURS", "START TIME", "END TIME"}
WEEKDAYS = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}
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


def test_real_wage_template_preserves_all_sheet_structure_and_touched_styles(
    tmp_path: Path,
) -> None:
    template_sha = compute_sha256(WAGE_TEMPLATE)
    before = xlrd.open_workbook(WAGE_TEMPLATE, formatting_info=True)
    parsed = parse_attendance_workbook(ATTENDANCE_FIXTURE)

    result = generate_wage_record(
        attendance_result=parsed,
        template_path=WAGE_TEMPLATE,
        output_dir=tmp_path,
        generated_at=datetime(2026, 7, 21, 12, 0, 0),
    )

    assert result.errors == ()
    assert compute_sha256(WAGE_TEMPLATE) == template_sha
    assert result.matchedSheets == (
        "FANGLEI XIAO (lay)",
        "MANDEEP KAUR",
        "HAO LIU",
        "SIMRAN",
        "BALIHAR SINGH(年轻印)",
        "CHUNYAN LIANG",
        "Wei Deng",
    )
    assert any(
        warning.code == "WAGE_TEMPLATE_SHEET_UNSUPPORTED_CONTRACT"
        and "司机WeiSheng Hong" in warning.message
        for warning in result.warnings
    )

    after = xlrd.open_workbook(result.outputPath, formatting_info=True)
    assert after.sheet_names() == before.sheet_names()
    assert after.nsheets == before.nsheets == 10

    for sheet_name in before.sheet_names():
        source_sheet = before.sheet_by_name(sheet_name)
        output_sheet = after.sheet_by_name(sheet_name)
        target_status = SHEET_TARGET_STATUS[sheet_name]
        source_inventory = _sheet_structure_inventory(
            before, source_sheet, target_status
        )
        output_inventory = _sheet_structure_inventory(
            after, output_sheet, target_status
        )
        assert source_inventory == output_inventory
        assert source_inventory["headers"]
        assert source_inventory["targetStatus"] == target_status
        assert source_inventory["keyStyles"]

    matched_positions = [
        before.sheet_names().index(sheet_name) for sheet_name in result.matchedSheets
    ]
    explicitly_required = {
        matched_positions[1],
        matched_positions[2],
        matched_positions[len(matched_positions) // 2],
        matched_positions[-1],
    }
    assert explicitly_required == {2, 3, 4, 9}

    for sheet_index in matched_positions:
        source_sheet = before.sheet_by_index(sheet_index)
        output_sheet = after.sheet_by_index(sheet_index)
        date_rows, total_row = _date_slots_and_total(source_sheet)
        assert len(date_rows) == 31
        for row_index in date_rows:
            for column_index in range(6):
                assert _normalized_style(
                    before, source_sheet, row_index, column_index
                ) == _normalized_style(
                    after, output_sheet, row_index, column_index
                )
        for column_index in (0, 2):
            assert _normalized_style(
                before, source_sheet, total_row, column_index
            ) == _normalized_style(
                after, output_sheet, total_row, column_index
            )

    for unchanged_sheet_name in ("Rui Zhou", "司机WeiSheng Hong", "JIANMING ZHANG"):
        assert _complete_sheet_inventory(
            before, before.sheet_by_name(unchanged_sheet_name)
        ) == _complete_sheet_inventory(
            after, after.sheet_by_name(unchanged_sheet_name)
        )
        assert _sheet_record_payloads(
            WAGE_TEMPLATE, unchanged_sheet_name, 0x0006
        ) == _sheet_record_payloads(result.outputPath, unchanged_sheet_name, 0x0006)

    source_driver = before.sheet_by_name("司机WeiSheng Hong")
    output_driver = after.sheet_by_name("司机WeiSheng Hong")
    assert _complete_sheet_inventory(before, source_driver) == _complete_sheet_inventory(
        after, output_driver
    )

    source_deng = before.sheet_by_name("Wei Deng")
    output_deng = after.sheet_by_name("Wei Deng")
    assert output_deng.row_values(3) == source_deng.row_values(3)
    assert [
        _normalized_style(before, source_deng, 3, column_index)
        for column_index in range(6)
    ] == [
        _normalized_style(after, output_deng, 3, column_index)
        for column_index in range(6)
    ]
    assert output_deng.cell_value(4, 1) == "2026.6.1"
    assert output_deng.cell_value(4, 2) == 8.77

    assert _biff_record_payloads(WAGE_TEMPLATE, 0x0018) == _biff_record_payloads(
        result.outputPath, 0x0018
    )
    assert _biff_record_payloads(WAGE_TEMPLATE, 0x00A1) == _biff_record_payloads(
        result.outputPath, 0x00A1
    )


def test_review_empty_and_total_writes_retain_their_template_styles(
    tmp_path: Path,
) -> None:
    parsed = parse_attendance_workbook(ATTENDANCE_FIXTURE)
    lay_days = [day for day in parsed.days if day.employeeName == "lay"]
    review_day = replace(lay_days[0], calculatedHours=None)
    modified_days = tuple(
        review_day if day is lay_days[0] else day
        for day in parsed.days
    )
    modified = replace(parsed, days=modified_days)

    result = generate_wage_record(
        attendance_result=modified,
        template_path=WAGE_TEMPLATE,
        output_dir=tmp_path,
        generated_at=datetime(2026, 7, 21, 12, 1, 0),
    )

    assert result.errors == ()
    source = xlrd.open_workbook(WAGE_TEMPLATE, formatting_info=True)
    output = xlrd.open_workbook(result.outputPath, formatting_info=True)
    source_sheet = source.sheet_by_name("FANGLEI XIAO (lay)")
    output_sheet = output.sheet_by_name("FANGLEI XIAO (lay)")
    assert output_sheet.cell_value(3, 2) == "REVIEW"
    assert output_sheet.row_values(3, 3, 6) == ["/", "/", "/"]
    empty_day = next(day for day in lay_days if not day.punchTimes)
    empty_row = 3 + empty_day.dayNumber - 1
    assert output_sheet.row_values(empty_row, 2, 6) == ["/", "/", "/", "/"]
    for row_index, columns in (
        (3, range(2, 6)),
        (empty_row, range(2, 6)),
        (34, (0, 2)),
    ):
        for column_index in columns:
            assert _normalized_style(
                source, source_sheet, row_index, column_index
            ) == _normalized_style(output, output_sheet, row_index, column_index)


def test_employee_to_sheet_matching_is_one_to_one_and_never_uses_substrings(
    tmp_path: Path,
) -> None:
    template_path = tmp_path / "duplicate-employee-sheets.xls"
    _write_standard_template(template_path, ("LAY Alpha", "Alpha LAY", "JIANMING"))
    original = xlrd.open_workbook(template_path, formatting_info=True)
    parsed = parse_attendance_workbook(ATTENDANCE_FIXTURE)
    lay_days = tuple(day for day in parsed.days if day.employeeName == "lay")
    ming_days = tuple(day for day in parsed.days if day.employeeName == "ming")
    input_result = replace(parsed, days=lay_days + ming_days)

    result = generate_wage_record(
        attendance_result=input_result,
        template_path=template_path,
        output_dir=tmp_path / "output",
        generated_at=datetime(2026, 7, 21, 12, 2, 0),
    )

    assert result.errors == ()
    assert result.matchedSheets == ()
    assert any(
        warning.code == "WAGE_TEMPLATE_EMPLOYEE_MULTIPLE_SHEETS"
        and warning.employeeName == "lay"
        for warning in result.warnings
    )
    assert any(
        warning.code == "WAGE_TEMPLATE_SHEET_NOT_MATCHED"
        and "JIANMING" in warning.message
        for warning in result.warnings
    )
    output = xlrd.open_workbook(result.outputPath, formatting_info=True)
    for sheet_name in original.sheet_names():
        assert _complete_sheet_inventory(
            original, original.sheet_by_name(sheet_name)
        ) == _complete_sheet_inventory(output, output.sheet_by_name(sheet_name))


def test_employee_sheet_matching_supports_reliable_id_and_rejects_short_name_tokens(
    tmp_path: Path,
) -> None:
    template_path = tmp_path / "id-and-short-name.xls"
    _write_standard_template(template_path, ("EMP9001", "LI PAYROLL"))
    source = xlrd.open_workbook(template_path, formatting_info=True)
    parsed = parse_attendance_workbook(ATTENDANCE_FIXTURE)
    lay_days = tuple(
        replace(day, employeeId="EMP9001", employeeName=None)
        for day in parsed.days
        if day.employeeName == "lay"
    )
    short_name_days = tuple(
        replace(day, employeeId=None, employeeName="li")
        for day in parsed.days
        if day.employeeName == "hao"
    )

    result = generate_wage_record(
        attendance_result=replace(parsed, days=lay_days + short_name_days),
        template_path=template_path,
        output_dir=tmp_path / "output",
        generated_at=datetime(2026, 7, 21, 12, 3, 0),
    )

    assert result.errors == ()
    assert result.matchedSheets == ("EMP9001",)
    assert any(
        warning.code == "WAGE_TEMPLATE_SHEET_NOT_MATCHED"
        and "LI PAYROLL" in warning.message
        for warning in result.warnings
    )
    output = xlrd.open_workbook(result.outputPath, formatting_info=True)
    assert output.sheet_by_name("EMP9001").cell_value(3, 1) == "2026.6.1"
    assert _complete_sheet_inventory(
        source, source.sheet_by_name("LI PAYROLL")
    ) == _complete_sheet_inventory(output, output.sheet_by_name("LI PAYROLL"))


def test_date_slots_require_a_date_in_the_generated_period_and_preserve_numeric_notes(
    tmp_path: Path,
) -> None:
    template_path = tmp_path / "validated-date-slots.xls"
    _write_date_validation_template(template_path)
    source = xlrd.open_workbook(template_path, formatting_info=True)
    parsed = parse_attendance_workbook(ATTENDANCE_FIXTURE)
    lay_days = tuple(day for day in parsed.days if day.employeeName == "lay")

    result = generate_wage_record(
        attendance_result=replace(parsed, days=lay_days),
        template_path=template_path,
        output_dir=tmp_path / "output",
        generated_at=datetime(2026, 7, 21, 12, 4, 0),
    )

    assert result.errors == ()
    assert result.matchedSheets == ("LAY",)
    output = xlrd.open_workbook(result.outputPath, formatting_info=True)
    source_sheet = source.sheet_by_name("LAY")
    output_sheet = output.sheet_by_name("LAY")
    assert output_sheet.row_values(3) == source_sheet.row_values(3)
    assert [
        _normalized_style(source, source_sheet, 3, column_index)
        for column_index in range(source_sheet.ncols)
    ] == [
        _normalized_style(output, output_sheet, 3, column_index)
        for column_index in range(output_sheet.ncols)
    ]
    assert output_sheet.cell_value(4, 1) == "2026.6.1"
    june_first = next(day for day in lay_days if day.dayNumber == 1)
    assert output_sheet.cell_value(4, 2) == june_first.calculatedHours


def test_legacy_xls_adaptive_dimensions_are_bounded_cjk_aware_and_deterministic(
    tmp_path: Path,
) -> None:
    template_path = tmp_path / "adaptive-template.xls"
    _write_adaptive_template(template_path)
    source = xlrd.open_workbook(template_path, formatting_info=True)

    outputs: list[Path] = []
    for index in range(2):
        output_path = tmp_path / f"adaptive-output-{index}.xls"
        editor = LegacyXlsTemplateEditor(template_path)
        editor.write(0, 3, 0, "A" * 100)
        editor.write(0, 4, 1, "ABCDEFGHIJ")
        editor.write(0, 5, 2, "中" * 10)
        editor.write(0, 6, 3, "first line\n第二行内容超过宽度")
        editor.write(0, 7, 4, "ok")
        editor.save(output_path)
        outputs.append(output_path)

    assert compute_sha256(outputs[0]) == compute_sha256(outputs[1])
    output = xlrd.open_workbook(outputs[0], formatting_info=True)
    source_sheet = source.sheet_by_index(0)
    output_sheet = output.sheet_by_index(0)

    assert output_sheet.colinfo_map[0].width == int(
        MAX_COLUMN_WIDTH_CHARS * XLS_COLUMN_WIDTH_UNIT
    )
    assert output_sheet.colinfo_map[1].width < output_sheet.colinfo_map[2].width
    assert output_sheet.colinfo_map[4].width == source_sheet.colinfo_map[4].width
    assert output_sheet.rowinfo_map[3].height > source_sheet.rowinfo_map[3].height
    assert output_sheet.rowinfo_map[6].height > source_sheet.rowinfo_map[6].height
    assert output_sheet.rowinfo_map[3].height <= MAX_ROW_HEIGHT_TWIPS
    assert output_sheet.rowinfo_map[6].height <= MAX_ROW_HEIGHT_TWIPS

    for row_index, column_index in ((3, 0), (4, 1), (5, 2), (6, 3)):
        source_style = _normalized_style(
            source, source_sheet, row_index, column_index
        )
        output_style = _normalized_style(
            output, output_sheet, row_index, column_index
        )
        assert source_style[:-1] == output_style[:-1]
        assert output_style[-1]["text_wrapped"] == 1


def _write_standard_template(path: Path, sheet_names: tuple[str, ...]) -> None:
    workbook = xlwt.Workbook()
    style = xlwt.easyxf(
        "font: name Arial; align: horiz center, vert center, wrap on; "
        "borders: left thin, right thin, top thin, bottom thin"
    )
    for sheet_name in sheet_names:
        sheet = workbook.add_sheet(sheet_name)
        for column_index, value in enumerate(
            ("", "DATE", "HOURS", "LUNCH HOURS", "START TIME", "END TIME")
        ):
            sheet.write(2, column_index, value, style)
            sheet.write(
                3,
                column_index,
                "" if column_index > 1 else ("MON", "2026.6.1")[column_index],
                style,
            )
        sheet.write_merge(4, 4, 0, 1, "TOTAL HOURS", style)
        sheet.write_merge(4, 4, 2, 5, 0, style)
    workbook.save(str(path))


def _write_date_validation_template(path: Path) -> None:
    workbook = xlwt.Workbook()
    sheet = workbook.add_sheet("LAY")
    style = xlwt.easyxf(
        "font: name Arial; align: horiz center, vert center, wrap on; "
        "borders: left thin, right thin, top thin, bottom thin"
    )
    date_style = xlwt.easyxf(
        "font: name Arial; align: horiz center, vert center, wrap on; "
        "borders: left thin, right thin, top thin, bottom thin",
        num_format_str="YYYY.MM.DD",
    )
    for column_index, value in enumerate(
        ("", "DATE", "HOURS", "LUNCH HOURS", "START TIME", "END TIME")
    ):
        sheet.write(2, column_index, value, style)
        note_value: object = ("MON", 42, "NUMERIC NOTE", "", "", "")[
            column_index
        ]
        date_value: object = (
            "MON",
            datetime(2026, 6, 1),
            "",
            "",
            "",
            "",
        )[column_index]
        sheet.write(3, column_index, note_value, style)
        sheet.write(
            4,
            column_index,
            date_value,
            date_style if column_index == 1 else style,
        )
    sheet.write_merge(5, 5, 0, 1, "TOTAL HOURS", style)
    sheet.write_merge(5, 5, 2, 5, 0, style)
    workbook.save(str(path))


def _write_adaptive_template(path: Path) -> None:
    workbook = xlwt.Workbook()
    sheet = workbook.add_sheet("Adaptive")
    style = xlwt.easyxf(
        "font: name Arial, colour blue; pattern: pattern solid, fore_colour yellow; "
        "align: horiz center, vert center; "
        "borders: left thin, right thin, top thin, bottom thin"
    )
    for column_index, width_chars in enumerate((8, 8, 8, 8, 20)):
        sheet.col(column_index).width = width_chars * XLS_COLUMN_WIDTH_UNIT
    for row_index in range(3, 8):
        sheet.row(row_index).height = 300
        for column_index in range(5):
            sheet.write(row_index, column_index, "template", style)
    workbook.save(str(path))


def _date_slots_and_total(sheet) -> tuple[list[int], int]:
    date_rows: list[int] = []
    total_row = -1
    for row_index in range(3, sheet.nrows):
        values = [str(sheet.cell_value(row_index, column_index)).strip() for column_index in range(sheet.ncols)]
        if any(value.upper().startswith("TOTAL HOURS") for value in values):
            total_row = row_index
            break
        if str(sheet.cell_value(row_index, 0)).upper() in WEEKDAYS:
            date_rows.append(row_index)
    assert total_row >= 0
    return date_rows, total_row


def _sheet_structure(sheet) -> dict[str, object]:
    return {
        "name": sheet.name,
        "nrows": sheet.nrows,
        "ncols": sheet.ncols,
        "merges": sorted(tuple(merge) for merge in sheet.merged_cells),
        "rows": {
            row_index: (
                info.height,
                info.hidden,
                info.outline_level,
                getattr(info, "collapsed", 0),
            )
            for row_index, info in sheet.rowinfo_map.items()
        },
        "columns": {
            column_index: (
                info.width,
                info.hidden,
                info.outline_level,
                info.collapsed,
            )
            for column_index, info in sheet.colinfo_map.items()
        },
        "visibility": sheet.visibility,
        "horizontal_page_breaks": tuple(sheet.horizontal_page_breaks),
        "vertical_page_breaks": tuple(sheet.vertical_page_breaks),
        "panes_are_frozen": sheet.panes_are_frozen,
        "horz_split_pos": sheet.horz_split_pos,
        "vert_split_pos": sheet.vert_split_pos,
    }


def _sheet_structure_inventory(
    workbook, sheet, target_status: str
) -> dict[str, object]:
    inventory = _sheet_structure(sheet)
    header_cells = tuple(
        (row_index, column_index, str(sheet.cell_value(row_index, column_index)))
        for row_index in range(sheet.nrows)
        for column_index in range(sheet.ncols)
        if str(sheet.cell_value(row_index, column_index)).strip().upper()
        in STANDARD_HEADERS
    )
    key_coordinates = {
        (row_index, column_index)
        for row_index, column_index, _ in header_cells
    }
    for row_index in range(sheet.nrows):
        if any(
            str(sheet.cell_value(row_index, column_index))
            .strip()
            .upper()
            .startswith("TOTAL HOURS")
            for column_index in range(sheet.ncols)
        ):
            key_coordinates.update(
                (row_index, column_index) for column_index in range(sheet.ncols)
            )
    inventory["headers"] = header_cells
    inventory["targetStatus"] = target_status
    inventory["keyStyles"] = tuple(
        (
            row_index,
            column_index,
            _normalized_style(workbook, sheet, row_index, column_index),
        )
        for row_index, column_index in sorted(key_coordinates)
    )
    return inventory


def _complete_sheet_inventory(workbook, sheet) -> dict[str, object]:
    inventory = _sheet_structure(sheet)
    inventory["values"] = tuple(
        tuple(sheet.cell_value(row_index, column_index) for column_index in range(sheet.ncols))
        for row_index in range(sheet.nrows)
    )
    inventory["styles"] = tuple(
        tuple(
            _normalized_style(workbook, sheet, row_index, column_index)
            for column_index in range(sheet.ncols)
        )
        for row_index in range(sheet.nrows)
    )
    return inventory


def _normalized_style(workbook, sheet, row_index: int, column_index: int):
    xf = workbook.xf_list[sheet.cell_xf_index(row_index, column_index)]
    font = workbook.font_list[xf.font_index]
    font_properties = {
        key: value
        for key, value in vars(font).items()
        if key != "font_index"
    }
    colour_properties = {
        "font": workbook.colour_map.get(font.colour_index),
        "pattern": workbook.colour_map.get(xf.background.pattern_colour_index),
        "background": workbook.colour_map.get(xf.background.background_colour_index),
    }
    return (
        font_properties,
        colour_properties,
        vars(xf.border).copy(),
        vars(xf.background).copy(),
        workbook.format_map[xf.format_key].format_str,
        vars(xf.protection).copy(),
        vars(xf.alignment).copy(),
    )


def _biff_record_payloads(path: Path, record_id: int) -> tuple[bytes, ...]:
    stream = _workbook_stream(path)
    payloads: list[bytes] = []
    position = 0
    while position + 4 <= len(stream):
        current_id, payload_size = struct.unpack_from("<HH", stream, position)
        end = position + 4 + payload_size
        if current_id == record_id:
            payloads.append(stream[position + 4 : end])
        position = end
    return tuple(payloads)


def _sheet_record_payloads(
    path: Path,
    sheet_name: str,
    target_record_id: int,
) -> tuple[bytes, ...]:
    stream = _workbook_stream(path)
    boundsheets: list[tuple[int, str]] = []
    position = 0
    while position + 4 <= len(stream):
        record_id, payload_size = struct.unpack_from("<HH", stream, position)
        payload = stream[position + 4 : position + 4 + payload_size]
        if record_id == 0x0085:
            offset = struct.unpack_from("<I", payload, 0)[0]
            character_count = payload[6]
            unicode_name = bool(payload[7] & 0x01)
            name_bytes = payload[8 : 8 + character_count * (2 if unicode_name else 1)]
            name = name_bytes.decode("utf-16le" if unicode_name else "latin1")
            boundsheets.append((offset, name))
        position += 4 + payload_size
        if boundsheets and position >= min(offset for offset, _ in boundsheets):
            break

    sheet_index = next(
        index for index, (_, name) in enumerate(boundsheets) if name == sheet_name
    )
    position = boundsheets[sheet_index][0]
    payloads: list[bytes] = []
    while position + 4 <= len(stream):
        record_id, payload_size = struct.unpack_from("<HH", stream, position)
        if record_id == target_record_id:
            payloads.append(stream[position + 4 : position + 4 + payload_size])
        position += 4 + payload_size
        if record_id == 0x000A:
            break
    return tuple(payloads)


def _workbook_stream(path: Path) -> bytes:
    compound = CompDoc(path.read_bytes())
    return compound.get_named_stream("Workbook") or compound.get_named_stream("Book")
