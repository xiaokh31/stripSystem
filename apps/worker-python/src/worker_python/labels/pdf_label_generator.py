from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Any

import qrcode
from jinja2 import Environment, FileSystemLoader, select_autoescape
from qrcode.constants import ERROR_CORRECT_M
from weasyprint import HTML

from worker_python.labels.qr_payload import build_qr_payload
from worker_python.time_utils import operational_now, operational_today


REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "storage" / "labels"
LABEL_MANIFEST_FILENAME = "label_manifest.json"
TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"
TEMPLATE_NAME = "label.html"
PRINT_CALIBRATION_FILENAME = "print-calibration.pdf"
PRINT_CALIBRATION_TEMPLATE_NAME = "print_calibration.html"
MANUAL_DESTINATION = "NEED_MANUAL_DESTINATION"


@dataclass(frozen=True)
class LabelGenerationIssue:
    code: str
    message: str
    palletId: str | None = None


@dataclass(frozen=True)
class LabelGenerationResult:
    outputPath: Path
    manifestPath: Path
    warnings: tuple[LabelGenerationIssue, ...]
    errors: tuple[LabelGenerationIssue, ...]
    labelCount: int
    palletIds: tuple[str, ...]
    qrPayloads: tuple[str, ...]


@dataclass(frozen=True)
class PrintCalibrationResult:
    outputPath: Path
    pageWidthMm: int
    pageHeightMm: int
    qrBoxMm: int
    instruction: str


def generate_pallet_label_pdf(
    *,
    parsed_result: Any,
    pallet_result: Any,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    label_date: date | None = None,
) -> LabelGenerationResult:
    label_date = label_date or operational_today()
    output_dir.mkdir(parents=True, exist_ok=True)

    container_no = getattr(parsed_result, "containerNo", None) or "UNKNOWN-CONTAINER"
    warnings: list[LabelGenerationIssue] = []
    errors: list[LabelGenerationIssue] = []
    labels = _label_contexts(
        container_no=container_no,
        pallet_result=pallet_result,
        label_date=label_date,
        warnings=warnings,
    )

    output_path = output_dir / f"{_safe_filename(container_no)}托盘面单.pdf"
    manifest_path = output_dir / LABEL_MANIFEST_FILENAME

    if not labels:
        errors.append(
            LabelGenerationIssue(
                code="NO_PALLET_LABELS",
                message="No pallet IDs were available for label generation.",
            )
        )
        return LabelGenerationResult(
            outputPath=output_path,
            manifestPath=manifest_path,
            warnings=tuple(warnings),
            errors=tuple(errors),
            labelCount=0,
            palletIds=(),
            qrPayloads=(),
        )

    html = _render_template(labels)
    HTML(string=html, base_url=str(TEMPLATE_DIR)).write_pdf(
        output_path,
        uncompressed_pdf=True,
    )
    _append_manifest_record(
        manifest_path=manifest_path,
        output_path=output_path,
        container_no=container_no,
        label_date=label_date,
        labels=labels,
        warnings=warnings,
    )

    return LabelGenerationResult(
        outputPath=output_path,
        manifestPath=manifest_path,
        warnings=tuple(warnings),
        errors=tuple(errors),
        labelCount=len(labels),
        palletIds=tuple(label["pallet_id"] for label in labels),
        qrPayloads=tuple(label["qr_payload"] for label in labels),
    )


def generate_print_calibration_pdf(
    *,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
) -> PrintCalibrationResult:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / PRINT_CALIBRATION_FILENAME
    instruction = (
        "Disable automatic print scaling. Print at actual size / 100% on "
        "150mm x 100mm label stock."
    )
    environment = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = environment.get_template(PRINT_CALIBRATION_TEMPLATE_NAME)
    html = template.render(instruction=instruction)
    HTML(string=html, base_url=str(TEMPLATE_DIR)).write_pdf(
        output_path,
        uncompressed_pdf=True,
    )
    return PrintCalibrationResult(
        outputPath=output_path,
        pageWidthMm=150,
        pageHeightMm=100,
        qrBoxMm=30,
        instruction=instruction,
    )


def _label_contexts(
    *,
    container_no: str,
    pallet_result: Any,
    label_date: date,
    warnings: list[LabelGenerationIssue],
) -> list[dict[str, Any]]:
    labels: list[dict[str, Any]] = []

    for plan in getattr(pallet_result, "plans", ()):
        destination = getattr(plan, "destinationCode", None) or MANUAL_DESTINATION
        if destination == MANUAL_DESTINATION:
            warnings.append(
                LabelGenerationIssue(
                    code="MISSING_DESTINATION",
                    message="Destination is missing; label uses NEED_MANUAL_DESTINATION.",
                )
            )

        pallet_ids = tuple(getattr(plan, "palletIds", ()) or ())
        for plan_index, pallet_id in enumerate(pallet_ids, start=1):
            if not pallet_id:
                warnings.append(
                    LabelGenerationIssue(
                        code="MISSING_PALLET_ID",
                        message="Skipped a label because pallet ID is missing.",
                    )
                )
                continue

            pallet_no = str(plan_index)
            qr_payload = build_qr_payload(
                label_date=label_date,
                container_no=container_no,
                destination=destination,
                pallet_no=pallet_no,
                pallet_id=pallet_id,
            )
            labels.append(
                {
                    "date": label_date.isoformat(),
                    "container_no": container_no,
                    "destination": destination,
                    "destination_font_size": _destination_font_size(destination),
                    "pallet_no": pallet_no,
                    "pallet_id": pallet_id,
                    "qr_payload": qr_payload,
                    "qr_data_uri": _qr_data_uri(qr_payload),
                }
            )

    return labels


def _destination_font_size(destination: str) -> str:
    length = len(destination.strip())
    if length > 44:
        return "28pt"
    if length > 30:
        return "34pt"
    if length > 20:
        return "44pt"
    return "56pt"


def _render_template(labels: list[dict[str, Any]]) -> str:
    environment = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(("html", "xml")),
    )
    template = environment.get_template(TEMPLATE_NAME)
    return template.render(labels=labels)


def _qr_data_uri(payload: str) -> str:
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _append_manifest_record(
    *,
    manifest_path: Path,
    output_path: Path,
    container_no: str,
    label_date: date,
    labels: list[dict[str, Any]],
    warnings: list[LabelGenerationIssue],
) -> None:
    manifest = _load_manifest(manifest_path)
    record = {
        "generated_at": operational_now().isoformat(),
        "label_date": label_date.isoformat(),
        "container_no": container_no,
        "output_path": str(output_path),
        "label_count": len(labels),
        "pallet_ids": [label["pallet_id"] for label in labels],
        "warnings": [warning.message for warning in warnings],
    }
    manifest["records"] = [
        existing
        for existing in manifest["records"]
        if existing.get("output_path") != str(output_path)
    ]
    manifest["records"].append(record)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _load_manifest(manifest_path: Path) -> dict[str, Any]:
    if not manifest_path.exists():
        return {"schema_version": 1, "records": []}

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1:
        raise ValueError(f"Unsupported label manifest schema: {manifest_path}")
    if not isinstance(manifest.get("records"), list):
        raise ValueError(f"Label manifest records must be a list: {manifest_path}")
    return manifest


def _safe_filename(value: str) -> str:
    return "".join(character for character in value if character.isalnum() or character in "-_") or "UNKNOWN-CONTAINER"
