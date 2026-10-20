# Payments: two billers, one entitlement

Apple StoreKit 2 sells in the app and one web biller sells on the web. `readEntitlement` in
`lib/entitlements.ts` is the union of the two, and it is the only place the union is computed.
`isPaid` is a view onto it, so no gate ever learns there are two billers.

## Rules that hold for either biller
- **One table per biller.** Each has its own `last_event_at` ordering guard. A shared guard lets one
  biller's events silently no-op the other's.
- **`expires_at IS NULL` means perpetual on the Apple row** and **not live** on the web row. Writing
  null for a lapsed web subscription grants lifetime access.
- **`environment` gates the web read**, and is only a label on the Apple row: App Review and
  TestFlight buy in Sandbox against production, so production honours sandbox StoreKit rows (held
  perpetual).
- **Live web statuses are `active` and `past_due` only.** Under the RPC's takeover rule, an event for
  a *different* subscription replaces the row only on a status that grants access. So a late cancel
  for an old subscription cannot revoke a resubscribe.
- **The buyer is linked by the Supabase uid** carried *through* the biller: `appAccountToken` on
  StoreKit, `customData.userId` on Paddle, server-written `metadata.userId` on Dodo. The webhook
  validates it as a UUID. Never match on email.
- **A webhook returns 200 only for work that landed.** Unconfigured → 503, bad signature → 401/400,
  failed write → 500. A 200 stops the retries.
- **A failed entitlement read is not "unpaid".** `readEntitlement` throws and the route answers
  500. A 403 shows a payer the paywall.
- **Biller event ids are the Amplitude `insert_id`**, made state-shaped wherever the biller
  re-reports standing state (Dodo: `${subscription_id}:${next_billing_date}`).
- **Meta Purchase fires twice and dedupes on `event_id`.** One copy comes from the browser, the
  other from the webhook via CAPI with `fbp`, `fbc`, `ua` and `ip` forwarded through the biller's
  metadata. Only a *new* subscription counts. A renewal reported as a conversion trains the
  optimizer on noise.
- **Nothing above the paywall step imports the biller SDK.** `PaywallStep`/`CheckoutStep` are
  `lazy()` chunks, and the build's size print shows it.
- `/api/entitlement` returns `{paid, expiresAt, provider}`. `provider` decides whether the phone
  opens StoreKit's manage sheet or `POST /api/subscription/portal`.

## Lifetime at the DB level
A web lifetime unlock is never a row on the subscription table. Give it its own table,
`<biller>_lifetime_entitlements`, beside the subscription one.
- **Why not the subscription row.** That row is keyed on a subscription id a one-time payment
  does not have. Its null period end means not live, and a sentinel date (year 9999) is a lie
  every reader must know about.
  One account holds one row there, so a running monthly plan overwrites the unlock.
- **Shape.** `user_id` primary key (cascading FK), the biller's customer id, the one-time payment
  or transaction id (unique index), product or price id, `environment`, `revoked_at`,
  `last_event_at`, `updated_at`. No expiry column at all. RLS on, no policies.
- **Live** means the environment matches and `revoked_at IS NULL`. `readEntitlement` reads it
  as a third table in the same `Promise.all` and adds a `null` expiry, which `furthestExpiry`
  ranks above any dated grant. `provider` is the web biller, so the portal shows the receipt.
- **Grant RPC** (`apply_<biller>_lifetime_grant`) upserts on `user_id` behind the
  `last_event_at` guard. If the event replays the payment on record, it keeps `revoked_at`. For a
  different payment (a rebuy after a refund), it clears it. It returns whether the payment id is
  new, which is the only Meta Purchase trigger.
- **Revoke RPC** is keyed on the payment id, because refunds and disputes carry nothing else. A
  full refund or a lost dispute sets `revoked_at`. A partial refund does not. A subscription
  payment matches no row, which is the intended no-op.
- **Selling it is a flag, not the product id.** Keep the product id set after the offer ends,
  so an open checkout or a redelivered payment still grants. Dodo: `DODO_LIFETIME_ON_SALE`.
  Paddle: `NEXT_PUBLIC_PADDLE_LIFETIME_ON_SALE`. The paywall draws the lifetime card only while
  `lifetimeOffered()` in the overlay's `planQuote.ts` says so.
- The template: `0004_<biller>_lifetime_entitlements.sql` in each overlay.

## Choose one

| | Paddle | Dodo |
|---|---|---|
| Browser SDK | `@paddle/paddle-js` inline frame | `dodopayments-checkout` inline |
| Browser needs | client token and price ids (`NEXT_PUBLIC_*`) | nothing, the server returns `{checkoutUrl}` |
| Price preview | client `PricePreview`, all plans in one call (`planQuote.ts`) | `GET /api/funnel/quote`, one server preview per plan |
| Plan change | `Checkout.updateItems` in the open frame | tear down, mint that plan's session (once per plan) |
| Success signal | `checkout.completed` in the page | redirect to `return_url` (`/start/done`) |
| Lifetime | yes (`paddle_lifetime_entitlements`) | yes (`dodo_lifetime_entitlements`) |
| Abandoned-checkout email | `lib/checkoutReminder`, cron, code in `?discount=` | `lib/checkoutReminder`, cron, code applied by `/api/funnel/checkout` |
| Welcome email after a web purchase | `lib/welcomeEmail`, from the webhook | `lib/welcomeEmail`, from the webhook |
| Webhook | `/api/paddle/webhook`, `paddle-signature` | `/api/dodo/webhook`, Standard Webhooks |
| Env labels | `sandbox` / `production` | `test_mode` / `live_mode` |

## Paddle setup
1. Sandbox first (sandbox-vendors.paddle.com), then repeat in live.
2. Catalog → one product with prices: monthly and yearly recurring (no trial), plus, for lifetime, a
   one-time price → `NEXT_PUBLIC_PADDLE_PRICE_{MONTHLY,YEARLY,LIFETIME}`. Checkout
   stays closed unless the token and both subscription prices are set. Set
   `NEXT_PUBLIC_PADDLE_LIFETIME_ON_SALE=true` while lifetime is offered.
3. Developer Tools → Authentication:
   - Client-side token → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`.
   - API key with subscriptions, customers, customer portal, transactions read and **discounts
     write** → `PADDLE_API_KEY`.
4. Notifications → destination `https://<apex>/api/paddle/webhook`, subscribed to
   `subscription.activated|updated|canceled|paused|resumed|past_due`, `transaction.completed`,
   `adjustment.created|updated` → secret `PADDLE_WEBHOOK_SECRET`.
5. `PADDLE_ENVIRONMENT` and `NEXT_PUBLIC_PADDLE_ENVIRONMENT` must agree.
6. Checkout settings:
   - **Default payment link** `https://<apex>/pay` (`app/(funnel)/pay` exists for this. It is
     where Paddle's "update card" email lands).
   - Turn **checkout recovery off**, because the reminder is ours.
   - Submit the domain for **website approval**.

## Dodo setup
1. Test mode first. Test and live are separate accounts: separate keys, products and webhooks.
2. Products → two subscription products, `trial_period_days: 0` → `DODO_PRODUCT_MONTHLY`,
   `DODO_PRODUCT_YEARLY` (`pdt_…`, with the price inline). For lifetime, add a one-time product →
   `DODO_PRODUCT_LIFETIME`, and set `DODO_LIFETIME_ON_SALE=true` while it is offered.
3. Developer → API Keys (write) → `DODO_PAYMENTS_API_KEY`. It is server-only and account-wide, so
   rotate it on suspicion.
4. Developer → Webhooks → `https://<apex>/api/dodo/webhook`. Subscribe to exactly the
   `SUBSCRIPTION_EVENTS` in the route, → `DODO_PAYMENTS_WEBHOOK_KEY` (`whsec_…`).
   For lifetime, also subscribe to `payment.succeeded`, `refund.succeeded` and `dispute.lost`.
5. `DODO_PAYMENTS_ENVIRONMENT=test_mode|live_mode` must match the key.
6. Leave Dodo's own abandoned-cart recovery off, because the reminder is ours. The reminder mints
   its single-use codes with the API key, so the key needs discounts write.

## What each overlay holds
The template's `base/` is biller-neutral. It holds the funnel, the paywall (`PaywallStep`) and the
done page. It also holds the reminder, the welcome email, `lib/plans.ts` (plans, list quote, money)
and the migrations that every biller shares. An overlay adds the rest, and a file in it replaces the base's:

- `lib/biller.ts`: the biller's name and buyer-terms link for the legal pages, and the public env
  names the funnel build inlines.
- `lib/entitlements.ts`, the webhook route, the portal route and the biller's migrations.
- `lib/checkoutReminder/discount.ts`: how a reminder code is minted, and what the link carries.
  Dodo ties the code to the account and `/api/funnel/checkout` applies it. Paddle puts it in
  `?discount=`, and the funnel keeps it across the sign-in round trip.
- `components/funnel/{CheckoutStep,InlineCheckout,CheckoutSummary,PurchaseReport}.tsx` and
  `planQuote.ts`, which exports `planQuote()` and `lifetimeOffered()` for the shared paywall.
- `package.json`, `bun.lock` and `.env.local.example`.

A new biller is a third overlay with the same files. Nothing in `base/` names a biller.
