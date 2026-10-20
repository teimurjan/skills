-- The App Store half of the paid tier.
--
-- `original_transaction_id` is the primary key rather than `user_id` because App Store
-- Server Notifications only ever carry that id — the webhook has no account in hand and
-- must still be able to apply an event. `user_id` is stamped by the two authenticated
-- paths (purchase-verify and the sync reconcile) and is what every entitlement read
-- keys on.
--
-- Writes happen server-side (service role) from the purchase, sync, and webhook routes;
-- RLS is on with no policies, so the table is unreadable to clients — every read goes
-- through /api/entitlement.
create table if not exists public.entitlements (
  original_transaction_id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  device_id text,
  product_id text,
  active boolean not null default false,
  -- Null means *perpetual*: that is how App Review and TestFlight grants arrive.
  expires_at timestamptz,
  environment text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists entitlements_user_idx on public.entitlements (user_id);
create index if not exists entitlements_device_idx on public.entitlements (device_id);

alter table public.entitlements enable row level security;

-- Single atomic writer for all three entitlement paths (client purchase-verify, the App
-- Store Server Notifications webhook, and the server-initiated sync reconcile). Always
-- upserts by original_transaction_id — that id is the only identity Apple gives every
-- path. Notifications aren't guaranteed in order, so last_event_at tracks the signed date
-- of the last-applied event and ignores anything older, letting a late or duplicate
-- notification no-op instead of clobbering current state.
--
-- `user_id` is coalesced rather than overwritten: the webhook passes null, and a
-- notification landing after a purchase must not orphan a row the buyer already claimed.
create or replace function public.apply_entitlement_event(
  p_original_transaction_id text,
  p_device_id text,
  p_product_id text,
  p_active boolean,
  p_expires_at timestamptz,
  p_event_at timestamptz,
  p_environment text,
  p_user_id uuid default null
) returns void
language plpgsql
as $$
begin
  insert into public.entitlements as e (
    original_transaction_id, device_id, product_id, active,
    expires_at, environment, last_event_at, user_id, updated_at
  )
  values (
    p_original_transaction_id, p_device_id, p_product_id, p_active,
    p_expires_at, p_environment, p_event_at, p_user_id, now()
  )
  on conflict (original_transaction_id) do update set
    device_id = coalesce(excluded.device_id, e.device_id),
    product_id = coalesce(excluded.product_id, e.product_id),
    active = excluded.active,
    expires_at = excluded.expires_at,
    environment = coalesce(excluded.environment, e.environment),
    last_event_at = excluded.last_event_at,
    user_id = coalesce(excluded.user_id, e.user_id),
    updated_at = now()
  where e.last_event_at is null or e.last_event_at <= p_event_at;
end;
$$;
