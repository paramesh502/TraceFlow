# TraceFlow Backend

FastAPI service that traces Java program execution into step-by-step state
snapshots. The actual tracing engine is a Java program under `tracer/` that uses
the Java Debug Interface (JDI); FastAPI compiles and shells out to it.

## Requirements

- **JDK 17+** with `java` and `javac` on PATH (the tracer needs the compiler and
  `jdk.jdi`). Tested on JDK 25.
- Python 3.11+ (tested on 3.14).

## Layout

| Path                          | Responsibility                                          |
| ----------------------------- | ------------------------------------------------------- |
| `app/main.py`                 | HTTP API (`POST /api/trace`, `GET /health`)             |
| `app/core/tracer_runner.py`   | Compile-on-demand + run the Java tracer subprocess      |
| `app/models/schemas.py`       | Request/response contract                               |
| `tracer/src/com/traceflow/`   | The JDI tracer: `Tracer`, `Serializer`, `Json`          |

## Pipeline

```
code ─▶ tracer_runner ─▶ [Java] Tracer
                           ├─ javac (compile with -g)
                           ├─ launch under JDI, STEP_LINE / STEP_INTO
                           ├─ per step: read call frames + locals + heap
                           └─ emit JSON  ─▶ TraceResponse
```

The tracer:
- Skips the standard library while stepping (you only see your code).
- Reads `java.util` collections structurally (internal fields) instead of
  invoking methods on the debuggee, so stepping stays robust.
- Unwraps boxed primitives (`Integer`, `Double`, …) to clean values.
- Bounds execution (~1500 steps / 12s) so infinite loops terminate safely.

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The tracer is compiled automatically on startup / first request, and recompiled
when its `.java` sources change. To build it by hand:

```bash
cd tracer
javac --add-modules jdk.jdi -d build src/com/traceflow/*.java
```

## Test

```bash
PYTHONPATH=. python tests/test_tracer.py   # requires a JDK
```

## Endpoints

- `POST /api/trace` — `{code, language}` → execution trace (see root README for
  the full response shape). `ok: false` with `stage`/`error` for compile/runtime
  problems in the user's code; HTTP 503 for toolchain failures (no JDK, etc.).
- `GET /health` — liveness.

## Configuration

- `TRACEFLOW_CORS_ORIGINS` — comma-separated extra allowed origins for the
  deployed frontend. Any `localhost` port is always allowed in development.

## Security

This service compiles and runs arbitrary user-submitted Java. The step/time
bounds are safety rails, **not** a security sandbox. Before exposing it publicly,
run it in an isolated container with no outbound network and tight resource
limits.
