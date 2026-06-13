"use client";

import type { Frame, HeapObject, Step, Value } from "@/lib/types";
import { ValueView, makeCtx, valueEq } from "./state/ValueView";

/**
 * Renders the call stack for the current step. The top frame (currently
 * executing) is shown first and highlighted; each frame lists its local
 * variables, rendered richly via ValueView. Variables that changed since the
 * previous step are flagged so the user can see exactly what moved.
 */
export function CallStackView({
  step,
  prevStep,
}: {
  step: Step;
  prevStep: Step | null;
}) {
  const { frames, heap } = step;
  const prevHeap = prevStep?.heap;

  if (frames.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No user frames at this step (executing library code).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {frames.map((frame, i) => {
        const isTop = i === 0;
        const ctx = makeCtx(heap, prevHeap);
        const locals = Object.entries(frame.locals);
        const prevFrame = matchPrevFrame(frame, i, frames.length, prevStep);
        const changed = changedLocals(frame, prevFrame, heap, prevHeap);

        return (
          <div
            key={i}
            className={`rounded-lg border p-3 ${
              isTop ? "border-accent/60 bg-accent-soft/10" : "border-surface-border bg-surface-raised/40"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-slate-200">
                {frame.className}.{frame.method}()
              </span>
              <span className="flex items-center gap-2">
                {isTop && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-white">running</span>}
                <span className="text-[11px] text-slate-500">line {frame.line}</span>
              </span>
            </div>

            {locals.length === 0 ? (
              <p className="text-xs text-slate-600">no local variables</p>
            ) : (
              <div className="flex flex-col gap-2">
                {locals.map(([name, value]) => {
                  const didChange = changed.has(name);
                  return (
                    <div
                      key={name}
                      className={`flex flex-wrap items-start gap-2 rounded-md ${didChange ? "bg-active/10 px-1.5 py-1" : ""}`}
                    >
                      <span className={`mt-1 min-w-[3rem] font-mono text-xs ${didChange ? "font-semibold text-active" : "text-slate-400"}`}>
                        {name}
                      </span>
                      <div className="flex-1">
                        <ValueView value={value} ctx={ctx} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Match a current frame to the equivalent frame in the previous step by call
 * depth (distance from the bottom of the stack), so recursion lines up and a
 * newly-entered frame correctly has no match.
 */
function matchPrevFrame(
  frame: Frame,
  index: number,
  curLen: number,
  prevStep: Step | null,
): Frame | null {
  if (!prevStep) return null;
  const prevFrames = prevStep.frames;
  const depth = curLen - 1 - index;
  const prevIdx = prevFrames.length - 1 - depth;
  if (prevIdx < 0 || prevIdx >= prevFrames.length) return null;
  const pf = prevFrames[prevIdx];
  return pf.method === frame.method && pf.className === frame.className ? pf : null;
}

function changedLocals(
  frame: Frame,
  prevFrame: Frame | null,
  heap: Record<string, HeapObject>,
  prevHeap?: Record<string, HeapObject>,
): Set<string> {
  const changed = new Set<string>();
  if (!prevFrame) return changed; // newly-entered frame: nothing to diff against
  for (const [name, v] of Object.entries(frame.locals)) {
    const pv = prevFrame.locals[name];
    if (pv === undefined || localChanged(v, pv, heap, prevHeap)) changed.add(name);
  }
  return changed;
}

/**
 * Did a local change? Reassignment (different prim value or different ref id),
 * or in-place mutation of the *same* object (its shallow heap entry differs).
 */
function localChanged(
  v: Value,
  pv: Value,
  heap: Record<string, HeapObject>,
  prevHeap?: Record<string, HeapObject>,
): boolean {
  if (!valueEq(v, pv)) return true;
  if (v.kind === "ref" && pv.kind === "ref" && prevHeap) {
    // Same id — check whether the object's contents mutated. Heap entries embed
    // child objects only as ref-ids, so they're flat and safe to stringify.
    return JSON.stringify(heap[String(v.id)]) !== JSON.stringify(prevHeap[String(pv.id)]);
  }
  return false;
}
