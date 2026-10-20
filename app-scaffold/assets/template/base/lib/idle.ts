/**
 * Run `task` once the main thread has nothing better to do, and no later than `timeout`.
 *
 * For the things a page needs eventually but not before it is usable — analytics, the
 * sign-in client. Loading those from a mount effect puts their chunks on the wire beside the
 * one the reader is actually waiting for; from here they wait their turn.
 *
 * Safari, and so every WebView paid traffic arrives in, has no `requestIdleCallback`. The
 * fallback is a timeout at the deadline: later than idle would have been, but still off the
 * hydration task, which is what matters.
 */
export function onIdle(task: () => void, timeout = 1500): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(task, { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, timeout);
  return () => clearTimeout(id);
}
