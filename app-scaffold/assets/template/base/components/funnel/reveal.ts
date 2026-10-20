import { useEffect, useState } from "preact/hooks";

/**
 * Once per page load, not once per mount: a reader who steps back onto a widget gets the end
 * state rather than the performance a second time. No animation library — this bundle
 * hydrates the first paint.
 */

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** After the step's own entry animation has settled. */
export const REVEAL_DELAY_MS = 950;

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const played = new Set<string>();

const skips = (key: string): boolean => played.has(key) || prefersReducedMotion();

/** Eased 0 → 1 over `durationMs`, after `delayMs`. Jumps to 1 on a second visit. */
export function useRamp(key: string, delayMs: number, durationMs: number): number {
  const [progress, setProgress] = useState(() => (played.has(key) ? 1 : 0));

  useEffect(() => {
    if (skips(key)) {
      setProgress(1);
      return;
    }
    played.add(key);
    let frame = 0;
    let startedAt = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / durationMs);
      setProgress(easeInOutCubic(elapsed));
      if (elapsed < 1) frame = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame((now) => {
        startedAt = now;
        tick(now);
      });
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, []);

  return progress;
}

/** How many of `count` items have arrived. Jumps to `count` on a second visit. */
export function useStagger(key: string, count: number, delayMs: number, everyMs: number): number {
  const [shown, setShown] = useState(() => (played.has(key) ? count : 0));

  useEffect(() => {
    if (skips(key)) {
      setShown(count);
      return;
    }
    played.add(key);
    const timers = Array.from({ length: count }, (_, index) =>
      window.setTimeout(() => setShown(index + 1), delayMs + index * everyMs),
    );
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return shown;
}
