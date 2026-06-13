"use client";

import { useCallback, useState } from "react";
import { Header } from "@/components/Header";
import { CodeEditor } from "@/components/CodeEditor";
import { ExecutionView } from "@/components/ExecutionView";
import { PlaybackControls } from "@/components/PlaybackControls";
import { Timeline } from "@/components/Timeline";
import { usePlayback } from "@/hooks/usePlayback";
import { ApiError, trace } from "@/lib/api";
import { DEFAULT_CODE } from "@/lib/samples";
import type { TraceResponse } from "@/lib/types";

export default function Home() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [result, setResult] = useState<TraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const steps = result?.ok ? result.steps : [];
  const playback = usePlayback(steps.length);

  const runTrace = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await trace(code);
      setResult(res);
    } catch (e) {
      setResult(null);
      setError(e instanceof ApiError ? e.message : "Unexpected error while tracing.");
    } finally {
      setIsLoading(false);
    }
  }, [code]);

  const loadSample = useCallback((sample: string) => {
    setCode(sample);
    setResult(null);
    setError(null);
  }, []);

  const controlsDisabled = isLoading || steps.length === 0;
  const highlightLine = steps[playback.index]?.line ?? null;

  return (
    <div className="flex h-screen flex-col">
      <Header />

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section className="min-h-0 border-b border-surface-border lg:border-b-0 lg:border-r">
          <CodeEditor
            code={code}
            onChange={setCode}
            onRun={runTrace}
            onLoadSample={loadSample}
            isLoading={isLoading}
            highlightLine={highlightLine}
          />
        </section>

        <section className="min-h-0">
          <ExecutionView
            code={code}
            result={result}
            index={playback.index}
            error={error}
            isLoading={isLoading}
          />
        </section>
      </main>

      <footer className="flex flex-col gap-3 border-t border-surface-border bg-surface-raised px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <Timeline playback={playback} steps={steps} />
        </div>
        <PlaybackControls playback={playback} disabled={controlsDisabled} />
      </footer>
    </div>
  );
}
