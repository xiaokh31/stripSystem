from __future__ import annotations

import json
import shutil
from pathlib import Path

from worker_python.imports import ImportRegistry, compute_sha256


REPO_ROOT = Path(__file__).resolve().parents[4]
REAL_FIXTURE = REPO_ROOT / "samples" / "unloading-plans" / "BEAU5601716 UNLOADING PLAN.xlsx"


def test_import_registry_preserves_real_excel_original_bytes(tmp_path: Path) -> None:
    registry = ImportRegistry(tmp_path / "original_files")
    source_sha256 = compute_sha256(REAL_FIXTURE)
    source_size = REAL_FIXTURE.stat().st_size

    result = registry.import_file(REAL_FIXTURE)

    assert result.duplicate is False
    assert result.sha256 == source_sha256
    assert result.original_filename == REAL_FIXTURE.name
    assert result.size_bytes == source_size
    assert result.stored_path.is_file()
    assert result.stored_path.read_bytes() == REAL_FIXTURE.read_bytes()
    assert compute_sha256(result.stored_path) == source_sha256

    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["schema_version"] == 1
    assert manifest["records"] == [
        {
            "first_imported_at": manifest["records"][0]["first_imported_at"],
            "original_filename": REAL_FIXTURE.name,
            "sha256": source_sha256,
            "size_bytes": source_size,
            "stored_path": f"files/{source_sha256}/{REAL_FIXTURE.name}",
        }
    ]
    assert manifest["attempts"][0]["duplicate"] is False
    assert manifest["attempts"][0]["sha256"] == source_sha256


def test_import_registry_detects_duplicate_by_sha256_without_overwrite(
    tmp_path: Path,
) -> None:
    registry = ImportRegistry(tmp_path / "original_files")
    renamed_source = tmp_path / "same-content-different-name.xlsx"
    shutil.copy2(REAL_FIXTURE, renamed_source)

    first = registry.import_file(REAL_FIXTURE)
    before_mtime = first.stored_path.stat().st_mtime_ns
    before_bytes = first.stored_path.read_bytes()

    duplicate = registry.import_file(renamed_source)

    assert duplicate.duplicate is True
    assert duplicate.sha256 == first.sha256
    assert duplicate.stored_path == first.stored_path
    assert duplicate.stored_path.stat().st_mtime_ns == before_mtime
    assert duplicate.stored_path.read_bytes() == before_bytes

    manifest = json.loads(first.manifest_path.read_text(encoding="utf-8"))
    assert len(manifest["records"]) == 1
    assert len(manifest["attempts"]) == 2
    assert [attempt["duplicate"] for attempt in manifest["attempts"]] == [False, True]
