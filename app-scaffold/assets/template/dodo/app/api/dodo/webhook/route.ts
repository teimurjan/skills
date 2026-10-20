import { NextResponse } from "next/server";
import type { Payment } from "dodopayments/resources/payments";
import type { Subscription } from "dodopayments/resources/subscriptions";
import { dodoClient, dodoEnvironment, isDodoConfigured, planForProductId } from "@/lib/dodo";
import { applyDodoEntitlementEvent, applyDodoLifetimeGrant, revokeDodoLifetime } from "@/lib/entitlements";
import { logFields, withLogging } from "@/lib/log";
import { isMetaConfigured, parseMetaBrowserIdentity, sendMetaPurchase } from "@/lib/meta";
import { trackServerEvent, type ServerAnalyticsEvent } from "@/lib/serverAnalytics";
import { isWelcomeEmailConfigured, sendWelcomeEmail } from "@/lib/welcomeEmail/send";

export const dynamic = "force-dynamic";

/** Where the funnel's success page lives, for Meta's URL-level reporting. Dodo calls this
 * route, so there is no referer to read and no request URL worth trusting.
 *
 * `SITE_URL`, not `API_BASE_URL` — the latter is an iOS xcconfig value that is never set on
 * the server, so reading it here would silently mean "always the fallback". */
const FUNNEL_SUCCESS_URL = `${process.env.SITE_URL ?? "https://appname.example"}/start/done`;

/** Supabase uids ride through checkout in the session's `metadata`; validate the shape
 * before trusting one. Same reasoning as `accountToken` on the Apple side: the value comes
 * back through the biller, so it is only trusted once it is the shape we wrote. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every subscription lifecycle event carries the whole subscription, so all of them are
 * written the same way and the status alone decides access (DODO_LIVE_STATUSES).
 *
 * `past_due` is in the SDK's types ahead of the docs' event list; subscribing to it in the
 * dashboard is optional, handling it here is free. A subscription's own payments are
 * ignored: a renewal is `subscription.renewed`. Payments matter only for the lifetime unlock,
 * which `payment.succeeded`, `refund.succeeded` and `dispute.lost` grant and revoke. */
const SUBSCRIPTION_EVENTS = new Set([
  "subscription.active",
  "subscription.updated",
  "subscription.renewed",
  "subscription.on_hold",
  "subscription.past_due",
  "subscription.paused",
  "subscription.unpaused",
  "subscription.plan_changed",
  "subscription.update_payment_method",
  "subscription.cancelled",
  "subscription.failed",
  "subscription.expired",
]);

/**
 * Dodo Payments webhook — the durable record of a web purchase, and the only thing that
 * writes `dodo_entitlements` and `dodo_lifetime_entitlements`.
 *
 * The Standard Webhooks signature is the authentication: no shared URL token, no bearer,
 * exactly as Apple's JWS is the authentication on the App Store notifications route.
 */
export const POST = withLogging("dodo.webhook", async (request: Request) => {
  if (!isDodoConfigured) {
    // Loud rather than silent: a misconfigured deployment that 200s here would have Dodo
    // consider every entitlement delivered and stop redelivering after eight attempts.
    return NextResponse.json({ error: "dodo_unavailable" }, { status: 503 });
  }

  const id = request.headers.get("webhook-id");
  const signature = request.headers.get("webhook-signature");
  const timestamp = request.headers.get("webhook-timestamp");
  // The raw body, not request.json() — the signature covers the exact bytes Dodo sent, and
  // a parse-then-restringify round trip does not reproduce them.
  const raw = await request.text();
  if (!id || !signature || !timestamp || !raw) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let event;
  try {
    event = dodoClient().webhooks.unwrap(raw, {
      headers: {
        "webhook-id": id,
        "webhook-signature": signature,
        "webhook-timestamp": timestamp,
      },
    });
  } catch (cause) {
    // 401 lets Dodo retry with backoff.
    console.error("dodo signature verification failed", cause);
    logFields({ outcome: "invalid_signature" });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // The delivery id, stable across retries. Not used as an idempotency key — the RPC's
  // ordering guard and the state-shaped Amplitude `insert_id`s already cover redelivery, and
  // both also cover the case a delivery id cannot: Dodo re-reporting the same standing state
  // under a fresh id. It is logged so a duplicate can be recognised as one.
  logFields({ type: event.type, webhookId: id });

  if (event.type === "payment.succeeded") return applyLifetimePayment(event.data, event.timestamp);
  // A partial refund leaves the unlock paid for.
  if (event.type === "refund.succeeded" && !event.data.is_partial) {
    return revokeLifetime(event.data.payment_id, event.timestamp);
  }
  if (event.type === "dispute.lost") return revokeLifetime(event.data.payment_id, event.timestamp);

  if (!SUBSCRIPTION_EVENTS.has(event.type)) {
    // Subscribed-to-but-unhandled, or Dodo adding a type. 2xx so it isn't retried for a
    // day; the type is in the log line if it turns out to matter.
    logFields({ outcome: "ignored" });
    return NextResponse.json({ ok: true });
  }

  return applySubscription(event.type, event.data as Subscription, event.timestamp);
});

async function applySubscription(type: string, subscription: Subscription, occurredAt: string) {
  const userId = userIdFrom(subscription.metadata);
  if (!userId) {
    // Nothing to attach the subscription to. Checkout never opens without a signed-in
    // user, so this means someone bought through a link that bypassed it — log it rather
    // than silently leaving them paid-but-unentitled.
    logFields({ outcome: "no_user_id" });
    return NextResponse.json({ ok: true });
  }

  const productId = subscription.product_id;
  // `subscriptionStatus`, not `status`: `withLogging` spreads these fields over its own
  // `status`, which is the HTTP one, and a bare `status: "active"` would erase it from the
  // line — leaving no way to filter this route's 500s.
  logFields({
    subscriptionStatus: subscription.status,
    plan: planForProductId(productId) ?? "unknown",
  });

  const { applied, isNewPurchase } = await applyDodoEntitlementEvent({
    userId,
    customerId: subscription.customer.customer_id,
    subscriptionId: subscription.subscription_id,
    productId,
    status: subscription.status,
    // Dodo advances `next_billing_date` only when a period is actually paid for, so a
    // cancellation scheduled for period end keeps access until then and lapses on its own
    // even if the terminal event is missed.
    currentPeriodEnd: subscription.next_billing_date,
    eventAt: occurredAt,
    // Not read off the payload — Dodo doesn't send one. It's which Dodo this deployment is
    // configured for, and the signature check above already proved the event came from
    // that one, since the webhook key is per-environment.
    environment: dodoEnvironment,
  });

  if (!applied) {
    // 500 so Dodo redelivers. Same reasoning as the 503 above: this route 200s only for
    // work that is actually done, because a 200 is what stops the retries.
    logFields({ outcome: "write_failed" });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  // The first time a subscription id is seen is the acquisition, and the RPC that wrote the
  // row is what says so — there is no window between the two. A renewal, a redelivery, and
  // a dunning recovery (which also arrives as `subscription.active`) all find the row
  // already there, which is what keeps revenue out of the conversion count: reporting a
  // renewal as a Purchase would inflate the optimizer's view of what an ad click is worth,
  // the same reason the App Store route fires on SUBSCRIBED and not DID_RENEW.
  //
  // Gated on the payload's status, not on the event type. Dodo sends `subscription.renewed`
  // for the *first* charge as well as later ones, as a separate delivery with no ordering
  // against `subscription.active` (both arrived for `sub_0NnZnWdFyqV29DoLMFV0w`, 2026-09-14).
  // Whenever `renewed` lands first it is the one that inserts the row, and the `active`
  // behind it finds nothing new — so keying on the type silently drops the purchase.
  // Whichever live event is first to see the id is the acquisition. The status check is
  // what keeps `subscription.failed` out: a mandate that was never created also inserts a
  // row, and is not a sale.
  if (isNewPurchase && subscription.status === "active") {
    await reportPurchase({
      eventId: subscription.metadata.eventId,
      userId,
      email: subscription.customer.email,
      metadata: subscription.metadata,
      // Dodo states the recurring amount before tax. The browser twin carries the exact
      // charged total, and normally arrives first and wins deduplication, so this is the
      // slightly conservative number on the fallback path rather than the usual one.
      amountMinorUnits: subscription.recurring_pre_tax_amount,
      currency: subscription.currency,
      occurredAt,
    });
    await welcomeBuyer(userId, subscription.subscription_id);
  }

  // After the write, not before: a cancellation reported to Amplitude that we then failed
  // to record would be a churn number with no entitlement behind it. Awaited, and unable to
  // fail the request, for the same two reasons `reportPurchase` is.
  const lifecycle = lifecycleEvent(type, subscription);
  if (lifecycle) {
    await trackServerEvent(
      { userId, dedupeKey: lifecycle.dedupeKey, occurredAt },
      lifecycle.event,
    );
  }

  logFields({ outcome: "applied" });
  return NextResponse.json({ ok: true });
}

/**
 * The lifetime unlock: a one-time payment for the lifetime product. A subscription's charges
 * arrive here too, and are left to the subscription's own lifecycle events.
 */
async function applyLifetimePayment(payment: Payment, occurredAt: string) {
  const productId = payment.product_cart?.find(
    (item) => planForProductId(item.product_id) === "lifetime",
  )?.product_id;
  if (payment.subscription_id || !productId) {
    logFields({ outcome: "ignored" });
    return NextResponse.json({ ok: true });
  }

  const userId = userIdFrom(payment.metadata);
  if (!userId) {
    logFields({ outcome: "no_user_id" });
    return NextResponse.json({ ok: true });
  }
  logFields({ plan: "lifetime" });

  const { applied, isNewPurchase } = await applyDodoLifetimeGrant({
    userId,
    customerId: payment.customer.customer_id,
    paymentId: payment.payment_id,
    productId,
    eventAt: occurredAt,
    environment: dodoEnvironment,
  });
  if (!applied) {
    logFields({ outcome: "write_failed" });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  if (isNewPurchase) {
    await reportPurchase({
      eventId: payment.metadata.eventId,
      userId,
      email: payment.customer.email,
      metadata: payment.metadata,
      amountMinorUnits: payment.total_amount,
      currency: payment.currency,
      occurredAt,
    });
    await welcomeBuyer(userId, payment.payment_id);
  }

  logFields({ outcome: "applied" });
  return NextResponse.json({ ok: true });
}

/** A full refund or a lost dispute ends a lifetime unlock. Both name only the payment, and a
 * subscription payment matches no row, so this is a no-op for those. */
async function revokeLifetime(paymentId: string, occurredAt: string) {
  if (!(await revokeDodoLifetime(paymentId, occurredAt))) {
    logFields({ outcome: "write_failed" });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
  logFields({ outcome: "applied" });
  return NextResponse.json({ ok: true });
}

/**
 * Which Amplitude event, if any, this lifecycle event is worth reporting as — Dodo's
 * vocabulary translated into the one both billers share.
 *
 * Dodo splits a cancellation the way the App Store does: asking to cancel sets
 * `cancel_at_next_billing_date` and leaves the subscription active until the paid period
 * runs out, and only then does it end. So the flag is the decision and the terminal event
 * is the departure, exactly as AUTO_RENEW_DISABLED and EXPIRED are on Apple's side.
 *
 * There is no `subscription_cancel_reverted` here, unlike Apple's. Undoing a scheduled
 * cancellation arrives as one more `subscription.updated` with the flag back to false, and
 * this route holds no previous state to tell that from any other update — most of which
 * also carry a false one. Recording it would mean storing the flag on `dodo_entitlements`
 * to diff against, which is a migration this doesn't need yet.
 *
 * The cancel key describes the *state* rather than the notification, because Dodo reports a
 * standing cancellation on every `subscription.updated` until its date arrives, and each
 * redelivery carries its own `webhook-id` — so keying on the header would count one
 * decision many times. That is bounded, not absolute: Amplitude only remembers an
 * `insert_id` for 7 days, so it collapses the burst of updates around the cancellation and
 * not an unrelated one a month later.
 */
function lifecycleEvent(
  type: string,
  subscription: Subscription,
): { dedupeKey: string; event: ServerAnalyticsEvent } | null {
  const id = subscription.subscription_id;
  const shared = {
    provider: "dodo" as const,
    // False in practice: both products carry `trial_period_days: 0` and no checkout session
    // overrides it, because the 3-day free trial is an App Store introductory offer. Read
    // off the subscription anyway rather than hardcoded, so it stays true if that changes.
    in_trial: subscription.trial_period_days > 0,
    product_id: subscription.product_id,
    expires_at: subscription.next_billing_date,
    transaction_environment: dodoEnvironment,
  };

  if (type === "subscription.cancelled") {
    return {
      dedupeKey: `${id}:${subscription.cancelled_at ?? ""}`,
      event: { name: "subscription_ended", reason: "cancelled", ...shared },
    };
  }
  if (type === "subscription.expired") {
    return {
      dedupeKey: `${id}:expired`,
      event: { name: "subscription_ended", reason: "expired", ...shared },
    };
  }
  // The mandate was never created, so nothing was ever live. Counted so a run of them is
  // visible as a payment problem rather than as silence.
  if (type === "subscription.failed") {
    return {
      dedupeKey: `${id}:failed`,
      event: { name: "subscription_ended", reason: "failed", ...shared },
    };
  }
  if (subscription.cancel_at_next_billing_date) {
    return {
      dedupeKey: `${id}:${subscription.next_billing_date}`,
      event: { name: "subscription_cancel_requested", ...shared },
    };
  }
  return null;
}

/**
 * Report a completed web purchase to Meta.
 *
 * This is the *only* Purchase signal that cannot be faked: it originates on the server, off
 * a subscription or a payment Dodo has actually completed, rather than mirroring something the browser
 * claimed. Its browser twin fires from `/start/done` and the two carry the same `event_id`,
 * so Meta collapses them into one conversion.
 *
 * Deliberately synchronous rather than deferred to `after()`: the outbound call below adds
 * latency to a webhook Dodo is waiting on, but `after()` callbacks run outside the
 * AsyncLocalStorage context `withLogging` establishes, which would silently no-op every
 * `logFields` inside `lib/meta.ts` — losing exactly the `events_received` / `fbtrace_id`
 * diagnostics that file exists to produce. Nothing here can fail the request: a bad send
 * costs one optimization signal, and a non-2xx would have Dodo redeliver an event that
 * already landed.
 */
async function reportPurchase(purchase: {
  eventId: unknown;
  userId: string;
  /** The payload carries the buyer's email — the strongest match signal Meta has — so it
   * costs no extra API call to look one up. */
  email: string;
  metadata: Subscription["metadata"];
  amountMinorUnits: number;
  currency: string;
  occurredAt: string;
}) {
  if (!isMetaConfigured) {
    logFields({ outcome: "meta_unconfigured" });
    return;
  }

  await sendMetaPurchase({
    eventId: asString(purchase.eventId),
    userId: purchase.userId,
    email: purchase.email,
    browser: parseMetaBrowserIdentity(purchase.metadata),
    eventSourceUrl: FUNNEL_SUCCESS_URL,
    amountMinorUnits: purchase.amountMinorUnits,
    currency: purchase.currency,
    eventAtSeconds: Math.floor(new Date(purchase.occurredAt).getTime() / 1000),
  });
  logFields({ metaReported: true });
}

/** Where the app is and which account the purchase is on. Once per purchase, and unable to
 * fail the request for the reason `reportPurchase` gives. */
async function welcomeBuyer(userId: string, purchaseId: string) {
  if (!isWelcomeEmailConfigured) {
    logFields({ welcomeEmail: "unconfigured" });
    return;
  }
  logFields({ welcomeEmail: await sendWelcomeEmail(userId, purchaseId) });
}

/** The Supabase uid the checkout session stamped into `metadata` when it was created. */
function userIdFrom(metadata: Subscription["metadata"]): string | null {
  const value = asString(metadata.userId);
  return value && UUID_PATTERN.test(value) ? value : null;
}

/** Dodo metadata values are `string | number | boolean`; everything we wrote was a string. */
const asString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;
