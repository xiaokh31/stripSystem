from __future__ import annotations

import re
from typing import Any


def normalize_header(value: Any) -> str:
    text = str(value or "").replace("＃", "#").replace("：", ":").replace("³", "3")
    return re.sub(r"\s+", "", text).upper()
