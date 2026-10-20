-- The lifetime unlock, sold on the web. A one-time Paddle price alongside the two
-- subscriptions, the same unlock the App Store sells as a non-consumable.
--
-- Its own table rather than more columns on public.paddle_entitlements, because that row
-- is a subscription in every column: keyed on a subscription id that a one-time
-- transaction does not have, read as live off a status vocabulary a transaction does not
-- use, and — the part that matters — a null `current_period_end` there means *not live*,
-- deliberately, so that column can never grant lifetime access by accident. A grant that
-- is nothing but lifetime access has no honest place in it. And one account holds one row
-- there, so somebody who buys the unlock while a monthly subscription is still running
-- would have the unlock overwritten by that subscription's next lifecycle event.
--
-- Nothing in this table expires. A row is live unless `revoked_at` is set, which only a
-- full refund or a chargeback does. Writes happen server-side from the Paddle webhook only.
create table if not exists public.paddle_lifetime_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  paddle_customer_id text not null,
  -- The one-time transaction that paid for it. Adjustments (refunds, chargebacks) name
  -- the transaction and not the buyer, so this is the key a revocation arrives under.
  paddle_transaction_id text not null,
  price_id text not null,
  -- Which Paddle billed this ("production" | "sandbox"). Gates the read, exactly as it
  -- does on paddle_entitlements and for the same reason: a sandbox purchase is a test
  -- card against a client token that lives only in someone's .env.local.
  environment text not null,
  -- Set when Paddle approves a full refund or a chargeback lands; cleared if either is
  -- reversed. The row is kept rather than deleted so the reversal has something to land on.
  revoked_at timestamptz,
  -- Paddle's `occurred_at` of the last event applied. Its own out-of-order guard.
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One transaction maps to one account. A webhook for a transaction already bound to a
-- different user fails loudly rather than quietly moving the unlock.
create unique index if not exists paddle_lifetime_entitlements_transaction_idx
  on public.paddle_lifetime_entitlements (paddle_transaction_id);

alter table public.paddle_lifetime_entitlements enable row level security;
-- No policies, deliberately — same as every other table here. Reads and writes both go
-- through the secret-key client; the app learns its state from /api/entitlement.

-- The grant, from `transaction.completed`. Upsert keyed on user_id with a last_event_at
-- guard, so a redelivered event is a no-op and a stale one cannot revert a newer state.
--
-- `revoked_at` is preserved when the event is a replay of the transaction on record —
-- a refund that already landed must survive Paddle redelivering the original purchase —
-- and cleared when it is a new transaction, which is somebody buying the unlock again
-- after a refund.
create or replace function public.apply_paddle_lifetime_grant(
  p_user_id uuid,
  p_paddle_customer_id text,
  p_paddle_transaction_id text,
  p_price_id text,
  p_environment text,
  p_event_at timestamptz
) returns void
language plpgsql
as $$
begin
  insert into public.paddle_lifetime_entitlements as p (
    user_id, paddle_customer_id, paddle_transaction_id, price_id,
    environment, revoked_at, last_event_at, updated_at
  )
  values (
    p_user_id, p_paddle_customer_id, p_paddle_transaction_id, p_price_id,
    p_environment, null, p_event_at, now()
  )
  on conflict (user_id) do update set
    paddle_customer_id = excluded.paddle_customer_id,
    paddle_transaction_id = excluded.paddle_transaction_id,
    price_id = excluded.price_id,
    environment = excluded.environment,
    revoked_at = case
      when p.paddle_transaction_id = excluded.paddle_transaction_id then p.revoked_at
      else null
    end,
    last_event_at = excluded.last_event_at,
    updated_at = now()
  where p.last_event_at is null or p.last_event_at <= p_event_at;
exception
  -- The account was deleted and the row went with it, but Paddle keeps sending events
  -- with the dead uid in `customData`. Nothing to attach it to and retrying will never
  -- help, so treat it as applied — same reading as paddle_entitlements.
  when foreign_key_violation then
    return;
end;
$$;

-- The revocation, from `adjustment.*`. Keyed on the transaction because that is all an
-- adjustment carries. Null `p_revoked_at` reinstates — a refund or chargeback reversed.
-- Matches nothing for an adjustment on a subscription transaction, which is the intended
-- no-op: those are handled by the subscription's own lifecycle.
create or replace function public.set_paddle_lifetime_revoked(
  p_paddle_transaction_id text,
  p_revoked_at timestamptz,
  p_event_at timestamptz
) returns void
language sql
as $$
  update public.paddle_lifetime_entitlements as p
  set revoked_at = p_revoked_at,
      last_event_at = p_event_at,
      updated_at = now()
  where p.paddle_transaction_id = p_paddle_transaction_id
    and (p.last_event_at is null or p.last_event_at <= p_event_at);
$$;
