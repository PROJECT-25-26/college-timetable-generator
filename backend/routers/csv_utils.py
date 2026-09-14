"""
Shared utilities for CSV bulk-import endpoints.

Usage pattern
-------------
  from routers.csv_utils import parse_csv_bytes, CsvRowError, raise_if_errors
"""

from __future__ import annotations

import codecs
import csv
import io
from dataclasses import dataclass

from fastapi import HTTPException


# ---------------------------------------------------------------------------
# Error structure
# ---------------------------------------------------------------------------
@dataclass
class CsvRowError:
    row: int          # 1-based, header not counted
    field: str
    message: str

    def to_dict(self) -> dict:
        return {"row": self.row, "field": self.field, "message": self.message}


# ---------------------------------------------------------------------------
# Raise if any errors were collected
# ---------------------------------------------------------------------------
def raise_if_errors(errors: list[CsvRowError]) -> None:
    """Raise HTTP 422 with a structured error body if the list is non-empty."""
    if not errors:
        return
    raise HTTPException(
        status_code=422,
        detail={"errors": [e.to_dict() for e in errors]},
    )


# ---------------------------------------------------------------------------
# CSV parser
# ---------------------------------------------------------------------------
def parse_csv_bytes(content: bytes) -> tuple[list[str], list[list[str]]]:
    """
    Decode *content* as UTF-8 (BOM-tolerant) and return:
      (header_row, data_rows)

    Blank rows are skipped.  Returns ([], []) for an empty / header-only file.
    Raises HTTPException 400 when the file cannot be decoded or has no header.
    """
    try:
        text = content.decode("utf-8-sig")           # strips BOM if present
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception:
            raise HTTPException(status_code=400, detail="CSV file is not valid UTF-8 or Latin-1.")

    reader = csv.reader(io.StringIO(text, newline=""))
    rows: list[list[str]] = [
        [cell.strip() for cell in row]
        for row in reader
        if any(cell.strip() for cell in row)   # skip blank rows
    ]

    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty.")

    header = [h.strip() for h in rows[0]]
    data   = rows[1:]
    return header, data


# ---------------------------------------------------------------------------
# Small coercion helpers (return None on failure)
# ---------------------------------------------------------------------------
def parse_int_field(value: str) -> int | None:
    """Return int or None if *value* is blank / non-numeric."""
    v = value.strip()
    if not v:
        return None
    try:
        return int(v)
    except ValueError:
        return None
