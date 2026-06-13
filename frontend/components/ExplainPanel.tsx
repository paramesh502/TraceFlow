"use client";

import { useState } from "react";
import { ApiError, explain } from "@/lib/api";
import type { ExplainResponse, Step } from "@/lib/types";

// AI is gated off by default so a public deploy doesn't burn your free LLM quota.
// Enable it by setting NEXT_PUBLIC_AI_ENABLED=true in the frontend environment.
const AI_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === "true";

/**
 * "Explain this step" panel — the AI layer. When enabled, it requests a
 * plain-English explanation of the current step grounded in the real trace
 * state and supports follow-up questions. When disabled it shows a "coming
 * soon" teaser. Remounted per step (via a `key` on the index) so it starts fresh.
 */
export function ExplainPanel({
  code,
  step,
  prevStep,
}: {
  code: string;
  step: Step;
  prevStep: Step | null;
}) {
  if (!AI_ENABLED) return <ComingSoon />;
  return <ExplainPanelLive code={code} step={step} prevStep={prevStep} />;
}

function ComingSoon() {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft/5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-accent-hover">✨ AI explanation &amp; Q&amp;A</span>
        <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] text-accent-hover">
          Coming soon
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        Step-by-step explanations and questions about your code — grounded in the real
        execution state. Launching soon.
      </p>
    </div>
  );
}

function ExplainPanelLive({
  code,
  step,
  prevStep,
}: {
  code: string;
  step: Step;
  prevStep: Step | null;
}) {
  const [result, setResult] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");

  const ask = async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await explain(code, step, prevStep, q);
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not get an explanation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-accent-hover">✨ AI explanation</span>
        {result && <span className="text-[10px] text-slate-500">via {result.provider}</span>}
      </div>

      {!result && !loading && (
        <button
          onClick={() => ask()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Explain this step
        </button>
      )}

      {loading && <p className="animate-pulse text-xs text-slate-400">Thinking…</p>}
      {error && <p className="text-xs text-active">{error}</p>}

      {result && (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
            {result.explanation}
          </p>
          {result.warning && (
            <p className="mt-1 text-[10px] text-slate-500">
              Add a free GEMINI_API_KEY or GROQ_API_KEY for richer explanations.
            </p>
          )}
        </>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) ask(question.trim());
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this step…"
          className="min-w-0 flex-1 rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent hover:text-white disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
