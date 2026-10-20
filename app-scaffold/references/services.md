# Services checklist

In order. Each step lists the clicks and the values it produces. `→ ENV` is `.env.local` plus Vercel;
`→ XC` is `ios/Config/Production.xcconfig` (and `Local.xcconfig` for local runs). Never paste a
placeholder into either: blank means "not configured", and every service has an `is…Configured`
gate.

## 1. Domain + DNS (start first)
- Buy the apex. Add it to Vercel with the project created in step 8 (nameservers or A/CNAME records).
- `SITE_URL=https://<apex>` → ENV.

## 2. Apple (long pole: agreements and tax/banking)
- Developer portal → Identifiers → App ID `<bundle>` with **Sign in with Apple** (In-App Purchase
  is on by default). Add any domain capability here too; a device build won't provision without it.
- Sign in with Apple for the web: a **Services ID** whose return URL is
  `https://<supabase-ref>.supabase.co/auth/v1/callback`, plus a **Sign in with Apple key** (.p8, Key
  ID, Team ID). These go into Supabase (step 4).
- App Store Connect → New App (bundle id, SKU = slug). **Agreements → Paid Apps** must be active, or
  StoreKit returns no products and nothing says why.
- Subscriptions: one group, `<bundle>.fullaccess.monthly` and `.yearly`. Each gets an
  **introductory offer** (free trial, N days). The trial is never a server allowance. Lifetime, if
  sold, is a **non-consumable** `<bundle>.fullaccess.lifetime`.
- App Information → numeric Apple ID → `APPLE_APP_APPLE_ID`, `NEXT_PUBLIC_APP_STORE_ID` → ENV.
  `APPLE_BUNDLE_ID=<bundle>` → ENV.
- Root certs: download Apple Root CA G3 (plus G2 and AAA) from apple.com/certificateauthority, then
  `base64 -i AppleRootCA-G3.cer`. Comma-join the results into `APPLE_ROOT_CERTS_BASE64` → ENV.
- Users and Access → Integrations → **In-App Purchase** key → `APPLE_INAPP_KEY_ID`,
  `APPLE_INAPP_ISSUER_ID`, `APPLE_INAPP_PRIVATE_KEY` (the .p8 PEM, or base64 of it) → ENV.
- Users and Access → Integrations → **App Store Connect API** key, role **App Manager**. Drop the
  `AuthKey_<id>.p8` into `appstore/fastlane/` (gitignored). This is the fastlane key, not the IAP
  key above.
- App → App Store Server Notifications → **Version 2**, Production **and** Sandbox URL
  `https://<apex>/api/appstore/notifications`.
- Create an App Review demo user in Supabase (email + password). It goes into
  `appstore/metadata/review_information/`.

## 3. Web biller
See `payments.md` §Paddle setup or §Dodo setup. Paddle's **website approval** of the domain takes
days. Submit it as soon as the site has live Privacy, Terms and Refund pages and pricing.

## 4. Supabase
- New project (region near the buyers). Project Settings → API Keys (new format) →
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → ENV and XC
  (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`), and `SUPABASE_SECRET_KEY` → ENV only.
- Migrations: `supabase init && supabase link --project-ref <ref> && supabase db push`, or paste
  `supabase/migrations/*` into the SQL editor in order. Every table has RLS on and **no policies**.
  The service-role client plus an explicit `.eq("user_id", …)` is the access check.
- Auth → URL configuration: Site URL `https://<apex>`. Redirect URLs: `https://<apex>/auth/callback`,
  `<slug>://auth-callback`, `http://localhost:7071/auth/callback`.
- Auth → Providers:
  - **Email**: on, with "Confirm email" on. The emailed code is the only sign-up path.
  - **Apple**: client IDs `<bundle>` (native id_token) **and** the Services ID (web), plus the
    .p8 secret from step 2.
  - **Google**: the *Web* client id + secret, with the *iOS* client id under "Authorized Client IDs" (step 5).
  - **Facebook**: app id + secret (step 5).
- Auth → Emails: paste each `supabase/templates/*.html` into its tab and set the subjects by hand.
  `confirmation`, `magic_link` and `reauthentication` carry `{{ .Token }}` only, with no link: a
  link opened from the mail app lands in a browser that cannot redeem the PKCE code. Paste them
  only after Phase 8 re-themed them. Subjects:

  | Tab | File | Subject |
  | --- | --- | --- |
  | Confirm signup | `confirmation` | Your `<Name>` code |
  | Magic link | `magic_link` | Your `<Name>` code |
  | Reauthentication | `reauthentication` | Your `<Name>` confirmation code |
  | Reset password | `recovery` | Reset your `<Name>` password |
  | Change email address | `email_change` | Confirm your new `<Name>` email |
  | Invite user | `invite` | You’ve been invited to `<Name>` |
- Auth → SMTP: Resend (step 6) as the sender, so the codes don't come from Supabase's rate-limited
  default.

## 5. OAuth providers
- **Google Cloud** → new project → OAuth consent screen (external, app name, domain, privacy URL)
  → Credentials:
  - **Web** client: redirect `https://<supabase-ref>.supabase.co/auth/v1/callback`. Goes to Supabase.
  - **iOS** client: bundle id. Its id *without* `.apps.googleusercontent.com` →
    `GOOGLE_IOS_CLIENT_ID` → XC.
- **Meta** (developers.facebook.com) → app type Consumer → Facebook Login:
  - Valid OAuth redirect `https://<supabase-ref>.supabase.co/auth/v1/callback`.
  - Privacy URL `https://<apex>/privacy`.
  - **User data deletion instructions URL** `https://<apex>/privacy#delete`.
  - Switch it to Live.

## 6. Resend
- Add the domain, then add its DNS records (SPF, DKIM, return-path) at the registrar and verify.
- API key (sending access) → `RESEND_API_KEY`. `RESEND_FROM="<Name> <hello@<apex>>"`.
- `EMAIL_POSTAL_ADDRESS` (CAN-SPAM footer; nothing sends without it) → ENV.
- The abandoned-checkout cron needs `CRON_SECRET` (any long random string) → ENV.
  `vercel.json` schedules it every 15 minutes.

## 7. Analytics + ads
- **Amplitude**: one project shared by the web, the server and iOS. API key →
  `NEXT_PUBLIC_AMPLITUDE_API_KEY` → ENV and `AMPLITUDE_API_KEY` → XC (Production only; Debug stays
  blank so dev runs send nothing). Prefixes are `<slug>_`, `<slug>_web_` and `<slug>_server_`.
- **Meta Events Manager**: two datasets, "<Name> (Web)" (live, Vercel only) and "<Name> (Web) (Dev)"
  (local, connected to no ad account).
  - Pixel id → `NEXT_PUBLIC_META_PIXEL_ID` and `META_DATASET_ID`.
  - Dataset → Settings → **Generate access token** → `META_CAPI_ACCESS_TOKEN`. Keep it
    dataset-scoped and never give it a system-user token with `ads_management`.
  - Optional `META_TEST_EVENT_CODE` while testing; unset it before spending.

## 8. Vercel
- New project from the repo. Framework Next.js, install `bun install`, build `bun run build`.
- Domains: the apex (plus `www` → apex redirect).
- Env: everything above, per environment (Production uses live biller keys, Preview uses sandbox/test).
- GitHub: secret `VERCEL_TOKEN`, vars `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (from `.vercel/project.json`
  after `vercel link`) for `.github/workflows/deploy.yml`.

## 9. Local
- `cp .env.local.example .env.local`, then fill it from the dev and sandbox values.
- `ios/Config/Local.xcconfig` → `API_BASE_URL = http:/$()/localhost:7071` (the `$()` stops `//`
  reading as a comment). Use the LAN IP for a device.
- `bun run dev` serves the site and the funnel on `:7071` and rebuilds the funnel on every edit.
