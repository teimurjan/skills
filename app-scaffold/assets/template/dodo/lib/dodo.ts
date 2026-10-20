import "server-only";
import DodoPayments from "dodopayments";
import type { Plan } from "./plans";

/**
 * Dodo Payments — the merchant of record on the web, beside Apple's StoreKit in the app.
 *
 * Two secrets, two jobs. The API key mints checkout sessions and customer-portal links;
 * the webhook key verifies the Standard Webhooks signature on every event, which is a
 * local HMAC and never leaves the process. Both variable names are the SDK's own defaults,
 * so the constructor below doesn't have to name them.
 */

const API_KEY = process.env.DODO_PAYMENTS_API_KEY ?? "";
const WEBHOOK_KEY = process.env.DODO_PAYMENTS_WEBHOOK_KEY ?? "";

/** Which Dodo this deployment talks to. Test keys only work against the test API and vice
 * versa, so this must agree with which key is set. It also gates the entitlement *read* —
 * see `lib/entitlements.ts`. Defaults to live, as the SDK does. */
const ENVIRONMENT: "live_mode" | "test_mode" =
  process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "test_mode" : "live_mode";

const PRODUCT_IDS: Record<Plan, string> = {
  monthly: process.env.DODO_PRODUCT_MONTHLY ?? "",
  yearly: process.env.DODO_PRODUCT_YEARLY ?? "",
  lifetime: process.env.DODO_PRODUCT_LIFETIME ?? "",
};

/** The webhook 503s until both are set rather than 200-ing work it did not do — a 200 is
 * what stops Dodo retrying, so a missing key here would lose a paid subscription for good. */
export const isDodoConfigured = Boolean(API_KEY && WEBHOOK_KEY);

/** Selling needs the key and both products; verifying webhooks needs neither. */
export const isDodoCheckoutConfigured = Boolean(
  API_KEY && dodoProductId("monthly") && dodoProductId("yearly"),
);

export const dodoEnvironment = ENVIRONMENT;

/** What the browser SDK calls the same thing. Handed to the client alongside a checkout
 * url rather than published as an env var: the server already knows, and one value that
 * can't drift is better than two that can. */
export const dodoBrowserMode: "live" | "test" = ENVIRONMENT === "live_mode" ? "live" : "test";

let client: DodoPayments | null = null;

export function dodoClient(): DodoPayments {
  if (!client) {
    client = new DodoPayments({
      bearerToken: API_KEY,
      webhookKey: WEBHOOK_KEY,
      environment: ENVIRONMENT,
    });
  }
  return client;
}

/** The product being sold for a plan. Dodo has no separate price id — a product carries its
 * price inline — so this one id is both. Server-side only: the checkout session is minted
 * here, so nothing about what we sell needs to reach the browser. Empty for a plan not on sale. */
export function dodoProductId(plan: Plan): string {
  return PRODUCT_IDS[plan];
}

/** Every product configured on this deployment, for a discount that covers whichever is bought. */
export const dodoProductIds = (): string[] => Object.values(PRODUCT_IDS).filter(Boolean);

/** The lifetime unlock is a launch offer, switched off by the flag alone. The product id
 * stays set after it ends, so a checkout still open, or a redelivered payment, still grants. */
export const isLifetimeOffered =
  Boolean(PRODUCT_IDS.lifetime) && process.env.DODO_LIFETIME_ON_SALE === "true";

/** Whether a checkout for this plan may be minted now. */
export const isOnSale = (plan: Plan): boolean =>
  plan === "lifetime" ? isLifetimeOffered : Boolean(PRODUCT_IDS[plan]);

/** Name the plan behind a product id, for logging. Unknown ids return null rather than
 * guessing — a product added in the Dodo dashboard but not in the env should be visible in
 * the logs, not silently filed as monthly. */
export function planForProductId(productId: string | null | undefined): Plan | null {
  if (!productId) return null;
  const plans = Object.keys(PRODUCT_IDS) as Plan[];
  return plans.find((plan) => PRODUCT_IDS[plan] === productId) ?? null;
}
