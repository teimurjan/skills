import { NextResponse } from "next/server";
import { isReminderConfigured, recordCheckoutStart } from "@/lib/checkoutReminder/reminders";
import { isLang } from "@/lib/i18n";
import { logFields, withLogging } from "@/lib/log";
import { getUserFromRequest } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

/** The card field is in front of a signed-in reader. What the abandoned-checkout reminder is
 * timed from; the account comes off the bearer token, never the body. */
export const POST = withLogging("checkout.started", async (request: Request) => {
  if (!isReminderConfigured) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body: { lang?: unknown } = await request.json().catch(() => ({}));
  if (!isLang(body.lang)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  if (!(await recordCheckoutStart(user.id, body.lang))) {
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
  logFields({ lang: body.lang });
  return new NextResponse(null, { status: 204 });
});
