import { useEffect, useState } from "preact/hooks";
import type { CheckoutBreakdownData, CheckoutMode } from "dodopayments-checkout";
import { closeDodoCheckout, dodoCheckoutClient, onDodoCheckoutEvent } from "@/lib/dodoCheckout";
import type { Plan, PlanQuote } from "@/lib/plans";
import { CheckoutSummary } from "./CheckoutSummary";
import { useLocale } from "./locale";

/** Dodo injects its iframe into the element with this id. */
const FRAME_TARGET = "dodo-inline-checkout-frame";

/** Whichever of these arrives first means the frame has something on screen. */
const READY_EVENTS = new Set(["checkout.form_ready", "checkout.payment_page_opened", "checkout.breakdown"]);

/** A frame that reports nothing is still a frame; the loader goes after this long regardless. */
const READY_FALLBACK_MS = 4000;

/**
 * Dodo's payment frame plus our order summary. One session, one frame: the step re-keys this
 * on a new url rather than updating it. Closing on unmount is required, because the SDK
 * tracks the open checkout itself.
 */
export function InlineCheckout({
  checkoutUrl,
  mode,
  plan,
  quote,
}: {
  checkoutUrl: string;
  mode: CheckoutMode;
  plan: Plan;
  quote: PlanQuote;
}) {
  const words = useLocale().copy.checkout;
  const [breakdown, setBreakdown] = useState<CheckoutBreakdownData | undefined>();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void dodoCheckoutClient(mode)
      .then((sdk) => {
        if (!cancelled) sdk.Checkout.open({ checkoutUrl, elementId: FRAME_TARGET });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      void closeDodoCheckout();
    };
  }, [checkoutUrl, mode]);

  useEffect(
    () =>
      onDodoCheckoutEvent((event) => {
        if (event.event_type === "checkout.breakdown") setBreakdown(event.data as CheckoutBreakdownData);
        if (READY_EVENTS.has(event.event_type)) setReady(true);
        if (event.event_type === "checkout.error") setFailed(true);
      }),
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);

  if (failed) {
    return <p className="card px-4 py-3.5 text-center text-[15.5px] leading-snug text-muted">{words.failed}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The frame is in the DOM from the start for the SDK to inject into; the loader lays over it. */}
      <div className="relative min-h-[450px] w-full overflow-hidden rounded-[22px] bg-surface">
        <div id={FRAME_TARGET} className="w-full" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface">
            <p className="text-[16.5px] text-muted">{words.opening}</p>
          </div>
        )}
      </div>
      <CheckoutSummary breakdown={breakdown} plan={plan} quote={quote} />
    </div>
  );
}
