from __future__ import annotations

import json
from pathlib import Path

from openpyxl import load_workbook
from typer.testing import CliRunner

from worker_python.cli import app


def test_write_unloading_summary_cli_generates_xlsx(tmp_path: Path) -> None:
    payload_path = tmp_path / "summary-payload.json"
    payload_path.write_text(
        json.dumps(
            {
                "month": "2026-06",
                "rows": [
                    {
                        "sequence": 1,
                        "containerId": "container-1",
                        "containerNo": "BEAU5946301",
                        "dateBusinessTag": "6.1海柜",
                        "destinationText": "YYC4",
                        "quantityText": "40件 / 8托",
                        "referenceText": "124115028975",
                        "appointmentText": "06/03/2026 19:00 MDT",
                    }
                ],
                "reviewItems": [],
            }
        ),
        encoding="utf-8",
    )
    output_dir = tmp_path / "summary"

    result = CliRunner().invoke(
        app,
        [
            "write-unloading-summary",
            "--payload",
            str(payload_path),
            "--output-dir",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0
    body = json.loads(result.output)
    assert body["task_status"] == "GENERATED"
    output_path = Path(body["summary_result"]["outputPath"])
    assert output_path.is_file()
    workbook = load_workbook(output_path)
    assert workbook["6月拆柜数据"]["A1"].value == "1、BEAU5946301"
    workbook.close()
