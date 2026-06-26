from worker_python.task_reports.corrections_schema import (
    correction_draft_from_records,
    write_corrections_json,
)
from worker_python.task_reports.html_task_report import (
    TaskDestinationSummary,
    TaskIssue,
    TaskReportRecord,
    TaskReportResult,
    generate_html_task_report,
    record_from_detection,
    record_from_parsed_result,
)

__all__ = [
    "TaskDestinationSummary",
    "TaskIssue",
    "TaskReportRecord",
    "TaskReportResult",
    "correction_draft_from_records",
    "generate_html_task_report",
    "record_from_detection",
    "record_from_parsed_result",
    "write_corrections_json",
]
