import { MULTI_SEPARATOR, type FunnelAnswers, type FunnelQuestion } from "./steps";
import { Body, Headline } from "./Headline";

const ROW = "choice flex items-center gap-3 px-4 py-3.5 text-left";

/**
 * Single select is an anchor, not a button: its `href` carries the answer in the hash, so a
 * tap that lands before the bundle does still counts (`location.ts`). Multi select is buttons
 * — no single destination, and no multi question is ever prerendered.
 */
export function QuestionCard({
  question,
  answers,
  index,
  onPick,
}: {
  question: FunnelQuestion;
  answers: FunnelAnswers;
  index: number;
  onPick: (value: string) => void;
}) {
  const answer = answers[question.key];
  const chosen = new Set(
    question.multi ? (answer ? answer.split(MULTI_SEPARATOR) : []) : answer ? [answer] : [],
  );

  /** Joined in option order, not tap order, so the stored string is stable. */
  const toggle = (value: string) =>
    onPick(
      question.options
        .filter((option) =>
          option.value === value ? !chosen.has(value) : chosen.has(option.value),
        )
        .map((option) => option.value)
        .join(MULTI_SEPARATOR),
    );

  return (
    <>
      <Headline text={question.headline} />
      <Body text={question.description} />
      {question.options.map((option) => {
        const selected = chosen.has(option.value);
        const inner = (
          <>
            {option.emoji && (
              <span aria-hidden className="emoji shrink-0 text-[19px] leading-none">
                {option.emoji}
              </span>
            )}
            <span className="min-w-0 flex-1 text-[17px] font-semibold leading-snug">
              {option.title}
            </span>
            <Tick selected={selected} multi={question.multi} />
          </>
        );

        return question.multi ? (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            data-selected={selected}
            onClick={() => toggle(option.value)}
            className={ROW}
          >
            {inner}
          </button>
        ) : (
          <a
            key={option.value}
            href={`#step-${index + 1}.${question.key}=${option.value}`}
            data-selected={selected}
            onClick={(event) => {
              event.preventDefault();
              onPick(option.value);
            }}
            className={ROW}
          >
            {inner}
          </a>
        );
      })}
    </>
  );
}

/** A circle for one answer, a rounded square for several — the distinction a form makes.
 * Amber once picked, the highlight of an ink surface, with an ink check in it. */
function Tick({ selected, multi }: { selected: boolean; multi?: boolean }) {
  return (
    <svg
      aria-hidden
      width="20"
      height="20"
      viewBox="0 0 20 20"
      className={`shrink-0 ${selected ? "text-amber" : "text-chevron"}`}
    >
      <rect
        x="1"
        y="1"
        width="18"
        height="18"
        rx={multi ? 5 : 9}
        fill={selected ? "currentColor" : "none"}
        stroke="currentColor"
        stroke-width="1.5"
      />
      {selected && (
        <path
          d="M5.8 10.2 8.5 12.9 14.2 7.2"
          fill="none"
          stroke="var(--ink)"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      )}
    </svg>
  );
}
