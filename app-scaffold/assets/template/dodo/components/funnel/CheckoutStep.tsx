import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { CheckoutBreakdownData, CheckoutEvent, CheckoutMode } from "dodopayments-checkout";
import { useAuth } from "@/components/auth/AuthProvider";
import { track } from "@/lib/analytics";
import type { BrowserContext, CheckoutSessionResult } from "@/lib/checkoutSession";
import { onDodoCheckoutEvent } from "@/lib/dodoCheckout";
import { funnelPath, type Lang } from "@/lib/i18n";
import { metaCookie, metaTrack } from "@/lib/metaPixel";
import { fromMinorUnits, planListQuote, type Plan, type PlanQuote } from "@/lib/plans";
import { InlineCheckout } from "./InlineCheckout";
import { useLocale } from "./locale";
import { planQuote } from "./planQuote";
import { readClickId, rememberPurchase, type Attribution } from "./session";
import { ACCOUNT_STEP_INDEX, WEB_FUNNEL, type FunnelAnswers } from "./steps";

interface OpenCheckout {
  checkoutUrl: string;
  mode: CheckoutMode;
}

async function requestCheckout(
  accessToken: string,
  plan: Plan,
  browser: BrowserContext,
  lang: Lang,
): Promise<CheckoutSessionResult> {
  try {
    const response = await fetch("/api/funnel/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ plan, browser, lang }),
    });
    if (!response.ok) return { ok: false, error: response.status === 503 ? "unconfigured" : "failed" };
    const session = (await response.json()) as { checkoutUrl: string; mode: "live" | "test" };
    return { ok: true, ...session };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/**
 * The card field, and only the card field. A Dodo session is minted server-side for one product
 * and cannot change it, so the plan is picked on the paywall.
 *
 * **Mounted hidden under the paywall**, so the session, the SDK and Dodo's frame load while the
 * reader compares plans and Continue reveals a form that is already there. A plan change there
 * mints that plan's session, once. Nothing is reported to Meta or Amplitude until `visible`.
 *
 * Two things ride into the session's `metadata`: the Supabase uid, which the route reads off
 * the bearer token so a buyer cannot claim to be somebody else, and an `eventId` minted once
 * per mount, which the browser Pixel and the server CAPI event dedupe on. Dodo emits no
 * completion event; success is the redirect to `/start/done`, so the amount is written down
 * here for `PurchaseReport` to read there.
 */
export function CheckoutStep({
  plan,
  answers,
  attribution,
  visible,
}: {
  plan: Plan;
  answers: FunnelAnswers;
  attribution: Attribution;
  visible: boolean;
}) {
  const { user, accessToken } = useAuth();
  const { copy, lang } = useLocale();
  const words = copy.checkout;
  const [eventId] = useState(() => crypto.randomUUID());
  const [quote, setQuote] = useState<PlanQuote>(planListQuote);
  const [checkout, setCheckout] = useState<OpenCheckout | null>(null);
  const [state, setState] = useState<"opening" | "failed" | "unconfigured" | "open">("opening");
  const [frameOpened, setFrameOpened] = useState(false);
  const started = useRef(false);
  /** One session per plan for this mount, so flipping between plans does not mint again. */
  const sessions = useRef(new Map<Plan, Promise<CheckoutSessionResult>>());

  useEffect(() => {
    void planQuote().then((live) => live && setQuote(live));
  }, []);

  const handleCheckoutEvent = useCallback(
    (event: CheckoutEvent) => {
      if (event.event_type === "checkout.opened") {
        setFrameOpened(true);
        // Provisional, at the list price: a missed conversion is worse than one a few cents
        // out. The breakdown below overwrites it with the charged total.
        rememberPurchase({ eventId, plan, value: quote[plan], currency: quote.currency });
      }
      if (event.event_type === "checkout.breakdown") {
        const breakdown = event.data as CheckoutBreakdownData | undefined;
        const minor = breakdown?.finalTotal ?? breakdown?.total;
        const currency = breakdown?.finalTotalCurrency ?? breakdown?.currency;
        if (minor != null && currency) {
          rememberPurchase({ eventId, plan, value: fromMinorUnits(minor, currency), currency });
        }
      }
    },
    [eventId, plan, quote],
  );

  useEffect(() => onDodoCheckoutEvent(handleCheckoutEvent), [handleCheckoutEvent]);

  // When the reader sees the form, not when the hidden frame loads behind the paywall.
  useEffect(() => {
    if (!visible || !frameOpened || started.current) return;
    started.current = true;
    metaTrack("InitiateCheckout", { content_name: plan });
    track({ name: "checkout_started", plan });
  }, [visible, frameOpened, plan]);

  const mint = useCallback(async (): Promise<CheckoutSessionResult> => {
    const token = await accessToken().catch(() => null);
    if (!token) return { ok: false, error: "failed" };
    return requestCheckout(token, plan, {
      eventId,
      fbp: metaCookie("_fbp") ?? undefined,
      fbc: metaCookie("_fbc") ?? readClickId(),
      ua: navigator.userAgent,
      answers,
      attribution,
      funnel: WEB_FUNNEL.id,
    }, lang);
  }, [accessToken, answers, attribution, eventId, lang, plan]);

  /** A failed session is forgotten, so Try again and a later return to the plan both ask anew. */
  const sessionFor = useCallback(() => {
    const cached = sessions.current.get(plan);
    if (cached) return cached;
    const pending = mint().then((result) => {
      if (!result.ok) sessions.current.delete(plan);
      return result;
    });
    sessions.current.set(plan, pending);
    return pending;
  }, [mint, plan]);

  const open = useCallback(() => {
    let cancelled = false;
    setState("opening");
    setCheckout(null);
    setFrameOpened(false);
    void sessionFor().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState(result.error === "unconfigured" ? "unconfigured" : "failed");
        return;
      }
      setCheckout({ checkoutUrl: result.checkoutUrl, mode: result.mode });
      setState("open");
    });
    // A plan picked while the last one was still minting must not be overwritten by it.
    return () => {
      cancelled = true;
    };
  }, [sessionFor]);

  useEffect(() => {
    if (user) return open();
  }, [user?.id, plan]);

  function payment() {
    // Reachable signed-out only by deep link. Say why there is no form rather than show an inert one.
    if (!user) {
      return (
        <Unavailable>
          {words.needsAccount}{" "}
          <a href={`${funnelPath(lang)}#step-${ACCOUNT_STEP_INDEX}`} className="font-semibold underline underline-offset-4">
            {words.createYours}
          </a>
        </Unavailable>
      );
    }
    if (state === "unconfigured") return <Unavailable>{words.notConfigured}</Unavailable>;
    if (state === "failed") {
      return (
        <Unavailable>
          {words.retry}{" "}
          <button onClick={open} className="font-semibold underline underline-offset-4">
            {words.tryAgain}
          </button>
        </Unavailable>
      );
    }
    if (!checkout) return <Unavailable>{words.opening}</Unavailable>;
    return <InlineCheckout key={checkout.checkoutUrl} {...checkout} plan={plan} quote={quote} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Above the card field: a buyer who finds out the platform after paying is a refund. */}
      <p className="text-center text-[14.5px] leading-[1.5] text-muted">
        {words.platforms} {plan !== "lifetime" && words.cancelAnytime}
      </p>
      {payment()}
    </div>
  );
}

function Unavailable({ children }: { children: ComponentChildren }) {
  return <p className="card px-4 py-3.5 text-center text-[15.5px] leading-snug text-muted">{children}</p>;
}
