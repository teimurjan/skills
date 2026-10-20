import { NextResponse } from "next/server";
import { accountToken, isAppleConfigured, isSandbox, verifyTransaction } from "@/lib/appstore";
import { accountExists } from "@/lib/account";
import { applyEntitlementEvent } from "@/lib/entitlements";
import { getUserFromRequest } from "@/lib/supabase/auth";
import { logFields, withLogging } from "@/lib/log";

export const dynamic = "force-dynamic";

interface PurchaseBody {
  signedTransaction?: string;
}

/** Verify a StoreKit purchase with Apple and write the paid entitlement. The
 * iOS client calls this right after a successful purchase; the App Store
 * Server Notifications webhook is the durable backstop.
 *
 * The signed JWS is what proves the purchase happened; the access token is what
 * says whose account it belongs to. Both are required — an unattributed grant
 * would be unreachable, since every entitlement read keys on the user. */
export const POST = withLogging("purchase", async (request: Request) => {
  if (!isAppleConfigured) {
    return NextResponse.json({ error: "purchase_unavailable" }, { status: 503 });
  }

  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: PurchaseBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.signedTransaction) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let transaction;
  try {
    transaction = await verifyTransaction(body.signedTransaction);
  } catch (cause) {
    console.error("purchase verification failed", cause);
    logFields({ outcome: "invalid_transaction" });
    return NextResponse.json({ error: "invalid_transaction" }, { status: 400 });
  }

  // The buyer stamps their uid as the appAccountToken, so a JWS that names a
  // different account was not bought by this caller — refuse rather than
  // re-attributing somebody else's subscription. An unstamped transaction
  // (bought before we stamped one) still goes through on the token alone, and so
  // does one stamped for an account since deleted: there is no owner left to protect.
  const stamped = accountToken(transaction);
  if (stamped && stamped !== user.id && (await accountExists(stamped))) {
    logFields({ outcome: "wrong_account" });
    return NextResponse.json({ error: "invalid_transaction" }, { status: 400 });
  }

  // A refunded/revoked transaction must not grant anything.
  if (transaction.revocationDate) {
    logFields({ outcome: "revoked", productId: transaction.productId });
    return NextResponse.json({ ok: false, revoked: true });
  }

  // A sandbox transaction (App Review, TestFlight) is honored but held perpetual — this
  // deployment never hears its ~5-minute renewal/expiry, so a real expiry would strand a
  // reviewer. Production grants keep Apple's real expiry. See isSandbox.
  const perpetual = isSandbox(transaction.environment);
  const expiresAt = perpetual ? null : transaction.expiresDate ? new Date(transaction.expiresDate).toISOString() : null;

  const applied = await applyEntitlementEvent({
    originalTransactionId: transaction.originalTransactionId ?? "",
    userId: user.id,
    deviceId: request.headers.get("x-device-id"),
    productId: transaction.productId ?? "",
    active: true,
    expiresAt,
    eventAt: new Date(transaction.signedDate ?? Date.now()).toISOString(),
    environment: transaction.environment ?? null,
  });
  if (!applied) {
    logFields({ outcome: "write_failed" });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  logFields({ outcome: "granted", productId: transaction.productId });
  return NextResponse.json({ ok: true, originalTransactionId: transaction.originalTransactionId });
});
