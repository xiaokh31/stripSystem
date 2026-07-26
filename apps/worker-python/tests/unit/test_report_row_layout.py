from __future__ import annotations

from worker_python.reports.row_layout import (
    CellLayoutInput,
    TextRun,
    calculate_cell_layout,
    calculate_row_layout,
    excel_column_width_to_points,
)


def _cell(value: str, **overrides: object) -> CellLayoutInput:
    values: dict[str, object] = {
        "visible_value": value,
        "printable_width_points": 92.0,
        "font_name": "Arial",
        "font_size": 12.0,
        "bold": True,
        "wrap_text": True,
    }
    values.update(overrides)
    return CellLayoutInput(**values)


def test_layout_distinguishes_ascii_cjk_multiline_and_long_tokens() -> None:
    ascii_layout = calculate_cell_layout(
        _cell("Long industrial receiving address with appointment")
    )
    cjk_layout = calculate_cell_layout(
        _cell("卡尔加里工业园区仓库东侧卸货门请提前预约")
    )
    multiline_layout = calculate_cell_layout(
        _cell("YYC4 Receiving\nDoor A\nAppointment Required")
    )
    token_layout = calculate_cell_layout(_cell("X" * 80))

    assert ascii_layout.line_count >= 3
    assert cjk_layout.line_count >= 3
    assert multiline_layout.line_count >= 3
    assert token_layout.line_count > ascii_layout.line_count
    assert token_layout.required_height_points > ascii_layout.required_height_points


def test_layout_uses_merged_width_and_actual_font_properties() -> None:
    narrow = calculate_cell_layout(_cell("Palletizing Standards text"))
    merged = calculate_cell_layout(
        _cell("Palletizing Standards text", printable_width_points=280.0)
    )
    larger_bold = calculate_cell_layout(
        CellLayoutInput(
            visible_value="Palletizing Standards text",
            printable_width_points=92.0,
            font_name="Arial",
            font_size=16.0,
            bold=True,
            wrap_text=True,
            runs=(
                TextRun(
                    text="Palletizing ",
                    font_name="Arial",
                    font_size=11.0,
                    bold=True,
                ),
                TextRun(
                    text="Standards text",
                    font_name="Arial",
                    font_size=16.0,
                    bold=True,
                ),
            ),
        )
    )

    assert merged.line_count < narrow.line_count
    assert larger_bold.required_height_points > narrow.required_height_points


def test_row_layout_is_deterministic_never_shrinks_and_uses_tallest_cell() -> None:
    short = _cell("YYC4")
    tall = _cell("Door A\nAppointment Required\nContact Warehouse")

    first = calculate_row_layout(
        (short, tall),
        template_height_points=16.5,
    )
    second = calculate_row_layout(
        (short, tall),
        template_height_points=16.5,
    )
    template_floor = calculate_row_layout(
        (short,),
        template_height_points=40.0,
    )

    assert first == second
    assert first.required_height_points == max(
        result.required_height_points for result in first.cell_results
    )
    assert template_floor.required_height_points == 40.0


def test_indent_and_rotation_increase_required_height() -> None:
    plain = calculate_cell_layout(_cell("Receiving appointment required"))
    indented = calculate_cell_layout(
        _cell("Receiving appointment required", indent=2.0)
    )
    rotated = calculate_cell_layout(
        _cell("Receiving appointment required", rotation=45)
    )

    assert indented.line_count >= plain.line_count
    assert rotated.required_height_points > plain.required_height_points


def test_excel_column_width_conversion_is_monotonic() -> None:
    assert excel_column_width_to_points(8.0) > 0
    assert excel_column_width_to_points(21.625) > excel_column_width_to_points(8.0)
