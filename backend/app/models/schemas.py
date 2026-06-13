"""Pydantic schemas for the TraceFlow API.

The trace itself is a dynamic, deeply-nested structure produced by the Java
tracer (call frames + an arbitrary heap graph), so the response forwards it as
loosely-typed JSON rather than over-modelling it. The frontend mirrors the shape
in `frontend/lib/types.ts`.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TraceRequest(BaseModel):
    """Incoming request: the user's source code plus an optional language hint."""

    code: str = Field(..., min_length=1, description="Source code to trace.")
    language: str = Field(default="java", description="Source language (currently 'java').")


class TraceResponse(BaseModel):
    """Result of an execution trace.

    On success: ``ok=True`` with ``steps`` (one snapshot per executed line),
    ``stdout`` and ``className``. On a user-code problem (compile/runtime):
    ``ok=False`` with ``error`` and ``stage``.
    """

    ok: bool
    className: str | None = None
    steps: list[dict[str, Any]] = Field(default_factory=list)
    stdout: str = ""
    truncated: bool = False
    stepCount: int = 0
    error: str | None = None
    stage: str | None = None


class ExplainRequest(BaseModel):
    """Ask for a natural-language explanation of one trace step.

    ``step``/``prevStep`` are raw trace Step objects (as returned by /api/trace).
    Set ``question`` for grounded Q&A about the current state instead of a
    generic step explanation.
    """

    code: str = Field(..., min_length=1)
    step: dict[str, Any]
    prevStep: dict[str, Any] | None = None
    question: str | None = Field(default=None, max_length=500)


class ExplainResponse(BaseModel):
    explanation: str
    provider: str
    warning: str | None = None
