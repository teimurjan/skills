import "server-only";
import { ACCOUNT_STEP_INDEX } from "@/components/funnel/steps";
import { dodoClient, dodoProductIds, isDodoCheckoutConfigured } from "@/lib/dodo";
import { funnelPath, SITE_URL, type Lang } from "@/lib/i18n";

/**
 * The reminder's discount, as Dodo takes it. The code is tied to the account rather than to the
 * link: `/api/funnel/checkout` applies it to that account's next session, so nobody types it.
 */

export const isDiscountConfigured = isDodoCheckoutConfigured;

/** Single-use, on the first payment only, on every web product. No expiry: a code that lapsed
 * would cost a reader who came back late the discount the email promised. */
export async function mintDiscount(code: string, percent: number, userId: string): Promise<boolean> {
  try {
    await dodoClient().discounts.create({
      amount: percent * 100,
      type: "percentage",
      code,
      name: "Checkout reminder",
      usage_limit: 1,
      subscription_cycles: 1,
      restricted_to: dodoProductIds(),
      metadata: { userId },
    });
    return true;
  } catch (cause) {
    console.error("mintDiscount failed", cause);
    return false;
  }
}

/** A signed-in reader goes straight on to the paywall from the account step; anyone else signs in first. */
export const reminderLink = (lang: Lang, _code: string): string =>
  `${SITE_URL}${funnelPath(lang)}#step-${ACCOUNT_STEP_INDEX}`;
