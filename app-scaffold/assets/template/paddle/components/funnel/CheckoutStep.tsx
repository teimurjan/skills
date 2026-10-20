import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { CheckoutEventNames, type PaddleEventData } from "@paddle/paddle-js";
import { useAuth } from "@/components/auth/AuthProvider";
import { track } from "@/lib/analytics";
import { metaCookie, metaTrack } from "@/lib/metaPixel";
import { onPaddleEvent } from "@/lib/paddleClient";
import { isPaddleCheckoutConfigured, paddlePriceIds, planForPriceId } from "@/lib/paddlePrices";
import type { Plan } from "@/lib/plans";
import { funnelPath, type Lang } from "@/lib/i18n";
import { InlineCheckout } from "./InlineCheckout";
import { useLocale } from "./locale";
import { readClickId, readDiscount, type Attribution } from "./session";
import { ACCOUNT_STEP_INDEX, type FunnelAnswers } from "./steps";

/**
 * The card field, and only the card field — the plan was picked on the step before.
 *
 * Mounted by the shell from the offer onwards and only *shown* on the checkout step: the frame
 * opens hidden while the reader is still weighing the plans, so Continue reveals a form that is
 * already there. Hidden means clipped, invisible and `inert`, so nothing in it takes a tab.
 *
 * Two things are stamped into `customData`: the Supabase uid, which is how the webhook knows
 * whose entitlement this is, and an `eventId` uuid, which is how the browser Pixel and the
 * server CAPI event deduplicate into one conversion. The `_fbp`/`_fbc` cookies and the buyer's
 * IP ride along because Paddle calls the webhook and Paddle is not the buyer's browser; `fbc`
 * falls back to the click saved off the landing URL when the Pixel was blocked.
 */
export function CheckoutStep({
  visible,
  plan,
  answers,
  attribution,
}: {
  visible: boolean;
  plan: Plan;
  answers: FunnelAnswers;
  attribution: Attribution;
}) {
  const { user, accessToken } = useAuth();
  const { copy, lang } = useLocale();
  const words = copy.checkout;
  /** One id per conversion, which is what Meta dedupes on. */
  const [eventId] = useState(() => crypto.randomUUID());
  const [loaded, setLoaded] = useState(false);
  /** Back to the plans and Continue again is the same checkout; the funnel starts once. */
  const started = useRef(false);
  /** From the reminder email's link, if that is how the reader came back. */
  const [discountCode] = useState(readDiscount);
  const ip = useClientIp();

  const handleCheckoutEvent = useCallback(
    (event: PaddleEventData) => {
      if (event.name === CheckoutEventNames.CHECKOUT_LOADED) setLoaded(true);

      // Read off the event, not off `plan`: the frame holds the transaction. The selection
      // stands in for a checkout Paddle sends no items with.
      const eventPlan = planForPriceId(event.data?.items[0]?.price_id) ?? plan;

      // Purchase fires here, not on the success page: this is the only place the amount
      // actually charged is known, and Paddle quotes in the buyer's own currency.
      if (event.name === CheckoutEventNames.CHECKOUT_COMPLETED && event.data) {
        metaTrack(
          "Purchase",
          { value: event.data.totals.total, currency: event.data.currency_code },
          eventId,
        );
        track({
          name: "purchase_completed",
          plan: eventPlan,
          value: event.data.totals.total,
          currency: event.data.currency_code,
          transaction_id: eventId,
        });
      }
    },
    [eventId, plan],
  );

  useEffect(() => onPaddleEvent(handleCheckoutEvent), [handleCheckoutEvent]);

  // Not on `checkout.loaded`: that now lands while the frame is still hidden behind the offer,
  // and every paywall view would count as a checkout. It starts when the reader sees a form.
  useEffect(() => {
    if (!visible || !loaded || started.current) return;
    started.current = true;
    metaTrack("InitiateCheckout", { content_name: plan });
    track({ name: "checkout_started", plan });
    void reportCheckoutStart(accessToken, lang);
  }, [visible, loaded, plan]);

  // Null until the user is known, which is also what keeps `navigator` off the server, and until
  // the IP lookup settles: Paddle reads `customData` once, when the frame opens.
  const checkout = user && ip !== undefined && {
    items: [{ priceId: paddlePriceIds[plan], quantity: 1 }],
    customer: user.email ? { email: user.email } : undefined,
    customData: {
      userId: user.id,
      eventId,
      fbp: metaCookie("_fbp") ?? "",
      fbc: metaCookie("_fbc") ?? readClickId() ?? "",
      ua: navigator.userAgent,
      ip,
      ...answers,
      // Last, so a question keyed `ad` can never shadow the creative id.
      ...attribution,
    },
    discountCode,
    successPath: funnelPath(lang, "done"),
    // The site ships one appearance, so the frame is told which rather than following the
    // reader's system preference into a dark form inside a white page.
    theme: "light" as const,
  };

  function payment() {
    if (!isPaddleCheckoutConfigured) {
      return <Unavailable>{words.notConfigured}</Unavailable>;
    }
    // Reachable signed-out only by deep link. Say why there is no form rather than show an inert one.
    if (!checkout) {
      return (
        <Unavailable>
          {words.needsAccount}{" "}
          <a
            href={`${funnelPath(lang)}#step-${ACCOUNT_STEP_INDEX}`}
            className="font-medium text-ink underline underline-offset-4"
          >
            {words.createYours}
          </a>
        </Unavailable>
      );
    }
    return <InlineCheckout {...checkout} />;
  }

  return (
    <div
      className={visible ? "mt-4 flex flex-col gap-4" : "invisible h-0 overflow-hidden"}
      inert={!visible}
      aria-hidden={!visible}
    >
      {/* Above the card field: a buyer who finds out the platforms after paying is a refund. */}
      <p className="text-center text-[13px] leading-[1.5] text-muted">
        {words.platforms} {plan === "lifetime" ? words.noRenewal : words.cancelAnytime}
      </p>

      {payment()}
    </div>
  );
}

/** Times the abandoned-checkout reminder. Fire and forget: a reminder that failed to schedule
 * is not worth a card field that waits on it. */
async function reportCheckoutStart(
  accessToken: () => Promise<string | null>,
  lang: Lang,
): Promise<void> {
  const token = await accessToken().catch(() => null);
  if (!token) return;
  await fetch("/api/checkout/started", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ lang }),
  }).catch(() => undefined);
}

function Unavailable({ children }: { children: ComponentChildren }) {
  return (
    <p className="card px-4 py-3.5 text-center text-[14px] leading-snug text-muted">{children}</p>
  );
}

/** How long the card field waits on the IP before opening without it. */
const IP_LOOKUP_MS = 1500;

/** The reader's IP as our server sees it: `undefined` while asking, `""` when there is no
 * answer, so a slow lookup costs the server Purchase a match key and never the card field. */
function useClientIp(): string | undefined {
  const [ip, setIp] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IP_LOOKUP_MS);
    fetch("/api/client-ip", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { ip?: unknown } | null) => setIp(typeof body?.ip === "string" ? body.ip : ""))
      .catch(() => setIp(""))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  return ip;
}
