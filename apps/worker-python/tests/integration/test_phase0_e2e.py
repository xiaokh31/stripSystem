from __future__ import annotations

import json
from pathlib import Path

from openpyxl import load_workbook
from typer.testing import CliRunner

from worker_python.cli import app


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
TEMPLATE_PATH = REPO_ROOT / "samples" / "templates" / "卸柜报告-En.xlsx"


def test_phase0_e2e_regression_uses_all_real_fixtures(tmp_path: Path) -> None:
    fixture_paths = sorted(FIXTURE_DIR.glob("*.xlsx"))
    fixture_names = {fixture.name for fixture in fixture_paths}
    output_dir = tmp_path / "storage"

    assert len(fixture_paths) == 28

    result = CliRunner().invoke(
        app,
        [
            "batch",
            "--input-dir",
            str(FIXTURE_DIR),
            "--template",
            str(TEMPLATE_PATH),
            "--output-dir",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0, result.output
    assert f"Processed: {len(fixture_paths)}" in result.output

    parsed_payloads = _parsed_payloads(output_dir)
    assert len(parsed_payloads) == len(fixture_paths)
    assert {payload["original_filename"] for payload in parsed_payloads} == fixture_names

    for payload in parsed_payloads:
        assert payload["schema_version"] == 1
        assert payload["batch_version"] == "phase0-batch-v1"
        assert payload["sha256"]
        assert payload["detection"]["format_type"] in {
            "UNLOADING_PLAN_CN",
            "BESTAR_RECEIVING",
            "UNKNOWN",
        }
        assert payload["task_status"] in {"SUCCESS", "WARNING", "ERROR"}
        assert isinstance(payload["warnings"], list)
        assert isinstance(payload["errors"], list)

    supported_payloads = [
        payload
        for payload in parsed_payloads
        if payload["detection"]["format_type"] in {"UNLOADING_PLAN_CN", "BESTAR_RECEIVING"}
    ]
    assert supported_payloads
    assert {payload["detection"]["format_type"] for payload in supported_payloads} >= {
        "UNLOADING_PLAN_CN",
        "BESTAR_RECEIVING",
    }
    assert any(payload["parsed_result"]["lines"] for payload in supported_payloads)
    assert any(payload["pallet_result"]["plans"] for payload in supported_payloads)
    assert any(payload["report_result"] and payload["report_result"]["outputPath"] for payload in supported_payloads)
    assert any(payload["label_result"] and payload["label_result"]["outputPath"] for payload in supported_payloads)

    report_files = sorted((output_dir / "reports").glob("*.xlsx"))
    label_files = sorted((output_dir / "labels").glob("*.pdf"))
    assert report_files
    assert label_files
    assert label_files[0].read_bytes().startswith(b"%PDF")

    workbook = load_workbook(report_files[0], data_only=False)
    try:
        assert "Sheet1" in workbook.sheetnames
    finally:
        workbook.close()

    task_report_path = next((output_dir / "task_reports").glob("task-report-*.html"))
    task_report_html = task_report_path.read_text(encoding="utf-8")
    for fixture_name in fixture_names:
        assert fixture_name in task_report_html

    corrections_path = next((output_dir / "corrections").glob("corrections-*.json"))
    corrections = json.loads(corrections_path.read_text(encoding="utf-8"))
    assert len(corrections["corrections"]) == len(fixture_paths)

    import_manifest = json.loads(
        (output_dir / "original_files" / "import_manifest.json").read_text(encoding="utf-8")
    )
    assert len(import_manifest["records"]) == len(fixture_paths)
    assert len({record["sha256"] for record in import_manifest["records"]}) == len(fixture_paths)


def _parsed_payloads(output_dir: Path) -> list[dict]:
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted((output_dir / "parsed_json").glob("*.json"))
    ]
