-- The abandoned-checkout reminder, and the language the welcome email is written in.
--
-- One row per account, written when a signed-in reader reaches the checkout and
-- moved forward on every later one, so the reminder is timed off the last checkout rather than
-- the first. A `sent_at` is never cleared once the email went out: one reminder per account,
-- ever, which is also what makes the cron safe to run twice over the same rows.
--
-- Written and read through the secret-key client only: the checkout route, the cron, the
-- biller's webhook and the unsubscribe route. RLS on with no policies, like every other table here.
create table if not exists public.checkout_reminders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- The language the reader was reading in, which is the language of both emails.
  lang text not null,
  started_at timestamptz not null default now(),
  -- Claimed by the cron before it sends and released if the send fails.
  sent_at timestamptz,
  -- The single-use biller code. Kept so a retried send offers the same one, and so the checkout
  -- applies it to this account's next session.
  discount_code text,
  -- What the unsubscribe link carries: unguessable, and nothing to sign.
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  unsubscribed_at timestamptz
);

-- The cron's one question: whose checkout went quiet and has not been reminded.
create index if not exists checkout_reminders_due_idx
  on public.checkout_reminders (started_at)
  where sent_at is null and unsubscribed_at is null;

alter table public.checkout_reminders enable row level security;
