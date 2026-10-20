import { NextResponse } from "next/server";
import { isReminderConfigured, recordCheckoutStart, reminderDiscountCode } from "@/lib/checkoutReminder/reminders";
import { createCheckoutSession, type BrowserContext } from "@/lib/checkoutSession";
import { DEFAULT_LANG, isLang } from "@/lib/i18n";
import { logFields, withLogging } from "@/lib/log";
import type { Plan } from "@/lib/plans";
import { getUserFromRequest } from "@/lib/supabase/auth";

interface CheckoutBody {
  plan?: unknown;
  browser?: unknown;
  lang?: unknown;
}

const isPlan = (value: unknown): value is Plan =>
  value === "monthly" || value === "yearly" || value === "lifetime";

/** Only the shape the metadata bag needs is checked here; `metadataFor` bounds the rest,
 * since every key in it is the buyer's to edit. */
const isBrowserContext = (value: unknown): value is BrowserContext =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as BrowserContext).eventId === "string";

/**
 * Mint a Dodo checkout session for the signed-in buyer.
 *
 * Bearer-authenticated like every other route here — the web funnel holds a GoTrue session
 * the same way the iOS app does — and that is the whole of the attribution guarantee: the
 * uid `createCheckoutSession` stamps into the session's `metadata` is the one the token
 * verified, never one the page sent up.
 *
 * A minted session is also what times the abandoned-checkout reminder, and the reminder's
 * code, once sent, is applied here to this account's next session.
 */
export const POST = withLogging("funnel.checkout", async (request: Request) => {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: CheckoutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!isPlan(body.plan) || !isBrowserContext(body.browser)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  logFields({ plan: body.plan, funnel: body.browser.funnel ?? null });

  // Optional, so a funnel page loaded before the deploy still checks out.
  const lang = isLang(body.lang) ? body.lang : DEFAULT_LANG;
  const [discountCode, recorded] = await Promise.all([
    reminderDiscountCode(user.id),
    isReminderConfigured ? recordCheckoutStart(user.id, lang) : true,
  ]);
  if (!recorded) logFields({ reminder: "write_failed" });
  logFields({ discounted: Boolean(discountCode) });

  const result = await createCheckoutSession(user, body.plan, body.browser, discountCode);
  if (!result.ok) {
    logFields({ outcome: result.error });
    const status = result.error === "unconfigured" ? 503 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ checkoutUrl: result.checkoutUrl, mode: result.mode });
});
