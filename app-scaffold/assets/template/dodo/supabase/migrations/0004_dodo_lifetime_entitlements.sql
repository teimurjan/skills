-- The lifetime unlock, sold on the web: a one-time Dodo product beside the two subscriptions.
--
-- Its own table rather than a row on public.dodo_entitlements, because that row is a
-- subscription in every column. It is keyed on a subscription id a one-time payment does not
-- have, and it is read as live off a status vocabulary a payment does not use. A null
-- `current_period_end` there means *not live*, deliberately, and a far-future sentinel date is
-- a lie every later reader has to know about (0003 cleans up after exactly that). One account
-- also holds one row there, so a buyer whose monthly plan is still running would have the
-- unlock overwritten by that subscription's next lifecycle event.
--
-- Nothing in this table expires. A row is live unless `revoked_at` is set, which only a full
-- refund or a lost chargeback does. Writes happen server-side from the Dodo webhook only.
create table if not exists public.dodo_lifetime_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dodo_customer_id text not null,
  -- The one-time payment that bought it. Refunds and disputes name the payment and not the
  -- buyer, so this is the key a revocation arrives under.
  dodo_payment_id text not null,
  product_id text not null,
  -- Which Dodo billed this ("live_mode" | "test_mode"). Gates the read, exactly as it does
  -- on dodo_entitlements and for the same reason.
  environment text not null,
  -- Set by a full refund or a lost dispute. The row is kept rather than deleted, so a
  -- redelivered `payment.succeeded` for the same payment cannot grant it again.
  revoked_at timestamptz,
  -- The webhook envelope's `timestamp`. Its own out-of-order guard.
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One payment maps to one account. A webhook for a payment already bound to a different user
-- fails loudly rather than quietly moving the unlock.
create unique index if not exists dodo_lifetime_entitlements_payment_idx
  on public.dodo_lifetime_entitlements (dodo_payment_id);

alter table public.dodo_lifetime_entitlements enable row level security;
-- No policies, deliberately, same as every other table here.

-- The grant, from `payment.succeeded`. Upsert keyed on user_id with a last_event_at guard,
-- so a redelivered event is a no-op and a stale one cannot revert a newer state.
--
-- `revoked_at` survives a replay of the payment on record, so a refund that already landed
-- outlives Dodo redelivering the purchase. A different payment clears it: somebody bought
-- the unlock again after a refund.
--
-- Returns whether this payment id is new, the acquisition signal the webhook reports to Meta
-- on, computed here so there is no window between the check and the write.
create or replace function public.apply_dodo_lifetime_grant(
  p_user_id uuid,
  p_dodo_customer_id text,
  p_dodo_payment_id text,
  p_product_id text,
  p_environment text,
  p_event_at timestamptz
) returns boolean
language plpgsql
as $$
declare
  v_known boolean;
begin
  select true into v_known
    from public.dodo_lifetime_entitlements
   where dodo_payment_id = p_dodo_payment_id
   limit 1;

  insert into public.dodo_lifetime_entitlements as l (
    user_id, dodo_customer_id, dodo_payment_id, product_id,
    environment, revoked_at, last_event_at, updated_at
  )
  values (
    p_user_id, p_dodo_customer_id, p_dodo_payment_id, p_product_id,
    p_environment, null, p_event_at, now()
  )
  on conflict (user_id) do update set
    dodo_customer_id = excluded.dodo_customer_id,
    dodo_payment_id = excluded.dodo_payment_id,
    product_id = excluded.product_id,
    environment = excluded.environment,
    revoked_at = case
      when l.dodo_payment_id = excluded.dodo_payment_id then l.revoked_at
      else null
    end,
    last_event_at = excluded.last_event_at,
    updated_at = now()
  where l.last_event_at is null or l.last_event_at <= p_event_at;

  return coalesce(v_known, false) = false;
exception
  -- The account was deleted and the row went with it. Nothing to attach the payment to and
  -- retrying will never help, so treat it as applied, as apply_dodo_entitlement_event does.
  when foreign_key_violation then
    return false;
end;
$$;

-- The revocation, from `refund.succeeded` (full refunds only) and `dispute.lost`. Keyed on the
-- payment because that is all either carries. Matches nothing for a subscription payment,
-- which is the intended no-op: a subscription ends through its own lifecycle events.
create or replace function public.revoke_dodo_lifetime(
  p_dodo_payment_id text,
  p_event_at timestamptz
) returns void
language sql
as $$
  update public.dodo_lifetime_entitlements as l
  set revoked_at = p_event_at,
      last_event_at = p_event_at,
      updated_at = now()
  where l.dodo_payment_id = p_dodo_payment_id
    and (l.last_event_at is null or l.last_event_at <= p_event_at);
$$;

-- Callable with the secret key only, like merge_progress.
revoke execute on function public.apply_dodo_lifetime_grant(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.revoke_dodo_lifetime(text, timestamptz) from public, anon, authenticated;
