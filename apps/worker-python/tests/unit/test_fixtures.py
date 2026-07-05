from __future__ import annotations

import hashlib
import json
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import xlrd


REPO_ROOT = Path(__file__).resolve().parents[4]
MANIFEST_PATH = REPO_ROOT / "docs" / "fixtures.md"
FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-plans"
WAGE_FIXTURE_DIR = REPO_ROOT / "samples" / "wage"
UNLOADING_WAGE_FIXTURE_DIR = REPO_ROOT / "samples" / "unloading-wage"


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


def _wage_manifest_entries() -> list[FixtureEntry]:
    entries: list[FixtureEntry] = []

    for line in MANIFEST_PATH.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| samples/wage/"):
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


def _unloading_wage_manifest_entries() -> list[FixtureEntry]:
    entries: list[FixtureEntry] = []

    for line in MANIFEST_PATH.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| samples/unloading-wage/"):
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


def _duplicate_sha256(entries: list[FixtureEntry]) -> dict[str, list[str]]:
    grouped: defaultdict[str, list[str]] = defaultdict(list)
    for entry in entries:
        grouped[entry.sha256].append(entry.path)
    return {
        sha256: paths
        for sha256, paths in grouped.items()
        if len(paths) > 1
    }


def _open_legacy_xls(path: Path) -> xlrd.book.Book:
    try:
        return xlrd.open_workbook(path)
    except Exception as exc:  # pragma: no cover - exercised only on bad fixtures
        raise AssertionError(
            f"Legacy .xls fixture is not readable by xlrd: {path}: {exc}"
        ) from exc


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


def test_real_wage_xls_fixture_manifest_matches_sample_directory() -> None:
    entries = _wage_manifest_entries()
    actual_paths = {
        path.relative_to(REPO_ROOT).as_posix()
        for path in WAGE_FIXTURE_DIR.glob("*.xls")
        if path.is_file()
    }

    assert len(entries) == 2
    assert {entry.path for entry in entries} == actual_paths


def test_real_wage_xls_fixtures_are_registered_with_unique_sha256() -> None:
    entries = _wage_manifest_entries()
    duplicates = _duplicate_sha256(entries)

    assert duplicates == {}

    for entry in entries:
        fixture_path = REPO_ROOT / entry.path

        assert entry.source_type in {
            "real attendance record",
            "real wage record template",
        }
        assert entry.path.endswith(".xls")
        assert fixture_path.is_file()
        assert fixture_path.stat().st_size == entry.size
        assert fixture_path.stat().st_size > 0
        assert _sha256(fixture_path) == entry.sha256
        assert fixture_path.read_bytes().startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")


def test_real_wage_xls_fixtures_are_readable_by_worker_xls_reader() -> None:
    attendance_workbook = _open_legacy_xls(
        WAGE_FIXTURE_DIR / "workAttendanceRecordForm_June.xls"
    )
    attendance_sheet = attendance_workbook.sheet_by_name("员工刷卡记录表")
    attendance_text = "\n".join(
        str(attendance_sheet.cell_value(row_index, column_index)).strip()
        for row_index in range(attendance_sheet.nrows)
        for column_index in range(attendance_sheet.ncols)
    )

    assert attendance_workbook.sheet_names() == ["员工刷卡记录表"]
    assert "员工刷卡记录表" in attendance_text.replace(" ", "")
    assert "工号：" in attendance_text
    assert "姓名：" in attendance_text

    template_workbook = _open_legacy_xls(
        WAGE_FIXTURE_DIR / "20260601-0630_wageRecords.xls"
    )
    template_sheet = template_workbook.sheet_by_name("FANGLEI XIAO (lay)")

    assert "FANGLEI XIAO (lay)" in template_workbook.sheet_names()
    assert template_sheet.cell_value(0, 0) == "NAME：FANGLEI XIAO"
    assert template_sheet.cell_value(2, 1) == "DATE"
    assert template_sheet.cell_value(2, 2) == "HOURS"
    assert template_sheet.cell_value(2, 3) == "LUNCH HOURS"


def test_unloading_wage_fixture_manifest_matches_sample_directory() -> None:
    entries = _unloading_wage_manifest_entries()
    actual_paths = {
        path.relative_to(REPO_ROOT).as_posix()
        for path in UNLOADING_WAGE_FIXTURE_DIR.glob("*.json")
        if path.is_file()
    }

    assert len(entries) == 1
    assert {entry.path for entry in entries} == actual_paths


def test_unloading_wage_fixture_is_registered_and_references_real_containers() -> None:
    entries = _unloading_wage_manifest_entries()
    known_container_tokens = {
        token
        for path in FIXTURE_DIR.glob("*.xlsx")
        for token in path.stem.replace("(", " ").replace(")", " ").split()
        if any(char.isdigit() for char in token)
    }

    for entry in entries:
        fixture_path = REPO_ROOT / entry.path
        payload = json.loads(fixture_path.read_text(encoding="utf-8"))

        assert entry.source_type == "reviewed unloading wage prototype fixture"
        assert fixture_path.stat().st_size == entry.size
        assert _sha256(fixture_path) == entry.sha256
        assert payload["schema_version"] == 1
        assert "prototype" in payload["source_note"].lower()
        assert payload["work_items"]
        assert {
            item["container_number"] for item in payload["work_items"]
        }.issubset(known_container_tokens)
