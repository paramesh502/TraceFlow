"""Minimal .env loader (no dependency).

Loads ``backend/.env`` into the process environment at startup so a key dropped
in that file (per .env.example) is picked up without exporting it by hand.
Existing environment variables always win, and we never overwrite them.
"""

from __future__ import annotations

from pathlib import Path

# backend/app/core/env.py -> backend/.env
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def load_env() -> None:
    if not _ENV_FILE.exists():
        return
    import os

    for raw in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
