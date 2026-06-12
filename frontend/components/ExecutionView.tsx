"use client";

import type { TraceResponse } from "@/lib/types";
import { CallStackView } from "./CallStackView";

interface ExecutionViewProps {
  result: TraceResponse | null;
  index: number;
  error: string | null;
  isLoading: boolean;
}

/**
 * Right pane. Shows the program state for the current step: the call stack with
 * all variables and data structures, plus program output. Compile/runtime
 * problems and the empty state are handled here too.
 */
export function ExecutionView({ result, index, error, isLoading }: ExecutionViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Program State
        </h2>
        {result?.ok && result.steps.length > 0 && (
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] text-slate-400">
            {result.steps[index]?.frames[0]?.className ?? result.className} · line {result.steps[index]?.line}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <Body result={result} index={index} error={error} isLoading={isLoading} />
      </div>

      {result?.ok && (result.steps[index]?.stdout ?? result.stdout) && (
        <OutputPanel text={result.steps[index]?.stdout ?? ""} truncated={result.truncated} />
      )}
    </div>
  );
}

function Body({ result, index, error, isLoading }: ExecutionViewProps) {
  if (error) {
    return (
      <div className="mx-auto mt-10 max-w-md text-center">
        <div className="mb-2 text-2xl">⚠️</div>
        <p className="text-sm text-slate-300">{error}</p>
      </div>
    );
  }
  if (isLoading) {
    return <p className="mt-10 animate-pulse text-center text-sm text-slate-500">Compiling &amp; tracing…</p>;
  }
  if (!result) {
    return (
      <div className="mx-auto mt-10 max-w-xs text-center text-slate-500">
        <div className="mb-3 text-3xl">▶</div>
        <p className="text-sm">
          Paste Java code and click <span className="text-accent-hover">Run &amp; Trace</span> to
          step through its execution.
        </p>
      </div>
    );
  }

  // Compile or runtime problem reported by the tracer.
  if (!result.ok) {
    return (
      <div className="mx-auto mt-6 max-w-lg">
        <div className="mb-2 text-sm font-semibold text-active">
          {result.stage === "compile" ? "Compilation error" : "Could not run"}
        </div>
        <pre className="whitespace-pre-wrap rounded-lg border border-active/30 bg-active/5 p-3 font-mono text-xs text-slate-300">
          {result.error}
        </pre>
      </div>
    );
  }

  if (result.steps.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-md text-center text-slate-400">
        <p className="text-sm">Program ran but produced no traceable steps.</p>
        {result.stdout && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-raised p-3 text-left font-mono text-xs">
            {result.stdout}
          </pre>
        )}
      </div>
    );
  }

  const step = result.steps[index];
  return <CallStackView frames={step.frames} heap={step.heap} />;
}

function OutputPanel({ text, truncated }: { text: string; truncated: boolean }) {
  return (
    <div className="border-t border-surface-border bg-surface-raised px-4 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Output</span>
        {truncated && <span className="text-[10px] text-active">trace truncated</span>}
      </div>
      <pre className="max-h-24 overflow-auto whitespace-pre-wrap font-mono text-xs text-emerald-300">
        {text || " "}
      </pre>
    </div>
  );
}
