from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest
import xlrd  # type: ignore[import-untyped]

from worker_python.wage.template import (
    WAGE_TEMPLATE_EMPLOYEE_SLOT_COUNT,
    WAGE_TEMPLATE_SHA256,
    WAGE_TEMPLATE_SOURCE_SHA256,
    WAGE_TEMPLATE_VERSION,
    audit_wage_template,
    build_wage_template,
    default_template_path,
    preflight_wage_template,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
HISTORICAL_REFERENCE = (
    REPO_ROOT / "samples" / "wage" / "20260601-0630_wageRecords.xls"
)


def test_tracked_template_is_privacy_audited_readable_and_versioned() -> None:
    template = default_template_path()
    audit = preflight_wage_template(template, require_read_only=True)

    assert audit.sha256 == WAGE_TEMPLATE_SHA256
    assert audit.version == WAGE_TEMPLATE_VERSION
    assert audit.employeeSlotCount == WAGE_TEMPLATE_EMPLOYEE_SLOT_COUNT
    assert audit.dateCellCount == 0
    assert audit.unsupportedValueCount == 0
    assert audit.metadataNonZeroByteCount == 0
    assert audit.formulaCount > 0
    assert audit.mergeCount > 0


def test_template_build_is_byte_reproducible_and_removes_historical_identity(
    tmp_path: Path,
) -> None:
    assert HISTORICAL_REFERENCE.is_file()
    assert _sha256(HISTORICAL_REFERENCE) == WAGE_TEMPLATE_SOURCE_SHA256
    rebuilt = tmp_path / "rebuilt.xls"

    audit = build_wage_template(
        source_path=HISTORICAL_REFERENCE,
        output_path=rebuilt,
    )

    assert rebuilt.read_bytes() == default_template_path().read_bytes()
    assert audit.sha256 == WAGE_TEMPLATE_SHA256
    reference = xlrd.open_workbook(HISTORICAL_REFERENCE, formatting_info=True)
    sanitized_bytes = rebuilt.read_bytes()
    sanitized_book = xlrd.open_workbook(rebuilt, formatting_info=True)
    assert not set(reference.sheet_names()).intersection(sanitized_book.sheet_names())
    for sheet in reference.sheets():
        identity = str(sheet.cell_value(0, 0)).strip()
        for sensitive_text in (sheet.name, identity):
            if len(sensitive_text) < 3:
                continue
            assert sensitive_text.encode("utf-8") not in sanitized_bytes
            assert sensitive_text.encode("utf-16le") not in sanitized_bytes


def test_template_preflight_fails_closed_with_stable_codes(tmp_path: Path) -> None:
    missing = tmp_path / "missing.xls"
    with pytest.raises(ValueError, match="^WAGE_TEMPLATE_MISSING$"):
        preflight_wage_template(missing)

    changed = tmp_path / "changed.xls"
    changed.write_bytes(default_template_path().read_bytes() + b"changed")
    os.chmod(changed, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
    with pytest.raises(ValueError, match="^WAGE_TEMPLATE_SHA_MISMATCH$"):
        preflight_wage_template(changed)

    writable = tmp_path / "writable.xls"
    writable.write_bytes(default_template_path().read_bytes())
    os.chmod(writable, stat.S_IRUSR | stat.S_IWUSR)
    with pytest.raises(ValueError, match="^WAGE_TEMPLATE_NOT_READ_ONLY$"):
        preflight_wage_template(writable)


def test_template_audit_does_not_need_historical_reference() -> None:
    audit = audit_wage_template(default_template_path())
    assert audit.readable is True
    assert audit.sha256 == WAGE_TEMPLATE_SHA256


def _sha256(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()
