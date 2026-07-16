---
name: ux-laws-audit
description: >-
  Audit a UI (webapp or mobile app) against the Laws of UX (lawsofux.com) and
  produce a markdown report of concrete, prioritized usability problems — each
  tied to a named UX law — plus an actionable, effort-ranked fix plan. Use this
  whenever the user wants a UX review, UX audit, usability evaluation, heuristic
  evaluation, design critique, or asks to check a screen / flow / app against UX
  best practices or the Laws of UX — whether they hand over a live URL or
  screenshots, and whether the target is web or mobile. Trigger even when the
  user never says "Laws of UX": phrases like "review the UX of my signup page",
  "what's wrong with this checkout screen", "critique this app's design", "is
  this interface usable", "find usability issues in these screenshots", or
  "audit our onboarding flow" all belong here.
---

# UX Laws Audit

Evaluate a real interface against the 30 [Laws of UX](https://lawsofux.com/) and
hand back a markdown file the team can act on immediately: specific problems,
each grounded in a named law and visible evidence, ranked so the highest-impact,
lowest-effort fixes come first.

The value of this audit is **specificity**. Generic advice ("improve hierarchy",
"reduce clutter") is worthless — the team already suspects that. What moves the
needle is: *this* element, breaking *this* law, hurting the user *this* way, fix
it *this* way. Every finding should survive the question "could this have been
written without looking at the actual screen?" If yes, it's too vague — cut it or
sharpen it.

## Workflow

### 1. Establish target and scope

Get two things straight before analyzing:

- **What you're evaluating:** a live URL, or screenshots the user provides. A
  native mobile app you can't drive means working from screenshots.
- **The scope:** a single screen, or a flow spanning several screens (signup,
  checkout, onboarding). If the user hasn't said, infer from what they gave you
  and confirm briefly if it's ambiguous — auditing the wrong scope wastes the run.

Also worth knowing, but don't interrogate: who the users are and what the primary
task is. Severity only means something relative to the job the user came to do. If
it's obvious from the interface, proceed; if not and it materially changes the
verdict, ask one short question.

### 2. Capture the interface

**You cannot audit what you can't see.** Get real pixels in front of you.

- **Live URL:** open it with whatever browser automation is available (the
  Playwright MCP tools, or the `browser-testing` skill) and screenshot each screen
  in scope. Capture at a realistic viewport — for web, a desktop width, and a
  mobile width too when responsiveness or tap-target sizing is in question, since
  Fitts's Law issues surface on mobile. For a flow, drive through it step by step
  and capture each state (empty, filled, error, success) — the error and success
  states are where Peak-End problems hide.
- **Screenshots provided:** work from them directly. If key states are missing
  (e.g. they gave you the form but not the error or confirmation), note the gap
  rather than guessing what those screens do.
- **Neither available:** ask the user for a URL or screenshots. Do not audit from
  a verbal description — you'll produce generic filler.

### 3. Evaluate against the laws

Read `references/laws-of-ux.md` — it lists all 30 laws grouped by theme, each with
a definition and concrete **Flag when** failure modes. Its "Highest-leverage
checks" section is the fast path: start there on every screen (tap targets, choice
overload, primary-action emphasis, grouping, broken conventions, feedback timing,
input tolerance, progress indication, how the flow ends).

Then go law by law and inspect the actual screen. Good practice:

- **Anchor every finding to visible evidence.** Not "targets may be too small" but
  "the three icon buttons in the top bar are ~24px with no spacing — mis-taps on
  mobile (Fitts's Law)." Counts, sizes, placement, exact wording — cite what you see.
- **One law per finding, the one that fits best.** Many issues touch several laws;
  name the primary one so the fix is focused. Note a secondary law only if it
  genuinely adds something.
- **Report real problems, not a checklist of all 30.** A screen that respects a law
  needs no entry for it. A tight report of what actually hurts beats an exhaustive
  one padded to look thorough. If a screen is genuinely solid, say so — don't invent
  problems to fill space.
- **Don't fabricate.** If you can't observe an interaction (hover, load time, live
  validation) from a static screenshot, either drive it live to check, or say it's
  unverified — never assert a dynamic behavior you didn't see.

Rate each finding:

- **Severity** — 🔴 Critical (blocks/derails the core task, causes errors or
  abandonment, or is inaccessible) · 🟠 Major (real friction or confusion; task
  still completable) · 🟡 Minor (polish, consistency, missed opportunity). Severity
  is about user impact, not how egregious the violation looks.
- **Effort** — S (copy/CSS/config tweak) · M (component change) · L (flow or
  structural rework). This is your best-guess implementation cost; it drives fix ordering.

### 4. Write the report

Follow `assets/report-template.md` exactly — it defines the section order, the
per-finding fields (Law, Where, Problem, Evidence, Fix), and the severity/effort
notation. The two sections that make the audit *actionable*:

- **Fix per finding:** one concrete change, not a restatement of the problem.
  "Add 8px gaps and bump the icon buttons to 44px" — not "improve tap targets."
- **Action plan:** a checklist ordered by impact ÷ effort, so quick wins that remove
  real pain sit at the top. This is what the team actually executes from — make it
  scannable and specific enough to start on without re-reading the findings.

Save the file to the working directory (or wherever the user asked). Name it
descriptively — e.g. `ux-audit-<target>.md`. Tell the user the path and give a
2–3 sentence verbal summary of the top issues so they don't have to open the file
to know where things stand.

## Example finding

Concrete beats abstract — this is the bar for a finding:

> ### [F2] Primary "Continue" button doesn't stand out · 🟠 Major · Effort: S
>
> - **Law:** Von Restorff Effect — among similar items, the distinct one is noticed and remembered.
> - **Where:** Checkout step 1, bottom action row.
> - **Problem:** "Continue", "Save for later", and "Cancel" are three identical grey
>   outlined buttons. Users can't tell which action moves them forward, so they hesitate
>   or mis-click — friction at the exact moment they're trying to progress.
> - **Evidence:** All three buttons share the same grey border, white fill, and size;
>   no color, weight, or size distinguishes the primary action.
> - **Fix:** Make "Continue" a solid filled button in the brand/accent color; demote
>   "Save for later" and "Cancel" to text or outline styles.

Notice: a named law, a specific location, user impact (not just "violates a law"),
evidence anyone can verify against the screenshot, and a fix a developer can ship
today. Hold every finding to that standard.
