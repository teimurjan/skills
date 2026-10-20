import { useEffect, useRef, useState } from "preact/hooks";
import {
  CheckoutEventNames,
  type CheckoutCustomer,
  type CheckoutEventsData,
  type CheckoutOpenLineItem,
  type Paddle,
  type Theme,
} from "@paddle/paddle-js";
import { onPaddleEvent, paddleBrowserClient } from "@/lib/paddleClient";
import { PADDLE_LOCALE } from "@/lib/paddlePrices";
import { CheckoutSummary } from "./CheckoutSummary";
import { useLocale } from "./locale";

/** Paddle locates the container by class name and mounts its iframe inside it. */
const FRAME_TARGET = "paddle-inline-checkout-frame";
/** What Paddle opens the frame at before it measures itself; the container carries the same
 * number as a min-height so the step doesn't jump as the form arrives. */
const FRAME_INITIAL_HEIGHT = 450;

/** The events that can change what is being bought or what it costs. Re-rendering the summary
 * on the others would only make it flicker. */
const ORDER_EVENTS = new Set<CheckoutEventNames>([
  CheckoutEventNames.CHECKOUT_LOADED,
  CheckoutEventNames.CHECKOUT_UPDATED,
  CheckoutEventNames.CHECKOUT_ITEMS_UPDATED,
  CheckoutEventNames.CHECKOUT_CUSTOMER_CREATED,
  CheckoutEventNames.CHECKOUT_CUSTOMER_UPDATED,
  CheckoutEventNames.CHECKOUT_DISCOUNT_APPLIED,
  CheckoutEventNames.CHECKOUT_DISCOUNT_REMOVED,
]);

/**
 * Paddle's checkout in the page rather than over it. It closes on unmount: Paddle tracks the
 * open checkout itself, so removing the container from the DOM tells it nothing and the next
 * `open` would find one already there.
 *
 * Opened once. A different plan is swapped into the open checkout with `updateItems` rather
 * than a close and a fresh frame, so the form picked on the offer is still loaded at Continue.
 */
export function InlineCheckout({
  items,
  customer,
  customData,
  discountCode,
  successPath,
  theme,
}: {
  items: CheckoutOpenLineItem[];
  /** Prefill only. The buyer can still edit it, and Paddle owns the record. */
  customer?: CheckoutCustomer;
  customData?: Record<string, unknown>;
  /** Paddle applies it in the frame, and the summary picks it up off the discount events. */
  discountCode?: string;
  /** Resolved against the current origin — Paddle redirects the whole tab and wants it absolute. */
  successPath?: string;
  theme?: Theme;
}) {
  const { copy, lang } = useLocale();
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [checkout, setCheckout] = useState<CheckoutEventsData | undefined>();
  const [failed, setFailed] = useState(false);
  /** The items the open checkout holds; null while none is open. */
  const openedWith = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void paddleBrowserClient()
      .then((ready) => {
        if (cancelled) return;
        if (ready) setPaddle(ready);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const itemsKey = items.map((item) => `${item.priceId}:${item.quantity ?? 1}`).join(",");

  // `paddle` starting null is what keeps StrictMode's double-effect from opening two checkouts:
  // both mount passes bail on the null. The items, `customData`, `customer` and the discount are read fresh
  // but deliberately out of the deps — a new object literal from the parent must not reopen
  // the checkout, and a new plan is the effect below.
  useEffect(() => {
    if (!paddle) return;
    paddle.Checkout.open({
      items,
      ...(customer ? { customer } : {}),
      ...(customData ? { customData } : {}),
      ...(discountCode ? { discountCode } : {}),
      settings: {
        displayMode: "inline",
        variant: "one-page",
        frameTarget: FRAME_TARGET,
        frameInitialHeight: FRAME_INITIAL_HEIGHT,
        // Transparent and borderless: the page around it is already ours.
        frameStyle: "width: 100%; min-width: 312px; background-color: transparent; border: none;",
        ...(successPath
          ? { successUrl: new URL(successPath, window.location.origin).toString() }
          : {}),
        ...(theme ? { theme } : {}),
        ...(PADDLE_LOCALE[lang] ? { locale: PADDLE_LOCALE[lang] } : {}),
      },
    });
    openedWith.current = itemsKey;
    return () => {
      openedWith.current = null;
      void paddle.Checkout.close();
    };
  }, [paddle]);

  // Keyed on the items, not the array's identity, so an equivalent literal from the parent
  // doesn't touch the form.
  useEffect(() => {
    if (!paddle || openedWith.current === null || openedWith.current === itemsKey) return;
    openedWith.current = itemsKey;
    paddle.Checkout.updateItems(items.map(({ priceId, quantity }) => ({ priceId, quantity: quantity ?? 1 })));
  }, [paddle, itemsKey]);

  // Only the summary listens here; the conversions off these same events are `CheckoutStep`'s.
  useEffect(
    () =>
      onPaddleEvent((event) => {
        if (event.name && ORDER_EVENTS.has(event.name) && event.data) setCheckout(event.data);
      }),
    [],
  );

  if (failed) {
    return (
      <p className="card px-4 py-3.5 text-center text-[14px] leading-snug text-muted">
        {copy.checkout.failed}
      </p>
    );
  }

  // The skeleton is the frame's sibling, never its child: Paddle appends its iframe to the
  // target, and a node Preact owns inside it would be reconciled against one it does not.
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div
          className={`${FRAME_TARGET} w-full`}
          style={{ minHeight: `${FRAME_INITIAL_HEIGHT}px` }}
        />
        {!checkout && <FrameSkeleton />}
      </div>
      <CheckoutSummary checkout={checkout} />
    </div>
  );
}

/** Over the frame until Paddle's first order event: a reader who taps Continue before the
 * preloaded form is ready sees one taking shape rather than an empty box. */
function FrameSkeleton() {
  const bar = "rounded-[14px] bg-track";
  return (
    <div aria-hidden className="absolute inset-x-0 top-0 flex animate-pulse flex-col gap-3">
      {["w-24", "w-28"].map((width) => (
        <div key={width} className="flex flex-col gap-2">
          <span className={`h-3 rounded-full bg-track ${width}`} />
          <span className={`h-12 ${bar}`} />
        </div>
      ))}
      <div className="flex gap-3">
        <span className={`h-12 flex-1 ${bar}`} />
        <span className={`h-12 flex-1 ${bar}`} />
      </div>
      <span className={`mt-2 h-12 ${bar}`} />
    </div>
  );
}
