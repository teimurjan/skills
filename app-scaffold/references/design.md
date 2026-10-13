# Design from Claude Design

The design is requested as a Claude Design artifact, the user iterates on it in claude.ai, and
the approved version is transcribed into tokens. Start it in Phase 1 so it runs alongside the
scaffold.

## Request it
This needs Claude's Artifact tool (Claude Code with a claude.ai login). On another agent, give the
user the brief below to paste into claude.ai/design, and ask for the link back.

1. `Artifact` → `action: "quickstart"`, `intent: "design"`. The result names the Design type's
   `type_url` and any design system on the account. If the user has a design system for this
   brand, pass it; otherwise build without one.
2. Publish with that `type_url`, `title: "<Name> design"`, no files and
   `auto_open: "after_first_write"`, then follow the instructions the create result returns to
   fill the canvas.
3. Fill it from the brief below. Tell the user the link and that you're continuing with the
   scaffold while they review.

## Brief (fill the angle brackets from the intake)
Product: <Name>, <one-line promise>. Audience: <who>, reading on a phone, often one-handed, often
inside Instagram's or Facebook's in-app browser. The pain: <pain sentence>.

Artboards:
- **Landing**, at 1440 wide and at 390 wide: a hero naming the pain in the ad's words, one proof
  section showing the app solving it, a pricing teaser, the App Store badge and the CTA to
  `/start`. Footer: Privacy, Terms, Support, language switcher.
- **Funnel steps**, each at **390×650** (the in-app-browser viewport):
  - the yes/no opener;
  - a single-choice question with 4 options (emoji + label);
  - a multi-choice question;
  - an "it's not you" statement;
  - widget A (the pain happening);
  - widget B (passive);
  - the recap (first card red, the rest grey, the closing card accent-tinted);
  - the account step (email code first, then Facebook, Apple, Google);
  - the paywall (three plans, the middle one preselected, price per day, reviews, FAQ — this one
    may scroll);
  - checkout (the card frame plus an order summary).

  The header is the wordmark plus a progress bar with an `n/16` fraction in the right corner. The
  footer is one 52pt primary button.
- **iOS**, at 393×852:
  - sign-in;
  - paywall: the billed amount as the big figure, trial line, restore, terms;
  - home: an empty state plus the core action;
  - the core action screen;
  - profile.
- **App icon** (1024, Icon Composer-friendly layers) and the **App Store frame** (1290×2796:
  caption with one emphasised span over the device).

Constraints (the house style; keep them unless the brief says otherwise):
- **One accent colour, spent once per screen**, on the single action that screen exists for.
- **Red means only "this is costing you"**, appearing once per screen at most. Green and yellow
  only inside a level gauge.
- Light mode only, on a neutral canvas with hairline borders.
- Two typefaces at most: a sans for language and a mono with **tabular figures for every number**.
  Both must be free OFL fonts available as TTF (they are vendored once and shared by the app, the
  site, the funnel and the screenshots).
- Tap targets of 44pt minimum, 52pt for the committing button.
- Large, high-contrast type in the funnel: the sizes and the colour rules are in
  `references/funnel.md` → Rules. Ask Claude Design for them in the brief.
- No motion that needs a library. Entrances are a short stagger: title, then body, then options.

## Transcribe it (Phase 8)
1. `Artifact` → `action: "read"` on the approved URL, which gives the page and its files.
2. Colours → `app/base.css` `:root` (`--ink`, `--ink-muted`, `--faint`, `--hairline`, `--track`,
   `--canvas`, `--brand`, `--alert`, `--good`, `--caution`) **and** `Palette.swift`, with the same
   values in both.
3. Fonts → TTFs plus licenses into `ios/<Target>/Resources/Fonts/`. Then update every reader:
   - `Typeface.swift`, by PostScript name;
   - `app/fonts.ts`;
   - `FACES` / `FONT_VARIABLES` in `scripts/build-funnel.tsx`;
   - `FACES` / `FONT_FILES` in `appstore/scripts/lib/screenshot-kit.mjs`.
4. Mark: `components/Logo.tsx`, `ios/.../Assets.xcassets/AppMark`, and the favicon set via
   `scripts/build-icons.mjs` (replace its inline SVG).
5. App icon → Icon Composer → `ios/<Target>/AppIcon.icon`.
6. Screenshot styling → `PALETTE` and the background in `screenshot-kit.mjs`.
7. Check the funnel steps still fit 390×650 with the real type sizes. Hand that check to the user.
