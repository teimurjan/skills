# <Name>

<One paragraph: who it is for, the pain, the one thing the app does about it.>

## Architecture

Root is the Next.js backend (API, payments, marketing site, web funnel). The SwiftUI app lives in
`ios/` and the store-listing pipeline in `appstore/`. Scaffolded from Printyard (`~/Projects/takt`),
with the screenshot scripts from Oyno (`~/Projects/oyno`); when a pattern is missing here, look
there before inventing one.

**No free tier, and the wall is on writing, not reading.** Everything already on the device opens
for free. Adding to it needs a live entitlement. The gate is `requireEntitlement()` inside
`<Target>Store`, the only type that mutates user data, never on buttons. `refusedActions` is a
counter, not a flag.

**The first run is one sequence**, decided in `AppRoot`: `FunnelScreen` → `SignInScreen` (hard
wall, no skip) → `PaywallScreen` → main, all keyed on `didFinishFirstRun`. `FunnelScreen` is the web
funnel: `bun run funnel:export-ios` writes `Resources/Funnel.json`, which is generated and
committed, never edited.

**The paywall is a page, never a sheet**: a step in the first run, and a `fullScreenCover` over a
refused write. The billed amount is the big figure (3.1.2). The trial is an App Store intro offer,
never a server allowance, and store copy must not say we charge from the start.

## Payments: two billers, one entitlement

Apple StoreKit 2 in the app; <Paddle|Dodo> on the web. `readEntitlement` is the union, and no
caller of `isPaid` learns there is more than one.

- `expires_at IS NULL` is perpetual on the Apple row and **not live** on the web row.
- `environment` gates the web read and is only a label on the Apple one: App Review and TestFlight
  buy in Sandbox, which is held perpetual.
- The buyer is linked by the Supabase uid carried through the biller (`appAccountToken`,
  <`customData.userId`|server-written `metadata.userId`>), validated as a UUID. Never by email.
- A webhook returns 200 only for work that landed (503 unconfigured, 401/400 bad signature, 500
  failed write).
- A failed entitlement read throws and returns 500. It is never "unpaid".
- Nothing above the paywall step imports the biller SDK.

## Data access

The service-role client bypasses RLS. Every table has RLS on with **no policies**, so the
`.eq("user_id", …)` in the query *is* the access check. Routes take the user from the bearer
token and never from the body. A field added to a Swift record that syncs needs its column in
the same commit, and is `Optional`.

## Sign-in

Facebook, Apple, Google and an emailed one-time code everywhere, with a sign-in-only password form
behind "Use a password instead" (App Review's demo account uses it). Facebook is first; Apple sits
above Google. The app exchanges an id_token (Apple, Google) and runs PKCE in
`webAuthenticationSession` (Facebook, `<slug>://auth-callback`), while the web redirects through
`/auth/callback`. The email templates carry a code and no link. Inside Meta's webview the funnel
hides Google.

The emails are `supabase/templates/`, one file per tab in Authentication → Emails, in the
<design name> look. You paste them by hand, and nothing pushes them. Subjects:

- `confirmation`, `magic_link`: "Your <Name> code"
- `reauthentication`: "Your <Name> confirmation code"
- `recovery`: "Reset your <Name> password"
- `email_change`: "Confirm your new <Name> email"
- `invite`: "You’ve been invited to <Name>"

## Language and currency

Two independent choices. The locale list is the same in three places
(`InterfaceLanguage.supported`, `LOCALES` in `lib/i18n.ts`, `LOCALES` in
`appstore/scripts/lib/locales.mjs`), and every tag has a site deck and a funnel deck. Use
`String(interface:)`, never `String(localized:)`. `bun run strings:check` fails on a single
missing key, plural form or specifier.

## Design system

`Palette.swift` and `app/base.css` `:root` hold the same values. One accent, spent once per
screen. Red means only "this is costing you". The sans carries language and the mono (tabular
figures) carries every number. Fonts are vendored once in `ios/<Target>/Resources/Fonts/` and
read by the app, the site, the funnel build and the screenshot kit. Tap targets are 44pt, and
52pt for the committing button.

## Error copy

Routes send a machine code and never a `message`. The words live in `ServerErrorCopy.swift` and the
funnel decks.

## Before finishing a change

- Strings: copy the catalogue aside, `bun run strings:sync`, then `bun run strings:check`.
- Backend: `bun run typecheck && bun run build && bun test lib`.
- iOS: build Debug and Release (Release whenever payments or an xcconfig changed).
- Funnel: `bun run funnel:build`; after editing `steps.ts` or a deck, run `bun run funnel:export-ios`
  and commit `Funnel.json`. Check every step at 390×650.
- Site: both `/x` and `/<tag>/x` for every page touched.
- Store: `bun run metadata:check` before any deliver. After a capture or caption change, run
  `bun run screenshots:composite` and commit `public/screenshots/`.
