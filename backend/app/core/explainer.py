"""AI explanation layer for TraceFlow.

Turns the current trace step into a plain-English explanation of what the line
does and why it matters. Pluggable, free-tier-friendly providers:

* ``gemini`` — Google Gemini (free tier), via the public REST endpoint.
* ``groq``   — Groq (free tier), OpenAI-compatible REST endpoint.
* ``rule``   — deterministic, no network/key. Always available as a fallback.

Provider is chosen by ``TRACEFLOW_LLM_PROVIDER`` (gemini|groq|rule). If unset, we
auto-detect from whichever API key is present, else fall back to ``rule``. All
HTTP uses the standard library, so there is no extra dependency to install.

Get a free key:
* Gemini: https://aistudio.google.com/apikey  → set GEMINI_API_KEY
* Groq:   https://console.groq.com/keys       → set GROQ_API_KEY
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from app.core import explain_format as fmt

_TIMEOUT_S = 30

_SYSTEM = (
    "You are TraceFlow, a tutor that explains Java algorithm execution to students. "
    "You are given the program, the exact line currently executing, and the real "
    "program state captured by a debugger (these values are ground truth — never "
    "contradict them). Be concise and concrete; use the actual values; do not just "
    "restate the code."
)


# ---- Prompt construction ----

def _build_prompt(code: str, step: dict, prev: dict | None, question: str | None) -> str:
    line = step.get("line", 0)
    parts = [
        "Program:",
        "```java",
        fmt.numbered_source(code),
        "```",
        f"\nCurrently executing line {line}: `{fmt.line_text(code, line)}`",
        "\nCall stack and variables right now (top frame first):",
        fmt.render_state(step),
    ]
    diff = fmt.diff_top_frame(prev, step)
    if diff:
        parts.append(f"\nWhat changed since the previous step: {diff}")
    if step.get("stdout"):
        parts.append(f"\nProgram output so far: {step['stdout'].strip()!r}")

    if question:
        parts.append(
            f'\nThe student asks: "{question}"\n'
            "Answer in 1-3 short sentences using only the real state above. "
            "If it cannot be determined from this step, say so."
        )
    else:
        parts.append(
            "\nIn 1-2 short sentences, explain what this line is doing right now and "
            "why it matters for the algorithm. Reference the actual values."
        )
    return "\n".join(parts)


# ---- Providers ----

def _http_post_json(url: str, payload: dict, headers: dict[str, str]) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _gemini(prompt: str) -> str:
    key = os.environ["GEMINI_API_KEY"]
    model = os.getenv("TRACEFLOW_GEMINI_MODEL", "gemini-2.0-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 300},
    }
    data = _http_post_json(url, payload, {})
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def _groq(prompt: str) -> str:
    key = os.environ["GROQ_API_KEY"]
    model = os.getenv("TRACEFLOW_GROQ_MODEL", "llama-3.3-70b-versatile")
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 300,
    }
    data = _http_post_json(url, payload, {"Authorization": f"Bearer {key}"})
    return data["choices"][0]["message"]["content"].strip()


def _rule_based(code: str, step: dict, prev: dict | None, question: str | None) -> str:
    """Deterministic explanation from the trace diff — no network or key."""
    line = step.get("line", 0)
    text = fmt.line_text(code, line)
    if question:
        return (
            "AI explanations are not configured, so I can't answer free-form questions. "
            f"At line {line} (`{text}`), the current state is:\n{fmt.render_state(step)}"
        )
    method = step.get("method", "?")
    diff = fmt.diff_top_frame(prev, step)
    if diff:
        return f"Line {line} in {method}() — `{text}`. This step changed: {diff}."
    return f"Line {line} in {method}() — `{text}`."


# ---- Public entry point ----

def _selected_provider() -> str:
    explicit = os.getenv("TRACEFLOW_LLM_PROVIDER", "").strip().lower()
    if explicit in {"gemini", "groq", "rule"}:
        return explicit
    if os.getenv("GEMINI_API_KEY"):
        return "gemini"
    if os.getenv("GROQ_API_KEY"):
        return "groq"
    return "rule"


def explain(code: str, step: dict, prev: dict | None = None, question: str | None = None) -> dict[str, Any]:
    """Return ``{"explanation": str, "provider": str}``.

    Falls back to the rule-based explainer (noting the failure) if a cloud
    provider is selected but errors out, so the UI always gets a useful answer.
    """
    provider = _selected_provider()
    if provider == "rule":
        return {"explanation": _rule_based(code, step, prev, question), "provider": "rule-based"}

    prompt = _build_prompt(code, step, prev, question)
    try:
        text = _gemini(prompt) if provider == "gemini" else _groq(prompt)
        return {"explanation": text, "provider": provider}
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, TimeoutError, ValueError) as exc:
        fallback = _rule_based(code, step, prev, question)
        return {
            "explanation": fallback,
            "provider": f"rule-based (fallback — {provider} unavailable)",
            "warning": str(exc),
        }
