-- The Dodo Payments half of the paid tier: Dodo replaces Paddle as the web biller.
--
-- Additive only. 0005's table is removed by 0007, separately, so this migration reads as
-- one change and the removal can be reviewed — or reverted — on its own.
--
-- Named to pair with public.entitlements, which despite the generic name holds only the
-- App Store half: original_transaction_id, product_id, expires_at, environment. One table
-- per biller, and `readEntitlement` in lib/entitlements.ts is the union of the two — no
-- caller of `isPaid` ever learns there is more than one.
--
-- A parallel table rather than more columns on public.entitlements, for three reasons:
--
--   1. That row carries a single `last_event_at` guard, and the RPC drops anything older
--      (`where e.last_event_at <= p_event_at`). Shared, an Apple notification and a Dodo
--      webhook would silently no-op each other. Each biller needs its own ordering.
--   2. `expires_at` means *perpetual* when null on the Apple row — that is how App Review
--      and TestFlight grants work. Null means *not live* here. One column cannot carry
--      both readings without eventually granting someone lifetime access by accident.
--   3. `original_transaction_id` is that table's primary key. A Dodo subscription id in
--      it would be reachable by every query written for Apple's.
--
-- Writes happen server-side (secret key) from the Dodo webhook only.
create table if not exists public.dodo_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dodo_customer_id text not null,
  dodo_subscription_id text not null,
  -- Dodo has no separate price id: a product carries its recurring price inline, so this
  -- one id is both what was bought and what it costs.
  product_id text,
  -- Dodo's own vocabulary, verbatim: pending, active, past_due, on_hold, paused,
  -- cancelled, failed, expired. Kept unmapped so a status we didn't anticipate reads as
  -- "not live" instead of being coerced into one that grants.
  status text not null,
  -- Dodo's `next_billing_date` — the end of the period already paid for. Never null for a
  -- live subscription: lib/entitlements.ts treats a null expiry on the *Apple* row as a
  -- perpetual unlock, and this column must not inherit that meaning, so the live check
  -- requires a real future timestamp.
  current_period_end timestamptz,
  -- Which Dodo billed this ("live_mode" | "test_mode"). Unlike the Apple column this
  -- *gates the read*: App Review and TestFlight transact in Sandbox against the production
  -- API, so production must honour sandbox StoreKit rows — Dodo has no such case. Test and
  -- live are entirely separate accounts with separate keys, products and webhooks, so a
  -- row grants only on the environment that billed it. The webhook key is per-environment,
  -- so a deployment can only ever verify events from the Dodo it is configured for, which
  -- makes this label trustworthy rather than merely declared.
  environment text not null,
  -- The webhook envelope's `timestamp`. This table's own out-of-order guard, independent
  -- of Apple's.
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One subscription maps to one account. The unique index makes a webhook that arrives for
-- a subscription already bound to a different user fail loudly rather than quietly move
-- the entitlement.
create unique index if not exists dodo_entitlements_subscription_idx
  on public.dodo_entitlements (dodo_subscription_id);

alter table public.dodo_entitlements enable row level security;
-- No policies, deliberately — same as every other table here. Reads and writes both go
-- through the secret-key client, which bypasses RLS; nothing reaches this table with a
-- user's own JWT. The client learns its state from /api/entitlement instead.

-- Single atomic writer for the Dodo webhook, mirroring apply_entitlement_event: upsert
-- keyed on user_id, with a last_event_at guard that drops events older than the one
-- already applied. Dodo does not guarantee webhook order either, and a stale
-- `subscription.updated` landing after `subscription.active` would otherwise revert a live
-- subscription.
--
-- The guard carries a second clause for the resubscribe case. One account holds one row,
-- so a user who cancels and later subscribes again replaces sub1 with sub2 on it. A late
-- `subscription.cancelled` for sub1 can then arrive with a timestamp *newer* than sub2's
-- activation — Dodo only promises delivery, not order, and retries for up to a day — and
-- would revoke a subscription that is currently being paid for. So an event about a
-- subscription other than the one on record may only take the row over if it grants; a
-- revocation for a subscription we have already moved on from is not ours to apply.
--
-- Returns whether this is the *first* event ever seen for this subscription id, which is
-- the acquisition signal: the webhook reports a Meta Purchase only on a true. Computed
-- here rather than by a separate read so there is no window between the check and the
-- write, and so a renewal, a redelivery, or a dunning recovery — all of which find the row
-- already present — can never be counted as a new conversion.
create or replace function public.apply_dodo_entitlement_event(
  p_user_id uuid,
  p_dodo_customer_id text,
  p_dodo_subscription_id text,
  p_product_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_event_at timestamptz,
  p_environment text
) returns boolean
language plpgsql
as $$
declare
  v_known boolean;
begin
  select true into v_known
    from public.dodo_entitlements
   where dodo_subscription_id = p_dodo_subscription_id
   limit 1;

  insert into public.dodo_entitlements as d (
    user_id, dodo_customer_id, dodo_subscription_id, product_id,
    status, current_period_end, environment, last_event_at, updated_at
  )
  values (
    p_user_id, p_dodo_customer_id, p_dodo_subscription_id, p_product_id,
    p_status, p_current_period_end, p_environment, p_event_at, now()
  )
  on conflict (user_id) do update set
    dodo_customer_id = excluded.dodo_customer_id,
    dodo_subscription_id = excluded.dodo_subscription_id,
    -- coalesce: a lifecycle event that omits the product must not blank the one on record.
    product_id = coalesce(excluded.product_id, d.product_id),
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    -- Deliberately *not* coalesced the way product_id is. A row must be able to move from
    -- test to live: one account holds one row, so a developer who tests locally and later
    -- subscribes for real needs the second event to overwrite the first label.
    environment = excluded.environment,
    last_event_at = excluded.last_event_at,
    updated_at = now()
  where (d.last_event_at is null or d.last_event_at <= p_event_at)
    and (
      d.dodo_subscription_id = p_dodo_subscription_id
      -- Keep in step with DODO_LIVE_STATUSES in lib/entitlements.ts.
      or p_status in ('active', 'past_due')
    );

  return coalesce(v_known, false) = false;
exception
  -- The account was deleted. `user_id` is this table's primary key *and* a cascading FK,
  -- so the row went with the account — but the Dodo subscription did not, and Dodo keeps
  -- sending its lifecycle events with the dead uid still stamped in `metadata`. Unhandled,
  -- the insert above raises, the webhook 500s, and Dodo retries an event that can never
  -- succeed. There is nothing to attach it to and retrying will never help, so treat it as
  -- applied — the same reading as the route's `no_user_id` branch, which also answers 200.
  -- `user_id` is the only foreign key on this table, so this catches that case and nothing
  -- else. False, because a subscription with nowhere to land is not an acquisition.
  --
  -- Note this is where the two billers differ: `entitlements.user_id` is `on delete set
  -- null`, so an Apple row survives account deletion as transaction history a later
  -- notification can still land on (see lib/account.ts). A Dodo row cannot do that while
  -- `user_id` is its primary key, so the event is dropped instead of parked.
  when foreign_key_violation then
    return false;
end;
$$;
