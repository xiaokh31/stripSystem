from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from openpyxl import load_workbook

from worker_python.reports.cell_map import DESTINATION_ROWS
from worker_python.reports.excel_report_writer import write_excel_report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate deterministic XLSX inputs for UNLOAD-REPORT-02."
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    boundary_count = len(DESTINATION_ROWS)
    cases = {
        "long-english": (
            "LONGENGLISH",
            (
                _plan(
                    "Private Address / 12345 Industrial Receiving Calgary Dock Door "
                    "Appointment Required"
                ),
            ),
        ),
        "long-cjk": (
            "LONGCJK",
            (
                _plan(
                    "贵司卡尔加里仓超长中文收货地址工业园区第八大道仓库东侧"
                    "四十二号卸货门请提前预约"
                ),
            ),
        ),
        "multiline": (
            "MULTILINE",
            (_plan("YYC4 Receiving\nDoor A Appointment\nContact Before Arrival"),),
        ),
        "boundary-16-long": (
            "BOUNDARY16",
            tuple(
                _plan(
                    "FINAL-ROW-LONG-TOKEN-" + ("X" * 40) + "-TOKEN-END"
                    if index == boundary_count
                    else f"BOUNDARY-{index:02d}"
                )
                for index in range(1, boundary_count + 1)
            ),
        ),
        "height-overflow": (
            "HEIGHTOVERFLOW",
            tuple(
                _plan(f"HEIGHT-{index:02d} LONG")
                for index in range(1, boundary_count + 1)
            ),
        ),
    }

    manifest: dict[str, object] = {"cases": {}}
    with TemporaryDirectory(prefix="unload-report-02-visual-") as temporary_dir:
        temporary_path = Path(temporary_dir)
        for name, (container_no, plans) in cases.items():
            output_path = args.output_dir / f"{name}.xlsx"
            case_result = _write_fixture(
                temporary_path,
                output_path,
                container_no,
                plans,
            )
            manifest["cases"][name] = case_result  # type: ignore[index]

    (args.output_dir / "visual-fixtures.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _plan(destination: str) -> SimpleNamespace:
    return SimpleNamespace(
        destinationCode=destination,
        finalPallets=1,
        totalCartons=10,
    )


def _write_fixture(
    temporary_dir: Path,
    output_path: Path,
    container_no: str,
    plans: tuple[SimpleNamespace, ...],
) -> dict[str, object]:
    result = write_excel_report(
        parsed_result=SimpleNamespace(containerNo=container_no),
        pallet_result=SimpleNamespace(plans=plans),
        output_dir=temporary_dir / container_no,
        report_datetime=datetime(2026, 7, 26, 9, 30),
    )
    if result.errors or result.writtenDestinationCount != len(plans):
        raise RuntimeError(
            f"Unable to generate {container_no}: "
            f"{[issue.code for issue in result.errors]}"
        )
    shutil.copy2(result.outputPath, output_path)

    workbook = load_workbook(output_path, rich_text=True, data_only=False)
    try:
        populated = [
            worksheet
            for worksheet in workbook.worksheets
            if worksheet.calculate_dimension() not in {"A1", "A1:A1"}
        ]
        destinations = [
            [
                str(worksheet[row.destination_cell].value)
                for row in DESTINATION_ROWS
                if worksheet[row.destination_cell].value is not None
            ]
            for worksheet in populated
        ]
        row_heights = [
            {str(row): worksheet.row_dimensions[row].height for row in range(1, 26)}
            for worksheet in populated
        ]
        return {
            "containerNo": container_no,
            "destinations": destinations,
            "rowHeights": row_heights,
            "worksheetCount": len(populated),
        }
    finally:
        workbook.close()


if __name__ == "__main__":
    main()
