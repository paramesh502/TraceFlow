"use client";

import type { Playback } from "@/hooks/usePlayback";
import type { Step } from "@/lib/types";

/**
 * Scrubbable progress bar plus a label describing the current step (which method
 * and line is executing). Clicking the track seeks to that step.
 */
export function Timeline({
  playback,
  steps,
}: {
  playback: Playback;
  steps: Step[];
}) {
  const { index, total } = playback;
  const current = steps[index];
  const progress = total > 1 ? (index / (total - 1)) * 100 : 0;

  const label = current
    ? `${current.method}()  ·  line ${current.line}`
    : "No trace yet — run some code.";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span className="truncate pr-3 font-mono text-slate-200">{label}</span>
        <span className="shrink-0 tabular-nums">
          {total > 0 ? `${index + 1} / ${total}` : "0 / 0"}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(total - 1, 0)}
        value={index}
        onChange={(e) => playback.seek(Number(e.target.value))}
        disabled={total === 0}
        aria-label="Timeline scrubber"
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-border accent-accent disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(to right, #6366f1 ${progress}%, #1f2937 ${progress}%)`,
        }}
      />
    </div>
  );
}
