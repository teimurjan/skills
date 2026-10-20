/**
 * The browser's one Paddle.js instance, and a fan-out for the events it emits.
 *
 * Paddle.js takes a single `eventCallback` per instance, so everything that wants checkout
 * events has to share the instance initialized with one — calling `initializePaddle` again
 * does not buy a second callback, it hands back the same script. The funnel has two
 * consumers (the frame, which draws its own summary from those events, and the step around
 * it, which reports the conversion off them), so the callback dispatches to a set of
 * listeners rather than belonging to whoever initialized first.
 *
 * Memoizing the promise also makes React's StrictMode double-effect a no-op instead of a
 * second checkout. It is lazy on purpose — nothing above the checkout step may import this,
 * or Paddle.js lands in the bundle that gates the funnel's first paint.
 */

import { initializePaddle, type Paddle, type PaddleEventData } from "@paddle/paddle-js";
import { paddleBrowserEnvironment, paddleClientToken } from "@/lib/paddlePrices";

type PaddleEventListener = (event: PaddleEventData) => void;

const listeners = new Set<PaddleEventListener>();

let instance: Promise<Paddle | undefined> | null = null;

/** The shared instance, initialized on first call. Resolves to `undefined` when Paddle.js
 * declines to load — callers treat that as they would a rejection. */
export function paddleBrowserClient(): Promise<Paddle | undefined> {
  instance ??= initializePaddle({
    token: paddleClientToken,
    environment: paddleBrowserEnvironment,
    eventCallback: (event) => listeners.forEach((listener) => listener(event)),
  });
  return instance;
}

/** Subscribe to every Paddle.js event. Returns the unsubscribe. */
export function onPaddleEvent(listener: PaddleEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
