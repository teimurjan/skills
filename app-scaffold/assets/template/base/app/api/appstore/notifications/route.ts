import { NextResponse } from "next/server";
import {
  NotificationTypeV2,
  OfferDiscountType,
  OfferType,
  Subtype,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import {
  accountToken,
  isAppleConfigured,
  isSandbox,
  verifyNotification,
  verifyRenewalInfo,
  verifyTransaction,
} from "@/lib/appstore";
import { applyEntitlementEvent } from "@/lib/entitlements";
import { logFields, withLogging } from "@/lib/log";
import { trackServerEvent, type ServerAnalyticsEvent } from "@/lib/serverAnalytics";

export const dynamic = "force-dynamic";

/** Notification types that revoke access outright. */
const REVOKING = new Set<string>([
  NotificationTypeV2.REFUND,
  NotificationTypeV2.REVOKE,
  NotificationTypeV2.EXPIRED,
  NotificationTypeV2.GRACE_PERIOD_EXPIRED,
]);

interface NotificationBody {
  signedPayload?: string;
}

/** App Store Server Notifications V2 webhook. Apple calls this on refunds,
 * revocations, renewals, and expiries so the paid entitlement stays current
 * without the client. Always upserts by original_transaction_id, so this route
 * can create the row from scratch too (e.g. if the client's /api/purchase call
 * never made it, the first renewal still lands) — and because the buyer stamped
 * their uid as the transaction's appAccountToken, such a row still lands
 * *attributed*, which is what makes this a real backstop rather than an
 * orphaned row nobody can read. */
export const POST = withLogging("appstore.notifications", async (request: Request) => {
  if (!isAppleConfigured) {
    return NextResponse.json({ error: "purchase_unavailable" }, { status: 503 });
  }

  let body: NotificationBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.signedPayload) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let transaction;
  let renewal;
  let notificationType: string;
  let subtype: string;
  let notificationUUID: string;
  let eventAt: string;
  try {
    const notification = await verifyNotification(body.signedPayload);
    notificationType = notification.notificationType ?? "";
    // Present only on some types, and on DID_CHANGE_RENEWAL_STATUS it carries the entire
    // meaning: the type says the renewal setting changed, the subtype says which way.
    subtype = notification.subtype ?? "";
    // Apple's own id for this message, stable across every redelivery of it. Falls back to
    // the type and date, which are stable for the same reason if less unique.
    notificationUUID = notification.notificationUUID ?? "";
    eventAt = new Date(notification.signedDate ?? Date.now()).toISOString();
    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) return NextResponse.json({ ok: true }); // e.g. TEST — nothing to map
    transaction = await verifyTransaction(signedTransaction);
    const signedRenewal = notification.data?.signedRenewalInfo;
    if (signedRenewal) renewal = await verifyRenewalInfo(signedRenewal);
  } catch (cause) {
    // 400 lets Apple retry with backoff.
    console.error("notification verification failed", cause);
    logFields({ outcome: "invalid_notification" });
    return NextResponse.json({ error: "invalid_notification" }, { status: 400 });
  }

  logFields({ type: notificationType, subtype });

  // Keep access through a billing-retry grace period: the last paid period's
  // expiresDate is already past, but gracePeriodExpiresDate extends entitlement.
  // Set expires_at to the grace end so the read-side expiry gate auto-revokes even
  // if the terminal GRACE_PERIOD_EXPIRED notification is missed.
  const graceUntil = renewal?.gracePeriodExpiresDate;
  const inGrace = graceUntil ? graceUntil > Date.now() : false;
  const expired = transaction.expiresDate ? transaction.expiresDate < Date.now() : false;
  const active = !REVOKING.has(notificationType) && !transaction.revocationDate && (!expired || inGrace);
  const expiresAt = inGrace
    ? new Date(graceUntil!).toISOString()
    : transaction.expiresDate
      ? new Date(transaction.expiresDate).toISOString()
      : null;

  const buyer = accountToken(transaction);

  // Reported *before* the sandbox gate below, unlike the entitlement write. A TestFlight
  // tester turning off auto-renew is the only way to exercise this path before release,
  // and `transaction_environment` keeps those events filterable rather than mixed into
  // real churn.
  const lifecycle = lifecycleEvent(notificationType, subtype, transaction, expiresAt);
  if (lifecycle) {
    if (buyer) {
      await trackServerEvent(
        {
          userId: buyer,
          // Apple's message id, not the subscription's state: someone who turns auto-renew
          // off, back on, and off again has made three decisions, and a state-derived key
          // would collapse the two that matter into one.
          dedupeKey: notificationUUID || `${notificationType}:${eventAt}`,
          occurredAt: eventAt,
        },
        lifecycle,
      );
    } else {
      // A purchase made before the client stamped an appAccountToken. There is no
      // Amplitude user to file this against, and filing it against nobody is worse than
      // not filing it — the entitlement write below still proceeds.
      logFields({ analytics: "no_user_id" });
    }
  }

  // Ignore sandbox notifications (App Review, TestFlight). Their grants are held perpetual
  // (see /api/purchase), so acting on a sandbox renewal/expiry here would wrongly lapse a
  // reviewer. Production notifications are the only ones that move a real entitlement.
  if (isSandbox(transaction.environment)) {
    logFields({ outcome: "sandbox_ignored" });
    return NextResponse.json({ ok: true });
  }

  const originalTransactionId = transaction.originalTransactionId;
  if (!originalTransactionId) return NextResponse.json({ ok: true });

  const applied = await applyEntitlementEvent({
    originalTransactionId,
    // Apple's notification carries no account of its own, but it does carry back
    // the appAccountToken the buyer stamped at purchase. Null for a purchase made
    // before we stamped one, which leaves any owner /api/purchase already recorded
    // intact rather than clearing it.
    userId: buyer,
    deviceId: null,
    productId: transaction.productId ?? "",
    active,
    expiresAt,
    eventAt,
    environment: transaction.environment ?? null,
  });
  if (!applied) {
    // 500 so Apple redelivers: a 200 is what stops the retries.
    logFields({ outcome: "write_failed" });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  logFields({ outcome: active ? "active" : "revoked" });
  return NextResponse.json({ ok: true });
});

/**
 * Which Amplitude event, if any, this notification is worth reporting as — the App Store's
 * vocabulary translated into the one both billers share.
 *
 * Most types map to nothing: DID_RENEW and SUBSCRIBED are already reported by the app from
 * the device that bought, and reporting them again here would double-count the purchase
 * this exists to be the other end of.
 */
function lifecycleEvent(
  notificationType: string,
  subtype: string,
  transaction: JWSTransactionDecodedPayload,
  expiresAt: string | null,
): ServerAnalyticsEvent | null {
  const shared = {
    provider: "app_store" as const,
    in_trial: isFreeTrial(transaction),
    product_id: transaction.productId ?? "",
    expires_at: expiresAt,
    transaction_environment: transaction.environment ?? "",
  };

  if (notificationType === NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS) {
    // The only signal Apple gives that someone chose to leave. Access continues to the end
    // of the period they already paid for — or, during the trial, to a date we were never
    // going to charge them before — so nothing about the entitlement changes here and this
    // event is the entire record of the decision.
    if (subtype === Subtype.AUTO_RENEW_DISABLED) {
      return { name: "subscription_cancel_requested", ...shared };
    }
    if (subtype === Subtype.AUTO_RENEW_ENABLED) {
      return { name: "subscription_cancel_reverted", ...shared };
    }
    return null;
  }

  if (REVOKING.has(notificationType)) {
    // The subtype where there is one (EXPIRED carries VOLUNTARY, BILLING_RETRY,
    // PRICE_INCREASE or PRODUCT_NOT_FOR_SALE — the difference between leaving and a card
    // that failed); the type itself for REFUND and REVOKE, which carry none.
    return {
      name: "subscription_ended",
      reason: (subtype || notificationType).toLowerCase(),
      ...shared,
    };
  }

  return null;
}

/** Is the period being given up a free trial?
 *
 * The 3-day trial ships as an App Store Connect *introductory offer*, so Apple signs the
 * trial's transaction with `offerType` INTRODUCTORY_OFFER and `offerDiscountType`
 * FREE_TRIAL — which is exactly what separates "cancelled before we ever charged them"
 * from "cancelled a subscription they had been paying for", and the reason this is a
 * property rather than two event names. A payload old enough to predate `offerDiscountType`
 * reads as false, which understates the count rather than inventing one. */
function isFreeTrial(transaction: JWSTransactionDecodedPayload): boolean {
  return (
    transaction.offerType === OfferType.INTRODUCTORY_OFFER &&
    transaction.offerDiscountType === OfferDiscountType.FREE_TRIAL
  );
}
