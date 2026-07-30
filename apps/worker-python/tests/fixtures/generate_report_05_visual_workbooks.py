from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from openpyxl import load_workbook

from worker_python.reports.cell_map import EXPANDED_DESTINATION_ROWS
from worker_python.reports.excel_report_writer import write_excel_report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate deterministic XLSX inputs for UNLOAD-REPORT-05."
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    cases: dict[str, tuple[str, tuple[SimpleNamespace, ...]]] = {
        f"report-{count}": (
            f"REPORT{count}",
            tuple(_plan(f"DEST-{index:02d}", index) for index in range(1, count + 1)),
        )
        for count in (0, 1, 2, 8, 9, 10, 16, 17, 24, 25, 32, 33)
    }
    cases.update(
        {
            "duplicate-primary": (
                "DUPPRIMARY",
                _boundary_plans(
                    8,
                    "DUPLICATE-DESTINATION",
                    target_indexes=(2, 8),
                ),
            ),
            "duplicate-expanded": (
                "DUPEXPANDED",
                _boundary_plans(
                    9,
                    "DUPLICATE-DESTINATION",
                    target_indexes=(2, 9),
                ),
            ),
            **_text_cases(
                "long-english",
                "Private Address / Industrial Receiving Calgary Dock Door "
                "Appointment Required",
            ),
            **_text_cases(
                "long-cjk",
                "卡尔加里仓超长中文收货地址工业园区第八大道仓库东侧"
                "四十二号卸货门请提前预约",
            ),
            **_text_cases(
                "multiline",
                "YYC4 Receiving\nDoor A Appointment\nContact Before Arrival",
            ),
            **_text_cases(
                "long-token",
                "LONG-" + ("X" * 72) + "-TOKEN-END",
            ),
            **_text_cases("missing-destination", None),
            "last-row-primary": (
                "LASTPRIMARY",
                _boundary_plans(
                    8,
                    "FINAL-PRIMARY-" + ("X" * 48) + "-TOKEN-END",
                    target_indexes=(8,),
                ),
            ),
            "last-row-expanded": (
                "LASTEXPANDED",
                _boundary_plans(
                    16,
                    "FINAL-EXPANDED-" + ("X" * 48) + "-TOKEN-END",
                    target_indexes=(16,),
                ),
            ),
        }
    )

    manifest: dict[str, object] = {"cases": {}, "layoutReview": {}}
    with TemporaryDirectory(prefix="unload-report-05-visual-") as temporary_dir:
        temporary_path = Path(temporary_dir)
        for name, (container_no, plans) in cases.items():
            manifest["cases"][name] = _write_fixture(  # type: ignore[index]
                temporary_path,
                args.output_dir / f"{name}.xlsx",
                container_no,
                plans,
            )

        extreme_result = write_excel_report(
            parsed_result=SimpleNamespace(containerNo="EXTREMELAYOUT"),
            pallet_result=SimpleNamespace(
                plans=(_plan("EXTREME " * 2_000, 1),)
            ),
            output_dir=temporary_path / "extreme",
            report_datetime=datetime(2026, 7, 29, 9, 30),
        )
        error_codes = [issue.code for issue in extreme_result.errors]
        if error_codes != ["REPORT_LAYOUT_REVIEW_REQUIRED"]:
            raise RuntimeError(f"Unexpected extreme-layout result: {error_codes}")
        if extreme_result.outputPath.exists():
            raise RuntimeError("Extreme layout review must not publish an XLSX.")
        manifest["layoutReview"] = {
            "errorCodes": error_codes,
            "outputPublished": False,
        }

    (args.output_dir / "visual-fixtures.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _text_cases(
    name: str,
    destination: str | None,
) -> dict[str, tuple[str, tuple[SimpleNamespace, ...]]]:
    return {
        f"{name}-primary": (
            f"{name.upper().replace('-', '')}PRIMARY",
            _boundary_plans(8, destination, target_indexes=(8,)),
        ),
        f"{name}-expanded": (
            f"{name.upper().replace('-', '')}EXPANDED",
            _boundary_plans(9, destination, target_indexes=(9,)),
        ),
    }


def _boundary_plans(
    count: int,
    destination: str | None,
    *,
    target_indexes: tuple[int, ...],
) -> tuple[SimpleNamespace, ...]:
    return tuple(
        _plan(
            destination if index in target_indexes else f"BOUNDARY-{index:02d}",
            index,
        )
        for index in range(1, count + 1)
    )


def _plan(destination: str | None, index: int) -> SimpleNamespace:
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
        report_datetime=datetime(2026, 7, 29, 9, 30),
    )
    if result.errors or result.writtenDestinationCount != len(plans):
        raise RuntimeError(
            f"Unable to generate {container_no}: "
            f"{[issue.code for issue in result.errors]}"
        )
    shutil.copy2(result.outputPath, output_path)

    workbook = load_workbook(output_path, rich_text=True, data_only=False)
    try:
        populated = workbook.worksheets[: len(result.pageEvidence)]
        canonical_rows = [
            {
                "destination": str(worksheet[f"N{row}"].value),
                "excelRow": row,
                "finalPallets": int(worksheet[f"O{row}"].value),
                "page": page_index,
                "totalCartons": int(worksheet[f"P{row}"].value),
            }
            for page_index, (worksheet, evidence) in enumerate(
                zip(populated, result.pageEvidence),
                start=1,
            )
            for row in evidence.writtenPhysicalRows
        ]
        return {
            "canonicalRows": canonical_rows,
            "expectedDestinationCount": result.totalDestinationCount,
            "layoutModes": list(result.layoutModes),
            "orderedDestinationDigest": result.orderedDestinationDigest,
            "pageEvidence": [
                {
                    "page": evidence.page,
                    "layoutMode": evidence.layoutMode,
                    "expectedDestinationCount": evidence.expectedDestinationCount,
                    "writtenDestinationCount": evidence.writtenDestinationCount,
                    "expectedPhysicalRows": list(evidence.expectedPhysicalRows),
                    "writtenPhysicalRows": list(evidence.writtenPhysicalRows),
                }
                for evidence in result.pageEvidence
            ],
            "pageRows": [
                evidence.writtenDestinationCount for evidence in result.pageEvidence
            ],
            "physicalCapacity": len(EXPANDED_DESTINATION_ROWS),
            "worksheetCount": len(populated),
            "writtenDestinationCount": result.writtenDestinationCount,
        }
    finally:
        workbook.close()


if __name__ == "__main__":
    main()
