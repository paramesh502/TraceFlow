"use client";

/**
 * Drives step-by-step playback over a list of frames.
 *
 * Owns the current step index and an auto-advancing timer. Exposes the controls
 * the PlaybackControls and Timeline components need (play/pause/next/prev/
 * restart/seek) plus playback speed. Resets to the first step whenever the
 * number of steps changes (i.e. a new visualization is loaded).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Playback {
  index: number;
  total: number;
  isPlaying: boolean;
  speed: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  restart: () => void;
  seek: (i: number) => void;
  setSpeed: (s: number) => void;
}

export function usePlayback(total: number): Playback {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when a new visualization arrives.
  useEffect(() => {
    setIndex(0);
    setIsPlaying(false);
  }, [total]);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Auto-advance loop. Stops at the last frame.
  useEffect(() => {
    if (!isPlaying) return;
    if (index >= total - 1) {
      setIsPlaying(false);
      return;
    }
    timer.current = setTimeout(() => {
      setIndex((i) => Math.min(i + 1, total - 1));
    }, 900 / speed);
    return clear;
  }, [isPlaying, index, total, speed, clear]);

  const play = useCallback(() => {
    if (total === 0) return;
    // Restart from the beginning if we're already at the end.
    setIndex((i) => (i >= total - 1 ? 0 : i));
    setIsPlaying(true);
  }, [total]);

  const pause = useCallback(() => setIsPlaying(false), []);
  const toggle = useCallback(
    () => (isPlaying ? pause() : play()),
    [isPlaying, pause, play],
  );

  const next = useCallback(() => {
    setIsPlaying(false);
    setIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  const prev = useCallback(() => {
    setIsPlaying(false);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const restart = useCallback(() => {
    setIsPlaying(false);
    setIndex(0);
  }, []);

  const seek = useCallback(
    (i: number) => {
      setIsPlaying(false);
      setIndex(Math.max(0, Math.min(i, total - 1)));
    },
    [total],
  );

  return {
    index,
    total,
    isPlaying,
    speed,
    play,
    pause,
    toggle,
    next,
    prev,
    restart,
    seek,
    setSpeed,
  };
}
