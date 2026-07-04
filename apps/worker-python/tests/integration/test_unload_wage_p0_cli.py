from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from worker_python.cli import app


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE = REPO_ROOT / "samples" / "unloading-wage" / "unload_wage_p0.json"


def test_unload_wage_p0_cli_generates_settlement_json_and_task_report(
    tmp_path: Path,
) -> None:
    output_dir = tmp_path / "unload-wage-p0"
    runner = CliRunner()

    result = runner.invoke(
        app,
        [
            "unload-wage-p0",
            "--input-file",
            str(FIXTURE),
            "--output-dir",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["originalFilename"] == FIXTURE.name
    assert payload["sha256"] == (
        "ce0b03113ead110b314c44a1bd822964b56bde737eb626646e39e7bd8a01806e"
    )
    assert payload["taskStatus"] == "WARNING"
    assert payload["duplicate"] is False
    assert payload["payContainerCount"] == 3
    assert payload["workerCount"] == 3
    assert payload["warningCount"] == 1
    assert payload["errorCount"] == 0
    assert Path(payload["settlementJsonPath"]).is_file()
    assert Path(payload["taskReportPath"]).is_file()

    settlement_payload = json.loads(
        Path(payload["settlementJsonPath"]).read_text(encoding="utf-8")
    )
    settlement = settlement_payload["settlement_result"]
    assert settlement["settlementMonth"] == "2026-06"
    assert settlement["totalAmount"] == 960.0
    assert len(settlement["payContainers"]) == 3
    assert len(settlement["workers"]) == 3
    assert any(
        container["trailerNumber"] == "TR-P0-0604"
        and container["containerNumbers"] == ["ZCSU9025988B", "TXGU5580229"]
        for container in settlement["payContainers"]
    )
    assert {worker["workerId"]: worker["totalAmount"] for worker in settlement["workers"]} == {
        "P0-WORKER-A": 330.0,
        "P0-WORKER-B": 325.0,
        "P0-WORKER-C": 305.0,
    }

    import_manifest = json.loads(
        (output_dir / "original_files" / "import_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert len(import_manifest["records"]) == 1
    assert import_manifest["records"][0]["sha256"] == payload["sha256"]

    html = Path(payload["taskReportPath"]).read_text(encoding="utf-8")
    assert "UNLOAD-WAGE-P0 Task Report" in html
    assert "PC-TRAILER-TR-P0-0604" in html
    assert "Prototype Worker A" in html


def test_unload_wage_p0_cli_detects_duplicate_input(tmp_path: Path) -> None:
    output_dir = tmp_path / "unload-wage-p0"
    runner = CliRunner()
    args = [
        "unload-wage-p0",
        "--input-file",
        str(FIXTURE),
        "--output-dir",
        str(output_dir),
    ]

    first = runner.invoke(app, args)
    second = runner.invoke(app, args)

    assert first.exit_code == 0
    assert second.exit_code == 0
    payload = json.loads(second.output)
    assert payload["duplicate"] is True
    assert payload["taskStatus"] == "WARNING"

    import_manifest = json.loads(
        (output_dir / "original_files" / "import_manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert len(import_manifest["records"]) == 1
    assert [attempt["duplicate"] for attempt in import_manifest["attempts"]] == [
        False,
        True,
    ]
