from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path

from worker_python.imports import compute_sha256
from worker_python.wage import (
    ATTENDANCE_PARSER_VERSION,
    AttendanceCalculationMethod,
    AttendanceDay,
    AttendanceEmployeeSummary,
    AttendanceParseResult,
    AttendanceWorkInterval,
    WageFormatType,
    generate_wage_record,
)
from worker_python.wage.template import default_template_path


EMPLOYEES = tuple(
    (f"EMP{index:03d}", f"Team Member {index:02d}") for index in range(1, 17)
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    source_dir = output_dir / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    template_path = default_template_path()
    (source_dir / "deidentified-template.xls").write_bytes(template_path.read_bytes())

    records: list[dict[str, object]] = []
    for label, start, end in (
        ("june", date(2026, 6, 1), date(2026, 6, 30)),
        ("july", date(2026, 7, 1), date(2026, 7, 31)),
    ):
        result = generate_wage_record(
            attendance_result=attendance_result(start, end),
            template_path=template_path,
            output_dir=output_dir / label,
            generated_at=datetime(2026, 8, 1, 9, 0, 0),
        )
        if result.errors or not result.validated:
            raise RuntimeError(f"deidentified {label} generation failed")
        target = source_dir / f"deidentified-{label}-wage-record.xls"
        target.write_bytes(result.outputPath.read_bytes())
        records.append(
            {
                "label": label,
                "periodStart": start.isoformat(),
                "periodEnd": end.isoformat(),
                "sha256": compute_sha256(target),
                "sizeBytes": target.stat().st_size,
                "sheetCount": 17,
                "writtenEmployeeCount": result.writtenEmployeeCount,
                "writtenDayCount": result.writtenDayCount,
            }
        )

    manifest = {
        "schemaVersion": 1,
        "fixtureClassification": "DEIDENTIFIED_SYNTHETIC",
        "templateSha256": compute_sha256(template_path),
        "records": records,
    }
    (output_dir / "visual-fixtures.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def attendance_result(start: date, end: date) -> AttendanceParseResult:
    days: list[AttendanceDay] = []
    summaries: list[AttendanceEmployeeSummary] = []
    for employee_index, (employee_id, employee_name) in enumerate(EMPLOYEES):
        employee_days: list[AttendanceDay] = []
        current = start
        while current <= end:
            worked = current.weekday() < 5
            if worked:
                start_time = "08:00" if employee_index == 0 else "08:30"
                end_time = "16:30" if employee_index == 0 else "17:00"
                interval = AttendanceWorkInterval(
                    start=start_time, end=end_time, minutes=510, hours=8.5
                )
                punch_times = (start_time, end_time)
                intervals = (interval,)
                gross = 8.5
                calculated = 8.0
                first_punch = start_time
                last_punch = end_time
                method = AttendanceCalculationMethod.PAIRED_INTERVALS
            else:
                punch_times = ()
                intervals = ()
                gross = None
                calculated = 0.0
                first_punch = None
                last_punch = None
                method = AttendanceCalculationMethod.NO_PUNCHES
            employee_days.append(
                AttendanceDay(
                    employeeId=employee_id,
                    employeeName=employee_name,
                    department="Synthetic Team",
                    workDate=current,
                    dayNumber=current.day,
                    punchTimes=punch_times,
                    calculationMethod=method,
                    workIntervals=intervals,
                    pairedGrossHours=gross,
                    lunchHours=0.5 if worked else 0.0,
                    calculatedHours=calculated,
                    firstPunch=first_punch,
                    lastPunch=last_punch,
                    rawCellValues=punch_times,
                    rowNumbers=(current.day,),
                )
            )
            current += timedelta(days=1)
        days.extend(employee_days)
        summaries.append(
            AttendanceEmployeeSummary(
                employeeId=employee_id,
                employeeName=employee_name,
                department="Synthetic Team",
                dayCount=len(employee_days),
                workedDayCount=sum(bool(day.punchTimes) for day in employee_days),
                reviewDayCount=0,
                totalCalculatedHours=sum(
                    day.calculatedHours or 0 for day in employee_days
                ),
            )
        )
    return AttendanceParseResult(
        formatType=WageFormatType.WAGE_ATTENDANCE,
        parserVersion=ATTENDANCE_PARSER_VERSION,
        sourceSheet="Synthetic Attendance",
        periodStart=start,
        periodEnd=end,
        confidence=1.0,
        employees=tuple(summaries),
        days=tuple(days),
        rawRows=(),
        warnings=(),
        errors=(),
        assumptions=("Synthetic visual fixture only.",),
    )


if __name__ == "__main__":
    main()
