import { onIdle } from "@/lib/idle";

/**
 * Fetch the offer ahead of the reader.
 *
 * The paywall and the checkout are `lazy()` chunks, and behind them sit the biller's browser
 * SDK and a price preview round trip — three serial waits a reader would
 * otherwise start paying for at the moment they arrive, on the one screen that is asking them
 * for a decision. Started on the first idle moment after the reader answers something: not at
 * the first paint, which has the wire to itself, and not a step or two out, because the last
 * step before the price is an account step a signed-in reader passes straight through.
 *
 * **Every load here is a dynamic `import()`** — this module is reached from `FunnelShell`,
 * which is the bundle that hydrates the first paint, so a static biller import would put its
 * SDK in front of step 0 rather than behind it.
 */

let started = false;

export function prewarmOffer(): void {
  if (started) return;
  started = true;
  onIdle(() => {
    warm(import("./PaywallStep"));
    warm(import("./CheckoutStep"));
    // The chunks are the smaller half of the wait: this is what puts this visitor's own prices
    // on the wire.
    warm(import("./planQuote").then((module) => module.planQuote()));
  });
}

/** A prewarm that fails costs nothing: the step's own `lazy()` asks again when the reader
 * gets there, and the paywall falls back to the USD quote it already renders. */
function warm(load: Promise<unknown>): void {
  void load.catch(() => {});
}
