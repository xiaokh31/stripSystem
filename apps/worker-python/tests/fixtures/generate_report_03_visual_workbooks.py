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
        description="Generate deterministic XLSX inputs for UNLOAD-REPORT-03."
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    cases = {
        **{
            f"report-{count}": (
                f"REPORT{count}",
                tuple(_plan(f"DEST-{index:02d}", index) for index in range(1, count + 1)),
            )
            for count in (0, 1, 8, 9, 16, 17, 32, 33)
        },
        "duplicate-destinations": (
            "DUPLICATES",
            (
                _plan("DUPLICATE-DESTINATION", 1),
                _plan("DUPLICATE-DESTINATION", 2),
                _plan("DUPLICATE-DESTINATION", 3),
            ),
        ),
        "long-english": (
            "LONGENGLISH",
            (
                _plan(
                    "Private Address / Industrial Receiving Calgary Dock Door "
                    "Appointment Required",
                    1,
                ),
            ),
        ),
        "long-cjk": (
            "LONGCJK",
            (
                _plan(
                    "卡尔加里仓超长中文收货地址工业园区第八大道仓库东侧"
                    "四十二号卸货门请提前预约",
                    1,
                ),
            ),
        ),
        "multiline": (
            "MULTILINE",
            (_plan("YYC4 Receiving\nDoor A Appointment\nContact Before Arrival", 1),),
        ),
        "long-token": (
            "LONGTOKEN",
            (_plan("LONG-" + ("X" * 72) + "-TOKEN-END", 1),),
        ),
        "last-row-long": (
            "LASTROWLONG",
            tuple(
                _plan(
                    "FINAL-ROW-LONG-" + ("X" * 48) + "-TOKEN-END"
                    if index == len(DESTINATION_ROWS)
                    else f"BOUNDARY-{index:02d}",
                    index,
                )
                for index in range(1, len(DESTINATION_ROWS) + 1)
            ),
        ),
    }

    manifest: dict[str, object] = {"cases": {}, "layoutReview": {}}
    with TemporaryDirectory(prefix="unload-report-03-visual-") as temporary_dir:
        temporary_path = Path(temporary_dir)
        for name, (container_no, plans) in cases.items():
            manifest["cases"][name] = _write_fixture(  # type: ignore[index]
                temporary_path,
                args.output_dir / f"{name}.xlsx",
                container_no,
                plans,
            )

        extreme_output = args.output_dir / "extreme-layout-review.xlsx"
        extreme_result = write_excel_report(
            parsed_result=SimpleNamespace(containerNo="EXTREMELAYOUT"),
            pallet_result=SimpleNamespace(
                plans=(_plan("EXTREME " * 2_000, 1),)
            ),
            output_dir=temporary_path / "extreme",
            report_datetime=datetime(2026, 7, 28, 9, 30),
        )
        error_codes = [issue.code for issue in extreme_result.errors]
        if error_codes != ["REPORT_LAYOUT_REVIEW_REQUIRED"]:
            raise RuntimeError(f"Unexpected extreme-layout result: {error_codes}")
        if extreme_output.exists() or extreme_result.outputPath.exists():
            raise RuntimeError("Extreme layout review must not publish an XLSX.")
        manifest["layoutReview"] = {
            "errorCodes": error_codes,
            "outputPublished": False,
        }

    (args.output_dir / "visual-fixtures.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _plan(destination: str, index: int) -> SimpleNamespace:
    return SimpleNamespace(
        destinationCode=destination,
        finalPallets=(index % 5) + 1,
        totalCartons=index * 10,
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
        report_datetime=datetime(2026, 7, 28, 9, 30),
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
        page_rows = [
            sum(
                1
                for row in DESTINATION_ROWS
                if worksheet[row.destination_cell].value is not None
            )
            for worksheet in populated
        ]
        canonical_rows = [
            {
                "destination": str(worksheet[row.destination_cell].value),
                "excelRow": row.row,
                "finalPallets": int(worksheet[row.pallet_count_cell].value),
                "page": page_index,
                "totalCartons": int(worksheet[row.carton_count_cell].value),
            }
            for page_index, worksheet in enumerate(populated, start=1)
            for row in DESTINATION_ROWS
            if worksheet[row.destination_cell].value is not None
        ]
        return {
            "canonicalRows": canonical_rows,
            "expectedDestinationCount": result.totalDestinationCount,
            "orderedDestinationDigest": result.orderedDestinationDigest,
            "pageRows": page_rows,
            "worksheetCount": len(populated),
            "writtenDestinationCount": result.writtenDestinationCount,
        }
    finally:
        workbook.close()


if __name__ == "__main__":
    main()
