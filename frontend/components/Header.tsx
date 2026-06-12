export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-surface-border bg-surface-raised px-5 py-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          TF
        </div>
        <div className="leading-tight">
          <h1 className="text-base font-semibold tracking-tight">TraceFlow</h1>
          <p className="text-[11px] text-slate-400">
            Visualize DSA code, step by step
          </p>
        </div>
      </div>
      <a
        href="https://github.com"
        target="_blank"
        rel="noreferrer"
        className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent hover:text-white"
      >
        Docs
      </a>
    </header>
  );
}
