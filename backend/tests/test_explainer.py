"""Tests for the explanation layer (rule-based path — no API key needed).

Run standalone: PYTHONPATH=. python tests/test_explainer.py
"""

from __future__ import annotations

import os

from app.core import explain_format as fmt
from app.core import explainer

CODE = "public class T {\n  void f() {\n    int i = 0;\n  }\n}"

STEP = {
    "line": 3,
    "method": "f",
    "stdout": "",
    "frames": [
        {
            "className": "T",
            "method": "f",
            "line": 3,
            "locals": {
                "i": {"kind": "prim", "type": "int", "value": 1},
                "arr": {"kind": "ref", "id": 5},
            },
        }
    ],
    "heap": {
        "5": {
            "kind": "array",
            "type": "int[]",
            "elements": [
                {"kind": "prim", "type": "int", "value": 2},
                {"kind": "prim", "type": "int", "value": 7},
            ],
        }
    },
}

PREV = {
    "line": 2,
    "method": "f",
    "frames": [
        {"className": "T", "method": "f", "line": 2, "locals": {"i": {"kind": "prim", "type": "int", "value": 0}}}
    ],
    "heap": {},
}


def test_render_value_array():
    assert fmt.render_value(STEP["frames"][0]["locals"]["arr"], STEP["heap"]) == "[2, 7]"


def test_diff_detects_change_and_new():
    diff = fmt.diff_top_frame(PREV, STEP)
    assert "i: 0 → 1" in diff
    assert "arr = [2, 7] (new)" in diff


def test_rule_based_explanation(monkeypatch_env=None):
    # Force rule-based regardless of any ambient key.
    os.environ.pop("GEMINI_API_KEY", None)
    os.environ.pop("GROQ_API_KEY", None)
    os.environ["TRACEFLOW_LLM_PROVIDER"] = "rule"
    res = explainer.explain(CODE, STEP, PREV)
    assert res["provider"] == "rule-based"
    assert "i: 0 → 1" in res["explanation"]


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All explainer tests passed.")
