import { paddleBrowserClient } from "@/lib/paddleClient";
import { isLifetimeOffered, isPaddleCheckoutConfigured, paddlePriceIds } from "@/lib/paddlePrices";
import { fromMinorUnits, planListQuote, type Plan, type PlanQuote } from "@/lib/plans";

/**
 * What this visitor will actually be charged, asked once per page.
 *
 * Paddle is the merchant of record and quotes in the buyer's own currency, so the plan cards
 * ask it rather than printing USD at everyone. It lives here rather than in `PaywallStep`
 * because `prewarm.ts` starts it while the reader is still answering questions: this one call
 * is what loads Paddle.js and the prices, so the paywall opens localized and the checkout after
 * it already has its instance.
 */

let pending: Promise<PlanQuote | null> | null = null;

/** Null when there is nothing to ask or the answer was unusable; the caller keeps
 * `planListQuote`. A failure is not remembered, so the paywall gets to ask again. */
export function planQuote(): Promise<PlanQuote | null> {
  pending ??= fetchQuote().then((quote) => {
    if (!quote) pending = null;
    return quote;
  });
  return pending;
}

/** Whether the lifetime card is shown. Known at build time here, so no round trip. */
export const lifetimeOffered = (): Promise<boolean> => Promise.resolve(isLifetimeOffered);

async function fetchQuote(): Promise<PlanQuote | null> {
  if (!isPaddleCheckoutConfigured) return null;
  const plans: Plan[] = isLifetimeOffered ? ["monthly", "yearly", "lifetime"] : ["monthly", "yearly"];
  try {
    const paddle = await paddleBrowserClient();
    const preview = await paddle?.PricePreview({
      items: plans.map((plan) => ({ priceId: paddlePriceIds[plan], quantity: 1 })),
    });
    if (!preview) return null;

    const { currencyCode, details } = preview.data;
    const amountOf = (plan: Plan) =>
      details.lineItems.find((item) => item.price.id === paddlePriceIds[plan])?.totals.total;
    const [monthly, yearly, lifetime] = plans.map(amountOf);
    // All or none: the yearly card strikes the monthly price per day through, so one localized
    // price beside one list price would advertise a saving across two currencies.
    if (!monthly || !yearly || (isLifetimeOffered && !lifetime)) return null;

    return {
      currency: currencyCode,
      monthly: fromMinorUnits(monthly, currencyCode),
      yearly: fromMinorUnits(yearly, currencyCode),
      // Never shown when not on sale, so the list price only fills the shape.
      lifetime: lifetime ? fromMinorUnits(lifetime, currencyCode) : planListQuote.lifetime,
    };
  } catch {
    return null;
  }
}
