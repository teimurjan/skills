/**
 * The web biller, as the rest of the codebase needs to name it. Dodo Payments is the merchant
 * of record: it takes the card, charges the tax and issues refunds.
 */
export const BILLER = {
  name: "Dodo Payments",
  /** The buyer terms that govern a web purchase, linked from Terms when the biller publishes one. */
  buyerTermsUrl: null as string | null,
  /** The public variables the funnel bundle reads; `scripts/build-funnel.tsx` inlines them.
   * None: the checkout session is minted on the server. */
  publicEnv: [] as string[],
};
