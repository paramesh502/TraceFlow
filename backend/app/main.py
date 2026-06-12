"""TraceFlow FastAPI application.

Exposes the Java execution tracer over HTTP. The frontend posts source code and
receives a step-by-step trace of program state (call stack + heap) to animate.

CORS allows any localhost port in development (Next.js may not get port 3000) plus
any origins listed in ``TRACEFLOW_CORS_ORIGINS`` (comma-separated) for deployment.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core import tracer_runner
from app.core.tracer_runner import TracerError
from app.models.schemas import TraceRequest, TraceResponse


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Compile the tracer at startup so the first request isn't slow.

    Failures here are non-fatal (e.g. no JDK in a dev shell) — they surface
    clearly on the first /api/trace call instead.
    """
    try:
        tracer_runner.ensure_compiled()
    except TracerError:
        pass
    yield


app = FastAPI(
    title="TraceFlow API",
    description="Traces Java program execution into step-by-step visualization data.",
    version="2.0.0",
    lifespan=lifespan,
)


def _allowed_origins() -> list[str]:
    extra = os.getenv("TRACEFLOW_CORS_ORIGINS", "")
    return [o.strip() for o in extra.split(",") if o.strip()]


_LOCALHOST_RE = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=_LOCALHOST_RE,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}


@app.post("/api/trace", response_model=TraceResponse, tags=["trace"])
def trace(req: TraceRequest) -> TraceResponse:
    """Trace the execution of `req.code` and return per-line state snapshots."""
    if req.language.lower() != "java":
        raise HTTPException(status_code=400, detail="Only 'java' is supported.")
    try:
        result = tracer_runner.run_trace(req.code)
    except TracerError as exc:
        # Toolchain / infrastructure failure (not the user's fault).
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return TraceResponse(**result)
