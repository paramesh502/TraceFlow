"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { SAMPLES } from "@/lib/samples";

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  onRun: () => void;
  onLoadSample: (code: string) => void;
  isLoading: boolean;
  highlightLine: number | null;
}

/**
 * Left pane: Monaco-based Java editor with a sample loader, the primary
 * "Run & Trace" action, and a highlight on the line currently executing in the
 * trace.
 */
export function CodeEditor({
  code,
  onChange,
  onRun,
  onLoadSample,
  isLoading,
  highlightLine,
}: CodeEditorProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decorationsRef = useRef<any>(null);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    decorationsRef.current = editor.createDecorationsCollection();
  };

  // Move the highlight whenever the active line changes.
  useEffect(() => {
    const editor = editorRef.current;
    const collection = decorationsRef.current;
    if (!editor || !collection) return;

    if (highlightLine == null || highlightLine < 1) {
      collection.clear();
      return;
    }
    collection.set([
      {
        range: { startLineNumber: highlightLine, startColumn: 1, endLineNumber: highlightLine, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: "traceflow-active-line",
          glyphMarginClassName: "traceflow-active-glyph",
        },
      },
    ]);
    editor.revealLineInCenterIfOutsideViewport(highlightLine);
  }, [highlightLine]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border px-3 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0 pr-1 text-[11px] uppercase tracking-wide text-slate-500">
            Examples
          </span>
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              onClick={() => onLoadSample(s.code)}
              className="shrink-0 rounded-md border border-surface-border px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-accent hover:text-white"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          defaultLanguage="java"
          language="java"
          theme="vs-dark"
          value={code}
          onChange={(v) => onChange(v ?? "")}
          onMount={onMount}
          options={{
            fontSize: 13,
            fontFamily: "var(--font-mono), monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12 },
            tabSize: 4,
            glyphMargin: true,
            automaticLayout: true,
          }}
        />
      </div>

      <div className="border-t border-surface-border p-3">
        <button
          onClick={onRun}
          disabled={isLoading || code.trim().length === 0}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Tracing…" : "Run & Trace"}
        </button>
      </div>
    </div>
  );
}
