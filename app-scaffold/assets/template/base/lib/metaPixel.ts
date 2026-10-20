/**
 * Meta Pixel runtime helpers — the browser half of the purchase signal.
 *
 * Its server counterpart is `lib/meta.ts`, fired from the biller's webhook. The two share an
 * `event_id` per purchase so Meta collapses them into one conversion.
 *
 * Kept apart from `components/MetaPixel.tsx` because these are called from client
 * components all over the funnel, while that file is only a `<Script>` tag.
 */

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

/** Inert until configured, the same shape as the biller's own gate. A dev machine or
 * a preview deploy therefore never pollutes live ad data. */
export const isMetaPixelConfigured = Boolean(META_PIXEL_ID);

export type MetaEvent =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "CompleteRegistration"
  | "InitiateCheckout"
  | "Purchase";

interface Fbq {
  (
    command: "track",
    event: MetaEvent,
    params?: Record<string, unknown>,
    options?: { eventID: string },
  ): void;
}

type PendingEvent = [MetaEvent, Record<string, unknown> | undefined, string | undefined];

/**
 * Events fired before the Pixel library was ready to send them.
 *
 * Without this they are dropped in silence — `metaTrack` would return when `window.fbq` was
 * absent, so a lost ViewContent looks exactly like a delivered one. We cannot pre-create
 * `fbq` to buffer them (Meta's snippet bails on `if (f.fbq) return`), so they wait here
 * until `flushMetaQueue` establishes that fbevents.js actually arrived.
 */
const pending: PendingEvent[] = [];

/** `waiting` until fbevents.js is known to have loaded or to have been blocked. Events
 * fired while blocked are dropped at the door rather than buffered forever. */
let state: "waiting" | "ready" | "blocked" = "waiting";
let watching = false;

/**
 * The Pixel library, or undefined while only the snippet's stub exists.
 *
 * Meta's snippet installs `window.fbq` synchronously; fbevents.js adds `callMethod` when it
 * executes. Testing for the function alone therefore reports a *blocked* pixel as ready: the
 * event goes into the stub's own queue, nothing ever drains it, and `metaTrack` returns as
 * though it sent. That is the silent loss this module's buffer exists to prevent.
 */
const loadedFbq = (): Fbq | undefined => {
  const candidate = (window as unknown as { fbq?: Fbq & { callMethod?: unknown } }).fbq;
  return typeof candidate?.callMethod === "function" ? candidate : undefined;
};

const send = (
  fbq: Fbq,
  event: MetaEvent,
  params?: Record<string, unknown>,
  eventId?: string,
): void => fbq("track", event, params ?? {}, eventId ? { eventID: eventId } : undefined);

/** How long fbevents.js gets before we call it blocked. */
const READY_TIMEOUT_MS = 5000;
const READY_POLL_MS = 100;

/**
 * Fire a standard Pixel event, buffering until the pixel is ready. A no-op when the pixel
 * isn't configured, so callers never guard.
 *
 * Pass `eventId` only for events the server also sends — today `Purchase` alone. Meta
 * deduplicates on `event_name` + `event_id` within 48 hours, so an id here that the server
 * does not repeat suppresses nothing, and a mismatched one double-counts.
 */
export function metaTrack(
  event: MetaEvent,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  if (!isMetaPixelConfigured || state === "blocked") return;
  const ready = loadedFbq();
  if (!ready) {
    pending.push([event, params, eventId]);
    return;
  }
  send(ready, event, params, eventId);
}

/**
 * Wait for the Pixel library, then replay whatever fired before it arrived.
 *
 * Called from the loader's `onLoad`, which is not the same moment: `/scripts/pixel.js`
 * injects fbevents.js and returns, so the library is still in flight when it fires. Hence a
 * poll rather than a single check — sampling once here would strand the buffer for every
 * reader, blocked or not. Idempotent, and safe to call from more than one place.
 */
export function flushMetaQueue(): void {
  // `isMetaPixelConfigured` first: `MetaPixel` calls this from a mount effect, and an effect
  // runs before the `return null` that skips rendering the loader. Without this guard a
  // deployment with no pixel id polls for five seconds on every page load and then reports a
  // blocked pixel that was never asked to load — which is precisely the number that is
  // supposed to say how much of the browser-side view is missing.
  if (!isMetaPixelConfigured || state !== "waiting" || watching) return;
  watching = true;
  const deadline = Date.now() + READY_TIMEOUT_MS;

  const settle = () => {
    // Withheld on purpose where consent would be required — `proxy.ts` serves a stub loader
    // that sets this instead of Meta's snippet. Settle quietly: a pixel we chose not to load
    // is not a blocked one, and counting it as one would corrupt the number that says how
    // much of the browser-side view is missing.
    if ((window as unknown as { __metaConsentGated?: boolean }).__metaConsentGated) {
      state = "blocked";
      pending.length = 0;
      return;
    }
    const ready = loadedFbq();
    if (ready) {
      state = "ready";
      while (pending.length) {
        const [event, params, eventId] = pending.shift()!;
        send(ready, event, params, eventId);
      }
      return;
    }
    if (Date.now() >= deadline) {
      state = "blocked";
      const buffered = pending.length;
      pending.length = 0;
      // Reported to Amplitude rather than to Meta, for the obvious reason. Imported lazily
      // so the analytics SDK stays out of every page's first-paint bundle — this module is
      // reachable from the root layout, and the pixel being blocked is the rare path.
      void import("./analytics").then(({ track }) => track({ name: "meta_pixel_blocked", buffered }));
      return;
    }
    setTimeout(settle, READY_POLL_MS);
  };

  settle();
}

/**
 * Read a first-party cookie the Pixel sets. `_fbp` identifies the browser and `_fbc` the ad
 * click that landed here; the funnel forwards both through the biller so the server event can
 * carry them, because a webhook call from the biller is not the reader's browser.
 *
 * These are also what populate the purchasers Custom Audience that every campaign excludes.
 * Dropping them from the CAPI payload would break that exclusion, not just match quality.
 */
export function metaCookie(name: "_fbp" | "_fbc"): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
