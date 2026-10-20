import { Body, Headline, Note } from "./Headline";
import type { FunnelAnswers, FunnelStep, StatementCopy } from "./steps";

/** A fragment, not a wrapper: `.anim-step > *` staggers the title and the body as siblings. */
export function StatementStep({ step, answers }: { step: FunnelStep; answers: FunnelAnswers }) {
  const branch = step.branch;
  const variant =
    branch && (branch.variants[answers[branch.on] ?? ""] ?? branch.variants[branch.fallback ?? ""]);
  const copy: StatementCopy = {
    headline: step.headline ?? "",
    body: step.body ?? "",
    note: step.note,
    ...variant,
  };
  return (
    <>
      <Headline text={copy.headline} />
      <Note text={copy.note} />
      <Body text={copy.body} />
    </>
  );
}
