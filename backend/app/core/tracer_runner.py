"""Bridge between FastAPI and the Java JDI tracer.

Compiles the tracer on demand (first use), then runs it as a subprocess with the
user's source on stdin and parses the JSON trace it writes to stdout.

The heavy lifting — compiling the user's code, single-stepping under the Java
Debug Interface and serializing program state — happens in `backend/tracer`.
This module only orchestrates the process and surfaces clean errors.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any

# backend/app/core/tracer_runner.py -> backend/
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_TRACER_DIR = _BACKEND_DIR / "tracer"
_SRC_DIR = _TRACER_DIR / "src"
_BUILD_DIR = _TRACER_DIR / "build"
_MAIN_CLASS = "com.traceflow.Tracer"

# The user's code runs in a child VM with the tracer's own 12s deadline; give the
# whole subprocess some headroom on top of that.
_SUBPROCESS_TIMEOUT_S = 25


class TracerError(RuntimeError):
    """Raised when the tracer cannot run (toolchain/infra problem, not user code)."""


def _require(tool: str) -> str:
    path = shutil.which(tool)
    if path is None:
        raise TracerError(
            f"'{tool}' was not found on PATH. A JDK (with {tool}) is required to run TraceFlow."
        )
    return path


def _sources() -> list[Path]:
    return sorted(_SRC_DIR.glob("com/traceflow/*.java"))


def _needs_compile() -> bool:
    tracer_class = _BUILD_DIR / "com" / "traceflow" / "Tracer.class"
    if not tracer_class.exists():
        return True
    newest_src = max((p.stat().st_mtime for p in _sources()), default=0)
    return newest_src > tracer_class.stat().st_mtime


@lru_cache(maxsize=1)
def ensure_compiled() -> Path:
    """Compile the tracer if needed; return the build dir. Cached per process."""
    if _needs_compile():
        javac = _require("javac")
        _BUILD_DIR.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [javac, "--add-modules", "jdk.jdi", "-d", str(_BUILD_DIR),
             *(str(p) for p in _sources())],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise TracerError(f"Failed to compile the tracer:\n{result.stderr.strip()}")
    return _BUILD_DIR


def run_trace(code: str) -> dict[str, Any]:
    """Run the tracer on `code` and return its parsed JSON result.

    The returned dict has either ``ok: true`` with a ``steps`` list, or
    ``ok: false`` with an ``error`` and ``stage`` (user-facing compile/run
    problems). Infrastructure failures raise :class:`TracerError`.
    """
    build_dir = ensure_compiled()
    java = _require("java")

    try:
        result = subprocess.run(
            [java, "--add-modules", "jdk.jdi", "-cp", str(build_dir), _MAIN_CLASS],
            input=code,
            capture_output=True,
            text=True,
            timeout=_SUBPROCESS_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired as exc:
        raise TracerError("Tracing timed out.") from exc

    if not result.stdout.strip():
        raise TracerError(
            "Tracer produced no output."
            + (f"\n{result.stderr.strip()}" if result.stderr.strip() else "")
        )

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise TracerError("Tracer returned malformed output.") from exc
