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
 * client's "Manage subscription" opens: Apple's own sheet, or the Paddle
 * customer portal, which is the only place a web subscription can be cancelled. */
export type EntitlementProvider = "app_store" | "paddle";

/** Paddle statuses that keep access on. `past_due` is Paddle's dunning window — the
 * analogue of Apple's billing grace period, where the card failed but the subscription
 * hasn't lapsed. Anything else (`paused`, `canceled`, or a status Paddle adds later)
 * reads as not live, so an unrecognized status never grants. `trialing` is absent on
 * purpose: the web sells no trial, so seeing it means Paddle is misconfigured. */
const PADDLE_LIVE_STATUSES = new Set(["active", "past_due"]);

/** Which Paddle this deployment talks to. Same derivation as `lib/paddle.ts`, repeated
 * rather than imported: `readEntitlement` is on the hot path for every gated
 * read, and importing that module would pull the Paddle SDK in with it.
 *
 * The label written on a row and the filter that reads it come from this one value, so a
 * deployment that has PADDLE_ENVIRONMENT wrong is at least self-consistent — it labels
 * and honours the same thing, and nobody loses access over it. */
const PADDLE_ENVIRONMENT =
  process.env.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";

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

/** The Paddle side of the same idea, written by the webhook alone. Its own row, its own
 * ordering guard — see 0002_paddle_entitlements.sql for why this is not more columns on
 * the Apple table. */
export interface PaddleEntitlementEvent {
  /** The Supabase uid the buyer's browser stamped into checkout `customData`. */
  userId: string;
  customerId: string;
  subscriptionId: string;
  /** Null when the lifecycle event carries no items; the stored price is then kept. */
  priceId: string | null;
  /** Paddle's status, unmapped. See PADDLE_LIVE_STATUSES. */
  status: string;
  /** End of the paid-for period. Null only for a subscription with no billing period
   * left to honour — never as a stand-in for "unknown", since a null here means the
   * subscription reads as not live. */
  currentPeriodEnd: string | null;
  /** Paddle's `occurred_at` — the ordering key. Older events no-op. */
  eventAt: string;
  /** Which Paddle billed this ("production" | "sandbox"). Unlike the Apple column this
   * gates the read, so a sandbox subscription made from a developer's machine never
   * grants paid access in production. */
  environment: string;
}

/** Single atomic writer for the Paddle webhook, with a `last_event_at` guard separate
 * from Apple's so the two providers can't drop each other's events.
 *
 * False means the write did not land, and the caller must fail the webhook on it. Paddle
 * only redelivers on a non-2xx, so a 200 after a failed write is the one outcome that
 * loses a paid subscription for good. An event dropped by the RPC's ordering guard is not
 * a failure — it updates no rows and reports no error, which is the intended no-op. */
export async function applyPaddleEntitlementEvent(event: PaddleEntitlementEvent): Promise<boolean> {
  if (!isServiceConfigured) return false;
  const admin = createAdminClient();
  const { error } = await admin.rpc("apply_paddle_entitlement_event", {
    p_user_id: event.userId,
    p_paddle_customer_id: event.customerId,
    p_paddle_subscription_id: event.subscriptionId,
    p_price_id: event.priceId,
    p_status: event.status,
    p_current_period_end: event.currentPeriodEnd,
    p_event_at: event.eventAt,
    p_environment: event.environment,
  });
  if (error) {
    console.error("applyPaddleEntitlementEvent failed", error);
    return false;
  }
  return true;
}

/** The lifetime unlock bought on the web: a one-time Paddle transaction, written from the
 * webhook's `transaction.completed` branch. Its own table and its own writer — see
 * 0008_paddle_lifetime_entitlements.sql for why it is not a row on the subscription one. */
export interface PaddleLifetimeGrant {
  /** The Supabase uid the buyer's browser stamped into checkout `customData`. */
  userId: string;
  customerId: string;
  /** The one-time transaction. Refunds and chargebacks arrive keyed on it. */
  transactionId: string;
  priceId: string;
  /** Paddle's `occurred_at` — the ordering key. Older events no-op. */
  eventAt: string;
  /** Which Paddle billed this; gates the read, as it does on the subscription row. */
  environment: string;
}

/** False means the write did not land and the webhook must fail, for the reason
 * `applyPaddleEntitlementEvent` gives: a 200 over a lost write loses a paid unlock. */
export async function applyPaddleLifetimeGrant(grant: PaddleLifetimeGrant): Promise<boolean> {
  if (!isServiceConfigured) return false;
  const admin = createAdminClient();
  const { error } = await admin.rpc("apply_paddle_lifetime_grant", {
    p_user_id: grant.userId,
    p_paddle_customer_id: grant.customerId,
    p_paddle_transaction_id: grant.transactionId,
    p_price_id: grant.priceId,
    p_environment: grant.environment,
    p_event_at: grant.eventAt,
  });
  if (error) {
    console.error("applyPaddleLifetimeGrant failed", error);
    return false;
  }
  return true;
}

/** Revoke — or, with a null `revokedAt`, reinstate — a lifetime unlock by the transaction
 * that paid for it, which is the only identity a Paddle adjustment carries. An adjustment
 * on a transaction this table never saw updates nothing, and that is not a failure. */
export async function setPaddleLifetimeRevoked(change: {
  transactionId: string;
  revokedAt: string | null;
  eventAt: string;
}): Promise<boolean> {
  if (!isServiceConfigured) return false;
  const admin = createAdminClient();
  const { error } = await admin.rpc("set_paddle_lifetime_revoked", {
    p_paddle_transaction_id: change.transactionId,
    p_revoked_at: change.revokedAt,
    p_event_at: change.eventAt,
  });
  if (error) {
    console.error("setPaddleLifetimeRevoked failed", error);
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

/** The Paddle ids behind a user's web subscription, for minting a customer-portal
 * session. Null when they never bought on the web. */
export async function getStoredPaddleIds(
  userId: string,
): Promise<{ customerId: string; subscriptionId: string } | null> {
  if (!isServiceConfigured) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("paddle_entitlements")
    .select("paddle_customer_id, paddle_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.paddle_customer_id || !data.paddle_subscription_id) return null;
  return { customerId: data.paddle_customer_id, subscriptionId: data.paddle_subscription_id };
}

export interface EntitlementStatus {
  paid: boolean;
  expiresAt: string | null;
  /** Null when nothing is live. Additive on /api/entitlement — binaries that predate it
   * decode `paid`/`expiresAt` and ignore this. */
  provider: EntitlementProvider | null;
}

/** The best of a set of live expiries: a perpetual grant (null — sandbox/App Review)
 * outranks any dated one, otherwise the one that runs longest. */
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
 * `paddle_entitlements` and `paddle_lifetime_entitlements` hold at most one row per
 * account each: the web subscription, and the web lifetime unlock.
 *
 * The three are read in parallel because this sits in front of every gated read.
 */
export async function readEntitlement(userId: string): Promise<EntitlementStatus> {
  if (!isServiceConfigured) return { paid: false, expiresAt: null, provider: null };
  const admin = createAdminClient();

  const [apple, paddle, lifetime] = await Promise.all([
    admin
      .from("entitlements")
      .select("active, expires_at")
      .eq("user_id", userId)
      .eq("active", true),
    admin
      .from("paddle_entitlements")
      .select("status, current_period_end, environment")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("paddle_lifetime_entitlements")
      .select("environment, revoked_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // A Paddle migration (0002, 0008) not applied yet — a deploy-ordering state rather than
  // a fault, and it reads as "nothing bought on the web" exactly as an empty table would.
  // That is what keeps either deploy order safe. Once both are everywhere this never fires.
  const tableMissing = (result: { error: { code?: string } | null }) =>
    result.error?.code === "PGRST205";

  // Otherwise: a failed read is not the same answer as "unpaid", and until now it produced
  // one. Every gate turns a false into `403 requires_pro`, so a transient database error
  // showed the paywall to someone who had already paid — and the entitlement refresh
  // flipped a live subscriber to locked. Fail the request instead: a 500 says we don't
  // know, which is true, and the client retries rather than believing it.
  const failure =
    apple.error ??
    (tableMissing(paddle) ? null : paddle.error) ??
    (tableMissing(lifetime) ? null : lifetime.error);
  if (failure) {
    console.error("readEntitlement failed", failure);
    throw new Error("entitlement_read_failed");
  }

  const appleLive = (apple.data ?? []).filter((row) => isUnexpired(row.expires_at));

  // A row grants only on the environment that billed it, so a sandbox subscription
  // bought from a developer's machine reads as nothing in production. And unlike the
  // Apple row, a null period end is not perpetual here — it means there is no paid-for
  // period left to honour, so it must not grant.
  const web = paddle.data;
  const paddleLive =
    web?.environment === PADDLE_ENVIRONMENT &&
    PADDLE_LIVE_STATUSES.has(web.status) &&
    Boolean(web.current_period_end) &&
    isUnexpired(web.current_period_end);

  // The lifetime unlock never expires. It is live unless a refund or chargeback revoked
  // it, and only on the environment that billed it — the same gate as the row above.
  const unlock = lifetime.data;
  const lifetimeLive = unlock?.environment === PADDLE_ENVIRONMENT && !unlock.revoked_at;

  const expiries = [
    ...appleLive.map((row) => row.expires_at as string | null),
    ...(paddleLive ? [web.current_period_end as string] : []),
    ...(lifetimeLive ? [null] : []),
  ];
  if (expiries.length === 0) return { paid: false, expiresAt: null, provider: null };

  return {
    paid: true,
    expiresAt: furthestExpiry(expiries),
    // Paddle wins when both are live: it's the one the user can only cancel off-device,
    // so it's the one worth pointing them at.
    provider: paddleLive || lifetimeLive ? "paddle" : "app_store",
  };
}
