import type { QuoteResult } from "@/lib/checkoutSession";
import type { PlanQuote } from "@/lib/plans";

/**
 * What this visitor will actually be charged, asked once per page.
 *
 * Dodo is the merchant of record and quotes in the buyer's own currency, so the plan cards ask
 * `/api/funnel/quote` rather than printing USD at everyone. It lives here rather than in
 * `PaywallStep` because `prewarm.ts` starts it while the reader is still answering questions.
 */

interface Offer {
  /** Null when the answer was unusable; the caller keeps `planListQuote`. */
  quote: PlanQuote | null;
  /** Whether the lifetime card is shown. */
  lifetime: boolean;
}

let pending: Promise<Offer | null> | null = null;

/** Null when the request failed. A missing quote is not remembered, so the paywall gets to ask again. */
function offer(): Promise<Offer | null> {
  pending ??= fetchOffer().then((answer) => {
    if (!answer?.quote) pending = null;
    return answer;
  });
  return pending;
}

export const planQuote = (): Promise<PlanQuote | null> => offer().then((answer) => answer?.quote ?? null);

export const lifetimeOffered = (): Promise<boolean> => offer().then((answer) => answer?.lifetime ?? false);

async function fetchOffer(): Promise<Offer | null> {
  try {
    const response = await fetch("/api/funnel/quote");
    if (!response.ok) return null;
    const result = (await response.json()) as QuoteResult;
    return { quote: result.configured ? result.quote : null, lifetime: result.lifetime };
  } catch {
    return null;
  }
}
