from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from worker_python.time_utils import operational_now


REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_CORRECTIONS_DIR = REPO_ROOT / "storage" / "corrections"


def correction_draft_from_records(
    records: tuple[Any, ...],
    *,
    generated_at: datetime,
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "generated_at": generated_at.isoformat(),
        "corrections": [
            {
                "correctionId": f"CORR-{index:04d}",
                "originalFilename": record.originalFilename,
                "detectedFormat": record.detectedFormat,
                "containerNo": record.containerNo,
                "correctedContainerNo": None,
                "correctedDestinationCode": None,
                "correctedPallets": None,
                "correctionNote": None,
                "auditEvents": [],
            }
            for index, record in enumerate(records, start=1)
        ],
    }


def write_corrections_json(
    records: tuple[Any, ...],
    *,
    output_dir: Path = DEFAULT_CORRECTIONS_DIR,
    generated_at: datetime | None = None,
) -> Path:
    generated_at = generated_at or operational_now()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"corrections-{generated_at.date().isoformat()}.json"
    draft = correction_draft_from_records(records, generated_at=generated_at)
    output_path.write_text(
        json.dumps(draft, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return output_path
