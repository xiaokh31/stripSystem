from __future__ import annotations

import hashlib
import json
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MANIFEST_FILENAME = "import_manifest.json"
ORIGINALS_DIRNAME = "files"


@dataclass(frozen=True)
class ImportResult:
    sha256: str
    duplicate: bool
    original_filename: str
    size_bytes: int
    stored_path: Path
    manifest_path: Path


def compute_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class ImportRegistry:
    def __init__(self, original_files_dir: Path) -> None:
        self.original_files_dir = original_files_dir
        self.files_dir = original_files_dir / ORIGINALS_DIRNAME
        self.manifest_path = original_files_dir / MANIFEST_FILENAME

    def import_file(self, source_path: Path) -> ImportResult:
        source_path = source_path.resolve()
        if not source_path.is_file():
            raise FileNotFoundError(f"Import source does not exist: {source_path}")
        if source_path.suffix.lower() != ".xlsx":
            raise ValueError(f"Only .xlsx unloading files can be imported: {source_path}")

        sha256 = compute_sha256(source_path)
        size_bytes = source_path.stat().st_size
        original_filename = source_path.name

        self.original_files_dir.mkdir(parents=True, exist_ok=True)
        self.files_dir.mkdir(parents=True, exist_ok=True)

        manifest = self._load_manifest()
        existing_record = self._find_record(manifest, sha256)

        if existing_record is not None:
            stored_path = self.original_files_dir / existing_record["stored_path"]
            self._append_attempt(
                manifest,
                source_path=source_path,
                sha256=sha256,
                duplicate=True,
                stored_path=stored_path,
            )
            self._write_manifest(manifest)
            return ImportResult(
                sha256=sha256,
                duplicate=True,
                original_filename=existing_record["original_filename"],
                size_bytes=existing_record["size_bytes"],
                stored_path=stored_path,
                manifest_path=self.manifest_path,
            )

        stored_path = self.files_dir / sha256 / original_filename
        stored_path.parent.mkdir(parents=True, exist_ok=False)
        self._copy_without_overwrite(source_path, stored_path)

        stored_relative_path = stored_path.relative_to(self.original_files_dir).as_posix()
        manifest["records"].append(
            {
                "sha256": sha256,
                "original_filename": original_filename,
                "size_bytes": size_bytes,
                "stored_path": stored_relative_path,
                "first_imported_at": _utc_now(),
            }
        )
        self._append_attempt(
            manifest,
            source_path=source_path,
            sha256=sha256,
            duplicate=False,
            stored_path=stored_path,
        )
        self._write_manifest(manifest)

        return ImportResult(
            sha256=sha256,
            duplicate=False,
            original_filename=original_filename,
            size_bytes=size_bytes,
            stored_path=stored_path,
            manifest_path=self.manifest_path,
        )

    def _load_manifest(self) -> dict[str, Any]:
        if not self.manifest_path.exists():
            return {"schema_version": 1, "records": [], "attempts": []}

        with self.manifest_path.open(encoding="utf-8") as file:
            manifest = json.load(file)

        if manifest.get("schema_version") != 1:
            raise ValueError(f"Unsupported import manifest schema: {self.manifest_path}")
        if not isinstance(manifest.get("records"), list):
            raise ValueError(f"Import manifest records must be a list: {self.manifest_path}")
        if not isinstance(manifest.get("attempts"), list):
            raise ValueError(f"Import manifest attempts must be a list: {self.manifest_path}")

        return manifest

    def _write_manifest(self, manifest: dict[str, Any]) -> None:
        self.original_files_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w",
            delete=False,
            dir=self.original_files_dir,
            encoding="utf-8",
        ) as file:
            json.dump(manifest, file, ensure_ascii=False, indent=2, sort_keys=True)
            file.write("\n")
            temp_path = Path(file.name)

        temp_path.replace(self.manifest_path)

    def _append_attempt(
        self,
        manifest: dict[str, Any],
        *,
        source_path: Path,
        sha256: str,
        duplicate: bool,
        stored_path: Path,
    ) -> None:
        manifest["attempts"].append(
            {
                "attempted_at": _utc_now(),
                "source_path": str(source_path),
                "sha256": sha256,
                "duplicate": duplicate,
                "stored_path": stored_path.relative_to(self.original_files_dir).as_posix(),
            }
        )

    @staticmethod
    def _find_record(manifest: dict[str, Any], sha256: str) -> dict[str, Any] | None:
        for record in manifest["records"]:
            if record["sha256"] == sha256:
                return record
        return None

    @staticmethod
    def _copy_without_overwrite(source_path: Path, stored_path: Path) -> None:
        with source_path.open("rb") as source, stored_path.open("xb") as destination:
            shutil.copyfileobj(source, destination)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
