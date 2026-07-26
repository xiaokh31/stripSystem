from __future__ import annotations

import math
import unicodedata
from dataclasses import dataclass
from typing import Iterable


DEFAULT_FONT_SIZE_POINTS = 11.0
DEFAULT_LINE_HEIGHT_MULTIPLIER = 1.35
SINGLE_LINE_HEIGHT_MULTIPLIER = 1.2
DEFAULT_VERTICAL_PADDING_POINTS = 0.0
MIN_ROW_HEIGHT_POINTS = 15.75
MAX_ROW_HEIGHT_POINTS = 240.0
RENDERER_SAFETY_POINTS = 2.0


@dataclass(frozen=True)
class TextRun:
    text: str
    font_name: str | None = None
    font_size: float = DEFAULT_FONT_SIZE_POINTS
    bold: bool = False


@dataclass(frozen=True)
class CellLayoutInput:
    visible_value: str
    printable_width_points: float
    font_name: str | None = None
    font_size: float = DEFAULT_FONT_SIZE_POINTS
    bold: bool = False
    wrap_text: bool = True
    indent: float = 0.0
    rotation: int = 0
    runs: tuple[TextRun, ...] = ()


@dataclass(frozen=True)
class CellLayoutResult:
    line_count: int
    required_height_points: float


@dataclass(frozen=True)
class RowLayoutResult:
    required_height_points: float
    cell_results: tuple[CellLayoutResult, ...]


def calculate_cell_layout(value: CellLayoutInput) -> CellLayoutResult:
    runs = value.runs or (
        TextRun(
            text=value.visible_value,
            font_name=value.font_name,
            font_size=value.font_size,
            bold=value.bold,
        ),
    )
    if not runs:
        runs = (TextRun(text=""),)

    max_font_size = max((run.font_size for run in runs), default=value.font_size)
    usable_width = max(
        value.printable_width_points
        - _indent_width_points(value.indent, max_font_size),
        max_font_size,
    )
    if value.wrap_text:
        # Excel and Office renderers prefer word boundaries and reserve slightly
        # different internal padding. A conservative width prevents a final
        # renderer-only line from being clipped.
        usable_width *= 0.9

    if value.rotation in {90, 255}:
        text_extent = sum(
            _glyph_width_points(character, run)
            for run in runs
            for character in run.text
            if character != "\n"
        )
        return CellLayoutResult(
            line_count=max(1, _explicit_line_count(runs)),
            required_height_points=_rounded_height(
                text_extent + DEFAULT_VERTICAL_PADDING_POINTS + RENDERER_SAFETY_POINTS
            ),
        )

    line_widths = _wrapped_line_widths(runs, usable_width, value.wrap_text)
    line_count = max(1, len(line_widths))
    line_height = max_font_size * (
        SINGLE_LINE_HEIGHT_MULTIPLIER
        if line_count == 1
        else DEFAULT_LINE_HEIGHT_MULTIPLIER
    )
    normal_height = (
        line_count * line_height
        + DEFAULT_VERTICAL_PADDING_POINTS
        + RENDERER_SAFETY_POINTS
    )
    if not value.rotation:
        required_height = normal_height
    else:
        angle = math.radians(min(value.rotation, 180 - value.rotation))
        widest_line = max(line_widths, default=0.0)
        required_height = (
            abs(math.sin(angle)) * widest_line
            + abs(math.cos(angle)) * normal_height
            + RENDERER_SAFETY_POINTS
        )

    return CellLayoutResult(
        line_count=line_count,
        required_height_points=_rounded_height(required_height),
    )


def calculate_row_layout(
    cells: Iterable[CellLayoutInput],
    *,
    template_height_points: float,
    minimum_height_points: float = MIN_ROW_HEIGHT_POINTS,
    maximum_height_points: float = MAX_ROW_HEIGHT_POINTS,
) -> RowLayoutResult:
    cell_results = tuple(calculate_cell_layout(cell) for cell in cells)
    required_height = max(
        template_height_points,
        minimum_height_points,
        *(result.required_height_points for result in cell_results),
    )
    return RowLayoutResult(
        required_height_points=min(
            _rounded_height(required_height),
            maximum_height_points,
        ),
        cell_results=cell_results,
    )


def excel_column_width_to_points(width: float) -> float:
    """Approximate Excel's stored character width as physical points.

    Excel stores column width in default-font character units. The documented
    pixel conversion has a five-pixel cell allowance for normal widths.
    """

    if width <= 0:
        return 0.0
    pixels = width * 12.0 if width < 1.0 else math.floor(width * 7.0 + 5.0)
    return pixels * 72.0 / 96.0


def _wrapped_line_widths(
    runs: tuple[TextRun, ...],
    usable_width: float,
    wrap_text: bool,
) -> list[float]:
    lines = [0.0]
    for run in runs:
        for character in run.text:
            if character == "\n":
                lines.append(0.0)
                continue

            glyph_width = _glyph_width_points(character, run)
            if wrap_text and lines[-1] > 0 and lines[-1] + glyph_width > usable_width:
                lines.append(0.0)
                if character.isspace():
                    continue
            lines[-1] += glyph_width

    return lines


def _glyph_width_points(character: str, run: TextRun) -> float:
    font_size = max(run.font_size, 1.0)
    if character == "\t":
        factor = 1.32
    elif character.isspace():
        factor = 0.34
    elif _is_cjk_or_full_width(character):
        factor = 1.0
    elif character.isdigit():
        factor = 0.58
    elif character.isupper():
        factor = 0.68
    elif character.islower():
        factor = 0.55
    elif unicodedata.category(character).startswith("P"):
        factor = 0.42
    else:
        factor = 0.62

    if run.bold:
        factor *= 1.08
    return font_size * factor


def _is_cjk_or_full_width(character: str) -> bool:
    return unicodedata.east_asian_width(character) in {"F", "W"}


def _indent_width_points(indent: float, font_size: float) -> float:
    return max(indent, 0.0) * font_size * 3.0


def _explicit_line_count(runs: tuple[TextRun, ...]) -> int:
    return 1 + sum(run.text.count("\n") for run in runs)


def _rounded_height(value: float) -> float:
    return math.ceil(value * 4.0) / 4.0
