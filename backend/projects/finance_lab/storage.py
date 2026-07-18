from __future__ import annotations

import json
import os
import re
from pathlib import Path
from threading import Lock
from uuid import uuid4

_SAFE_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$")
_LOCKS: dict[str, Lock] = {}
_LOCKS_GUARD = Lock()


def lock_for(path: Path) -> Lock:
    key = str(path.resolve())
    with _LOCKS_GUARD:
        if key not in _LOCKS:
            _LOCKS[key] = Lock()
        return _LOCKS[key]


def safe_id(value: str, label: str = "id") -> str:
    cleaned = str(value or "").strip()
    if not _SAFE_ID.fullmatch(cleaned):
        raise ValueError(f"Invalid {label}")
    return cleaned


def atomic_write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.parent / f".{path.name}.tmp.{uuid4().hex}"

    with temp_path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)
        file.write("\n")
        file.flush()
        os.fsync(file.fileno())

    temp_path.replace(path)


def read_json(path: Path, fallback):
    try:
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        corrupt = path.with_suffix(path.suffix + f".corrupt.{uuid4().hex[:8]}")
        try:
            path.replace(corrupt)
        except OSError:
            pass
        return fallback


def write_json_locked(path: Path, data) -> None:
    with lock_for(path):
        atomic_write_json(path, data)
