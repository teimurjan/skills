# The pain-point funnel

A standalone Preact bundle, prerendered per locale, served at `/start` by rewrites with no Next
function on the path. It argues before it asks: name the pain, show it costing them, make them
say it in their own answers, read it back, then save the plan and show the price.

## Mechanics (already copied; don't rebuild)
- `scripts/build-funnel.tsx`:
  1. Prerenders `FunnelShell` into `public/funnel/{index,done}.html` per locale (English at the
     root, others under `/<tag>/`) with the deck inlined as JSON.
  2. Builds one hashed Preact bundle that holds no words.
  3. Builds the Tailwind CSS from `app/globals.css`, and woff2 fonts from the TTFs in
     `ios/<Target>/Resources/Fonts`.
  4. Fails if a `process.env.X` survives, so a new public env var goes into `PUBLIC_ENV`.
- `next.config.mjs` rewrites `/start`, `/start/done`, `/:lang/start` and `/:lang/start/done`.
  Hashed assets are immutable.
- `bun run dev` runs `next dev :7071`, rebuilds the funnel on each edit and reloads the tab.
- Preact and React are two TS programs: the root `tsconfig.json` excludes `components/funnel` and
  `components/auth`, and `tsconfig.funnel.json` includes them. Never alias react to preact/compat.
- Routing is in the hash (`#step-N`, with `#step-N.key=value` for a tap that lands before
  hydration). `?step=N` handles the return from OAuth or an email.

## Step kinds
The kinds are `question`, `statement`, widget, `recap`, `account`, `paywall` and `checkout`.
- `question`: a single answer auto-advances after 180 ms, and `multi` keeps Continue.
- `statement`: drawn by `StatementStep` with a headline, body, note and `variants` keyed on an
  earlier answer.
- Widget: a kind registered in `DEMOS`, which is empty in the template.

Ids, question keys and option values are never translated: they are analytics, `sessionStorage`
and biller metadata. Words live in `copy/<tag>.ts` keyed by those ids. `[brackets]` mark the one
accent span and `{name}` is a placeholder.

**Add a question:**
1. `question(key, [[value, emoji], …], multi?)`.
2. An entry in `FUNNEL.steps`.
3. Nothing for the web: `WEB_ORDER` follows `FUNNEL` until the web needs another order.
4. `questions.<key>` (headline, options, `recap`) in every deck.
5. A recap icon in `RecapStep.ICONS`.
6. `bun run funnel:export-ios`.

`validateCopy` fails the build on a missing word.

**Add a widget:**
1. The kind in the union.
2. Register it in `DEMOS`.
3. `steps.<id>` plus a deck section for its strings.
4. Add it to `IOS_KINDS` in `build-funnel-ios.ts` if the app's first run shows it.

## Sequence template (fill it from the intake's pain sentence)
| # | Kind | Job |
|---|---|---|
| 0 | opener question (yes/no) | The ad's line as a question about the pain moment. "Yes" answers `problem=<main>`, "Not really" answers `none`. Plain anchors, prerendered. |
| 1 | widget A (interactive, self-running) | Show the pain happening, in their world, in about 5 seconds. It runs a tour on a loop until the first pointer event, so a reader who never touches it still sees the verdict turn. |
| 2 | question `problem` | "What brought you here?" 3–4 concrete pains. It feeds the recap's red card. |
| 3 | statement "it's not you" | Takes the blame off the reader and puts it on the method/tool. `variants` keyed on `problem`. |
| 4–9 | qualifying questions | Frequency, cost of one bad instance, current workaround, who else is affected, goal, experience level. Each has a `recap` line that turns the answer into a diagnosis. |
| 10 | widget B (passive) | Makes the cost or the fix visible with no controls. A widget that needs operating loses half its readers. |
| 11–14 | 2–3 more questions + 1 statement | Commitment ("how soon do you want this fixed?"), social proof statement. |
| recap | recap | Their answers read back. Only the **first card is red** (their named problem); the rest are grey; the closing card is accent-tinted, never filled. Max 5 lines. |
| account | account | "Your plan is ready. [Save it] to see your price." The emailed code comes first, then Facebook, Apple, Google. A signed-in reader is forwarded with `replace`. |
| paywall | paywall | No chrome. Three plans with a price per day, the yearly one in the middle and preselected, reviews, FAQ, then Terms/Privacy. |
| checkout | checkout | The biller's frame and an order summary, alone on the screen. |

`SURVEY_LENGTH` = everything before the account step. The bar reads 100% on the recap.

## Rules
- **390×650 is the budget for every step**, because that is what Meta's in-app browser leaves.
  The paywall is the only exception. Use `h-dvh`, a scrolling `main`, `mb-auto` and
  `max-w-[520px]`.
- **Type runs large**, because readers are on a phone in Meta's in-app browser, often tired:
  - headline `clamp(28px,7.4vw,36px)`, section title `clamp(24px,6vw,30px)`;
  - answer options 18.5px, body copy 18px, card and list text 16–17px;
  - small text (hints, notes, legal, the progress count) 14.5–15.5px, and nothing under 12px.
    A label that a widget's geometry holds (a tag on a tight timeline) is the only exception.
- **Every word is readable on its background**: content text is `--ink` or `--ink-muted`, never
  `--faint` or ink at reduced opacity. A green or red cue sits on a solid surface with the darker
  ink of its colour, never as a translucent tint over a gradient or glass.
- **One idea per screen**, with the headline in the ad's words. Body copy is at most two short lines.
- **Red means "this is costing you"**, and appears once (recap card 1). The accent *fill* is the
  footer button only.
- **No animation or DnD libraries.**
  - Motion is the `.anim-step` CSS keyframes with nth-child delays, inside
    `prefers-reduced-motion: no-preference`.
  - Every step component returns a **fragment**, so the cascade sees siblings.
  - There are no exit animations.
  - Widgets use pointer events and `reveal.ts`.
- **Hydration**: step 0 is the prerender and the shell must render it identically. Answers,
  position and attribution are read in effects only.
- **Progress** is eased (`0.04 + 0.96·pos^0.7`) and moves most where readers leave.
  `aria-valuenow` carries the true step.
- **Prewarm** the paywall and checkout chunks and the price on the first idle after the first
  answer (`prewarm.ts`).
- **Preload the checkout behind the plans.** `FunnelShell` mounts `CheckoutStep` from the paywall
  on, as a sibling of the re-keyed step, so Continue reveals a frame that is already loaded.
  Re-keying it would reload the biller's iframe. The template's `FunnelShell.tsx` does this.
  - On the paywall, wrap it `invisible absolute h-0 overflow-hidden` at the checkout's width, with
    `inert` and `aria-hidden`. `display: none` lays the frame out at zero width.
  - It gets `visible`. `InitiateCheckout` and `checkout_started` wait for it, or every paywall
    view counts as a checkout.
  - The abandoned-checkout reminder is ours, so keep the biller's own recovery off. On Dodo it is
    timed from the session mint, so with the preload the hour starts at the paywall, not at Continue.
- **In-app browsers** (FB/IG/Threads UA): hide Google (it fails with `disallowed_useragent`). The
  emailed code is the path that works everywhere.
- Hand-written proof numbers ("1,457 joined", "51 of 200 left") are representations to a buyer,
  so keep them true in every deck. The template leaves them empty, and an empty line draws nothing.
- `steps.ts` `FUNNEL` is the app's order and `WEB_ORDER` the web's. Keep them equal unless the web
  traffic is pre-qualified by the ad.

## Analytics already wired
- Amplitude:
  - `funnel_started`, `onboarding_page_viewed` and `onboarding_question_answered` (with the
    question key, the value and `elapsed_ms`).
  - `first_screen_left` on `visibilitychange`.
  - `plan_viewed`, `checkout_started` and `purchase_completed`.
- Meta: `ViewContent` on start, `Lead` on the recap, `CompleteRegistration` on account, and
  `InitiateCheckout` then `Purchase` (shared `event_id` with CAPI).
- User properties: the attribution params (`ad`, `adset`, `campaign`), `funnel_variant`, `opener`,
  the language and each answer.

## Hand-off check (for the user; don't run browsers unless asked)
At 390×650 on `/start` and `/<tag>/start`, check that:
- every step fits;
- a tap on step 0 before the JS loads still records its answer;
- Back returns to the picked plan;
- Google is hidden inside the Instagram webview;
- the funnel CSS size and the entry chunk in the build print stay put.
