/**
 * The web biller, as the rest of the codebase needs to name it. Paddle is the merchant of
 * record: it takes the card, charges the tax and issues refunds.
 */
export const BILLER = {
  name: "Paddle",
  /** The buyer terms that govern a web purchase, linked from Terms. */
  buyerTermsUrl: "https://www.paddle.com/legal/checkout-buyer-terms" as string | null,
  /** The public variables the funnel bundle reads; `scripts/build-funnel.tsx` inlines them. */
  publicEnv: [
    "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
    "NEXT_PUBLIC_PADDLE_ENVIRONMENT",
    "NEXT_PUBLIC_PADDLE_PRICE_MONTHLY",
    "NEXT_PUBLIC_PADDLE_PRICE_YEARLY",
    "NEXT_PUBLIC_PADDLE_PRICE_LIFETIME",
    "NEXT_PUBLIC_PADDLE_LIFETIME_ON_SALE",
  ],
};
