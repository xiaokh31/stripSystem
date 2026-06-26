from __future__ import annotations

import warnings
from collections.abc import Iterator
from contextlib import contextmanager


@contextmanager
def ignore_openpyxl_conditional_formatting_warning() -> Iterator[None]:
    # The parsers read workbook values only; unsupported style extension metadata is irrelevant.
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="Conditional Formatting extension is not supported and will be removed",
            category=UserWarning,
            module=r"openpyxl\.worksheet\._reader",
        )
        yield
