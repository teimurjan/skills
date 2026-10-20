import { NextResponse } from "next/server";
import { getStoredPaddleIds } from "@/lib/entitlements";
import { getUserFromRequest } from "@/lib/supabase/auth";
import { logFields, withLogging } from "@/lib/log";
import { isPaddleConfigured, paddleClient } from "@/lib/paddle";

export const dynamic = "force-dynamic";

/**
 * Mint a Paddle customer-portal session for the signed-in user's web subscription.
 *
 * A subscription bought on the web cannot be managed through Apple's
 * manage-subscriptions sheet, so a client holding `provider: "paddle"` from
 * /api/entitlement asks for this URL and opens it instead. The session is short-lived and
 * scoped to one subscription, which is why it is minted per request rather than stored.
 */
export const POST = withLogging("subscription.portal", async (request: Request) => {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isPaddleConfigured) {
    return NextResponse.json({ error: "portal_unavailable" }, { status: 503 });
  }

  const paddle = await getStoredPaddleIds(user.id);
  if (!paddle) {
    // Not an error state: an App Store subscriber reaching here means the client asked
    // the wrong question, and it should fall back to the StoreKit sheet.
    logFields({ outcome: "no_paddle_entitlement" });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let url: string | undefined;
  try {
    const session = await paddleClient().customerPortalSessions.create(paddle.customerId, [
      paddle.subscriptionId,
    ]);
    url = session.urls?.general?.overview;
  } catch (cause) {
    console.error("paddle portal session failed", cause);
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
