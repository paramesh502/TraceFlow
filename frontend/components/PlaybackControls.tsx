"use client";

import type { Playback } from "@/hooks/usePlayback";

const SPEEDS = [0.5, 1, 1.5, 2];

/** Transport controls: restart / prev / play-pause / next + speed selector. */
export function PlaybackControls({
  playback,
  disabled,
}: {
  playback: Playback;
  disabled: boolean;
}) {
  const { index, total, isPlaying, speed } = playback;
  const atStart = index <= 0;
  const atEnd = index >= total - 1;

  return (
    <div className="flex items-center gap-2">
      <IconButton label="Restart" onClick={playback.restart} disabled={disabled || atStart}>
        ⟲
      </IconButton>
      <IconButton label="Previous" onClick={playback.prev} disabled={disabled || atStart}>
        ⏮
      </IconButton>
      <button
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={playback.toggle}
        disabled={disabled}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
      <IconButton label="Next" onClick={playback.next} disabled={disabled || atEnd}>
        ⏭
      </IconButton>

      <div className="ml-2 flex items-center gap-1 rounded-lg border border-surface-border p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => playback.setSpeed(s)}
            disabled={disabled}
            className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
              speed === s
                ? "bg-accent text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-border text-slate-300 transition-colors hover:border-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
