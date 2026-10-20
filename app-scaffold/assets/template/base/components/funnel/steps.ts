/**
 * The web funnel's shape, as data: which steps, in what order, asking what. `FunnelShell`
 * renders a step by its `kind`, so reordering or adding a step costs an entry here, its words
 * in every deck under `copy/`, and no component.
 *
 * **Nothing here is in a language.** The words live in `copy/<tag>.ts`, keyed by step id,
 * question key and option value, and `stepAt` puts the two together for one reader. Keys and
 * values are what analytics, `sessionStorage` and the biller's metadata record, so they stay
 * the same in every language and are never reworded once an ad points at them.
 *
 * The app's first run is this funnel too: `bun run funnel:export-ios` writes these steps and every
 * deck into its bundle, so a step of a new `kind` needs a view in `FunnelScreen.swift` before
 * the script will write it.
 */

import type { FunnelCopy } from "./copy/types";
import { validateFunnel, type FunnelSpine } from "./steps.validate";

export type FunnelStepKind =
  | "question"
  /** A headline and a line or two, read rather than answered. */
  | "statement"
  | "recap"
  | "account"
  | "paywall"
  | "checkout";

export interface OptionShape {
  /** Stored, reported, and stamped onto the biller's metadata. Never reworded once an ad
   * points at it. */
  value: string;
  /** Kept off the title on purpose: the title is what a chart, a recap line and a transaction
   * read, and a glyph in the middle of that is one somebody has to strip later. */
  emoji?: string;
}

export interface QuestionShape {
  /** Names the answer in `sessionStorage`, as an Amplitude user property, as a key on the
   * biller's metadata, and as the question's entry in every copy deck. Never translated. */
  key: QuestionKey;
  /** Several answers at once, stored as a `MULTI_SEPARATOR`-joined string. A multi question
   * cannot auto-advance, so it keeps the footer's Continue. */
  multi?: boolean;
  options: OptionShape[];
}

export interface StepShape {
  /** Stable across a reorder, unlike the index — this is what analytics reports as `step`,
   * and the step's entry in every copy deck. */
  id: string;
  kind: FunnelStepKind;
  question?: QuestionShape;
  /** Reads differently by an earlier answer: the variant under the reader's answer overlays
   * the step's own copy line by line, and no answer leaves the step's own copy standing. */
  branch?: { on: QuestionKey };
}

/** The keys a deck has to word. `problem` is step 0's; the rest follow in step order. */
export type QuestionKey = keyof FunnelCopy["questions"];

export interface FunnelOption extends OptionShape {
  title: string;
}

/** A question as one reader sees it: the shape with its deck's words laid over it. */
export interface FunnelQuestion {
  key: string;
  headline: string;
  description?: string;
  multi?: boolean;
  options: FunnelOption[];
  /** Answer value → the sentence the recap reads back. A value with no entry contributes no
   * line, which keeps "rarely" and "just exploring" out of a summary they would dilute. */
  recap?: Record<string, string>;
}

export interface StatementCopy {
  /** `[bracketed]` marks the span that gets the accent. */
  headline: string;
  body?: string;
  /** A quiet centred line tucked under the headline. What it says is a fact about who is
   * already here, not part of the argument — the argument is the headline. */
  note?: string;
}

/** A step as one reader sees it. */
export interface FunnelStep extends StatementCopy {
  id: string;
  kind: FunnelStepKind;
  question?: FunnelQuestion;
  /** `fallback` is the opener's problem: what the step reads when the answer names no variant,
   * so a reader who said "not really" is argued the opener's case rather than the default one. */
  branch?: { on: string; variants: Record<string, Partial<StatementCopy>>; fallback?: string };
}

export type FunnelAnswers = Record<string, string>;

export interface RecapLine {
  key: string;
  line: string;
}

/** A separator no option value contains, so a joined answer can be split back apart. */
export const MULTI_SEPARATOR = "|";

/** The four problems the ads name and step 0 asks between. Placeholders: the intake's pain
 * sentence names the real ones. */
export const PROBLEMS = ["time", "money", "stress", "progress"] as const;

export type Problem = (typeof PROBLEMS)[number];

const PROBLEM: QuestionShape = {
  key: "problem",
  options: [
    { value: "time", emoji: "⏳" },
    { value: "money", emoji: "💸" },
    { value: "stress", emoji: "😮‍💨" },
    { value: "progress", emoji: "📉" },
  ],
};

/** The opener's "Not really". Not a problem, so no recap line answers to it; a branching
 * step falls back to the opener's own problem rather than to the default copy. */
const OPENER_DECLINED = "none";

/** The problem the web opener asks about: the one the winning ad names. */
const OPENER_PROBLEM: Problem = "time";

/** Names the opener in Amplitude's `opener` user property. Change it when the opener's
 * question changes, so the two are never one series in a chart. */
export const OPENER_ID = "opener";

/**
 * Step 0 for every web visit: one yes/no in the ad's words. Same `key` as `PROBLEM` and "Yes"
 * is `OPENER_PROBLEM`, so the branch, the recap line and the Amplitude join read as a four-way
 * answer would. The app's first run keeps the four-way question (`FUNNEL`'s own step 0).
 */
function opener(copy: FunnelCopy): FunnelQuestion {
  return {
    key: PROBLEM.key,
    headline: copy.openers.headline,
    options: [
      { value: OPENER_PROBLEM, emoji: "✅", title: copy.openers.yes },
      { value: OPENER_DECLINED, emoji: "🙅", title: copy.openers.no },
    ],
    recap: copy.questions.problem.recap,
  };
}

/** Which answers the first screen can carry through the hash before the bundle lands. */
export const OPENER_VALUES: readonly string[] = [OPENER_PROBLEM, OPENER_DECLINED];

const question = (
  key: QuestionKey,
  options: [value: string, emoji: string][],
  multi?: boolean,
): QuestionShape => ({
  key,
  ...(multi ? { multi } : {}),
  options: options.map(([value, emoji]) => ({ value, emoji })),
});

const OFTEN = question("often", [
  ["daily", "📆"],
  ["weekly", "🗓️"],
  ["monthly", "🕰️"],
  ["rarely", "🙂"],
]);

const TRIED = question("tried", [
  ["notes", "📝"],
  ["apps", "📱"],
  ["willpower", "💪"],
  ["nothing", "🤷"],
]);

const GOAL = question(
  "goal",
  [
    ["calm", "🧘"],
    ["time", "⏱️"],
    ["control", "🎛️"],
    ["proud", "🏆"],
  ],
  true,
);

const SOON = question("soon", [
  ["now", "🚀"],
  ["month", "📅"],
  ["exploring", "🔭"],
]);

export const FUNNEL: { id: string; steps: StepShape[] } = {
  id: "main",
  steps: [
    { id: "problem", kind: "question", question: PROBLEM },
    { id: "why", kind: "statement", branch: { on: "problem" } },
    { id: "often", kind: "question", question: OFTEN },
    { id: "tried", kind: "question", question: TRIED },
    { id: "goal", kind: "question", question: GOAL },
    { id: "proof", kind: "statement" },
    { id: "soon", kind: "question", question: SOON },
    { id: "recap", kind: "recap" },
    { id: "account", kind: "account" },
    { id: "paywall", kind: "paywall" },
    { id: "checkout", kind: "checkout" },
  ],
};

/** The web's order of `FUNNEL`'s steps. The same as the app's until the web opener argues for a
 * different one; every id must appear exactly once. */
const WEB_ORDER = FUNNEL.steps.map((step) => step.id);

export const WEB_FUNNEL: { id: string; steps: StepShape[] } = {
  id: FUNNEL.id,
  steps: WEB_ORDER.flatMap((id) => FUNNEL.steps.filter((step) => step.id === id)),
};

/** The words a deck has for a statement step, by id. */
export type StepCopy = FunnelCopy["steps"][keyof FunnelCopy["steps"]];

/** A question's words laid over its shape. */
function worded(shape: QuestionShape, copy: FunnelCopy): FunnelQuestion {
  const words: {
    headline: string;
    description?: string;
    options: Record<string, string>;
    recap?: Record<string, string>;
  } = copy.questions[shape.key];
  return {
    key: shape.key,
    headline: words.headline,
    description: words.description,
    multi: shape.multi,
    options: shape.options.map((option) => ({ ...option, title: words.options[option.value] })),
    recap: words.recap,
  };
}

/** A step's words laid over its shape. Question steps carry theirs on the question. */
function localized(shape: StepShape, copy: FunnelCopy): FunnelStep {
  const words: Partial<StatementCopy> & { variants?: Record<string, Partial<StatementCopy>> } =
    (copy.steps as Record<string, StepCopy | undefined>)[shape.id] ?? {};
  return {
    id: shape.id,
    kind: shape.kind,
    headline: words.headline ?? "",
    body: words.body,
    note: words.note,
    question: shape.question && worded(shape.question, copy),
    branch: shape.branch && { on: shape.branch.on, variants: words.variants ?? {} },
  };
}

/** Where the account step's two round trips come back to. Derived rather than written down,
 * so a step added above it cannot land a signed-in reader on the wrong screen. */
export const ACCOUNT_STEP_INDEX = WEB_FUNNEL.steps.findIndex((step) => step.kind === "account");

/**
 * What the progress counter promises: the questions and the demos, ending at the recap. The
 * account step, the offer and the card field are not survey, so the bar reads its last number
 * on the recap rather than running past its own total.
 */
export const SURVEY_LENGTH = ACCOUNT_STEP_INDEX;

/** The step at `index` as the web shows it, in its reader's words: the web's order with the
 * opener on step 0, and the opener's problem as the fallback on a branching step. */
export function stepAt(index: number, copy: FunnelCopy): FunnelStep {
  const step = localized(WEB_FUNNEL.steps[index], copy);
  return {
    ...step,
    question: index === 0 ? opener(copy) : step.question,
    branch: step.branch && { ...step.branch, fallback: OPENER_PROBLEM },
  };
}

/** The question each problem is the short form of. Its line is pinned into the recap beside
 * the problem's own, or the questions late in the spine never survive the cap. */
const FOLLOW_UP: Record<string, QuestionKey> = {
  time: "often",
  money: "tried",
  stress: "often",
  progress: "tried",
};

/**
 * The lines the recap reads back, in step order, capped so the summary reads as understanding
 * rather than as a receipt. The problem's line and its follow-up's survive whatever the cap,
 * and the problem's is moved to the front — the recap draws the first card in red, and a red
 * card halfway down a list reads as an arbitrary one rather than as theirs.
 */
export function recapLines(answers: FunnelAnswers, limit: number, copy: FunnelCopy): RecapLine[] {
  const all = WEB_FUNNEL.steps.flatMap((step) => {
    const key = step.question?.key;
    const words = key && copy.questions[key];
    const recap: Record<string, string> | undefined =
      words && "recap" in words ? words.recap : undefined;
    const line = key && recap?.[answers[key]];
    return key && line ? [{ key, line }] : [];
  });

  const pinned = new Set([PROBLEM.key, FOLLOW_UP[answers[PROBLEM.key]]]);
  const kept = all.filter((entry) => pinned.has(entry.key));
  const rest = all.filter((entry) => !pinned.has(entry.key));
  // The pinned lines survive whatever the cap; the rest fill what is left of it.
  const keep = [...kept, ...rest.slice(0, Math.max(0, limit - kept.length))];

  return all
    .filter((entry) => keep.includes(entry))
    .sort((a, b) => Number(b.key === PROBLEM.key) - Number(a.key === PROBLEM.key));
}

/** The account step's card: the problem the reader named and the line of the plan that answers
 * it. Null for the opener's "Not really", which named none. */
export function problemFix(
  answers: FunnelAnswers,
  copy: FunnelCopy,
): { problem: string; fix: string } | null {
  const answer = PROBLEMS.find((problem) => problem === answers[PROBLEM.key]);
  if (!answer) return null;
  return { problem: copy.questions.problem.recap[answer], fix: copy.account.fix[answer] };
}

// Development only — the live funnel must never fail to render over a copy mistake. The
// literal comparison is what lets the bundler fold this branch, and the import with it, away.
// Keep it synchronous, or a thrown error becomes an unhandled rejection.
/** Everything the checks read. The funnel build hands it to `validateCopy` for every deck. */
export const SPINE: FunnelSpine = {
  steps: FUNNEL.steps,
  problem: PROBLEM,
  problems: PROBLEMS,
  followUp: FOLLOW_UP,
  declined: OPENER_DECLINED,
  separator: MULTI_SEPARATOR,
};

if (process.env.NODE_ENV !== "production") {
  validateFunnel(SPINE);
  validateFunnel({ ...SPINE, steps: WEB_FUNNEL.steps });
  if (WEB_FUNNEL.steps.length !== FUNNEL.steps.length) {
    throw new Error("WEB_ORDER leaves out or misnames a step of FUNNEL");
  }
}
