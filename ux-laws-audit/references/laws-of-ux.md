# Laws of UX — Evaluator Reference

Source: https://lawsofux.com/ (30 laws/principles). Use this to spot concrete
violations in a real interface. Each entry gives the law, a one-line definition,
what good use looks like, and **Flag when** — the failure modes to look for.

Don't force every law onto every screen. Scan the whole list, then report only
the laws a screen actually violates, with visible evidence. A finding without a
specific law is a vague opinion; a law without visible evidence is a lecture.
Aim for findings that are both.

## Table of contents
1. Cognitive load & simplicity — Cognitive Load, Tesler's Law, Occam's Razor, Miller's Law
2. Memory & recall — Working Memory, Chunking, Serial Position Effect, Von Restorff Effect, Zeigarnik Effect
3. Attention & perception (Gestalt) — Selective Attention, Proximity, Common Region, Similarity, Uniform Connectedness, Prägnanz
4. Decision-making & targeting — Hick's Law, Choice Overload, Fitts's Law, Cognitive Bias, Pareto Principle
5. Mental models & familiarity — Jakob's Law, Mental Model, Postel's Law, Paradox of the Active User
6. Motivation & engagement — Goal-Gradient Effect, Flow
7. Time & performance — Doherty Threshold, Parkinson's Law
8. Emotion & aesthetics — Aesthetic-Usability Effect, Peak-End Rule

---

## 1. Cognitive load & simplicity
*How much mental effort the interface demands.*

### Cognitive Load
Total mental effort to understand and operate the UI. Split into *intrinsic*
(tied to the real task) and *extraneous* (wasted on distracting/superfluous design).
- **Flag when:** dense screens with competing visual noise; jargon or unexplained
  icons; users asked to remember data across steps; decorative animation/imagery
  that carries no meaning; forms asking for data the system already has.

### Tesler's Law (Conservation of Complexity)
Every system has irreducible complexity; either the system absorbs it or the user does.
- **Flag when:** inherent complexity pushed onto users (raw config, manual steps the
  system could infer); or over-simplified to the point that necessary complexity is
  hidden and users invent workarounds.

### Occam's Razor
Among designs that work equally well, the one with the fewest elements wins.
- **Flag when:** redundant controls doing the same job; unnecessary steps/fields/options;
  embellishment with no function; features kept "just in case."

### Miller's Law
Working memory holds ~7 (±2) items at once. (Not a hard cap — don't cite it to
arbitrarily limit useful options.)
- **Flag when:** long unbroken strings of digits/characters; flat menus with dozens
  of ungrouped items; users asked to compare many attributes from memory.

---

## 2. Memory & recall
*How users store, retrieve, and remember what the interface shows.*

### Working Memory
Temporary store that holds task info; ~4–7 chunks, each fading in ~20–30s.
- **Flag when:** a value shown on one screen must be re-entered on another; wizards
  that discard prior input; previously selected options hidden; recall required where
  recognition would do.

### Chunking
Break information into meaningful grouped units so it can be scanned.
- **Flag when:** walls of undifferentiated text or fields; no separation between
  unrelated groups; related items scattered instead of clustered.

### Serial Position Effect
People best remember the first and last items in a series; the middle fades.
- **Flag when:** the most important action/link is buried in the middle of a long
  list or menu; menu order is arbitrary so critical items land in the low-recall middle.

### Von Restorff Effect (Isolation)
Among similar items, the one that stands out is remembered.
- **Flag when:** everything competes for emphasis so nothing stands out; the primary
  action is styled identically to secondary ones; emphasis relies on color alone
  (fails color-blind/low-vision users); emphasis so ad-like it triggers banner blindness.

### Zeigarnik Effect
Uncompleted tasks are remembered better and pull users to finish.
- **Flag when:** no indication of remaining steps or progress in a multi-step task;
  tasks feel unbounded; no cue that more content/steps exist.

---

## 3. Attention & perception (Gestalt)
*How the visual system groups, filters, and interprets the screen.*

### Selective Attention
People focus on goal-relevant stimuli and filter out the rest.
- **Flag when:** *banner blindness* — important content styled like ads or placed in
  ad zones; *change blindness* — significant changes go unnoticed for lack of cues, or
  too much changes at once; distractions competing with the primary task path.

### Law of Proximity
Objects near each other are perceived as a group.
- **Flag when:** a label sits equidistant from multiple fields (ambiguous ownership);
  related controls spread far apart; unrelated elements crowded together; uniform
  spacing that erases grouping.

### Law of Common Region
Elements inside a shared boundary (border/background) read as a group.
- **Flag when:** a container/background groups unrelated items; grouping boundaries
  missing where needed; nested regions with conflicting boundaries.

### Law of Similarity
Elements that look alike are assumed to share meaning or function.
- **Flag when:** clickable and non-clickable elements styled identically (or links
  that look like plain text); same-function elements styled inconsistently; unrelated
  things made to look alike, implying a false relationship.

### Law of Uniform Connectedness
Visually connected elements (lines, frames, shared containers) read as most related.
- **Flag when:** related actions/items have no connecting cue; connectors imply
  relationships that don't exist; a bar/frame spans unrelated functions.

### Law of Prägnanz (Simplicity / Good Figure)
People perceive ambiguous images in their simplest form.
- **Flag when:** overly intricate icons/graphics hard to parse at a glance; noisy
  layouts the eye can't resolve into clear forms; ornament that obscures meaning.

---

## 4. Decision-making & targeting
*How the interface shapes the speed and quality of decisions and actions.*

### Hick's Law
Decision time grows with the number and complexity of choices.
- **Flag when:** overloaded menus/toolbars with too many equal-weight options; all
  choices shown at once instead of staged; no clear default or recommendation.

### Choice Overload
Too many options overwhelm users and degrade decision quality and satisfaction.
- **Flag when:** large unfiltered catalogs/menus with no search, sort, or filter; too
  many pricing plans or config options at once; no "recommended"/featured shortcut.

### Fitts's Law
Time to hit a target depends on its size and distance — bigger and closer is faster.
- **Flag when:** tiny tap/click targets (small icons, thin links); interactive elements
  crammed together with no spacing (mis-taps); critical actions in hard-to-reach areas;
  small close/submit buttons. (Mobile tap targets below ~44px are a classic offender.)

### Cognitive Bias
Systematic judgment errors from mental shortcuts.
- **Flag when (design side):** dark patterns exploiting bias — fake scarcity/urgency,
  manipulative defaults, confirmshaming.
- **Flag when (evaluation side):** assuming users think like the team.

### Pareto Principle (80/20)
~80% of effects come from ~20% of causes.
- **Flag when:** rarely used features get equal prominence to core flows; edge cases
  over-invested while primary paths are neglected; primary UI cluttered with low-value functionality.

---

## 5. Mental models & familiarity
*How prior experience shapes what users expect your interface to do.*

### Jakob's Law
Users spend most of their time on other apps and expect yours to work like those.
- **Flag when:** standard patterns reinvented with no payoff (novel nav, unusual icons,
  non-standard gestures); conventional placements broken (logo→home, cart top-right,
  search = magnifier); platform conventions ignored.

### Mental Model
The user's internal model of how the system works, built from past experience.
- **Flag when:** the UI contradicts established metaphors (cart, trash, folders);
  terminology/behavior mismatches user expectations; a large gulf between how the team
  assumes users think and how they actually do.

### Postel's Law (Robustness)
Be liberal in what you accept, conservative in what you send.
- **Flag when:** rigid input formats reject valid variations ("remove spaces from your
  card number"); no clear feedback when input is out of bounds; brittle validation that
  punishes minor deviations (casing, whitespace, phone/date formats).

### Paradox of the Active User
Users skip manuals and jump straight in, even when upfront learning would save time.
- **Flag when:** critical guidance buried in docs users won't read; onboarding that
  front-loads reading before letting users act; help that assumes one linear path.

---

## 6. Motivation & engagement
*How the interface sustains momentum and immersion.*

### Goal-Gradient Effect
Motivation rises as the goal nears; people accelerate toward the finish.
- **Flag when:** no visible progress toward completion; long tasks with no sense of
  nearing the end; users started from a bare zero when a small head start would motivate.

### Flow
Full immersion when task difficulty matches user skill.
- **Flag when:** friction/latency breaks immersion; tasks too hard (frustration) or
  too trivial (boredom) for the audience; missing feedback so users can't tell what happened.

---

## 7. Time & performance
*How the interface manages actual and perceived time.*

### Doherty Threshold
Productivity jumps when response is fast enough (<~400ms) that neither side waits.
- **Flag when:** interactions with no immediate feedback (>400ms of dead time);
  spinners with no progress context for long operations; UI that freezes while
  processing; no perceived-performance technique (skeletons, optimistic UI) where real
  speed can't improve.

### Parkinson's Law
A task expands to fill the time available for it.
- **Flag when:** flows with unnecessary friction/steps that inflate completion time;
  no autofill/shortcuts for known data; a task allowed to sprawl when it could be constrained.

---

## 8. Emotion & aesthetics
*How look and feel shape perception and lasting memory.*

### Aesthetic-Usability Effect
Users perceive attractive designs as more usable and forgive minor flaws.
- **Flag when (design side):** neglected visual quality undermines perceived usability
  and trust.
- **Flag when (evaluation side):** attractive visuals mask real usability problems —
  don't let polish hide a broken flow.

### Peak-End Rule
People judge an experience by its most intense moment and its end, not the average.
Negative peaks hit harder than positive ones.
- **Flag when:** abrupt/anticlimactic endings (bare "done" with no confirmation or next
  step); painful peak moments (error walls, forced friction) left unaddressed; average
  polish optimized while the emotionally pivotal peak and end are ignored.

---

## Highest-leverage checks (start here on any screen)
- **Fitts** — tap/click target size & spacing (especially mobile).
- **Hick / Choice Overload** — too many equal-weight options, no default or filter.
- **Von Restorff** — is the primary action visually dominant, or lost among peers?
- **Proximity / Common Region / Similarity** — do groups read as groups; do clickable
  things look clickable?
- **Jakob** — any broken convention (nav, icons, placement)?
- **Doherty** — immediate feedback on every action; progress for long waits.
- **Postel** — does input validation reject reasonable variations?
- **Goal-Gradient / Zeigarnik** — progress shown in multi-step flows.
- **Peak-End** — how does the flow *end*, and what's its worst moment?
