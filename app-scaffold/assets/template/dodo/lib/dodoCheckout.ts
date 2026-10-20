import type { CheckoutEvent, CheckoutMode } from "dodopayments-checkout";

/**
 * Dodo's checkout SDK, initialized once and shared.
 *
 * Memoized because `DodoPayments.Initialize` accepts exactly one `onEvent` callback while
 * two consumers need the events — `InlineCheckout` for the order summary, `CheckoutStep`
 * for the conversions — so the single callback fans out to a listener set instead.
 *
 * Lazily imported so the SDK never lands in the bundle that gates the funnel's first paint.
 * **Nothing above the paywall step may import this module.**
 *
 * `mode` comes from the server alongside the checkout url rather than from a public env var:
 * the url already encodes which Dodo minted it, and one value that cannot drift beats two
 * that can.
 */

type CheckoutSdk = typeof import("dodopayments-checkout").DodoPayments;
type CheckoutListener = (event: CheckoutEvent) => void;

const listeners = new Set<CheckoutListener>();

let instance: Promise<CheckoutSdk> | null = null;

export function dodoCheckoutClient(mode: CheckoutMode): Promise<CheckoutSdk> {
  instance ??= import("dodopayments-checkout").then(({ DodoPayments }) => {
    DodoPayments.Initialize({
      mode,
      displayType: "inline",
      onEvent: (event) => listeners.forEach((listener) => listener(event)),
    });
    return DodoPayments;
  });
  return instance;
}

/** Close whatever checkout is open, if the SDK was ever loaded. A no-op before the first
 * `open`, which is what makes it safe to call from a teardown path. */
export async function closeDodoCheckout(): Promise<void> {
  if (!instance) return;
  (await instance).Checkout.close();
}

export function onDodoCheckoutEvent(listener: CheckoutListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
