from __future__ import annotations

import json
import shutil
from pathlib import Path

from typer.testing import CliRunner

from worker_python.batch import run_batch
from worker_python.cli import app


REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
TEMPLATE_PATH = REPO_ROOT / "samples" / "templates" / "卸柜报告-En.xlsx"
REAL_FIXTURE = FIXTURE_DIR / "CAAU8011090 UNLOADING PLAN.xlsx"


def test_batch_runner_generates_phase0_outputs_and_reports_failed_files(
    tmp_path: Path,
) -> None:
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    shutil.copy2(REAL_FIXTURE, input_dir / REAL_FIXTURE.name)
    failed_file = input_dir / "corrupt-upload.xlsx"
    failed_file.write_bytes(b"not an xlsx workbook")

    result = run_batch(
        input_dir=input_dir,
        template_path=TEMPLATE_PATH,
        output_dir=tmp_path / "storage",
    )

    assert result.processedCount == 2
    assert result.successCount == 1
    assert result.failedCount == 1
    assert len(list(result.parsedJsonDir.glob("*.json"))) == 2
    assert list(result.reportDir.glob("*.xlsx"))
    assert list(result.labelDir.glob("*.pdf"))
    assert result.taskReport.htmlPath.is_file()
    assert result.taskReport.correctionsPath.is_file()

    import_manifest = json.loads(
        (tmp_path / "storage" / "original_files" / "import_manifest.json").read_text(encoding="utf-8")
    )
    assert len(import_manifest["records"]) == 2
    assert all(record["sha256"] for record in import_manifest["records"])

    failed_json = next(result.parsedJsonDir.glob("corrupt-upload-*.json"))
    failed_payload = json.loads(failed_json.read_text(encoding="utf-8"))
    assert failed_payload["sha256"]
    assert failed_payload["task_status"] == "ERROR"
    assert failed_payload["errors"]

    html = result.taskReport.htmlPath.read_text(encoding="utf-8")
    assert REAL_FIXTURE.name in html
    assert failed_file.name in html
    assert "Unable to read Excel workbook" in html


def test_unloading_worker_batch_cli_prints_summary(tmp_path: Path) -> None:
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    shutil.copy2(REAL_FIXTURE, input_dir / REAL_FIXTURE.name)
    output_dir = tmp_path / "storage"

    runner = CliRunner()
    result = runner.invoke(
        app,
        [
            "batch",
            "--input-dir",
            str(input_dir),
            "--template",
            str(TEMPLATE_PATH),
            "--output-dir",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0
    assert "Batch completed" in result.output
    assert "Processed: 1" in result.output
    assert "Task report:" in result.output
    assert list((output_dir / "parsed_json").glob("*.json"))
    assert list((output_dir / "reports").glob("*.xlsx"))
    assert list((output_dir / "labels").glob("*.pdf"))


def test_unloading_worker_parse_file_cli_outputs_parser_only_json() -> None:
    runner = CliRunner()
    result = runner.invoke(
        app,
        [
            "parse-file",
            "--input-file",
            str(REAL_FIXTURE),
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["parse_scope"] == "parser-only"
    assert payload["source_file"] == str(REAL_FIXTURE.resolve())
    assert payload["task_status"] in {"SUCCESS", "WARNING"}
    assert payload["parsed_result"]["containerNo"] == "CAAU8011090"
    assert payload["parsed_result"]["parserVersion"] == "unloading-plan-cn-v1"
    assert payload["parsed_result"]["lines"]
    assert payload["pallet_result"]["plans"]
    assert payload["report_result"] is None
    assert payload["label_result"] is None


def test_unloading_worker_write_report_cli_generates_excel_only(tmp_path: Path) -> None:
    runner = CliRunner()
    parsed = runner.invoke(
        app,
        [
            "parse-file",
            "--input-file",
            str(REAL_FIXTURE),
        ],
    )
    assert parsed.exit_code == 0
    parsed_payload = json.loads(parsed.output)
    report_payload_path = tmp_path / "report-payload.json"
    report_payload_path.write_text(
        json.dumps(
            {
                "company": "Bestar",
                "parsed_result": parsed_payload["parsed_result"],
                "pallet_result": parsed_payload["pallet_result"],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    output_dir = tmp_path / "reports"

    result = runner.invoke(
        app,
        [
            "write-report",
            "--payload",
            str(report_payload_path),
            "--template",
            str(TEMPLATE_PATH),
            "--output-dir",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert payload["task_status"] in {"SUCCESS", "WARNING"}
    assert payload["report_result"]["outputPath"].endswith(".xlsx")
    assert Path(payload["report_result"]["outputPath"]).is_file()
    assert not list(tmp_path.glob("*.pdf"))
