# TraceFlow

**Understand any algorithm by watching it run.** TraceFlow executes Java code and
visualizes the *entire program state* — call stack, every variable, and every
data structure (arrays, HashMaps, linked lists, trees, recursion) — one line at
a time. Built for students who can read code but struggle to *see* how an
algorithm actually works.

This is real execution tracing (in the spirit of [Python Tutor](https://pythontutor.com)),
not pattern guessing: the code is compiled, run under a debugger, and every step
of its execution is captured.

```
┌──────────────────────────────────────────────────────────┐
│  TraceFlow                                                 │
├───────────────────────────┬──────────────────────────────┤
│  Java editor              │  Program State                │
│  (current line highlit)   │   Call stack & variables:     │
│                           │     twoSum()  nums=[2,7,11,15]│
│  [ Run & Trace ]          │       map={2→0}  i=0          │
│                           │   Output: 0, 1                │
├───────────────────────────┴──────────────────────────────┤
│  Timeline ──────●─────  ⟲ ⏮ ▶ ⏭   0.5× 1× 2×             │
└──────────────────────────────────────────────────────────┘
```

---

## What it shows

Paste a full Java program with a `main` method, click **Run & Trace**, then play
/ step / scrub through execution. At every step you see:

- **The current line** highlighted in the editor.
- **The call stack** — every active method frame (recursion included), top frame
  highlighted.
- **All variables** in each frame, rendered by type:
  - primitives, `String`, `boolean`, `char`
  - **arrays** (1-D and 2-D) as indexed boxes
  - **HashMap / HashSet** as key→value tables
  - **ArrayList / LinkedList / Stack / Queue / PriorityQueue** as element rows
  - **custom objects** as field tables
  - **linked lists** (objects with `next`) drawn as `1 → 2 → 3 → null`
  - **binary trees** (objects with `left`/`right`) drawn as a node/edge diagram
- **Program output** (stdout) as it accumulates.

Bundled examples: Two Sum (HashMap), Fibonacci (recursion), Bubble Sort (array),
Linked List reverse, Binary Search Tree.

---

## Architecture

```
TraceFlow/
├── frontend/                Next.js (App Router) + TypeScript + Tailwind + Framer Motion
│   ├── app/                 layout, page, global styles
│   ├── components/
│   │   ├── CodeEditor.tsx        Monaco editor + current-line highlight
│   │   ├── ExecutionView.tsx     right pane: state + output + errors
│   │   ├── CallStackView.tsx     frames and their locals
│   │   ├── Timeline.tsx          scrubber + step label
│   │   ├── PlaybackControls.tsx  play / step / speed
│   │   └── state/ValueView.tsx   recursive value renderer (arrays/maps/lists/trees)
│   ├── hooks/usePlayback.ts
│   └── lib/                  api client, shared types, samples
│
└── backend/                 FastAPI (Python) + Java tracer
    ├── app/
    │   ├── main.py               POST /api/trace
    │   ├── core/tracer_runner.py compiles + runs the Java tracer as a subprocess
    │   └── models/schemas.py     request/response contract
    └── tracer/              Java JDI tracer (the engine)
        └── src/com/traceflow/
            ├── Tracer.java       compile → launch under JDI → single-step → emit JSON
            ├── Serializer.java   JDI values → heap/variable JSON model
            └── Json.java         tiny dependency-free JSON writer
```

**Pipeline:** the frontend POSTs code → FastAPI shells out to the Java tracer →
the tracer compiles the code with `javac` (debug symbols), launches it under the
**Java Debug Interface (JDI)**, single-steps every line, and serializes the call
stack + heap at each step → FastAPI returns the JSON → the frontend animates it.

> The tracer reads `java.util` collections *structurally* (via their internal
> fields) rather than by invoking methods on the debuggee, which keeps stepping
> robust. It excludes the standard library from stepping so you only see *your*
> code. Traces are bounded (≈1500 steps / 12s) to handle infinite loops safely.

---

## API Contract

### `POST /api/trace`

Request:
```json
{ "code": "public class Main { ... }", "language": "java" }
```

Success response:
```json
{
  "ok": true,
  "className": "TwoSum",
  "stepCount": 14,
  "truncated": false,
  "stdout": "0, 1\n",
  "steps": [
    {
      "line": 6,
      "method": "twoSum",
      "stdout": "",
      "frames": [
        { "className": "TwoSum", "method": "twoSum", "line": 6,
          "locals": {
            "nums": { "kind": "ref", "id": 38 },
            "target": { "kind": "prim", "type": "int", "value": 9 },
            "i": { "kind": "prim", "type": "int", "value": 0 }
          } }
      ],
      "heap": {
        "38": { "kind": "array", "type": "int[]", "length": 4,
                "elements": [ { "kind": "prim", "type": "int", "value": 2 }, ... ] },
        "40": { "kind": "map", "type": "HashMap",
                "entries": [ [ {"kind":"prim","type":"int","value":2},
                               {"kind":"prim","type":"int","value":0} ] ] }
      }
    }
  ]
}
```

Compile/runtime problem (still HTTP 200 — it's the user's code, not a server error):
```json
{ "ok": false, "stage": "compile", "error": "Compilation failed:\n  line 4: ..." }
```

A `Value` is either `{"kind":"prim","type":...,"value":...}` or
`{"kind":"ref","id":<n>}` pointing into `heap`. Full shapes: `frontend/lib/types.ts`.

### `GET /health` → `{ "status": "ok" }`

---

## Local Setup

### Prerequisites
- **JDK 17+** (`java` and `javac` on PATH) — the tracer needs the compiler and
  the Java Debug Interface. Tested on JDK 25.
- **Python 3.11+** (tested on 3.14)
- **Node.js 18+** and npm

### 1. Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
The Java tracer is compiled automatically on first run (and recompiled when its
sources change). Interactive API docs at `http://localhost:8000/docs`.

Run the tracer tests (needs a JDK):
```bash
PYTHONPATH=. python tests/test_tracer.py
```

### 2. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_BASE_URL at the backend
npm run dev                        # http://localhost:3000
```

> If port 8000 is busy, run the backend on another port (e.g. `--port 8077`) and
> set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8077` in `frontend/.env.local`.

---

## Deployment

Frontend and backend deploy independently.

### Frontend → Vercel
1. Import the repo, set **Root Directory** to `frontend`.
2. Set `NEXT_PUBLIC_API_BASE_URL` to your deployed backend URL.
3. Deploy (Next.js auto-detected).

### Backend → any host with a JDK (Render / Railway / Fly.io / a container)
The backend runs user Java, so the runtime image **must include a JDK** (not just
a JRE — `javac` and `jdk.jdi` are required). The simplest path is a container:

```dockerfile
FROM eclipse-temurin:21-jdk
RUN apt-get update && apt-get install -y python3 python3-venv python3-pip
WORKDIR /app/backend
COPY backend/ .
RUN python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Set `TRACEFLOW_CORS_ORIGINS` to your deployed frontend URL.

> **Security note:** the backend executes arbitrary user Java. The tracer bounds
> steps and wall-clock time, but for a public deployment you should additionally
> sandbox it (a locked-down container, a Java SecurityManager/policy or a
> seccomp/gVisor-style runtime, no outbound network). This is the main hardening
> task before going fully public.

---

## Extending TraceFlow

- **A new data structure renders automatically** if it's a custom object or a
  supported `java.util` collection — no code changes needed. To special-case its
  visuals, add a branch in `frontend/components/state/ValueView.tsx`.
- **Support another collection's internals:** add a structural reader in
  `backend/tracer/src/com/traceflow/Serializer.java`.
- **Another language** (e.g. Python via `sys.settrace`): add a sibling tracer and
  branch in `tracer_runner.py`; the frontend model is language-agnostic.

---

## License

MIT.
