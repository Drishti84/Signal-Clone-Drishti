"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** The current time, refreshed on an interval, so "5m ago" labels keep moving. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function isWatching(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/** True while this tab is the one the person is actually looking at. */
export function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const update = () => setFocused(isWatching());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return focused;
}

/** Call `onAway` on Escape or on a click outside `ref`, while `active`. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onAway: () => void,
): void {
  const callback = useRef(onAway);
  useEffect(() => {
    callback.current = onAway;
  });
  useEffect(() => {
    if (!active) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) callback.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") callback.current();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, active]);
}

export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
