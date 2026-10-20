import type { JSX } from "preact";
import { Headline } from "./Headline";
import { Glyph } from "./icons";
import { Accented, useLocale } from "./locale";
import { recapLines, type FunnelAnswers } from "./steps";

/** Enough that the reader recognises their own situation, few enough to read standing up. */
const LINES = 5;

/** `.card`'s shape on the alert wash. Spelled out because `.card` is unlayered and its paper
 * would win over any background utility. */
export const PROBLEM_CARD = "rounded-[24px] bg-alert-wash text-alert shadow-[0_1px_0_rgb(80_46_15/0.08)]";

/**
 * The reader's own answers, a card apiece. **The first card is red and only the first** — it
 * is the problem they named on step 0 (`recapLines` sorts it to the front), the one thing on
 * the screen that is measurably costing them money. Five red cards is an accusation.
 */
export function RecapStep({ answers, headline }: { answers: FunnelAnswers; headline: string }) {
  const { copy } = useLocale();
  const lines = recapLines(answers, LINES, copy);

  return (
    <>
      <Headline text={headline} />

      {lines.map((entry, index) => {
        const problem = index === 0;
        return (
          <div
            key={entry.key}
            className={`flex items-center gap-3 px-4 py-3 ${problem ? PROBLEM_CARD : "card text-faint"}`}
          >
            <span className="shrink-0">{ICONS[entry.key] ?? ICONS.default}</span>
            <p
              className={`min-w-0 text-[15.5px] leading-[1.4] ${
                problem ? "font-medium text-ink" : "text-ink"
              }`}
            >
              {entry.line}
            </p>
          </div>
        );
      })}

      {/* The ink card, so after the grey ones the answer looks like the answer; the footer's
          button stays the only accent fill on the screen. */}
      <div className="rounded-[28px] bg-ink p-[18px] text-on-ink">
        <p className="text-[17px] font-bold leading-[1.3]">
          <Accented text={copy.recap.closing} onInk />
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {copy.recap.answers.map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <span className="mt-px shrink-0 text-amber">
                <Tick />
              </span>
              <span className="min-w-0 text-[14.5px] leading-[1.35]">{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** Filled rather than outlined, unlike the diagnosis glyphs: these are already true. */
export function Tick() {
  return (
    <svg aria-hidden width="17" height="17" viewBox="0 0 20 20" className="fill-current">
      <path d="M10 1.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm4.05 6.42-4.9 4.9a.8.8 0 0 1-1.13 0L5.95 10.7a.8.8 0 0 1 1.13-1.13l1.5 1.5 4.34-4.34a.8.8 0 0 1 1.13 1.13Z" />
    </svg>
  );
}

const Mark = ({ children }: { children: JSX.Element | JSX.Element[] }) => (
  <Glyph size={20} box={20} stroke={1.6}>
    {children}
  </Glyph>
);

/** One outline mark per question key — drawn rather than emoji, because the options above use
 * emoji for warmth and the recap reads as a diagnosis. A key with no entry falls back. */
export const ICONS: Record<string, JSX.Element> = {
  problem: (
    <Mark>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M10 6.2v4.4" />
      <circle cx="10" cy="13.6" r="0.95" fill="currentColor" stroke="none" />
    </Mark>
  ),
  often: (
    <Mark>
      <rect x="3.4" y="4.4" width="13.2" height="12.2" rx="1.6" />
      <path d="M3.4 8.2h13.2M7 2.8v3M13 2.8v3" />
    </Mark>
  ),
  tried: (
    <Mark>
      <path d="M16.6 10a6.6 6.6 0 1 1-2-4.7" />
      <path d="M16.9 3.1v3.3h-3.3" />
    </Mark>
  ),
  soon: (
    <Mark>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M10 6v4.2l2.8 1.8" />
    </Mark>
  ),
  default: (
    <Mark>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M6.6 10h6.8" />
    </Mark>
  ),
};
