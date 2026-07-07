from __future__ import annotations

import html
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from worker_python.time_utils import operational_now

from worker_python.parser import FormatType
from worker_python.task_reports.corrections_schema import (
    DEFAULT_CORRECTIONS_DIR,
    write_corrections_json,
)


REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_TASK_REPORT_DIR = REPO_ROOT / "storage" / "task_reports"


@dataclass(frozen=True)
class TaskIssue:
    code: str
    message: str
    rowNumber: int | None = None
    field: str | None = None


@dataclass(frozen=True)
class TaskDestinationSummary:
    destinationCode: str | None
    packageType: str | None
    palletRuleCode: str | None
    calculationBasisCbm: float | None
    roundingMode: str | None
    totalCartons: int
    totalVolumeCbm: float
    lineCount: int
    calculatedPallets: int


@dataclass(frozen=True)
class TaskReportRecord:
    originalFilename: str
    detectedFormat: str
    containerNo: str | None
    parseStatus: str
    confidence: float
    destinationSummaries: tuple[TaskDestinationSummary, ...]
    totalCartons: int
    totalVolumeCbm: float
    calculatedPallets: int
    reportFileLink: str | None
    labelFileLink: str | None
    warnings: tuple[TaskIssue, ...]
    errors: tuple[TaskIssue, ...]


@dataclass(frozen=True)
class TaskReportResult:
    htmlPath: Path
    correctionsPath: Path
    recordCount: int
    warningCount: int
    errorCount: int


def generate_html_task_report(
    records: tuple[TaskReportRecord, ...],
    *,
    output_dir: Path = DEFAULT_TASK_REPORT_DIR,
    corrections_dir: Path = DEFAULT_CORRECTIONS_DIR,
    generated_at: datetime | None = None,
) -> TaskReportResult:
    generated_at = generated_at or operational_now()
    output_dir.mkdir(parents=True, exist_ok=True)
    html_path = output_dir / f"task-report-{generated_at.date().isoformat()}.html"
    corrections_path = write_corrections_json(
        records,
        output_dir=corrections_dir,
        generated_at=generated_at,
    )
    html_path.write_text(
        _render_html(records, generated_at=generated_at, corrections_path=corrections_path),
        encoding="utf-8",
    )

    return TaskReportResult(
        htmlPath=html_path,
        correctionsPath=corrections_path,
        recordCount=len(records),
        warningCount=sum(len(record.warnings) for record in records),
        errorCount=sum(len(record.errors) for record in records),
    )


def record_from_detection(original_file: Path, detection: Any) -> TaskReportRecord:
    warnings = tuple(_issue_from_any(warning, code="DETECTOR_WARNING") for warning in detection.warnings)
    errors = tuple(_issue_from_any(error, code="DETECTOR_ERROR") for error in detection.errors)

    if detection.format_type == FormatType.UNKNOWN and not errors:
        errors = (
            TaskIssue(
                code="UNSUPPORTED_FORMAT",
                message=detection.reason,
            ),
        )

    return TaskReportRecord(
        originalFilename=original_file.name,
        detectedFormat=str(detection.format_type.value),
        containerNo=None,
        parseStatus=_status(warnings, errors),
        confidence=float(detection.confidence),
        destinationSummaries=(),
        totalCartons=0,
        totalVolumeCbm=0.0,
        calculatedPallets=0,
        reportFileLink=None,
        labelFileLink=None,
        warnings=warnings,
        errors=errors,
    )


def record_from_parsed_result(
    *,
    original_file: Path,
    parsed_result: Any,
    pallet_result: Any | None = None,
    report_file: Path | None = None,
    label_file: Path | None = None,
    report_result: Any | None = None,
    label_result: Any | None = None,
) -> TaskReportRecord:
    warnings = tuple(_issue_from_any(issue) for issue in getattr(parsed_result, "warnings", ()))
    errors = tuple(_issue_from_any(issue) for issue in getattr(parsed_result, "errors", ()))

    if pallet_result is not None:
        warnings = warnings + tuple(_issue_from_any(issue) for issue in getattr(pallet_result, "warnings", ()))
        errors = errors + tuple(_issue_from_any(issue) for issue in getattr(pallet_result, "errors", ()))

    if report_result is not None:
        warnings = warnings + tuple(_issue_from_any(issue) for issue in getattr(report_result, "warnings", ()))
        errors = errors + tuple(_issue_from_any(issue) for issue in getattr(report_result, "errors", ()))
        report_file = report_file or _existing_output_path(report_result)

    if label_result is not None:
        warnings = warnings + tuple(_issue_from_any(issue) for issue in getattr(label_result, "warnings", ()))
        errors = errors + tuple(_issue_from_any(issue) for issue in getattr(label_result, "errors", ()))
        label_file = label_file or _existing_output_path(label_result)

    summaries = _summaries_from(parsed_result, pallet_result)

    return TaskReportRecord(
        originalFilename=original_file.name,
        detectedFormat=_format_value(getattr(parsed_result, "formatType", "")),
        containerNo=getattr(parsed_result, "containerNo", None),
        parseStatus=_status(warnings, errors),
        confidence=float(getattr(parsed_result, "confidence", 0.0) or 0.0),
        destinationSummaries=tuple(summaries),
        totalCartons=sum(summary.totalCartons for summary in summaries),
        totalVolumeCbm=sum(summary.totalVolumeCbm for summary in summaries),
        calculatedPallets=int(getattr(pallet_result, "totalFinalPallets", 0) or 0),
        reportFileLink=str(report_file) if report_file else None,
        labelFileLink=str(label_file) if label_file else None,
        warnings=warnings,
        errors=errors,
    )


def _summaries_from(parsed_result: Any, pallet_result: Any | None) -> list[TaskDestinationSummary]:
    plans_by_destination_and_package = {
        _destination_plan_key(
            getattr(plan, "destinationCode", None),
            getattr(plan, "packageType", None),
        ): plan
        for plan in getattr(pallet_result, "plans", ())
    }
    summaries: list[TaskDestinationSummary] = []

    for summary in getattr(parsed_result, "destinationSummaries", ()):
        destination_code = getattr(summary, "destinationCode", None)
        package_type = getattr(summary, "packageType", None)
        plan = plans_by_destination_and_package.get(
            _destination_plan_key(destination_code, package_type)
        )
        summaries.append(
            TaskDestinationSummary(
                destinationCode=destination_code,
                packageType=getattr(plan, "packageType", package_type),
                palletRuleCode=getattr(plan, "ruleCode", None),
                calculationBasisCbm=getattr(plan, "calculationBasisCbm", None),
                roundingMode=getattr(plan, "roundingMode", None),
                totalCartons=int(getattr(summary, "totalCartons", 0) or 0),
                totalVolumeCbm=float(getattr(summary, "totalVolumeCbm", 0) or 0),
                lineCount=int(getattr(summary, "lineCount", 0) or 0),
                calculatedPallets=int(getattr(plan, "finalPallets", 0) or 0),
            )
        )

    return summaries


def _destination_plan_key(destination_code: Any, package_type: Any) -> tuple[str | None, str | None]:
    destination = str(destination_code) if destination_code is not None else None
    package = str(package_type) if package_type is not None else None
    return destination, package


def _render_html(
    records: tuple[TaskReportRecord, ...],
    *,
    generated_at: datetime,
    corrections_path: Path,
) -> str:
    rows = "\n".join(_record_block(record) for record in records)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Phase 0 Task Report</title>
    <style>
      body {{ font-family: Arial, sans-serif; margin: 24px; color: #111; }}
      table {{ border-collapse: collapse; width: 100%; }}
      th, td {{ border: 1px solid #bbb; padding: 6px; vertical-align: top; }}
      th {{ background: #eee; }}
      .SUCCESS {{ background: #eef8ee; }}
      .WARNING {{ background: #fff8e6; }}
      .ERROR {{ background: #ffecec; }}
      ul {{ margin: 0; padding-left: 18px; }}
    </style>
  </head>
  <body>
    <h1>Phase 0 Task Report</h1>
    <p>Generated: {html.escape(generated_at.isoformat())}</p>
    <p>Corrections JSON: {html.escape(str(corrections_path))}</p>
    <table>
      <thead>
        <tr>
          <th>Original filename</th>
          <th>Detected format</th>
          <th>Container</th>
          <th>Parse status</th>
          <th>Confidence</th>
          <th>Destination summaries</th>
          <th>Total cartons</th>
          <th>Total volume</th>
          <th>Calculated pallets</th>
          <th>Report file link</th>
          <th>Label file link</th>
          <th>Warnings</th>
          <th>Errors</th>
          <th>Correction fields</th>
        </tr>
      </thead>
      <tbody>
        {rows}
      </tbody>
    </table>
  </body>
</html>
"""


def _record_block(record: TaskReportRecord) -> str:
    return f"""<tr class="{html.escape(record.parseStatus)}">
  <td>{html.escape(record.originalFilename)}</td>
  <td>{html.escape(record.detectedFormat)}</td>
  <td>{html.escape(record.containerNo or "")}</td>
  <td>{html.escape(record.parseStatus)}</td>
  <td>{record.confidence:.2f}</td>
  <td>{_destination_list(record.destinationSummaries)}</td>
  <td>{record.totalCartons}</td>
  <td>{record.totalVolumeCbm:.3f}</td>
  <td>{record.calculatedPallets}</td>
  <td>{_link_or_empty(record.reportFileLink)}</td>
  <td>{_link_or_empty(record.labelFileLink)}</td>
  <td>{_issue_list(record.warnings)}</td>
  <td>{_issue_list(record.errors)}</td>
  <td>correctedContainerNo<br>correctedDestinationCode<br>correctedPallets<br>correctionNote</td>
</tr>"""


def _destination_list(summaries: tuple[TaskDestinationSummary, ...]) -> str:
    if not summaries:
        return ""
    items = [
        (
            f"{summary.destinationCode or 'NEED_MANUAL_DESTINATION'}: "
            f"{summary.totalCartons} ctn, {summary.totalVolumeCbm:.3f} cbm, "
            f"{summary.calculatedPallets} plt"
            f"{_rule_text(summary)}"
        )
        for summary in summaries
    ]
    return "<ul>" + "".join(f"<li>{html.escape(item)}</li>" for item in items) + "</ul>"


def _rule_text(summary: TaskDestinationSummary) -> str:
    parts: list[str] = []
    if summary.palletRuleCode:
        parts.append(f"rule {summary.palletRuleCode}")
    if summary.packageType:
        parts.append(f"package {summary.packageType}")
    if summary.calculationBasisCbm is not None:
        parts.append(f"basis {summary.calculationBasisCbm:.3f} cbm")
    if summary.roundingMode:
        parts.append(f"rounding {summary.roundingMode}")

    return f" ({', '.join(parts)})" if parts else ""


def _issue_list(issues: tuple[TaskIssue, ...]) -> str:
    if not issues:
        return ""
    return "<ul>" + "".join(f"<li>{html.escape(_issue_text(issue))}</li>" for issue in issues) + "</ul>"


def _issue_text(issue: TaskIssue) -> str:
    return issue.message


def _link_or_empty(path: str | None) -> str:
    if not path:
        return "Not generated"
    escaped = html.escape(path)
    return f'<a href="{escaped}">{escaped}</a>'


def _existing_output_path(result: Any) -> Path | None:
    output_path = getattr(result, "outputPath", None)
    if isinstance(output_path, Path) and output_path.exists():
        return output_path
    return None


def _issue_from_any(value: Any, *, code: str | None = None) -> TaskIssue:
    if isinstance(value, str):
        return TaskIssue(code=code or "MESSAGE", message=value)

    return TaskIssue(
        code=str(getattr(value, "code", code or "MESSAGE")),
        message=str(getattr(value, "message", value)),
        rowNumber=getattr(value, "row_number", getattr(value, "rowNumber", None)),
        field=getattr(value, "field", None),
    )


def _status(warnings: tuple[TaskIssue, ...], errors: tuple[TaskIssue, ...]) -> str:
    if errors:
        return "ERROR"
    if warnings:
        return "WARNING"
    return "SUCCESS"


def _format_value(value: Any) -> str:
    return str(getattr(value, "value", value))
