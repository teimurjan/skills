import { useCallback, useEffect, useState } from "preact/hooks";
import { OPENER_VALUES, WEB_FUNNEL } from "./steps";

/** Where the URL says the funnel is, and — on the first screen only — what was answered. */
export interface FunnelLocation {
  index: number;
  answer?: { key: string; value: string };
}

/**
 * Three forms: `#step-4` is the shell's own; `#step-1.problem=time` is what the prerendered
 * first screen's plain anchors write, so a tap landing before the bundle still carries its
 * answer; `?step=13` arrives from off-site through `/auth/callback`'s `next`. Clamped, so a
 * hand-edited `#step-99` lands on the last step.
 */
export function readLocation(): FunnelLocation {
  const hash = window.location.hash.replace(/^#step-/, "");
  const raw = hash || new URLSearchParams(window.location.search).get("step") || "";
  const [position, carried] = raw.split(".");
  const parsed = Number(position);
  const index = Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 0), WEB_FUNNEL.steps.length - 1)
    : 0;

  const [key, value] = carried?.split("=") ?? [];
  // Only ever the first step's own question. This is a pre-hydration handoff, not a deep-link
  // format: accepting arbitrary keys would let a pasted link write onto a transaction.
  const first = WEB_FUNNEL.steps[0].question?.key;
  const answer =
    key && value && first === key && OPENER_VALUES.includes(value)
      ? { key, value }
      : undefined;

  return { index, answer };
}

/** Every move goes through the hash, so Back walks the funnel backwards instead of leaving
 * it. Module scope is what keeps the two funnel hooks from importing each other. `replace`
 * is for a step that waves the reader through: an entry Back would land on only to bounce
 * forward again is a trap. */
export const goto = (index: number, { replace = false } = {}): void => {
  if (replace) window.location.replace(`#step-${index}`);
  else window.location.hash = `step-${index}`;
};

/** Leave the URL in the shell's own form. `step` is dropped so a reload doesn't re-read a
 * return path as a destination; the ad ids and any `auth_error` flag are left alone. */
export function normalizeLocation(index: number): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("step");
  url.hash = `step-${index}`;
  window.history.replaceState(null, "", url.toString());
}

/**
 * Where the funnel is, mirrored from the hash. **Read on the very first render, not in an
 * effect** — a render late painted the opening step once more on the way to the one the
 * reader asked for — and the guard is what keeps the build renderable with no `window`.
 * Call before `useFunnelSession`.
 */
export function useFunnelLocation(): { index: number; advance: () => void } {
  const [index, setIndex] = useState(() =>
    typeof window === "undefined" ? 0 : readLocation().index,
  );

  // Follow the hash on Back/Forward, and read once more on mount in case a tap landed between
  // the first render and this listener.
  useEffect(() => {
    const read = () => setIndex(readLocation().index);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const advance = useCallback(() => {
    if (index < WEB_FUNNEL.steps.length - 1) goto(index + 1);
  }, [index]);

  return { index, advance };
}
