/**
 * The Paddle prices sold on the web: the two subscriptions the app also sells through StoreKit,
 * and the lifetime unlock, sold here only. Kept out of `lib/paddle.ts` because that file is
 * `server-only` and a checkout page needs these ids in the browser: a Paddle price id is public
 * by design, unlike the API key beside it.
 */

import type { Lang } from "./i18n";
import type { Plan } from "./plans";

/** `lifetime` is a one-time price in Paddle's catalog, not a subscription: no billing cycle,
 * no `subscription.*` lifecycle, and a `transaction.completed` the webhook reads as the
 * purchase itself. */
export const paddlePriceIds: Record<Plan, string> = {
  monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY ?? "",
  yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY ?? "",
  lifetime: process.env.NEXT_PUBLIC_PADDLE_PRICE_LIFETIME ?? "",
};

/** Identifies the seller to Paddle.js and can only open checkouts, public by design. */
export const paddleClientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";

/** Which Paddle the browser half talks to. Stated rather than defaulted: the two sides
 * disagreeing shows up only as a checkout that silently never opens. */
export const paddleBrowserEnvironment: "sandbox" | "production" =
  process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";

/** A checkout needs a token and both subscription prices. */
export const isPaddleCheckoutConfigured = Boolean(
  paddleClientToken && paddlePriceIds.monthly && paddlePriceIds.yearly,
);

/** The lifetime unlock is an offer, switched off by the flag alone. The price id stays set after
 * it ends, so a checkout still open, or a redelivered transaction, still grants. */
export const isLifetimeOffered =
  Boolean(paddlePriceIds.lifetime) && process.env.NEXT_PUBLIC_PADDLE_LIFETIME_ON_SALE === "true";

/**
 * The language Paddle draws its frame in, by the reader's. A locale missing from Paddle's own
 * list is left unset, and Paddle picks from the browser rather than being handed a language the
 * reader did not choose. Add a row with each locale, e.g. `"pt-BR": "pt-BR"`, `nb: "no"`.
 */
export const PADDLE_LOCALE: Partial<Record<Lang, string>> = {
  en: "en",
};

/** Name the plan behind a price id, for logging. Unknown ids return null rather than guessing:
 * a price added in the Paddle dashboard but not in the env should be visible in the logs. */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  const plans = Object.keys(paddlePriceIds) as Plan[];
  return plans.find((plan) => paddlePriceIds[plan] === priceId) ?? null;
}
