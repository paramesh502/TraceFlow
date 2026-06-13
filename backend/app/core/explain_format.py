"""Render trace state into compact text for LLM prompts and rule-based output.

The tracer's frames/heap model is verbose JSON. For prompting (and for the
deterministic fallback) we flatten it into short human-readable strings like
``nums=[2, 7, 11, 15], map={2: 0}, i=0`` so the model sees ground-truth values
without huge token cost.
"""

from __future__ import annotations

from typing import Any

_MAX_DEPTH = 4
_MAX_ITEMS = 30


def render_value(v: dict[str, Any], heap: dict[str, Any], depth: int = 0) -> str:
    """Render a single Value (prim or ref) to a short string."""
    if v.get("kind") == "prim":
        val = v.get("value")
        t = v.get("type")
        if t == "String":
            return f'"{val}"'
        if t == "null" or val is None:
            return "null"
        if t == "char":
            return f"'{val}'"
        return str(val)

    # reference
    obj = heap.get(str(v.get("id")))
    if obj is None or depth > _MAX_DEPTH:
        return f"#{v.get('id')}"

    kind = obj.get("kind")
    if kind == "prim":
        return str(obj.get("value"))
    if kind == "array":
        return "[" + ", ".join(render_value(e, heap, depth + 1) for e in obj.get("elements", [])[:_MAX_ITEMS]) + "]"
    if kind == "map":
        pairs = [
            f"{render_value(k, heap, depth + 1)}: {render_value(val, heap, depth + 1)}"
            for k, val in obj.get("entries", [])[:_MAX_ITEMS]
        ]
        return "{" + ", ".join(pairs) + "}"
    if kind in ("list", "set"):
        body = ", ".join(render_value(e, heap, depth + 1) for e in obj.get("elements", [])[:_MAX_ITEMS])
        return f"{obj.get('type', kind)}[{body}]"
    if kind == "object":
        fields = ", ".join(
            f"{n}={render_value(fv, heap, depth + 1)}" for n, fv in list(obj.get("fields", {}).items())[:_MAX_ITEMS]
        )
        return f"{obj.get('type', 'obj')}({fields})"
    return f"#{v.get('id')}"


def render_frame(frame: dict[str, Any], heap: dict[str, Any]) -> str:
    locals_ = frame.get("locals", {})
    body = ", ".join(f"{n}={render_value(v, heap)}" for n, v in locals_.items()) or "(no locals)"
    return f"{frame.get('className')}.{frame.get('method')}() @ line {frame.get('line')}: {body}"


def render_state(step: dict[str, Any]) -> str:
    """Render the whole call stack for a step, top frame first."""
    heap = step.get("heap", {})
    frames = step.get("frames", [])
    if not frames:
        return "(no user frames at this step)"
    return "\n".join("  " + render_frame(f, heap) for f in frames)


def diff_top_frame(prev: dict[str, Any] | None, cur: dict[str, Any]) -> str:
    """Describe what changed in the top frame's locals since the previous step."""
    cur_frames = cur.get("frames", [])
    if not cur_frames:
        return ""
    cur_top = cur_frames[0]
    cur_heap = cur.get("heap", {})
    cur_locals = cur_top.get("locals", {})

    prev_locals: dict[str, Any] = {}
    prev_heap: dict[str, Any] = {}
    if prev and prev.get("frames"):
        # Match by method name so we compare the same frame, not a caller.
        for f in prev["frames"]:
            if f.get("method") == cur_top.get("method"):
                prev_locals = f.get("locals", {})
                prev_heap = prev.get("heap", {})
                break

    changes: list[str] = []
    for name, v in cur_locals.items():
        now = render_value(v, cur_heap)
        if name not in prev_locals:
            changes.append(f"{name} = {now} (new)")
        else:
            before = render_value(prev_locals[name], prev_heap)
            if before != now:
                changes.append(f"{name}: {before} → {now}")
    return "; ".join(changes)


def numbered_source(code: str, max_lines: int = 200) -> str:
    lines = code.splitlines()[:max_lines]
    width = len(str(len(lines)))
    return "\n".join(f"{str(i + 1).rjust(width)} | {ln}" for i, ln in enumerate(lines))


def line_text(code: str, line: int) -> str:
    lines = code.splitlines()
    if 1 <= line <= len(lines):
        return lines[line - 1].strip()
    return ""
