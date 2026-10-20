import { NextResponse } from "next/server";
import { dodoClient, isDodoConfigured } from "@/lib/dodo";
import { getDodoCustomerId } from "@/lib/entitlements";
import { logFields, withLogging } from "@/lib/log";
import { getUserFromRequest } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

/**
 * A link to Dodo's customer portal — where a web subscription is cancelled, and its payment
 * method updated. A lifetime buyer finds their receipt there. There is no in-app equivalent: the App Store's own sheet handles an
 * in-app subscription, and this handles the other kind, which is why `/api/entitlement`
 * carries `provider` at all.
 *
 * The session is minted per request rather than stored: a portal link is a bearer credential
 * for someone's billing details, so it is short-lived by design.
 */
export const POST = withLogging("subscription.portal", async (request: Request) => {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isDodoConfigured) {
    return NextResponse.json({ error: "portal_unavailable" }, { status: 503 });
  }

  const customerId = await getDodoCustomerId(user.id);
  if (!customerId) {
    // An App Store subscriber reaching here means the client asked the wrong question —
    // theirs is managed by Apple, and `provider` on /api/entitlement says so.
    logFields({ outcome: "no_dodo_entitlement" });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let url: string | undefined;
  try {
    const session = await dodoClient().customers.customerPortal.create(customerId, {
      return_url: process.env.SITE_URL ?? "https://appname.example",
    });
    url = session.link;
  } catch (cause) {
    console.error("dodo portal session failed", cause);
    logFields({ outcome: "portal_failed" });
    return NextResponse.json({ error: "portal_failed" }, { status: 502 });
  }

  if (!url) {
    logFields({ outcome: "portal_failed" });
    return NextResponse.json({ error: "portal_failed" }, { status: 502 });
  }

  logFields({ outcome: "granted" });
  return NextResponse.json({ url });
});
