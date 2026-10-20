import { useEffect } from "preact/hooks";
import { track } from "@/lib/analytics";
import { metaTrack } from "@/lib/metaPixel";
import { takePurchase } from "./session";

/** What Dodo puts in the return url's `status` when the subscription started or the one-time payment went through. */
const SUCCEEDED = new Set(["active", "succeeded"]);

/**
 * The browser half of the purchase signal, fired once on the success page, because Dodo's
 * SDK emits no completion event: success is the redirect here. Its server twin is the CAPI
 * event the Dodo webhook sends with the same `event_id`, so Meta counts one conversion.
 */
export function PurchaseReport() {
  useEffect(() => {
    // Taken unconditionally, so a failed attempt cannot leave its amount for a later one.
    const purchase = takePurchase();
    if (!purchase) return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const purchased = params.get("subscription_id") ?? params.get("payment_id");
    if (!purchased || (status && !SUCCEEDED.has(status))) return;

    metaTrack("Purchase", { value: purchase.value, currency: purchase.currency }, purchase.eventId);
    track({
      name: "purchase_completed",
      plan: purchase.plan,
      value: purchase.value,
      currency: purchase.currency,
      transaction_id: purchase.eventId,
    });
  }, []);

  return null;
}
