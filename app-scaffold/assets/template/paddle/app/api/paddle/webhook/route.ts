import { NextResponse } from "next/server";
import { EventName } from "@paddle/paddle-node-sdk";
import type {
  AdjustmentNotification,
  SubscriptionNotification,
  TransactionNotification,
} from "@paddle/paddle-node-sdk";
import {
  applyPaddleEntitlementEvent,
  applyPaddleLifetimeGrant,
  setPaddleLifetimeRevoked,
} from "@/lib/entitlements";
import { logFields, withLogging } from "@/lib/log";
import { isMetaConfigured, parseMetaBrowserIdentity, sendMetaPurchase } from "@/lib/meta";
import {
  isPaddleConfigured,
  paddleClient,
  paddleEnvironment,
  paddleWebhookSecret,
} from "@/lib/paddle";
import { planForPriceId } from "@/lib/paddlePrices";
import { isWelcomeEmailConfigured, sendWelcomeEmail } from "@/lib/welcomeEmail/send";
import { trackServerEvent, type ServerAnalyticsEvent } from "@/lib/serverAnalytics";

export const dynamic = "force-dynamic";

/** Where the funnel's success page lives, for Meta's URL-level reporting. Paddle calls this
 * route, so there is no referer to read and no request URL worth trusting.
 *
 * `SITE_URL`, not `API_BASE_URL` — the latter is an iOS xcconfig value that is never set on
 * the server, so reading it here would silently mean "always the fallback". */
const FUNNEL_SUCCESS_URL = `${process.env.SITE_URL ?? "https://appname.example"}/start/done`;

/** Supabase uids ride through checkout in `customData`; validate the shape before
 * trusting one. Same reasoning as `accountToken` on the Apple side: the value comes back
 * through the biller, so it is only trusted once it is the shape we wrote. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Paddle webhook — the durable record of a web purchase, and the only thing that writes
 * `paddle_entitlements` (the subscription) and `paddle_lifetime_entitlements` (the unlock).
 *
 * The `Paddle-Signature` HMAC is the authentication: no shared URL token, no bearer,
 * exactly as Apple's JWS is the authentication on the App Store notifications route.
 */
export const POST = withLogging("paddle.webhook", async (request: Request) => {
  if (!isPaddleConfigured) {
    // Loud rather than silent: a misconfigured deployment that 200s here would have
    // Paddle consider every entitlement delivered and never redeliver it.
    return NextResponse.json({ error: "paddle_unavailable" }, { status: 503 });
  }

  const signature = request.headers.get("paddle-signature");
  // The raw body, not request.json() — the signature covers the exact bytes Paddle sent,
  // and a parse-then-restringify round trip does not reproduce them.
  const raw = await request.text();
  if (!signature || !raw) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let event;
  try {
    event = await paddleClient().webhooks.unmarshal(raw, paddleWebhookSecret, signature);
  } catch (cause) {
    // 401 lets Paddle retry with backoff.
    console.error("paddle signature verification failed", cause);
    logFields({ outcome: "invalid_signature" });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  logFields({ type: event.eventType });

  switch (event.eventType) {
    // Every lifecycle event carries the whole subscription, so all six are written the
    // same way and the status alone decides access (PADDLE_LIVE_STATUSES).
    case EventName.SubscriptionActivated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionCanceled:
    case EventName.SubscriptionPaused:
    case EventName.SubscriptionResumed:
    case EventName.SubscriptionPastDue:
      return applySubscription(event);
    case EventName.TransactionCompleted:
      return completeTransaction(event.data, event.occurredAt);
    // A refund or chargeback is the only way the lifetime unlock ends. Both events, because
    // a small refund can be born approved and never update, while a larger one is created
    // pending and approved later — the status matters, not the event that carried it.
    case EventName.AdjustmentCreated:
    case EventName.AdjustmentUpdated:
      return applyAdjustment(event.data, event.occurredAt);
    default:
      // Subscribed-to-but-unhandled, or Paddle adding a type. 2xx so it isn't retried
      // forever; the type is in the log line if it turns out to matter.
      logFields({ outcome: "ignored" });
      return NextResponse.json({ ok: true });
  }
});

/** The six subscription lifecycle events, structurally. Named here rather than imported as
 * a union of six SDK classes: the three fields this route reads off the envelope are the
 * whole of what it needs, and the switch above already proves `data` is a subscription. */
interface SubscriptionLifecycleEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  data: SubscriptionNotification;
}

async function applySubscription(event: SubscriptionLifecycleEvent) {
  const subscription = event.data;
  const userId = userIdFrom(subscription.customData);
  if (!userId) {
    // Nothing to attach the subscription to. Checkout never opens without a signed-in
    // user, so this means someone bought through a link that bypassed it — log it rather
    // than silently leaving them paid-but-unentitled.
    logFields({ outcome: "no_user_id" });
    return NextResponse.json({ ok: true });
  }

  const priceId = subscription.items[0]?.price?.id ?? null;
  logFields({ status: subscription.status, plan: planForPriceId(priceId) ?? "unknown" });

  const applied = await applyPaddleEntitlementEvent({
    userId,
    customerId: subscription.customerId,
    subscriptionId: subscription.id,
    priceId,
    status: subscription.status,
    // Paddle keeps `currentBillingPeriod` populated for the period already paid for, so a
    // cancellation scheduled for period end keeps access until then and lapses on its own
    // even if the terminal event is missed. Null only once no period is left, which the
    // read side treats as not live.
    currentPeriodEnd: subscription.currentBillingPeriod?.endsAt ?? null,
    eventAt: event.occurredAt,
    // Not read off the payload — Paddle doesn't send one. It's which Paddle this
    // deployment is configured for, and the signature check above already proved the
    // event came from that one, since the webhook secret is per-environment.
    environment: paddleEnvironment,
  });

  if (!applied) {
    // 500 so Paddle redelivers. Same reasoning as the 503 above: this route 200s only for
    // work that is actually done, because a 200 is what stops the retries.
    logFields({ outcome: "write_failed" });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  // After the write, not before: a cancellation reported to Amplitude that we then failed
  // to record would be a churn number with no entitlement behind it. Awaited, and unable
  // to fail the request, for the same two reasons `reportPurchase` below is.
  const lifecycle = lifecycleEvent(event.eventType, subscription, priceId);
  if (lifecycle) {
    await trackServerEvent(
      { userId, dedupeKey: lifecycle.dedupeKey, occurredAt: event.occurredAt },
      lifecycle.event,
    );
  }

  logFields({ outcome: "applied" });
  return NextResponse.json({ ok: true });
}

/**
 * Which Amplitude event, if any, this lifecycle event is worth reporting as — Paddle's
 * vocabulary translated into the one both billers share.
 *
 * Paddle splits a cancellation the way the App Store does: asking to cancel schedules it
 * for the end of the paid period and arrives as `subscription.updated` carrying a
 * `scheduledChange`, and `subscription.canceled` only fires once that date arrives. So the
 * first is the decision and the second is the departure, exactly as AUTO_RENEW_DISABLED
 * and EXPIRED are on Apple's side.
 *
 * There is no `subscription_cancel_reverted` here, unlike Apple's. Undoing a scheduled
 * cancellation arrives as one more `subscription.updated` with `scheduledChange` back to
 * null, and this route holds no previous state to tell that from any other update — most
 * of which also carry a null one. Recording it would mean storing the scheduled change on
 * `paddle_entitlements` to diff against, which is a migration this doesn't need yet.
 *
 * Both keys describe the *state* rather than the notification, because Paddle reports a
 * standing scheduled cancellation on every `subscription.updated` until its date arrives —
 * a saved payment method months later re-sends the same pending cancel — and one decision
 * counted twice is worse than not counting it. That is bounded, not absolute: Amplitude
 * only remembers an `insert_id` for 7 days, so it collapses the burst of updates around
 * the cancellation and not an unrelated one a month later. Closing the rest means storing
 * the scheduled change to diff against, which is worth doing only if the number looks
 * inflated against Paddle's own dashboard.
 */
function lifecycleEvent(
  eventType: string,
  subscription: SubscriptionNotification,
  priceId: string | null,
): { dedupeKey: string; event: ServerAnalyticsEvent } | null {
  const shared = {
    provider: "paddle" as const,
    // Structurally false: the web sells no trial, since the 3-day free trial is an App
    // Store introductory offer. Sent anyway so one chart reads both billers.
    in_trial: false,
    product_id: priceId ?? "",
    expires_at: subscription.currentBillingPeriod?.endsAt ?? null,
    transaction_environment: paddleEnvironment,
  };

  if (eventType === EventName.SubscriptionCanceled) {
    return {
      dedupeKey: `${subscription.id}:${subscription.canceledAt ?? ""}`,
      event: { name: "subscription_ended", reason: "canceled", ...shared },
    };
  }

  const scheduledCancel =
    subscription.scheduledChange?.action === "cancel" ? subscription.scheduledChange : null;
  if (eventType === EventName.SubscriptionUpdated && scheduledCancel) {
    return {
      dedupeKey: `${subscription.id}:${scheduledCancel.effectiveAt}`,
      event: { name: "subscription_cancel_requested", ...shared },
    };
  }

  return null;
}

/**
 * `transaction.completed` is two different things. For a subscription it is the payment
 * behind a lifecycle the `subscription.*` events already wrote, and only Meta wants to hear
 * about it. For the lifetime unlock it is the purchase itself: a one-time price has no
 * subscription and no lifecycle, so this is the only event that will ever say it was bought.
 * The grant goes first and can fail the request; the email and the report follow and cannot.
 */
async function completeTransaction(transaction: TransactionNotification, occurredAt: string) {
  const lifetimePriceId = lifetimePriceIn(transaction);
  if (lifetimePriceId && !(await grantLifetime(transaction, lifetimePriceId, occurredAt))) {
    logFields({ outcome: "write_failed" });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
  await emailBuyer(transaction);
  return reportPurchase(transaction, occurredAt);
}

/** Where the app is and which account the purchase is on. A checkout, never a renewal, and
 * best-effort for the reason `reportPurchase` gives. */
async function emailBuyer(transaction: TransactionNotification) {
  if (transaction.origin !== "web") return;
  const userId = userIdFrom(transaction.customData);
  if (!isWelcomeEmailConfigured || !userId) {
    logFields({ welcomeEmail: userId ? "unconfigured" : "no_user_id" });
    return;
  }
  logFields({ welcomeEmail: await sendWelcomeEmail(userId, transaction.id) });
}

/** The unlock's price id when this transaction bought it, else null. `subscriptionId` is
 * the belt to the price id's braces: every transaction of a subscription carries one, and
 * a one-time purchase never does. */
function lifetimePriceIn(transaction: TransactionNotification): string | null {
  if (transaction.subscriptionId !== null) return null;
  const unlock = transaction.items.find((item) => planForPriceId(item.price?.id) === "lifetime");
  return unlock?.price?.id ?? null;
}

/** False only when the write did not land — the one outcome the webhook has to fail on.
 * A purchase with nobody to attach it to is logged and treated as applied, exactly as the
 * subscription path treats its `no_user_id`: retrying will never produce a buyer. */
async function grantLifetime(
  transaction: TransactionNotification,
  priceId: string,
  occurredAt: string,
): Promise<boolean> {
  const userId = userIdFrom(transaction.customData);
  if (!userId || !transaction.customerId) {
    logFields({ unlock: "no_user_id" });
    return true;
  }
  const applied = await applyPaddleLifetimeGrant({
    userId,
    customerId: transaction.customerId,
    transactionId: transaction.id,
    priceId,
    eventAt: occurredAt,
    // Not read off the payload, for the reason `applySubscription` gives.
    environment: paddleEnvironment,
  });
  logFields({ unlock: applied ? "applied" : "write_failed" });
  return applied;
}

/**
 * Refunds and chargebacks. Paddle files both as adjustments against the transaction, and
 * an adjustment names no buyer, so the write is keyed on the transaction id — which also
 * makes it match nothing for a subscription's transactions, whose access is the
 * subscription's own lifecycle to decide. A partial refund keeps the unlock: that is a
 * goodwill amount, not a return.
 */
async function applyAdjustment(adjustment: AdjustmentNotification, occurredAt: string) {
  const revokedAt = revocationFrom(adjustment, occurredAt);
  if (revokedAt === undefined) {
    logFields({ outcome: "ignored", action: adjustment.action, status: adjustment.status });
    return NextResponse.json({ ok: true });
  }
  const applied = await setPaddleLifetimeRevoked({
    transactionId: adjustment.transactionId,
    revokedAt,
    eventAt: occurredAt,
  });
  if (!applied) {
    logFields({ outcome: "write_failed" });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
  logFields({ outcome: revokedAt ? "revoked" : "reinstated", action: adjustment.action });
  return NextResponse.json({ ok: true });
}

/** What an adjustment does to access: a time to revoke from, null to reinstate, or
 * undefined when it changes nothing — pending, rejected, partial, or a credit. */
function revocationFrom(
  adjustment: AdjustmentNotification,
  occurredAt: string,
): string | null | undefined {
  const { action, status, type } = adjustment;
  const takesBack = action === "chargeback" || (action === "refund" && type === "full");
  if (takesBack && status === "approved") return occurredAt;
  if (takesBack && status === "reversed") return null;
  if (action === "chargeback_reverse" && status === "approved") return null;
  return undefined;
}

/**
 * Report a completed web purchase to Meta.
 *
 * This is the *only* Purchase signal that cannot be faked: it originates on the server, off
 * a transaction Paddle has actually settled, rather than mirroring something the browser
 * claimed. Its browser twin fires from `checkout.completed` and the two carry the same
 * `event_id`, so Meta collapses them into one conversion.
 *
 * Deliberately synchronous rather than deferred to `after()`: the two outbound calls below
 * add latency to a webhook Paddle is waiting on, but `after()` callbacks run outside the
 * AsyncLocalStorage context `withLogging` establishes, which would silently no-op every
 * `logFields` inside `lib/meta.ts` — losing exactly the `events_received` / `fbtrace_id`
 * diagnostics that file exists to produce. Nothing here can fail the request: a bad send
 * costs one optimization signal, and a non-2xx would have Paddle redeliver an event that
 * already landed.
 */
async function reportPurchase(transaction: TransactionNotification, occurredAt: string) {
  // Checked here rather than relying on `sendMetaPurchase` to no-op, because the customer
  // lookup below is an argument to it — so it runs first, and an unconfigured deployment
  // would pay a Paddle API round trip on every purchase to build a value that is discarded.
  if (!isMetaConfigured) {
    logFields({ outcome: "meta_unconfigured" });
    return NextResponse.json({ ok: true });
  }

  // `web` is a checkout the buyer completed; `subscription_recurring` is a renewal.
  // Renewals are revenue, not conversions, and reporting them as Purchase would inflate the
  // optimizer's view of what an ad click is worth — the same reason the App Store route
  // fires on SUBSCRIBED and not DID_RENEW.
  if (transaction.origin !== "web") {
    logFields({ outcome: "not_acquisition", origin: transaction.origin });
    return NextResponse.json({ ok: true });
  }

  const custom = (transaction.customData ?? null) as Record<string, unknown> | null;
  await sendMetaPurchase({
    eventId: typeof custom?.eventId === "string" ? custom.eventId : null,
    userId: userIdFrom(transaction.customData),
    email: await customerEmail(transaction.customerId),
    browser: parseMetaBrowserIdentity(custom),
    eventSourceUrl: FUNNEL_SUCCESS_URL,
    amountMinorUnits: transaction.details?.totals?.grandTotal,
    currency: transaction.details?.totals?.currencyCode ?? transaction.currencyCode,
    eventAtSeconds: Math.floor(new Date(occurredAt).getTime() / 1000),
  });

  logFields({ outcome: "reported" });
  return NextResponse.json({ ok: true });
}

/** The buyer's email, hashed by `lib/meta` before it leaves the process. It is the single
 * strongest match signal Meta has, and the transaction notification does not carry it — so
 * it costs one API call per purchase, which is rare enough not to matter. A failure here
 * only weakens the match. */
async function customerEmail(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  try {
    return (await paddleClient().customers.get(customerId)).email ?? null;
  } catch (cause) {
    console.error("paddle customer lookup failed", cause);
    return null;
  }
}

/** The Supabase uid the checkout stamped into `customData` when it opened. */
function userIdFrom(customData: unknown): string | null {
  if (!customData || typeof customData !== "object") return null;
  const value = (customData as Record<string, unknown>).userId;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}
