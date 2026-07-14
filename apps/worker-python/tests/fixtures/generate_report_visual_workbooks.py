from __future__ import annotations

import argparse
import shutil
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from worker_python.reports.cell_map import DESTINATION_ROWS
from worker_python.reports.excel_report_writer import write_excel_report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic XLSX inputs for the report print gate."
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    boundary_count = len(DESTINATION_ROWS)
    boundary_plans = tuple(
        _plan(
            "BOUNDARY-LONG-16\nCalgary Receiving Door A"
            if index == boundary_count
            else f"BOUNDARY-{index:02d}"
        )
        for index in range(1, boundary_count + 1)
    )
    overflow_plans = tuple(
        _plan(f"OVERFLOW-{index:02d}")
        for index in range(1, boundary_count + 2)
    )

    with TemporaryDirectory(prefix="unload-report-visual-") as temporary_dir:
        temporary_path = Path(temporary_dir)
        _write_fixture(
            temporary_path,
            args.output_dir / "boundary-16-long.xlsx",
            "BOUNDARY16",
            boundary_plans,
        )
        _write_fixture(
            temporary_path,
            args.output_dir / "overflow-17.xlsx",
            "OVERFLOW17",
            overflow_plans,
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
) -> None:
    result = write_excel_report(
        parsed_result=SimpleNamespace(containerNo=container_no),
        pallet_result=SimpleNamespace(plans=plans),
        output_dir=temporary_dir / container_no,
        report_datetime=datetime(2026, 6, 25, 9, 30),
    )
    if result.errors or result.writtenDestinationCount != len(plans):
        raise RuntimeError(f"Unable to generate {container_no} visual fixture")
    shutil.copy2(result.outputPath, output_path)


if __name__ == "__main__":
    main()
