from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from worker_python.cli import app
from worker_python.imports import compute_sha256


REPO_ROOT = Path(__file__).resolve().parents[4]
WORKBOOK = REPO_ROOT / "samples" / "unloading-plans" / "CAAU8011090 UNLOADING PLAN.xlsx"
MAPPING = (
    REPO_ROOT
    / "apps"
    / "worker-python"
    / "tests"
    / "fixtures"
    / "parser_profiles"
    / "unloading-plan-sheet1-v1.json"
)


def test_profile_cli_inspect_validate_and_execute_contracts_share_versions() -> None:
    runner = CliRunner()

    inspected = runner.invoke(app, ["profile-inspect", "--input-file", str(WORKBOOK)])
    assert inspected.exit_code == 0
    inspection_payload = json.loads(inspected.stdout)
    assert inspection_payload["contractVersion"] == "workbook-inspection-v1"
    assert inspection_payload["workerVersion"] == "parser-profile-engine-v1"
    assert inspection_payload["inspection"]["inputSha256"] == compute_sha256(WORKBOOK)
    assert inspection_payload["candidateMappings"]
    assert "source_file" not in inspection_payload

    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    fingerprint = {
        "profileId": "fixture-unloading-sheet1-v1",
        "algorithmVersion": "workbook-fingerprint-v1",
        "workbookType": "OOXML_XLSX",
        "sheet": {"name": "Sheet1"},
        "anchors": [{"value": "运单号", "row": 6, "column": 1}],
        "requiredRelativeColumns": [
            {"anchor": "运单号", "header": "箱数/件数", "offset": 3},
            {"anchor": "运单号", "header": "体积", "offset": 5},
        ],
        "dataStart": {"rowOffsetFromHeader": 1},
    }
    validated = runner.invoke(
        app,
        [
            "profile-validate",
            "--mapping-definition-json",
            json.dumps(mapping, ensure_ascii=False),
            "--fingerprint-definition-json",
            json.dumps(fingerprint, ensure_ascii=False),
        ],
    )
    assert validated.exit_code == 0
    validation_payload = json.loads(validated.stdout)
    assert validation_payload == {
        "fingerprintVersion": "workbook-fingerprint-v1",
        "issues": [],
        "mappingSchemaVersion": "parser-profile-mapping-v1",
        "valid": True,
        "workerVersion": "parser-profile-engine-v1",
    }

    executed = runner.invoke(
        app,
        [
            "profile-execute",
            "--input-file",
            str(WORKBOOK),
            "--mapping-definition-json",
            json.dumps(mapping, ensure_ascii=False),
            "--replay-input-hash",
            compute_sha256(WORKBOOK),
        ],
    )
    assert executed.exit_code == 0
    execution_payload = json.loads(executed.stdout)
    assert execution_payload["issues"] == []
    assert execution_payload["result"]["containerNo"] == "CAAU8011090"
    assert len(execution_payload["result"]["lines"]) == 43
    assert (
        execution_payload["result"]["rawMetadata"]["mappingSchemaVersion"]
        == "parser-profile-mapping-v1"
    )
    assert "source_file" not in execution_payload


def test_profile_cli_returns_stable_definition_issues() -> None:
    result = CliRunner().invoke(
        app,
        [
            "profile-validate",
            "--mapping-definition-json",
            json.dumps({"schemaVersion": "unsupported"}),
            "--fingerprint-definition-json",
            json.dumps({"algorithmVersion": "unsupported"}),
        ],
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["valid"] is False
    codes = {issue["code"] for issue in payload["issues"]}
    assert "MAPPING_DEFINITION_INVALID" in codes
    assert "FINGERPRINT_VERSION_UNSUPPORTED" in codes
