/**
 * The plans sold on the web, and the money formatting every surface shares.
 *
 * Nothing here is biller-specific and nothing here is secret, which is why the marketing pages
 * and the funnel can import it. What a biller needs on top (price ids, a client token) lives
 * beside that biller's code.
 *
 * No trial on the web: the free trial is an App Store introductory offer, so any trial wording on
 * the site belongs to the App Store button alone.
 */

/** `lifetime` is a one-time payment with no renewal, sold only while the biller offers it. */
export type Plan = "monthly" | "yearly" | "lifetime";

export type PlanQuote = { currency: string } & Record<Plan, number>;

/** Stands in until the biller's localized preview answers, and if it never does. The biller is
 * the merchant of record and quotes in the buyer's own currency, so this is what a US buyer sees
 * and a placeholder for everyone else, never the number they are charged. */
export const planListQuote: PlanQuote = {
  currency: "USD",
  monthly: 9.99,
  yearly: 59.99,
  lifetime: 119.99,
};

/** Billers quote amounts in the currency's lowest denomination. The exponent comes from the
 * currency rather than being 100, because it is 100 for USD and 1 for JPY. */
export function fromMinorUnits(amount: number | string, currency: string): number {
  const { maximumFractionDigits } = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).resolvedOptions();
  return Number(amount) / 10 ** (maximumFractionDigits ?? 2);
}

/** The currency is the buyer's, the number formatting is the page's: a German page writes
 * `9,99 $` for a buyer quoted in dollars. */
export function formatMoney(amount: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
