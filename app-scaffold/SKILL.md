---
name: app-scaffold
description: Scaffold a new paid iOS app + landing site + Preact web funnel on the Printyard/Wait Professor stack — Next.js on Vercel, Supabase auth and entitlements, StoreKit 2 in the app, Paddle or Dodo on the web, Resend, Amplitude + Meta CAPI, fastlane, xcstrings translations, and a lightweight multi-step pain-point funnel — with the visual design requested from Claude Design. Use whenever the user wants to start a new app, product, MVP or side project "like printyard/wait-professor", spin up the stack again, clone the setup, bootstrap a landing + funnel + iOS app, or set up a new subscription app quickly — even if they don't say "scaffold".
---

# App scaffold

Copy the generic half of the reference repos, strip the domain, then fill in the new product. The
reference is the user's own code, read from git `HEAD`:

- **takt** (`~/Projects/takt`, Printyard) — the canonical source for everything: site, funnel,
  auth, Apple + Paddle entitlements, iOS skeleton, App Store tooling.
- **wait-professor** (`~/Projects/wait-professor`) — the source for the Dodo Payments half only.

Never invent a pattern either repo already solves. When a step below is unclear, read the
reference file it names before writing anything.

## Phase 0 — Intake (one round)

Ask in plain text for what cannot be defaulted:

1. **Name** (display, e.g. "Wait Professor"), **target** (PascalCase, `WaitProfessor`), **slug**
   (`[a-z0-9]+`, `waitprofessor`; becomes the cookie name, event prefixes, UserDefaults keys and the URL scheme).
2. **Domain** (apex, e.g. `acme.app`). Bundle id defaults to `com.teimurjan.<slug>`.
3. **The pain point**: who has it, the moment it bites, what it costs them (money, time, face), and
   the one action the app does about it. That sentence drives the whole funnel, so push for a concrete one.
4. **Destination dir** (default `~/Projects/<slug>`).

Then ask the decisions as multiple choice (the agent's question tool if it has one):
- Web biller: **Paddle** (inline checkout, discount codes, lifetime price, abandoned-checkout email)
  or **Dodo** (server-minted session, cheaper, subscriptions only). See `references/payments.md`.
- Locales at launch: English only, or English plus the list (every tag needs a site deck, a funnel
  deck, an xcstrings language and an ASC metadata folder; adding one later is data, not routes).
- Plans: monthly + yearly, plus lifetime (Paddle and App Store only), trial length (App Store intro offer only).

## Phase 1 — Start the slow things in parallel

These take hours to days outside our control, so start them before writing code:

1. **Claude Design**: follow `references/design.md`. It produces the brand, tokens and screens
   while the scaffold is built. Don't block on it.
2. **Accounts checklist**: give the user `references/services.md`, sections 1–3 (domain + DNS,
   Apple developer + App Store Connect app record, the biller's website approval). Paddle's domain
   review and Apple's agreements are the long poles.

## Phase 2 — Copy

```bash
bun ~/.claude/skills/app-scaffold/scripts/scaffold.ts \
  --dest ~/Projects/<slug> --target <Target> --name "<Name>" --slug <slug> \
  --domain <domain> --biller paddle|dodo [--bundle com.x.y]
```

It copies ~240 files from the reference repos' `HEAD`. It renames identifiers, paths, the bundle
id and the domain, rewrites `package.json` without the domain-only dependencies, writes a clean
`.entitlements` (Sign in with Apple only) and sets the display name in the pbxproj. It prints
paths missing from the reference (port those by hand) and **every file that still names the old
domain**. That list is the work queue for Phase 3.

Then:
```bash
cd <dest> && git init && bun install
git add -A && git commit -m "chore: scaffold from printyard"
```

## Phase 3 — Strip the domain until it builds

Work the leftover list file by file. Delete domain code; don't rename it into the new product. The
copied tree typechecks except for a handful of predictable files:

- `components/funnel/copy/index.ts`, `components/site/copy/index.ts`: register only the chosen
  locales (only `en` was copied).
- `components/funnel/FunnelShell.tsx`: empty the `DEMOS` map. The widget kinds go too, from
  `steps.ts` and the deck.
- `components/site/HomePage.tsx`: drop the receipt section (`receiptEconomy`) and keep the layout.
- `lib/markets.ts`: keep `numberLocale` + currency per market, and drop `MarketEconomy`.
- `proxy.ts` + `lib/appHost.ts`: there is no `app.` web app, so delete the app-host rewrite and
  `appHost.ts`, and trim the matcher to the site pages.
- iOS `AppRoot.swift`: keep the gate chain (Splash → Funnel → SignIn → Restoring → Paywall → main)
  and swap the `ShopStore` for one `<Target>Store`, the **only** type that mutates user data. Its
  writes go through `requireEntitlement() -> Bool`, and `refusedActions` is a counter, not a flag.
  Replace the tabs with a single placeholder home.
- `PurchaseStore.swift`: product ids become `<bundle>.fullaccess.{monthly,yearly[,lifetime]}`.
- `AnalyticsEvent.swift`, `lib/analytics.ts`: keep the funnel, auth, paywall and purchase events,
  and drop the domain ones.
- `Localizable.xcstrings`: run `bun run strings:sync` (copy the catalogue aside first; it can
  blank translations), then delete every key marked `stale`. The generic keys keep their translations.

Gate: `bun run typecheck && bun run build`, plus the iOS Debug **and** Release builds
(`references/ios.md`). Then write the project's `CLAUDE.md` from `assets/CLAUDE.template.md` and
commit: `chore: strip reference domain`.

## Phase 4 — The funnel

Follow `references/funnel.md`: a pain-point funnel of about 12–16 survey steps plus recap →
account → paywall → checkout, built from the generic step kinds, with at most two widgets. Write
`copy/en.ts` first; it is the type every other deck must match. Then `bun run funnel:build`, and
`bun run funnel:export-ios` to commit `Funnel.json`.

Do not run browser checks yourself unless the user asks. Hand them the 390×650 check list from
`funnel.md`.

## Phase 5 — Site

`components/site/copy/en.tsx` (the `SiteCopy` shape): the hero names the pain in the ad's words,
then one proof section and the App Store badge. Every CTA goes to `/start`. Rewrite Privacy, Terms,
Support and, for Paddle, Refund for the new product: what it collects, the biller as merchant of
record, the `#delete` anchor (the Meta app needs it), and the account deletion path.

## Phase 6 — iOS core

Rename is already done. Build the one core screen that the paywall gates, behind the store's
`requireEntitlement`. Everything else in `references/ios.md`: xcconfig keys, capabilities,
StoreKit products, review gotchas.

## Phase 7 — Wire services

Walk the user through `references/services.md` in order. It names every dashboard click and the env
var each one yields. Fill `.env.local` and `ios/Config/*.xcconfig` (blank means "not configured",
never a placeholder). Apply the migrations (`supabase db push`, or paste them in the SQL editor in
order) and paste the email templates by hand, after Phase 8 re-themed them. Every service has an `is…Configured` gate, so the app
boots with any of them missing.

## Phase 8 — Design → tokens

When the user approves the Claude Design artifact, read it back (`Artifact` → `read`) and
transcribe it per `references/design.md`: `app/base.css` `:root`, `Palette.swift`, the fonts vendored
once into `ios/<Target>/Resources/Fonts/`, and every reader of those fonts.

Then re-theme the six `supabase/templates/*.html` from the same tokens. They arrive in the reference
app's look with only the name swapped. Keep every `{{ .Var }}`, link and sentence. Change the page
background, the card, the button (the accent fill), the font and the header. Load the font with a
Google Fonts `<link>` and a system fallback stack. The header is the product's real wordmark as
`{{ .SiteURL }}/ico/wordmark.png`, with the name as its `alt`. Mail clients drop SVG, so make the
icon build write that PNG beside `wordmark.svg`. Fix the article before the new name ("an Oyno", not
"a Oyno"). Show the user one preview artifact of all six in `srcdoc` iframes, with sample values
and the wordmark as a data URI, because the artifact CSP blocks remote images. Write
the six subjects into the project `CLAUDE.md` Sign-in section. The user pastes them in Phase 7.

## Phase 9 — Translations, App Store, deploy

- Locales: the same list in three places (`InterfaceLanguage.supported`, `lib/i18n.ts` `LOCALES`,
  `appstore/scripts/lib/locales.mjs`), each with a site deck, funnel deck, xcstrings language and
  metadata folder. `bun run strings:check` is the gate.
- App Store: `references/appstore.md`.
- Deploy: Vercel project on the apex, the env from Phase 7, and `.github/workflows/deploy.yml`
  (needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). Then point the webhooks at production
  (`services.md` §6–7) and send one sandbox purchase through each biller end to end.

## Done means

- `bun run typecheck && bun run build && bun test lib`; the funnel's entry chunk carries neither
  Paddle/Dodo nor supabase-js (check the build's size print).
- `xcodebuild … -configuration Debug` and `-configuration Release` both succeed.
- `bun run strings:check` and `bun run metadata:check` pass.
- A sandbox purchase on each biller flips `/api/entitlement` to `paid: true` for that account on
  the web *and* the phone.
- Report which pieces were deliberately left out, and why.
