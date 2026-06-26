from __future__ import annotations

from pathlib import Path

import typer

from worker_python.batch import run_batch


app = typer.Typer(no_args_is_help=True)


@app.callback()
def root() -> None:
    pass


@app.command()
def batch(
    input_dir: Path = typer.Option(
        ...,
        "--input-dir",
        file_okay=False,
        dir_okay=True,
        readable=True,
        help="Directory containing .xlsx unloading files.",
    ),
    template: Path = typer.Option(
        ...,
        "--template",
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Excel unloading report template path.",
    ),
    output_dir: Path = typer.Option(
        ...,
        "--output-dir",
        file_okay=False,
        dir_okay=True,
        writable=True,
        help="Batch output storage directory.",
    ),
) -> None:
    result = run_batch(
        input_dir=input_dir,
        template_path=template,
        output_dir=output_dir,
    )
    typer.echo("Batch completed")
    typer.echo(f"Processed: {result.processedCount}")
    typer.echo(f"Success: {result.successCount}")
    typer.echo(f"Warnings: {result.warningFileCount}")
    typer.echo(f"Failed: {result.failedCount}")
    typer.echo(f"Parsed JSON: {result.parsedJsonDir}")
    typer.echo(f"Reports: {result.reportDir}")
    typer.echo(f"Labels: {result.labelDir}")
    typer.echo(f"Task report: {result.taskReport.htmlPath}")
    typer.echo(f"Corrections JSON: {result.taskReport.correctionsPath}")


def main() -> None:
    app()
