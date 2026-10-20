import type { FunnelCopy } from "./copy/types";
import type { QuestionShape, StepShape } from "./steps";

/** Everything the checks need, handed in rather than imported — this module must not import
 * `steps.ts`, or the two form a cycle around a module-scope call. */
export interface FunnelSpine {
  steps: StepShape[];
  problem: QuestionShape;
  problems: readonly string[];
  followUp: Record<string, string>;
  declined: string;
  separator: string;
}

/**
 * What an edit to the shape can break without anything on screen going wrong: a duplicated
 * step id collapses two steps into one keyed subtree and reports one step's analytics for
 * both; a missing account step turns the return hash into `#step--1`; a branch on a question
 * asked later is a variant nobody can reach.
 *
 * Called from `steps.ts` behind a `NODE_ENV` guard, so this is folded out of the production
 * bundle.
 */
export function validateFunnel(spine: FunnelSpine): void {
  const { steps, problem, problems, followUp, declined, separator } = spine;

  const ids = steps.map((step) => step.id);
  const duplicate = ids.find((id, at) => ids.indexOf(id) !== at);
  if (duplicate) throw new Error(`the funnel repeats the step id "${duplicate}"`);
  if (!steps.some((step) => step.kind === "account")) {
    throw new Error("the funnel has no account step");
  }
  if (steps[0].question !== problem) throw new Error("the funnel no longer opens on PROBLEM");

  const questions = steps.map((step) => step.question);
  const keys = questions.flatMap((question) => (question ? [question.key] : []));
  const twice = keys.find((key, at) => keys.indexOf(key) !== at);
  if (twice) throw new Error(`two funnel questions share the key "${twice}"`);

  for (const question of questions) {
    if (!question) continue;
    if (question.options.some((option) => option.value.includes(separator))) {
      throw new Error(`an option of "${question.key}" contains the multi separator`);
    }
  }

  steps.forEach((step, index) => {
    const branch = step.branch;
    if (!branch) return;
    const asked = questions.slice(0, index).find((question) => question?.key === branch.on);
    if (!asked) {
      throw new Error(`step "${step.id}" branches on "${branch.on}", which no earlier step asks`);
    }
  });

  for (const [named, key] of Object.entries(followUp)) {
    if (!answers(problem, named)) {
      throw new Error(`FOLLOW_UP names "${named}", which the problem question never answers`);
    }
    if (!questions.some((question) => question?.key === key)) {
      throw new Error(`FOLLOW_UP points "${named}" at "${key}", which no step asks`);
    }
  }

  for (const named of problems) {
    if (!answers(problem, named)) {
      throw new Error(`PROBLEMS names "${named}", which the problem question never answers`);
    }
  }
  if (answers(problem, declined)) {
    throw new Error(
      `"${declined}" answers the problem question, so an opener's "not really" would read as one`,
    );
  }
}

const answers = (question: QuestionShape, value: string): boolean =>
  question.options.some((option) => option.value === value);

/**
 * What a deck can get wrong that its type cannot see, because option values and step ids are
 * strings: an option with no title renders an empty row, a step with no headline an empty
 * screen, a recap line or a variant keyed on a value the question never answers is a sentence
 * nobody reads, and a `multi` question's joined answer never matches a recap key at all.
 *
 * Run by the funnel build for every deck, so a missing word fails the build rather than
 * shipping a blank to one market.
 */
export function validateCopy(tag: string, copy: FunnelCopy, spine: FunnelSpine): void {
  const fail = (what: string) => {
    throw new Error(`funnel copy "${tag}": ${what}`);
  };
  const words = copy.questions as Record<
    string,
    { headline: string; options: Record<string, string>; recap?: Record<string, string> }
  >;
  const steps = copy.steps as Record<
    string,
    { headline?: string; variants?: Record<string, unknown> } | undefined
  >;

  for (const step of spine.steps) {
    const question = step.question;
    if (question) {
      const deck = words[question.key];
      if (!deck?.headline) fail(`"${question.key}" has no headline`);
      for (const option of question.options) {
        if (!deck.options[option.value]) fail(`"${question.key}" has no title for "${option.value}"`);
      }
      if (question.multi && deck.recap) fail(`"${question.key}" is multi, so its recap is unreachable`);
      for (const value of Object.keys(deck.recap ?? {})) {
        if (!answers(question, value)) fail(`"${question.key}" recaps "${value}", which it never answers`);
      }
      continue;
    }
    if (!steps[step.id]?.headline) fail(`step "${step.id}" has no headline`);
    const on = step.branch?.on;
    if (!on) continue;
    const asked = spine.steps.find((other) => other.question?.key === on)?.question;
    for (const value of Object.keys(steps[step.id]?.variants ?? {})) {
      if (asked && !answers(asked, value)) {
        fail(`step "${step.id}" has a variant for "${value}", which "${on}" never answers`);
      }
    }
  }
}
