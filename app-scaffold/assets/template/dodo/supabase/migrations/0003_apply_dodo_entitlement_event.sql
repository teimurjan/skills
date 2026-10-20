-- Restores apply_dodo_entitlement_event to its 0006 definition, verbatim.
--
-- A migration 0008 briefly widened the takeover clause for a lifetime one-time product
-- (status 'succeeded', a year-9999 current_period_end sentinel). The product was withdrawn
-- before anything ever wrote such a row, and 0008 was pulled from this directory — but it
-- had already been pushed, so this puts the deployed function back in step with the repo.
-- Its extra clauses were dead weight rather than a hazard: no event writes 'succeeded'
-- and no real subscription carries a year-9999 period end.
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
  when foreign_key_violation then
    return false;
end;
$$;
