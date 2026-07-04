from __future__ import annotations

import html
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from worker_python.time_utils import operational_now
from worker_python.unloading_wage.settlement import (
    UnloadingWageIssue,
    UnloadingWageSettlementResult,
)


@dataclass(frozen=True)
class UnloadingWageTaskReportResult:
    htmlPath: Path
    payContainerCount: int
    workerCount: int
    warningCount: int
    errorCount: int


def generate_unloading_wage_html_report(
    *,
    settlement_result: UnloadingWageSettlementResult,
    output_dir: Path,
    original_filename: str,
    sha256: str,
    generated_at: datetime | None = None,
) -> UnloadingWageTaskReportResult:
    generated_at = generated_at or operational_now()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"unloading-wage-report-{generated_at.date().isoformat()}.html"
    output_path.write_text(
        _render_html(
            settlement_result=settlement_result,
            original_filename=original_filename,
            sha256=sha256,
            generated_at=generated_at,
        ),
        encoding="utf-8",
    )

    return UnloadingWageTaskReportResult(
        htmlPath=output_path,
        payContainerCount=len(settlement_result.payContainers),
        workerCount=len(settlement_result.workers),
        warningCount=len(settlement_result.warnings),
        errorCount=len(settlement_result.errors),
    )


def _render_html(
    *,
    settlement_result: UnloadingWageSettlementResult,
    original_filename: str,
    sha256: str,
    generated_at: datetime,
) -> str:
    pay_container_rows = "\n".join(
        _pay_container_row(pay_container)
        for pay_container in settlement_result.payContainers
    )
    worker_rows = "\n".join(_worker_row(worker) for worker in settlement_result.workers)
    warning_rows = "\n".join(_issue_row(issue) for issue in settlement_result.warnings)
    error_rows = "\n".join(_issue_row(issue) for issue in settlement_result.errors)

    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>UNLOAD-WAGE-P0 Task Report</title>
    <style>
      body {{ font-family: Arial, sans-serif; margin: 24px; color: #111; }}
      table {{ border-collapse: collapse; width: 100%; margin: 16px 0; }}
      th, td {{ border: 1px solid #bbb; padding: 6px; vertical-align: top; }}
      th {{ background: #eee; }}
      .meta {{ margin: 4px 0; }}
    </style>
  </head>
  <body>
    <h1>UNLOAD-WAGE-P0 Task Report</h1>
    <p class="meta">Generated: {html.escape(generated_at.isoformat())}</p>
    <p class="meta">Input file: {html.escape(original_filename)}</p>
    <p class="meta">SHA-256: {html.escape(sha256)}</p>
    <p class="meta">Settlement month: {html.escape(settlement_result.settlementMonth)}</p>
    <p class="meta">Total amount: {html.escape(settlement_result.currency)}
      {settlement_result.totalAmount:.2f}</p>

    <h2>Pay Containers</h2>
    <table>
      <thead>
        <tr>
          <th>Pay container</th>
          <th>Classification</th>
          <th>Trailer</th>
          <th>Containers</th>
          <th>Completed at</th>
          <th>Rate</th>
          <th>Allocation</th>
        </tr>
      </thead>
      <tbody>{pay_container_rows}</tbody>
    </table>

    <h2>Workers</h2>
    <table>
      <thead>
        <tr>
          <th>Worker ID</th>
          <th>Name</th>
          <th>Pay containers</th>
          <th>Total amount</th>
        </tr>
      </thead>
      <tbody>{worker_rows}</tbody>
    </table>

    <h2>Warnings</h2>
    <table>
      <thead><tr><th>Code</th><th>Work item</th><th>Pay container</th><th>Field</th><th>Message</th></tr></thead>
      <tbody>{warning_rows}</tbody>
    </table>

    <h2>Errors</h2>
    <table>
      <thead><tr><th>Code</th><th>Work item</th><th>Pay container</th><th>Field</th><th>Message</th></tr></thead>
      <tbody>{error_rows}</tbody>
    </table>
  </body>
</html>
"""


def _pay_container_row(pay_container) -> str:
    allocations = "<br>".join(
        f"{html.escape(allocation.workerName)}: {pay_container.currency} {allocation.amount:.2f}"
        for allocation in pay_container.allocations
    )
    return f"""<tr>
  <td>{html.escape(pay_container.payContainerId)}</td>
  <td>{html.escape(str(pay_container.classification.value))}</td>
  <td>{html.escape(str(pay_container.trailerNumber or ""))}</td>
  <td>{html.escape(", ".join(pay_container.containerNumbers))}</td>
  <td>{html.escape(pay_container.completedAt.isoformat())}</td>
  <td>{html.escape(pay_container.currency)} {pay_container.rateAmount:.2f}</td>
  <td>{html.escape(pay_container.allocationMethod)}<br>{allocations}</td>
</tr>"""


def _worker_row(worker) -> str:
    return f"""<tr>
  <td>{html.escape(worker.workerId)}</td>
  <td>{html.escape(worker.workerName)}</td>
  <td>{worker.payContainerCount}</td>
  <td>{worker.totalAmount:.2f}</td>
</tr>"""


def _issue_row(issue: UnloadingWageIssue) -> str:
    return f"""<tr>
  <td>{html.escape(issue.code)}</td>
  <td>{html.escape(str(issue.workItemId or ""))}</td>
  <td>{html.escape(str(issue.payContainerId or ""))}</td>
  <td>{html.escape(str(issue.field or ""))}</td>
  <td>{html.escape(issue.message)}</td>
</tr>"""
