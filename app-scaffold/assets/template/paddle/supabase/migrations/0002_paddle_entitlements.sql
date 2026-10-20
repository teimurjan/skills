-- The Paddle half of the paid tier: the subscription is now also sold on the web.
--
-- Named to pair with public.entitlements, which despite the generic name holds only the
-- App Store half: original_transaction_id, product_id, expires_at, environment. One table
-- per biller, and `readEntitlement` in lib/entitlements.ts is the union of the two — no
-- caller of `isPaid` ever learns there is more than one.
--
-- A parallel table rather than more columns on public.entitlements, for three reasons:
--
--   1. That row carries a single `last_event_at` guard, and the RPC drops anything older
--      (`where e.last_event_at <= p_event_at`). Shared, an Apple notification and a Paddle
--      webhook would silently no-op each other. Each biller needs its own ordering.
--   2. `expires_at` means *perpetual* when null on the Apple row — that is how App Review
--      and TestFlight grants work. Null means *not live* here. One column cannot carry
--      both readings without eventually granting someone lifetime access by accident.
--   3. `original_transaction_id` is that table's primary key. A Paddle subscription id in
--      it would be reachable by every query written for Apple's.
--
-- Writes happen server-side (secret key) from the Paddle webhook only.
create table if not exists public.paddle_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  paddle_customer_id text not null,
  paddle_subscription_id text not null,
  price_id text,
  -- Paddle's own vocabulary, verbatim: active, trialing, past_due, paused, canceled.
  -- Kept unmapped so a status we didn't anticipate reads as "not live" instead of being
  -- coerced into one that grants.
  status text not null,
  -- End of the period already paid for. Never null for a live subscription:
  -- lib/entitlements.ts treats a null expiry on the *Apple* row as a perpetual unlock,
  -- and this column must not inherit that meaning, so the live check requires a real
  -- future timestamp.
  current_period_end timestamptz,
  -- Which Paddle billed this ("production" | "sandbox"). Unlike the Apple column this
  -- *gates the read*: App Review and TestFlight transact in Sandbox against the
  -- production API, so production must honour sandbox StoreKit rows — Paddle has no
  -- such case. A sandbox subscription is a test card against a client token that lives
  -- only in someone's .env.local, so a row grants only on the environment that billed
  -- it. The webhook secret is per-environment, so a deployment can only ever verify
  -- events from the Paddle it is configured for, which makes this label trustworthy
  -- rather than merely declared.
  environment text not null,
  -- Paddle's `occurred_at`. This table's own out-of-order guard, independent of Apple's.
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One subscription maps to one account. The unique index makes a webhook that arrives for
-- a subscription already bound to a different user fail loudly rather than quietly move
-- the entitlement.
create unique index if not exists paddle_entitlements_subscription_idx
  on public.paddle_entitlements (paddle_subscription_id);

alter table public.paddle_entitlements enable row level security;
-- No policies, deliberately — same as every other table here. Reads and writes both go
-- through the secret-key client, which bypasses RLS; nothing reaches this table with a
-- user's own JWT. The client learns its state from /api/entitlement instead.

-- Single atomic writer for the Paddle webhook, mirroring apply_entitlement_event: upsert
-- keyed on user_id, with a last_event_at guard that drops events older than the one
-- already applied. Paddle does not guarantee webhook order either, and a stale
-- `subscription.updated` landing after `subscription.activated` would otherwise revert a
-- live subscription.
--
-- The guard carries a second clause for the resubscribe case. One account holds one row,
-- so a user who cancels and later subscribes again replaces sub1 with sub2 on it. A late
-- `subscription.canceled` for sub1 can then arrive with an `occurred_at` *newer* than
-- sub2's activation — Paddle only promises delivery, not order — and would revoke a
-- subscription that is currently being paid for. So an event about a subscription other
-- than the one on record may only take the row over if it grants; a revocation for a
-- subscription we have already moved on from is not ours to apply.
create or replace function public.apply_paddle_entitlement_event(
  p_user_id uuid,
  p_paddle_customer_id text,
  p_paddle_subscription_id text,
  p_price_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_event_at timestamptz,
  p_environment text
) returns void
language plpgsql
as $$
begin
  insert into public.paddle_entitlements as p (
    user_id, paddle_customer_id, paddle_subscription_id, price_id,
    status, current_period_end, environment, last_event_at, updated_at
  )
  values (
    p_user_id, p_paddle_customer_id, p_paddle_subscription_id, p_price_id,
    p_status, p_current_period_end, p_environment, p_event_at, now()
  )
  on conflict (user_id) do update set
    paddle_customer_id = excluded.paddle_customer_id,
    paddle_subscription_id = excluded.paddle_subscription_id,
    -- coalesce: a lifecycle event that omits the price must not blank the one on record.
    price_id = coalesce(excluded.price_id, p.price_id),
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    -- Deliberately *not* coalesced the way price_id is. A row must be able to move from
    -- sandbox to production: one account holds one row, so a developer who tests locally
    -- and later subscribes for real needs the second event to overwrite the first label.
    environment = excluded.environment,
    last_event_at = excluded.last_event_at,
    updated_at = now()
  where (p.last_event_at is null or p.last_event_at <= p_event_at)
    and (
      p.paddle_subscription_id = p_paddle_subscription_id
      -- Keep in step with PADDLE_LIVE_STATUSES in lib/entitlements.ts.
      or p_status in ('active', 'past_due')
    );
exception
  -- The account was deleted. `user_id` is this table's primary key *and* a cascading FK,
  -- so the row went with the account — but the Paddle subscription did not, and Paddle
  -- keeps sending its lifecycle events with the dead uid still stamped in `customData`.
  -- Unhandled, the insert above raises, the webhook 500s, and Paddle retries an event
  -- that can never succeed. There is nothing to attach it to and retrying will never
  -- help, so treat it as applied — the same reading as the route's `no_user_id` branch,
  -- which also answers 200. `user_id` is the only foreign key on this table, so this
  -- catches that case and nothing else.
  --
  -- Note this is where the two billers differ: `entitlements.user_id` is `on delete set
  -- null`, so an Apple row survives account deletion as transaction history a later
  -- notification can still land on (see lib/account.ts). A Paddle row cannot do that
  -- while `user_id` is its primary key, so the event is dropped instead of parked.
  when foreign_key_violation then
    return;
end;
$$;
