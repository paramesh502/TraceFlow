"""Integration tests for the Java execution tracer.

These require a JDK (java + javac) on PATH. Run standalone:
    PYTHONPATH=. python tests/test_tracer.py
"""

from __future__ import annotations

from app.core import tracer_runner

TWO_SUM = """
import java.util.*;
public class TwoSum {
    public static int[] twoSum(int[] nums, int target) {
        HashMap<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[]{map.get(complement), i};
            }
            map.put(nums[i], i);
        }
        return new int[]{-1, -1};
    }
    public static void main(String[] args) {
        int[] nums = {2, 7, 11, 15};
        System.out.println(twoSum(nums, 9)[1]);
    }
}
"""

RECURSION = """
public class Rec {
    static int fib(int n) {
        if (n < 2) return n;
        return fib(n - 1) + fib(n - 2);
    }
    public static void main(String[] args) {
        System.out.println(fib(4));
    }
}
"""

COMPILE_ERROR = """
public class Broken {
    public static void main(String[] args) {
        int x = ;
    }
}
"""


def test_two_sum_traces_with_map():
    res = tracer_runner.run_trace(TWO_SUM)
    assert res["ok"] is True
    assert res["stepCount"] > 0
    assert res["stdout"].strip() == "1"
    # Somewhere the HashMap holds the entry 2 -> 0.
    found = False
    for step in res["steps"]:
        for obj in step["heap"].values():
            if obj.get("kind") == "map":
                for k, v in obj.get("entries", []):
                    if k.get("value") == 2 and v.get("value") == 0:
                        found = True
    assert found, "expected HashMap entry 2 -> 0 in the trace"


def test_recursion_grows_call_stack():
    res = tracer_runner.run_trace(RECURSION)
    assert res["ok"] is True
    assert res["stdout"].strip() == "3"
    max_depth = max(len(s["frames"]) for s in res["steps"])
    assert max_depth >= 3, "recursive calls should deepen the call stack"


def test_compile_error_is_reported():
    res = tracer_runner.run_trace(COMPILE_ERROR)
    assert res["ok"] is False
    assert res["stage"] == "compile"
    assert "line" in res["error"].lower()


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All tracer tests passed.")
