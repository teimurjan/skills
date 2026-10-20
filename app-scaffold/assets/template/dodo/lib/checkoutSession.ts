import "server-only";
import type { User } from "@supabase/supabase-js";
import type { CheckoutSessionBillingAddress } from "dodopayments/resources/checkout-sessions";
import {
  dodoBrowserMode,
  dodoClient,
  dodoProductId,
  isDodoCheckoutConfigured,
  isLifetimeOffered,
  isOnSale,
} from "./dodo";
import { fromMinorUnits, planListQuote, type Plan, type PlanQuote } from "./plans";

/**
 * The two Dodo calls the web funnel's checkout step makes, behind `app/api/funnel/`.
 *
 * That the session is minted here rather than in the browser is what makes the attribution
 * trustworthy: the Supabase uid stamped into `metadata` is the one the route verified off
 * the bearer token, not one handed up by the page. The buyer cannot claim to be somebody
 * else.
 */

/** What Dodo accepts as metadata: at most 50 pairs, keys ≤ 40 characters, string values
 * ≤ 500, and no nulls. Long values are truncated rather than dropped — a clipped user agent
 * still matches better than none. The two reserved keys are written outside these bounds,
 * so a full bag can never cost us the entitlement. */
const MAX_METADATA_VALUE = 500;
const MAX_METADATA_KEY = 40;
const MAX_METADATA_PAIRS = 48;

/** What the checkout step sends up with the plan. Its keys are the buyer's to edit, and
 * `metadataFor` treats them that way. */
export interface BrowserContext {
  /** Minted once per checkout mount. The Meta browser and CAPI events dedupe on it. */
  eventId: string;
  /** Meta's browser and click cookies. Dodo calls the webhook, and Dodo is not the buyer's
   * browser, so they only reach the server event by riding through here. */
  fbp?: string;
  fbc?: string;
  ua?: string;
  /** Quiz answers, and the ad that paid for the visit. */
  answers?: Record<string, string>;
  attribution?: Record<string, string>;
  /** The id of the funnel this buyer walked (`components/funnel/funnels/`). Written
   * server-side alongside the ad, so a purchase names its funnel the way it already names
   * its creative. */
  funnel?: string;
}

/** The plan cards' prices, in the buyer's own currency; `null` when Dodo could not say.
 * `lifetime` says whether the lifetime card is shown at all, priced from the list without a quote. */
export type QuoteResult =
  | { configured: false; lifetime: boolean }
  | { configured: true; quote: PlanQuote | null; lifetime: boolean };

export type CheckoutSessionResult =
  | { ok: true; checkoutUrl: string; mode: "live" | "test" }
  | { ok: false; error: "unconfigured" | "failed" };

/**
 * The buyer's own prices, for the plan cards.
 *
 * Dodo is the merchant of record and quotes in the buyer's currency, so the cards ask what
 * this visitor will actually be charged rather than printing USD at everyone.
 *
 * One call per plan: Dodo allows a single subscription product per cart (`422 Only one
 * subscription product allowed per checkout`), so the plans have to be priced separately.
 * They run in parallel and are used **all or none** — the yearly card strikes a year of
 * the monthly price through and states the saving between the two, so one localized price
 * beside one list price would advertise a discount computed across two currencies.
 *
 * `total_price`, not the cart item's `discounted_price`: the former is what the buyer is
 * charged, tax included, which is the number the card is claiming.
 *
 * `country` is Vercel's `x-vercel-ip-country`, resolved at the edge. Absent locally, and
 * absent is fine: Dodo then quotes its default currency, which is what the list quote
 * already says.
 */
export async function previewPlanQuote(country: string | undefined): Promise<QuoteResult> {
  const lifetime = isLifetimeOffered;
  if (!isDodoCheckoutConfigured) return { configured: false, lifetime };

  const billing = country
    ? { billing_address: { country: country as CheckoutSessionBillingAddress["country"] } }
    : {};
  const priceOf = (plan: Plan) =>
    dodoClient().checkoutSessions.preview({
      product_cart: [{ product_id: dodoProductId(plan), quantity: 1 }],
      ...billing,
    });

  try {
    const [monthly, yearly, once] = await Promise.all([
      priceOf("monthly"),
      priceOf("yearly"),
      lifetime ? priceOf("lifetime") : null,
    ]);
    // A buyer whose plans priced in different currencies is a Dodo bug, but printing a
    // saving across them would be ours.
    const previews = once ? [monthly, yearly, once] : [monthly, yearly];
    if (new Set(previews.map((preview) => preview.currency)).size > 1) {
      return { configured: true, quote: null, lifetime };
    }

    const amount = (preview: typeof monthly) => fromMinorUnits(preview.total_price, preview.currency);
    return {
      configured: true,
      lifetime,
      quote: {
        currency: monthly.currency,
        monthly: amount(monthly),
        yearly: amount(yearly),
        // Never shown when not on sale, so the list price only fills the shape.
        lifetime: once ? amount(once) : planListQuote.lifetime,
      },
    };
  } catch (cause) {
    // The list quote is already on screen; a failed preview is not worth an error.
    console.error("dodo price preview failed", cause);
    return { configured: true, quote: null, lifetime };
  }
}

/**
 * Mint a checkout session for one plan, for the signed-in buyer. The lifetime product is a
 * one-time payment, so its session makes a payment rather than a subscription.
 *
 * A Dodo session is single-use and fixed once created — there is no updating the plan of an
 * open checkout — which is why the step commits to a plan before revealing the form. The
 * session expires in 24 hours, so one per intent is the right granularity.
 */
export async function createCheckoutSession(
  user: User,
  plan: Plan,
  browser: BrowserContext,
  discountCode: string | null = null,
): Promise<CheckoutSessionResult> {
  if (!isDodoCheckoutConfigured || !isOnSale(plan)) return { ok: false, error: "unconfigured" };

  const result = await mintSession(user, plan, browser, discountCode);
  // A code already redeemed must not cost the reader the checkout itself.
  if (!result.ok && discountCode) return mintSession(user, plan, browser, null);
  return result;
}

async function mintSession(
  user: User,
  plan: Plan,
  browser: BrowserContext,
  discountCode: string | null,
): Promise<CheckoutSessionResult> {
  try {
    const session = await dodoClient().checkoutSessions.create({
      product_cart: [{ product_id: dodoProductId(plan), quantity: 1 }],
      ...(discountCode ? { discount_codes: [discountCode] } : {}),
      ...(user.email ? { customer: { email: user.email } } : {}),
      metadata: metadataFor(user.id, browser),
      return_url: `${siteUrl()}/start/done`,
      // No trial, structurally: the products carry `trial_period_days: 0` and nothing here
      // overrides it. The 3-day free trial is an App Store introductory offer.
      customization: {
        theme: "light",
        // Our own order summary sits under the frame — Dodo's would read as a second one.
        show_order_details: false,
        theme_config: {
          radius: "1rem",
          light: {
            bg_primary: "#ffffff",
            bg_secondary: "#ffffff",
            border_primary: "#18202e33",
            border_secondary: "#18202e1f",
            input_focus_border: "#18202e",
            text_primary: "#18202e",
            text_secondary: "#4e5869",
            text_placeholder: "#18202e80",
            button_primary: "#18202e",
            button_primary_hover: "#2b3546",
            button_text_primary: "#ffffff",
            button_secondary: "#ffffff",
            button_secondary_hover: "#fff8ef",
            button_text_secondary: "#18202e",
          },
        },
      },
      feature_flags: {
        // The reminder's code is applied above; an empty promo field only invites hunting for one.
        allow_discount_code: false,
        allow_phone_number_collection: false,
      },
    });

    if (!session.checkout_url) return { ok: false, error: "failed" };
    return { ok: true, checkoutUrl: session.checkout_url, mode: dodoBrowserMode };
  } catch (cause) {
    console.error("dodo checkout session failed", cause);
    return { ok: false, error: "failed" };
  }
}

/**
 * What rides through checkout and comes back on every webhook. `userId` is what the webhook
 * writes the entitlement against; the rest is the Meta match, kept for later personalization,
 * and the one join from a purchase back to the ad that bought it.
 *
 * The quiz answers reach here from `sessionStorage`, which is the buyer's to edit, so their
 * keys are treated as untrusted: `userId`, `eventId` and `funnel` are written **last** and
 * cannot be shadowed — an answer keyed `userId` would otherwise attach a paid subscription to
 * somebody else's account. Attribution goes in before them and after the answers, so a
 * question keyed `ad` cannot shadow the creative id either.
 *
 * Bounded to Dodo's limits (50 pairs, keys ≤ 40 characters, string values ≤ 500) so a stuffed
 * session storage costs its owner nothing worse than the ordinary checkout.
 */
function metadataFor(userId: string, browser: BrowserContext): Record<string, string> {
  const metadata: Record<string, string> = {};
  const add = (key: string, value: unknown) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || key.length > MAX_METADATA_KEY || Object.keys(metadata).length >= MAX_METADATA_PAIRS) return;
    metadata[key] = trimmed.slice(0, MAX_METADATA_VALUE);
  };

  add("fbp", browser.fbp);
  add("fbc", browser.fbc);
  add("ua", browser.ua);
  for (const [key, value] of Object.entries(browser.answers ?? {})) add(key, value);
  for (const [key, value] of Object.entries(browser.attribution ?? {})) add(key, value);

  // Unconditionally, and after everything the browser supplied.
  metadata.userId = userId;
  metadata.eventId = browser.eventId;
  if (browser.funnel) metadata.funnel = browser.funnel;
  return metadata;
}

/** `SITE_URL`, not `API_BASE_URL` — the latter is an iOS xcconfig value never set on the
 * server, so reading it here would silently mean "always the fallback". */
const siteUrl = () => process.env.SITE_URL ?? "https://appname.example";
