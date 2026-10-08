# Payments: two billers, one entitlement

Apple StoreKit 2 sells in the app and one web biller sells on the web. `readEntitlement` in
`lib/entitlements.ts` is the union of the two, and it is the only place the union is computed.
`isPaid` is a view onto it, so no gate ever learns there are two billers.

## Rules that hold for either biller
- **One table per biller.** Each has its own `last_event_at` ordering guard; a shared guard lets one
  biller's events silently no-op the other's.
- **`expires_at IS NULL` means perpetual on the Apple row** and **not live** on the web row. Writing
  null for a lapsed web subscription grants lifetime access.
- **`environment` gates the web read**, and is only a label on the Apple row: App Review and
  TestFlight buy in Sandbox against production, so production honours sandbox StoreKit rows (held
  perpetual).
- **Live web statuses are `active` and `past_due` only.** The RPC's takeover rule lets an event for
  a *different* subscription replace the row only when its status grants access, so a late cancel
  for an old subscription cannot revoke a resubscribe.
- **The buyer is linked by the Supabase uid** carried *through* the biller: `appAccountToken` on
  StoreKit, `customData.userId` on Paddle, server-written `metadata.userId` on Dodo. The webhook
  validates it as a UUID. Never match on email.
- **A webhook returns 200 only for work that landed.** Unconfigured → 503, bad signature → 401/400,
  failed write → 500. A 200 stops the retries.
- **A failed entitlement read is not "unpaid".** `readEntitlement` throws and the route answers
  500; a 403 would show a payer the paywall.
- **Biller event ids are the Amplitude `insert_id`**, made state-shaped wherever the biller
  re-reports standing state (Dodo: `${subscription_id}:${next_billing_date}`).
- **Meta Purchase fires twice and dedupes on `event_id`.** One copy comes from the browser, the
  other from the webhook via CAPI with `fbp`, `fbc`, `ua` and `ip` forwarded through the biller's
  metadata. Only a *new* subscription counts; a renewal reported as a conversion trains the
  optimizer on noise.
- **Nothing above the paywall step imports the biller SDK.** `PaywallStep`/`CheckoutStep` are
  `lazy()` chunks, and the build's size print is the check.
- `/api/entitlement` returns `{paid, expiresAt, provider}`. `provider` decides whether the phone
  opens StoreKit's manage sheet or `POST /api/subscription/portal`.

## Choose one

| | Paddle | Dodo |
|---|---|---|
| Browser SDK | `@paddle/paddle-js` inline frame | `dodopayments-checkout` inline |
| Browser needs | client token and price ids (`NEXT_PUBLIC_*`) | nothing; the server returns `{checkoutUrl}` |
| Price preview | client `PricePreview`, all plans in one call (`planQuote.ts`) | `GET /api/funnel/quote`, one server preview per plan |
| Plan change | `Checkout.updateItems` in the open frame | tear down, mint a new session |
| Success signal | `checkout.completed` in the page | redirect to `return_url` (`/start/done`) |
| Lifetime | yes (`paddle_lifetime_entitlements`) | no |
| Discount codes / abandoned-checkout email | yes (`lib/checkoutReminder`, cron) | no |
| Webhook | `/api/paddle/webhook`, `paddle-signature` | `/api/dodo/webhook`, Standard Webhooks |
| Env labels | `sandbox` / `production` | `test_mode` / `live_mode` |

## Paddle setup
1. Sandbox first (sandbox-vendors.paddle.com), then repeat in live.
2. Catalog → one product with prices: monthly and yearly recurring (no trial), plus a one-time
   lifetime price if it is sold → `NEXT_PUBLIC_PADDLE_PRICE_{MONTHLY,YEARLY,LIFETIME}`. Checkout
   stays closed unless all of them are set.
3. Developer Tools → Authentication:
   - Client-side token → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`.
   - API key with subscriptions, customers, customer portal, transactions read and **discounts
     write** → `PADDLE_API_KEY`.
4. Notifications → destination `https://<apex>/api/paddle/webhook`, subscribed to
   `subscription.activated|updated|canceled|paused|resumed|past_due`, `transaction.completed`,
   `adjustment.created|updated` → secret `PADDLE_WEBHOOK_SECRET`.
5. `PADDLE_ENVIRONMENT` and `NEXT_PUBLIC_PADDLE_ENVIRONMENT` must agree.
6. Checkout settings:
   - **Default payment link** `https://<apex>/pay` (`app/(funnel)/pay` exists for this; it is
     where Paddle's "update card" email lands).
   - Turn **checkout recovery off**, because the reminder is ours.
   - Submit the domain for **website approval**.

## Dodo setup
1. Test mode first. Test and live are separate accounts: separate keys, products and webhooks.
2. Products → two subscription products, `trial_period_days: 0` → `DODO_PRODUCT_MONTHLY`,
   `DODO_PRODUCT_YEARLY` (`pdt_…`, with the price inline).
3. Developer → API Keys (write) → `DODO_PAYMENTS_API_KEY`. It is server-only and account-wide, so
   rotate it on suspicion.
4. Developer → Webhooks → `https://<apex>/api/dodo/webhook`. Subscribe to exactly the
   `SUBSCRIPTION_EVENTS` in the route (`subscription.*` only, never `payment.*`) →
   `DODO_PAYMENTS_WEBHOOK_KEY` (`whsec_…`).
5. `DODO_PAYMENTS_ENVIRONMENT=test_mode|live_mode` must match the key.
6. Delete the Paddle env block from `.env.local.example` and paste wait-professor's Dodo block.

### Dodo: porting the funnel half
The scaffold copies Dodo's server half (`lib/dodo.ts`, `checkoutSession.ts`, `plans.ts`,
`entitlements.ts`, `app/api/{dodo,funnel,subscription/portal}`, migrations), while the funnel still
carries takt's Paddle components. Port them against
`~/Projects/wait-professor/components/funnel/{CheckoutStep,InlineCheckout,CheckoutSheet,PurchaseReport,DonePage}.tsx`:

- `planQuote.ts` → fetch `GET /api/funnel/quote` (memoize successes only). Keep the prewarm.
- `PaywallStep` keeps the offer. The plan is committed *before* the form, because a Dodo session
  cannot change its product.
- `CheckoutStep`:
  - `POST /api/funnel/checkout {plan, browser}` with the bearer token.
  - Open with `lib/dodoCheckout.ts`.
  - Mint one `eventId` per mount, and on `checkout.breakdown` keep it with the `finalTotal` in
    `sessionStorage`.
  - Delete takt's `updateItems` path and mount-hidden-early trick; a session minted early would
    be for the wrong plan.
- `DonePage` mounts `PurchaseReport`, which fires the browser Purchase from `sessionStorage` once
  `?subscription_id&status=active|succeeded` is present.
- Remove `lib/paddle*`, `app/api/paddle`, `app/(funnel)/pay`, `components/site/PaddleRetain.tsx`,
  and the `PUBLIC_ENV` Paddle names in `scripts/build-funnel.tsx`.
- iOS `PurchaseStore`/`ProfileScreen`: "Manage subscription" calls `POST /api/subscription/portal`
  when `provider == "dodo"`.
