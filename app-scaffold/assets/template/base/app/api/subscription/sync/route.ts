import { NextResponse } from "next/server";
import { Status } from "@apple/app-store-server-library";
import {
  accountToken,
  getSubscriptionStatuses,
  isAppleAPIConfigured,
  isSandbox,
  verifyRenewalInfo,
  verifyTransaction,
} from "@/lib/appstore";
import { applyEntitlementEvent } from "@/lib/entitlements";
import { getUserFromRequest } from "@/lib/supabase/auth";
import { logFields, withLogging } from "@/lib/log";

export const dynamic = "force-dynamic";

interface SyncBody {
  transactionId?: string;
}

/** A subscription Apple currently honors — active, or in a billing-grace period that
 * still entitles the customer. Billing-retry (no grace), expired, and revoked don't. */
const LIVE = new Set<number>([Status.ACTIVE, Status.BILLING_GRACE_PERIOD]);

/** Server-authoritative subscription reconcile. Asks Apple for the live status of a
 * subscription and writes the result to our DB — the source of truth for the
 * `/api/ai` gate and `/api/entitlement` read. Unlike `/api/purchase` (which trusts a
 * client-pushed JWS), this queries the App Store Server API directly, so it reflects
 * renewals, expiries, and refunds even when a notification was missed.
 *
 * The client sends the `transactionId` it holds from StoreKit; the access token says
 * whose account the reconciled result belongs to. The id itself proves nothing — it's
 * whatever the caller typed — so the appAccountToken on each verified transaction is
 * what decides ownership. */
export const POST = withLogging("subscription.sync", async (request: Request) => {
  if (!isAppleAPIConfigured) {
    return NextResponse.json({ error: "purchase_unavailable" }, { status: 503 });
  }

  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.transactionId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const transactionId = body.transactionId;

  let statuses;
  try {
    statuses = await getSubscriptionStatuses(transactionId);
  } catch (cause) {
    console.error("subscription status query failed", cause);
    logFields({ outcome: "query_failed" });
    return NextResponse.json({ error: "query_failed" }, { status: 502 });
  }

  // Verify every returned transaction; Apple returns the whole subscription group,
  // so pick the entry that actually matches the id the caller asked about (or share
  // its original transaction id, across renewals) *and* names them as the buyer.
  // The transaction id is client-supplied and unauthenticated — without the
  // appAccountToken check, posting somebody else's id would hand this account
  // their subscription.
  const owned = [];
  for (const group of statuses.data ?? []) {
    for (const item of group.lastTransactions ?? []) {
      if (!item.signedTransactionInfo) continue;
      let transaction;
      try {
        transaction = await verifyTransaction(item.signedTransactionInfo);
      } catch {
        continue;
      }
      if (transaction.transactionId !== transactionId && transaction.originalTransactionId !== transactionId) continue;
      if (accountToken(transaction) !== user.id) continue;
      let renewal;
      if (item.signedRenewalInfo) {
        try {
          renewal = await verifyRenewalInfo(item.signedRenewalInfo);
        } catch {
          // A missing/invalid renewal info only costs us the grace-period extension.
        }
      }
      owned.push({ status: item.status ?? Status.EXPIRED, transaction, renewal });
    }
  }

  // Nothing bound to this user — leave the row alone rather than writing an
  // inactive event over a grant that is still valid.
  if (owned.length === 0) {
    logFields({ outcome: "not_owned" });
    return NextResponse.json({ paid: false, expiresAt: null });
  }

  // Prefer a live subscription; otherwise the latest-expiring record, so an inactive
  // row still lands with the correct expiry.
  const chosen =
    owned.find((entry) => LIVE.has(entry.status)) ??
    owned.sort((a, b) => (b.transaction.expiresDate ?? 0) - (a.transaction.expiresDate ?? 0))[0];
  const { status, transaction, renewal } = chosen;

  // A sandbox subscription renews/expires in minutes, and Apple's live status would flip
  // a reviewer back to unpaid on the next restore. Hold it perpetually active instead,
  // matching /api/purchase; production subs track Apple's real status. See isSandbox.
  const perpetual = isSandbox(transaction.environment);
  const graceUntil = renewal?.gracePeriodExpiresDate;
  const inGrace = graceUntil ? graceUntil > Date.now() : false;
  const active = perpetual || (LIVE.has(status) && !transaction.revocationDate);
  const expiresAt = perpetual
    ? null
    : inGrace
      ? new Date(graceUntil!).toISOString()
      : transaction.expiresDate
        ? new Date(transaction.expiresDate).toISOString()
        : null;

  const applied = await applyEntitlementEvent({
    originalTransactionId: transaction.originalTransactionId ?? transactionId,
    userId: user.id,
    deviceId: request.headers.get("x-device-id"),
    productId: transaction.productId ?? "",
    active,
    expiresAt,
    // This reflects Apple's state as of now, so stamp it now — a live reconcile should
    // win over any older recorded event, not be dropped by the ordering guard.
    eventAt: new Date().toISOString(),
    environment: transaction.environment ?? null,
  });
  if (!applied) {
    logFields({ outcome: "write_failed" });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  logFields({ outcome: active ? "active" : "inactive", status });
  return NextResponse.json({ paid: active, expiresAt });
});
