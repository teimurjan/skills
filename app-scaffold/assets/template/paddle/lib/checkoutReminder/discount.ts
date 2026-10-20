import "server-only";
import { ACCOUNT_STEP_INDEX } from "@/components/funnel/steps";
import { funnelPath, SITE_URL, type Lang } from "@/lib/i18n";
import { isPaddleConfigured, paddleClient } from "@/lib/paddle";
import { paddlePriceIds } from "@/lib/paddlePrices";

/**
 * The reminder's discount, as Paddle takes it. Paddle's frame applies a code it is handed in the
 * browser, so the link carries it: the funnel keeps `?discount=` across the sign-in round trip
 * and the checkout opens with it.
 */

export const isDiscountConfigured = isPaddleConfigured;

/** Single-use and off the first payment only (`recur: false`), on every web price. No expiry: a
 * code that lapsed would break the checkout of somebody who came back late. */
export async function mintDiscount(code: string, percent: number, userId: string): Promise<boolean> {
  try {
    await paddleClient().discounts.create({
      amount: String(percent),
      description: "Checkout reminder",
      type: "percentage",
      enabledForCheckout: true,
      code,
      recur: false,
      usageLimit: 1,
      restrictTo: Object.values(paddlePriceIds).filter(Boolean),
      customData: { userId },
    });
    return true;
  } catch (cause) {
    console.error("mintDiscount failed", cause);
    return false;
  }
}

/** A signed-in reader goes straight on to the paywall from the account step; anyone else signs in first. */
export const reminderLink = (lang: Lang, code: string): string =>
  `${SITE_URL}${funnelPath(lang)}?discount=${code}#step-${ACCOUNT_STEP_INDEX}`;
