from __future__ import annotations

import hashlib
import zipfile
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
MANIFEST_PATH = REPO_ROOT / "docs" / "fixtures.md"
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"


@dataclass(frozen=True)
class FixtureEntry:
    path: str
    size: int
    sha256: str
    source_type: str


def _manifest_entries() -> list[FixtureEntry]:
    entries: list[FixtureEntry] = []

    for line in MANIFEST_PATH.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| samples/unloading-plans/"):
            continue

        cells = [cell.strip() for cell in line.strip("|").split("|")]
        entries.append(
            FixtureEntry(
                path=cells[0],
                size=int(cells[1]),
                sha256=cells[2],
                source_type=cells[3],
            )
        )

    return entries


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def test_real_excel_fixture_manifest_matches_sample_directory() -> None:
    entries = _manifest_entries()
    actual_paths = {
        path.relative_to(REPO_ROOT).as_posix()
        for path in FIXTURE_DIR.glob("*.xlsx")
        if path.is_file()
    }

    assert len(entries) == 28
    assert {entry.path for entry in entries} == actual_paths


def test_real_excel_fixtures_are_registered_with_unique_sha256() -> None:
    entries = _manifest_entries()
    hashes = [entry.sha256 for entry in entries]

    assert len(hashes) == len(set(hashes))

    for entry in entries:
        fixture_path = REPO_ROOT / entry.path

        assert entry.source_type == "real unloading plan"
        assert entry.path.endswith(".xlsx")
        assert fixture_path.is_file()
        assert fixture_path.stat().st_size == entry.size
        assert fixture_path.stat().st_size > 0
        assert _sha256(fixture_path) == entry.sha256
        assert zipfile.is_zipfile(fixture_path)
