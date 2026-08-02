from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from pathlib import Path

import xlrd

import worker_python.wage.generator as generator_module
from worker_python.imports import compute_sha256
from worker_python.wage import generate_wage_record, parse_attendance_workbook
from worker_python.wage.legacy_xls import LegacyXlsTemplateEditor


REPO_ROOT = Path(__file__).resolve().parents[4]
JUNE_ATTENDANCE = REPO_ROOT / "samples" / "wage" / "workAttendanceRecordForm_June.xls"
WAGE_TEMPLATE = REPO_ROOT / "samples" / "wage" / "20260601-0630_wageRecords.xls"
REAL_JULY_SAMPLE_SHA256 = (
    "63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597"
)


def test_real_june_and_july_periods_generate_valid_effective_workbooks(
    tmp_path: Path,
) -> None:
    sample_directory = REPO_ROOT / "samples" / "attendance_test"
    july_samples = tuple(sample_directory.glob("*.xls"))
    assert len(july_samples) == 1
    assert compute_sha256(july_samples[0]) == REAL_JULY_SAMPLE_SHA256

    for label, source, expected_period in (
        ("june", JUNE_ATTENDANCE, ("2026-06-01", "2026-06-30")),
        ("july", july_samples[0], ("2026-07-01", "2026-07-31")),
    ):
        parsed = parse_attendance_workbook(source)
        result = generate_wage_record(
            attendance_result=parsed,
            template_path=WAGE_TEMPLATE,
            output_dir=tmp_path / label,
            generated_at=datetime(2026, 8, 1, 9, 0, 0),
        )

        assert result.errors == ()
        assert result.validated is True
        assert result.generationStage == "COMPLETED"
        assert result.errorCode is None
        assert result.writtenEmployeeCount > 0
        assert result.writtenDayCount > 0
        assert expected_period[0] in result.generatedFilename
        assert expected_period[1] in result.generatedFilename
        assert result.outputSha256 == compute_sha256(result.outputPath)
        workbook = xlrd.open_workbook(result.outputPath, formatting_info=True)
        assert workbook.nsheets == 10


def test_generation_failures_have_distinct_codes_and_leave_no_partial_workbook(
    tmp_path: Path,
    monkeypatch,
) -> None:
    parsed = parse_attendance_workbook(JUNE_ATTENDANCE)
    template_sha = compute_sha256(WAGE_TEMPLATE)

    missing_period = generate_wage_record(
        attendance_result=replace(parsed, periodStart=None, periodEnd=None),
        template_path=WAGE_TEMPLATE,
        output_dir=tmp_path / "missing-period",
    )
    assert missing_period.errorCode == "WAGE_GENERATION_PERIOD_MISSING"

    missing_template = generate_wage_record(
        attendance_result=parsed,
        template_path=tmp_path / "missing-template.xls",
        output_dir=tmp_path / "missing-template",
    )
    assert missing_template.errorCode == "WAGE_TEMPLATE_MISSING"

    unreadable_template_path = tmp_path / "unreadable-template.xls"
    unreadable_template_path.write_bytes(b"not-an-ole-workbook")
    unreadable_template = generate_wage_record(
        attendance_result=parsed,
        template_path=unreadable_template_path,
        output_dir=tmp_path / "unreadable-template",
    )
    assert unreadable_template.errorCode == "WAGE_TEMPLATE_UNREADABLE"

    def fail_save(self, output_path: Path) -> None:
        raise OSError("injected save failure")

    monkeypatch.setattr(LegacyXlsTemplateEditor, "save", fail_save)
    save_failure_dir = tmp_path / "save-failure"
    save_failure = generate_wage_record(
        attendance_result=parsed,
        template_path=WAGE_TEMPLATE,
        output_dir=save_failure_dir,
    )
    assert save_failure.errorCode == "WAGE_GENERATION_SAVE_FAILED"
    assert tuple(save_failure_dir.glob("*.staging")) == ()
    assert tuple(save_failure_dir.glob("wage-record-*.xls")) == ()
    monkeypatch.undo()

    def fail_validation(**_kwargs) -> None:
        raise ValueError("injected validation failure")

    monkeypatch.setattr(
        generator_module,
        "_validate_staged_workbook",
        fail_validation,
    )
    validation_failure_dir = tmp_path / "validation-failure"
    validation_failure = generate_wage_record(
        attendance_result=parsed,
        template_path=WAGE_TEMPLATE,
        output_dir=validation_failure_dir,
    )
    assert validation_failure.errorCode == ("WAGE_GENERATION_OUTPUT_VALIDATION_FAILED")
    assert tuple(validation_failure_dir.glob("*.staging")) == ()
    assert tuple(validation_failure_dir.glob("wage-record-*.xls")) == ()
    assert compute_sha256(WAGE_TEMPLATE) == template_sha
