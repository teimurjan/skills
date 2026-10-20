import "server-only";
import { accountExists } from "./account";
import { createAdminClient, isServiceConfigured } from "./supabase/admin";

/** A grant is live only while unexpired; a null expiry is a perpetual unlock.
 * Every entitlement read applies this so a lapsed subscription never reads as
 * owned before the EXPIRED webhook lands. */
function isUnexpired(expiresAt: string | null | undefined): boolean {
  return !expiresAt || new Date(expiresAt) > new Date();
}

/** Which billing relationship the live entitlement came from. Decides what the
 * client's "Manage subscription" opens: Apple's own sheet, or the Dodo Payments
 * customer portal, which is the only place a web subscription can be cancelled. */
export type EntitlementProvider = "app_store" | "dodo";

/** Dodo statuses that keep access on. `past_due` is Dodo's dunning grace window — the
 * analogue of Apple's billing grace period, where the card failed but the subscription
 * hasn't lapsed. Everything else reads as not live, so an unrecognized status never
 * grants, and three exclusions are deliberate: `on_hold` means a renewal charge failed
 * and the subscription will not renew, `failed` means the mandate was never created at
 * all, and `pending` means it has not been authorized yet. */
const DODO_LIVE_STATUSES = new Set(["active", "past_due"]);

/** Which Dodo this deployment talks to. Same derivation as `lib/dodo.ts`, repeated
 * rather than imported: `readEntitlement` is on the hot path for every generation
 * request, and importing that module would pull the payments SDK in with it.
 *
 * The label written on a row and the filter that reads it come from this one value, so a
 * deployment that has DODO_PAYMENTS_ENVIRONMENT wrong is at least self-consistent — it
 * labels and honours the same thing, and nobody loses access over it. */
const DODO_ENVIRONMENT =
  process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "test_mode" : "live_mode";

/** An entitlement is owned by a signed-in user, but written under Apple's
 * `originalTransactionId` (stable across renewals, present on every purchase),
 * because that is the only identity the App Store Server Notifications webhook
 * ever carries. `userId` is the caller on the two authenticated paths and the
 * stamped `appAccountToken` on the webhook; `deviceId` is a best-effort label only. */
export interface EntitlementEvent {
  originalTransactionId: string;
  /** The buyer, when there is one to name. Null leaves an owner a purchase already
   * recorded alone rather than clearing it. */
  userId: string | null;
  deviceId: string | null;
  productId: string;
  /** Whether this event grants or revokes the paid tier. */
  active: boolean;
  /** ISO string for subscriptions; null for a perpetual (non-consumable) unlock. */
  expiresAt: string | null;
  /** Apple's signed date for this event — the ordering key. Older events no-op. */
  eventAt: string;
  /** StoreKit environment ("Production" | "Sandbox") the transaction was signed in.
   * Sandbox grants (App Review, TestFlight) are accepted but recorded so they can be
   * told apart from real revenue. Null when the payload omits it. */
  environment: string | null;
}

/** Single atomic writer for all three entitlement paths (client purchase-verify,
 * the notifications webhook, and the sync reconcile) — always upserts by
 * `original_transaction_id`, the one id every path has. Out-of-order events are
 * dropped by the RPC's `last_event_at` guard, and a null `userId` leaves an
 * existing owner alone rather than clearing it.
 *
 * False means the write did not land, and the caller must fail the request on it: Apple
 * stops retrying a notification once it gets a 200. */
export async function applyEntitlementEvent(event: EntitlementEvent): Promise<boolean> {
  if (!isServiceConfigured) return false;
  // Apple signs a deleted buyer's uid onto every later transaction, and written as the
  // owner it fails the foreign key — so the event lands without one instead.
  const userId = event.userId && (await accountExists(event.userId)) ? event.userId : null;
  const admin = createAdminClient();
  const { error } = await admin.rpc("apply_entitlement_event", {
    p_original_transaction_id: event.originalTransactionId,
    p_device_id: event.deviceId,
    p_product_id: event.productId,
    p_active: event.active,
    p_expires_at: event.expiresAt,
    p_event_at: event.eventAt,
    p_environment: event.environment,
    p_user_id: userId,
  });
  if (error) {
    console.error("applyEntitlementEvent failed", error);
    return false;
  }
  return true;
}

/** The Dodo side of the same idea, written by the webhook alone. Its own row, its own
 * ordering guard — see 0002_dodo_entitlements.sql for why this is not more columns on
 * the Apple table. */
export interface DodoEntitlementEvent {
  /** The Supabase uid the checkout session stamped into `metadata`. */
  userId: string;
  customerId: string;
  subscriptionId: string;
  /** Dodo's product id, which is also its price — the two are one object there. */
  productId: string | null;
  /** Dodo's status, unmapped. See DODO_LIVE_STATUSES. */
  status: string;
  /** Dodo's `next_billing_date`: the end of the paid-for period. Null only for a
   * subscription with no billing period left to honour — never as a stand-in for
   * "unknown", since a null here means the subscription reads as not live. */
  currentPeriodEnd: string | null;
  /** The webhook envelope's `timestamp` — the ordering key. Older events no-op. */
  eventAt: string;
  /** Which Dodo billed this ("live_mode" | "test_mode"). Unlike the Apple column this
   * gates the read, so a test-mode subscription made from a developer's machine never
   * grants paid access in production. */
  environment: string;
}

export interface DodoEntitlementResult {
  /** False means the write did not land, and the caller must fail the webhook on it. Dodo
   * only redelivers on a non-2xx, so a 200 after a failed write is the one outcome that
   * loses a paid subscription for good. An event dropped by the RPC's ordering guard is
   * not a failure — it updates no rows and reports no error, the intended no-op. */
  applied: boolean;
  /** First event ever seen for this subscription or payment id — the acquisition signal. A renewal,
   * a redelivery and a dunning recovery all find the row already there and report false,
   * which is what keeps them out of Meta's conversion count. */
  isNewPurchase: boolean;
}

/** Single atomic writer for the Dodo webhook, with a `last_event_at` guard separate from
 * Apple's so the two providers can't drop each other's events. */
export async function applyDodoEntitlementEvent(
  event: DodoEntitlementEvent,
): Promise<DodoEntitlementResult> {
  if (!isServiceConfigured) return { applied: false, isNewPurchase: false };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("apply_dodo_entitlement_event", {
    p_user_id: event.userId,
    p_dodo_customer_id: event.customerId,
    p_dodo_subscription_id: event.subscriptionId,
    p_product_id: event.productId,
    p_status: event.status,
    p_current_period_end: event.currentPeriodEnd,
    p_event_at: event.eventAt,
    p_environment: event.environment,
  });
  if (error) {
    console.error("applyDodoEntitlementEvent failed", error);
    return { applied: false, isNewPurchase: false };
  }
  return { applied: true, isNewPurchase: data === true };
}

/** The lifetime unlock bought on the web: a one-time Dodo payment, written from the webhook's
 * `payment.succeeded` branch. Its own table and its own writer — see
 * 0006_dodo_lifetime_entitlements.sql for why it is not a row on the subscription one. */
export interface DodoLifetimeGrant {
  /** The Supabase uid the checkout session stamped into `metadata`. */
  userId: string;
  customerId: string;
  /** The one-time payment. Refunds and disputes arrive keyed on it. */
  paymentId: string;
  productId: string;
  /** The webhook envelope's `timestamp` — the ordering key. Older events no-op. */
  eventAt: string;
  /** Which Dodo billed this; gates the read, as it does on the subscription row. */
  environment: string;
}

/** Same contract as `applyDodoEntitlementEvent`, keyed on the payment. */
export async function applyDodoLifetimeGrant(grant: DodoLifetimeGrant): Promise<DodoEntitlementResult> {
  if (!isServiceConfigured) return { applied: false, isNewPurchase: false };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("apply_dodo_lifetime_grant", {
    p_user_id: grant.userId,
    p_dodo_customer_id: grant.customerId,
    p_dodo_payment_id: grant.paymentId,
    p_product_id: grant.productId,
    p_environment: grant.environment,
    p_event_at: grant.eventAt,
  });
  if (error) {
    console.error("applyDodoLifetimeGrant failed", error);
    return { applied: false, isNewPurchase: false };
  }
  return { applied: true, isNewPurchase: data === true };
}

/** End a lifetime unlock by the payment that bought it, the only identity a refund or a
 * dispute carries. A payment this table never saw updates nothing, and that is not a failure. */
export async function revokeDodoLifetime(paymentId: string, eventAt: string): Promise<boolean> {
  if (!isServiceConfigured) return false;
  const admin = createAdminClient();
  const { error } = await admin.rpc("revoke_dodo_lifetime", {
    p_dodo_payment_id: paymentId,
    p_event_at: eventAt,
  });
  if (error) {
    console.error("revokeDodoLifetime failed", error);
    return false;
  }
  return true;
}

/** Is this user on the paid tier — do they hold a live subscription from either biller?
 * There is no free tier, so this is the whole access check. */
export async function isPaid(userId: string): Promise<boolean> {
  const { paid } = await readEntitlement(userId);
  return paid;
}

/** The Dodo customer behind a user's web purchase, subscription first, for minting a
 * customer-portal session. Null when they never bought on the web. */
export async function getDodoCustomerId(userId: string): Promise<string | null> {
  if (!isServiceConfigured) return null;
  const admin = createAdminClient();
  const [subscription, lifetime] = await Promise.all([
    admin.from("dodo_entitlements").select("dodo_customer_id").eq("user_id", userId).maybeSingle(),
    admin.from("dodo_lifetime_entitlements").select("dodo_customer_id").eq("user_id", userId).maybeSingle(),
  ]);
  return subscription.data?.dodo_customer_id ?? lifetime.data?.dodo_customer_id ?? null;
}

export interface EntitlementStatus {
  paid: boolean;
  expiresAt: string | null;
  /** Null when nothing is live. Additive on /api/entitlement — binaries that predate it
   * decode `paid`/`expiresAt` and ignore this. */
  provider: EntitlementProvider | null;
}

/** The best of a set of live expiries: a perpetual grant (null — sandbox/App Review, or a
 * lifetime unlock) outranks any dated one, otherwise the one that runs longest. */
function furthestExpiry(expiries: (string | null)[]): string | null {
  if (expiries.some((expiry) => !expiry)) return null;
  return expiries.reduce((latest, expiry) => (latest && expiry! < latest ? latest : expiry));
}

/**
 * One read of a user's live entitlement across both billers, and the only place the
 * union is computed — `isPaid` is a view onto it, so callers never learn there are two.
 *
 * `entitlements` is the App Store half; the generic name predates there being a second
 * biller. Someone can own more than one row there — an old lapsed subscription alongside
 * a current one — so it takes the best live grant rather than assuming a single row.
 * `dodo_entitlements` and `dodo_lifetime_entitlements` hold at most one row per account
 * each: the web subscription, and the web lifetime unlock.
 *
 * The three are read in parallel because this sits in front of every gated request.
 */
export async function readEntitlement(userId: string): Promise<EntitlementStatus> {
  if (!isServiceConfigured) return { paid: false, expiresAt: null, provider: null };
  const admin = createAdminClient();

  const [apple, dodo, lifetime] = await Promise.all([
    admin
      .from("entitlements")
      .select("active, expires_at")
      .eq("user_id", userId)
      .eq("active", true),
    admin
      .from("dodo_entitlements")
      .select("status, current_period_end, environment")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("dodo_lifetime_entitlements")
      .select("environment, revoked_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // A Dodo migration not applied yet — a deploy-ordering state rather than a fault, and it
  // reads as "nothing bought on the web" exactly as an empty table would. That is what keeps
  // either deploy order safe. Once the migrations are everywhere this can never fire.
  const tableMissing = (result: { error: { code?: string } | null }) =>
    result.error?.code === "PGRST205";

  // Otherwise: a failed read is not the same answer as "unpaid", and until now it produced
  // one. Every gate turns a false into `403 requires_pro`, so a transient database error
  // showed the paywall to someone who had already paid — and the entitlement refresh
  // flipped a live subscriber to locked. Fail the request instead: a 500 says we don't
  // know, which is true, and the client retries rather than believing it.
  const failure =
    apple.error ??
    (tableMissing(dodo) ? null : dodo.error) ??
    (tableMissing(lifetime) ? null : lifetime.error);
  if (failure) {
    console.error("readEntitlement failed", failure);
    throw new Error("entitlement_read_failed");
  }

  const appleLive = (apple.data ?? []).filter((row) => isUnexpired(row.expires_at));

  // A row grants only on the environment that billed it, so a test-mode subscription
  // bought from a developer's machine reads as nothing in production. And unlike the
  // Apple row, a null period end is not perpetual here — it means there is no paid-for
  // period left to honour, so it must not grant.
  const web = dodo.data;
  const dodoLive =
    web?.environment === DODO_ENVIRONMENT &&
    DODO_LIVE_STATUSES.has(web.status) &&
    Boolean(web.current_period_end) &&
    isUnexpired(web.current_period_end);

  // The lifetime unlock never expires. It is live unless a refund or a lost dispute revoked
  // it, and only on the environment that billed it — the same gate as the row above.
  const unlock = lifetime.data;
  const lifetimeLive = unlock?.environment === DODO_ENVIRONMENT && !unlock.revoked_at;

  const expiries = [
    ...appleLive.map((row) => row.expires_at as string | null),
    ...(dodoLive ? [web.current_period_end as string] : []),
    ...(lifetimeLive ? [null] : []),
  ];
  if (expiries.length === 0) return { paid: false, expiresAt: null, provider: null };

  return {
    paid: true,
    expiresAt: furthestExpiry(expiries),
    // Dodo wins when both are live: it's the one the user can only manage off-device,
    // so it's the one worth pointing them at.
    provider: dodoLive || lifetimeLive ? "dodo" : "app_store",
  };
}
