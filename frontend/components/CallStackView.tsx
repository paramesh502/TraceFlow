"use client";

import type { Frame, HeapObject } from "@/lib/types";
import { ValueView, makeCtx } from "./state/ValueView";

/**
 * Renders the call stack for the current step. The top frame (currently
 * executing) is shown first and highlighted; each frame lists its local
 * variables, rendered richly via ValueView.
 */
export function CallStackView({
  frames,
  heap,
}: {
  frames: Frame[];
  heap: Record<string, HeapObject>;
}) {
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
        const ctx = makeCtx(heap);
        const locals = Object.entries(frame.locals);
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
                {locals.map(([name, value]) => (
                  <div key={name} className="flex flex-wrap items-start gap-2">
                    <span className="mt-1 min-w-[3rem] font-mono text-xs text-slate-400">{name}</span>
                    <div className="flex-1">
                      <ValueView value={value} ctx={ctx} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
