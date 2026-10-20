---
name: app-scaffold
description: Scaffold a new paid iOS app, landing site and Preact web funnel from a bundled template. The stack is Next.js on Vercel, Supabase auth and entitlements, StoreKit 2 in the app, and Dodo or Paddle on the web. Resend sends an abandoned-checkout reminder with a discount and a welcome email. It also has Amplitude, Meta CAPI, fastlane, xcstrings translations and a multi-step pain-point funnel, with the visual design requested from Claude Design. When the user wants to start a new app, product, MVP, side project or subscription app, use it. If the user does not say "scaffold", use it all the same.
---

# App scaffold

Write the template into a new directory, renamed, then fill in the new product. The template is
`assets/template/`: a shared `base/` and one overlay per web biller (`dodo/`, `paddle/`). It
typechecks, builds and passes its tests as it stands, for either biller, on the web and on iOS.
Every product-specific word in it is a placeholder.

When a step below is unclear, read the template file it names before writing anything. Never
invent a pattern the template already solves.

## Phase 0 — Intake (one round)

Ask in plain text for what cannot be defaulted:

1. **Name** (display, for example "Acme Notes"), **target** (PascalCase, `AcmeNotes`) and **slug**
   (`[a-z0-9]+`, `acmenotes`). The slug becomes the cookie name, event prefixes, UserDefaults keys and the URL scheme.
2. **Domain** (apex, for example `acme.app`). Bundle id defaults to `com.teimurjan.<slug>`.
3. **The pain point**: who has it, the moment it bites, what it costs them (money, time, face), and
   the one action the app does about it. That sentence drives the whole funnel, so push for a concrete one.
4. **Destination dir** (default `~/Projects/<slug>`).

Then ask the decisions as multiple choice. If the agent has a question tool, use it:
- Web biller: **Dodo** (server-minted session, the code applied by account) or **Paddle** (inline
  checkout in the browser, the code carried in the link). Both sell monthly, yearly and lifetime,
  send the abandoned-checkout reminder with a single-use discount, and send the welcome email after
  a web purchase. See `references/payments.md`.
- Locales at launch: English only, or English plus the list. Every tag needs a site deck, a funnel
  deck, an xcstrings language and an ASC metadata folder. Adding one later is data, not routes.
- Plans: monthly + yearly, plus lifetime (its own table: `references/payments.md`), trial length
  (App Store intro offer only).
- Devices: iPhone only (portrait, one store slot), or iPhone plus iPad and iPhone Duo (each screen
  gets a two-column layout, and the listing gets the iPad 13", iPad 11" and iPhone Duo slots). See `references/ios.md`.

## Phase 1 — Start the slow things in parallel

These take hours to days outside our control, so start them before writing code:

1. **Claude Design**: follow `references/design.md`. It produces the brand, tokens and screens
   while the scaffold is built. Do not wait for it.
2. **Accounts checklist**: give the user `references/services.md`, sections 1–3 (domain + DNS,
   Apple developer + App Store Connect app record, the biller's website approval). The biller's
   domain review and Apple's agreements are the long poles.

## Phase 2 — Write the template

```bash
bun ~/.claude/skills/app-scaffold/scripts/scaffold.ts \
  --dest ~/Projects/<slug> --target <Target> --name "<Name>" --slug <slug> \
  --domain <domain> --biller dodo|paddle [--bundle com.x.y]
```

It writes the base and the biller's overlay and renames the placeholders. `Appname` becomes the
target in identifiers, paths, the project and module imports. It becomes the display name wherever a
reader sees it: copy, string literals, emails and store text. `appname` becomes the slug,
`appname.example` becomes the domain and `com.example.appname` the bundle id. It also writes the
gitignored `ios/Config/Local.xcconfig` and sets the display name in the pbxproj.

Then:
```bash
cd <dest> && git init && bun install
git add -A && git commit -m "chore: scaffold"
```

## Phase 3 — Green before anything changes

Run the gate once on the untouched scaffold, so every later failure is the new product's:
`bun run typecheck && bun run build && bun test lib`, plus the iOS Debug **and** Release builds
(`references/ios.md`). Then write the project's `CLAUDE.md` from `assets/CLAUDE.template.md`.

What the template leaves as placeholders, to replace in the phases below:
- The funnel spine and deck (`components/funnel/steps.ts`, `copy/en.ts`): four placeholder problems,
  two statements, four questions. No widgets.
- The site deck (`components/site/copy/en.tsx`): the operator, the support address, the dates and
  every product line in the legal pages.
- The email decks (`lib/checkoutReminder/copy.ts`, `lib/welcomeEmail/copy.ts`): the pitch, the
  first steps and the founder's signature.
- iOS: `<Target>Store`, the only type that mutates user data, with one example list behind
  `requireEntitlement()`, and a placeholder `HomeScreen`.
- The mark (`scripts/build-icons.mjs`, the `AppMark` and `AppIcon` image sets) and the palette.
- The store listing (`appstore/metadata`, `appstore/captions`).

## Phase 4 — The funnel

Follow `references/funnel.md`. Build a pain-point funnel of about 12–16 survey steps from the
generic step kinds, with at most two widgets. Recap, account, paywall and checkout follow it. Write
`copy/en.ts` first, because it is the type every other deck must match. Then `bun run funnel:build`, and
`bun run funnel:export-ios` to commit `Funnel.json`.

Do not run browser checks yourself unless the user asks. Hand them the 390×650 check list from
`funnel.md`.

## Phase 5 — Site

`components/site/copy/en.tsx` (the `SiteCopy` shape): the hero names the pain in the ad's words,
then the screenshots, the pains, how it works and the price. Every CTA goes to `/start` or the App
Store. Rewrite Privacy, Terms, Support and Refunds for the new product. Cover what it collects and
the biller as merchant of record (`lib/biller.ts` names it). Keep the `#delete` anchor, because the
Meta app needs it, and describe the account deletion path.

## Phase 6 — iOS core

Rename is already done. Replace the example list in `<Target>Store` and `HomeScreen` with the one
core screen that the paywall gates, behind the store's `requireEntitlement`. Everything else in
`references/ios.md`: xcconfig keys, capabilities, StoreKit products, review gotchas.

## Phase 7 — Wire services

Walk the user through `references/services.md` in order. It names every dashboard click and the env
var each one yields. Fill `.env.local` and `ios/Config/*.xcconfig` (blank means "not configured",
never a placeholder). Apply the migrations with `supabase db push`, or paste them in the SQL editor
in order. After Phase 8 re-themes the email templates, paste them by hand. Every service has an
`is…Configured` gate, so the app boots with any of them missing.

## Phase 8 — Design → tokens

When the user approves the Claude Design artifact, read it back (`Artifact` → `read`) and
transcribe it per `references/design.md`: `app/base.css` `:root`, `Palette.swift`, the fonts vendored
once into `ios/<Target>/Resources/Fonts/`, and every reader of those fonts.

Then re-theme the six `supabase/templates/*.html` from the same tokens. They arrive in the
template's placeholder look with only the name swapped. Keep every `{{ .Var }}`, link and sentence.
Change the page background, the card, the button (the accent fill), the font and the header. Load
the font with a Google Fonts `<link>` and a system fallback stack. The header is the product's real
wordmark as `{{ .SiteURL }}/ico/wordmark.png`, with the name as its `alt`. Mail clients drop SVG, so
make the icon build write that PNG. Fix the article before the new name ("an Acme", not "a Acme").
Show the user one preview artifact of all six in `srcdoc` iframes, with sample values. Put the
wordmark in as a data URI, because the artifact CSP blocks remote images. Write the six subjects into
the project `CLAUDE.md` Sign-in section. The user pastes them in Phase 7.

## Phase 9 — Translations, App Store, deploy

- Locales: the same list in three places (`InterfaceLanguage.supported`, `lib/i18n.ts` `LOCALES`,
  `appstore/scripts/lib/locales.mjs`), each with a site deck, funnel deck, email deck rows, xcstrings
  language and metadata folder. `bun run strings:check` is the gate.
- App Store: `references/appstore.md`. Plan the frames before you capture. For each caption, pick
  the screen. If the proof is small on the phone, also pick the widget to zoom. Tag those widgets with
  `.screenshotCallout(id)`. Trim `DEVICES` in `screenshot-kit.mjs` to the slots the app ships.
- Deploy: Vercel project on the apex, the env from Phase 7, and `.github/workflows/deploy.yml`
  (needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). The reminder cron in `vercel.json`
  runs every 15 minutes, which needs a Vercel Pro plan. Then point the webhooks at production
  (`services.md` §6–7) and send one sandbox purchase end to end.

## Done means

- `bun run typecheck && bun run build && bun test lib` pass. The funnel's entry chunk carries neither
  the biller's SDK nor supabase-js (check the build's size print).
- `xcodebuild … -configuration Debug` and `-configuration Release` both succeed.
- `bun run strings:check` and `bun run metadata:check` pass.
- A sandbox purchase flips `/api/entitlement` to `paid: true` for that account on the web *and* the
  phone, and the welcome email arrives.
- Report which pieces were deliberately left out, and why.

## Changing the template

The template is the skill's own code, not a copy of any app. Fix a pattern here once and every
later scaffold gets it. Keep it green: after an edit, scaffold both billers into a scratch
directory and run the gate on each.
