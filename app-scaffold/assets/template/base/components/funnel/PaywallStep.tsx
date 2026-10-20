import type { ComponentChildren, JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { formatMoney, planListQuote, type Plan, type PlanQuote } from "@/lib/plans";
import { Glyph } from "./icons";
import { LegalNote } from "./LegalNote";
import { fill, useLocale } from "./locale";
import { Faq } from "./paywall/Faq";
import { Reviews } from "./paywall/Reviews";
import { lifetimeOffered, planQuote } from "./planQuote";

/**
 * The offer, drawn as a page of its own: the shell hides the header, the progress bar and Back
 * on this step and hands the action here. The card field is the step after — the selection
 * lives in `FunnelShell` so Back returns to the plan that was picked.
 *
 * Nothing here needs an account or a configured biller; the cards render from the list quote
 * with no keys at all.
 */

/**
 * The part of this screen that is a claim about the world rather than a fact about the price.
 * Both lines are written by hand in every deck (`paywall.lifetimeLeft`, `paywall.weekly`) and
 * neither updates itself, so **they have to be made true and kept true**: a precise count is a
 * representation to a buyer. Each is drawn only when its deck line is filled in.
 *
 * `public/paywall/face-{1..n}.webp`, drawn as backgrounds so a missing file is a plain circle.
 */
const FACES = 3;

const Mark = ({ children }: { children: JSX.Element | JSX.Element[] }) => (
  <Glyph size={19} box={24} stroke={1.9}>
    {children}
  </Glyph>
);

/**
 * What the money buys, above the prices: a reader decides what a plan is worth before they
 * read what one costs. Three and no more — the fourth line is what makes the first three read
 * as filler. Lucide's geometry, copied because the funnel is Preact and `lucide-react` is not.
 */
/** One per line of `paywall.pros`, in order. */
const ICONS: JSX.Element[] = [
  <Mark>
    <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
    <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
  </Mark>,
  <Mark>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="2" />
  </Mark>,
  <Mark>
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M12 18h.01" />
  </Mark>,
];

/** A month is 30 and not 30.44: the figure illustrates scale, and a buyer checking it will
 * divide by 30. */
const DAYS = { monthly: 30, yearly: 365 };

export function PaywallStep({
  plan,
  onSelect,
  onContinue,
}: {
  plan: Plan;
  onSelect: (plan: Plan) => void;
  onContinue: () => void;
}) {
  const { copy, market } = useLocale();
  const words = copy.paywall;
  const [quote, setQuote] = useState<PlanQuote>(planListQuote);
  const [lifetime, setLifetime] = useState(false);
  const price = (amount: number) => formatMoney(amount, quote.currency, market.numberLocale);
  const yearOfMonthly = quote.monthly * 12;
  const saving = Math.round((1 - quote.yearly / yearOfMonthly) * 100);

  // Usually already answered: `prewarm.ts` asks for this while the reader is still in the
  // survey, and `planQuote` hands both callers the one round trip.
  useEffect(() => {
    let cancelled = false;
    void planQuote().then((live) => {
      if (live && !cancelled) setQuote(live);
    });
    void lifetimeOffered().then((offered) => {
      if (!cancelled) setLifetime(offered);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Keeps the currency's own precision: three decimal-free days' worth would read as the
   * same number on two cards. */
  const perDay = (amount: number, days: number) => price(amount / days);
  const monthlyPerDay = perDay(quote.monthly, DAYS.monthly);

  return (
    <>
      {/* Ink marks: kraft is too faint on the canvas, and it belongs to Continue. */}
      <ul className="mb-4 flex flex-col gap-2.5 md:flex-row md:gap-8 md:self-center md:mb-8">
        {words.pros.map((line, index) => (
          <li key={line} className="flex items-center gap-3">
            <span className="shrink-0 text-ink">{ICONS[index]}</span>
            <span className="min-w-0 text-[15.5px] leading-[1.3] text-ink">{line}</span>
          </li>
        ))}
      </ul>

      {/* A list on a phone, a row to compare across once there is room for one. */}
      <div className={`flex flex-col gap-2.5 md:grid md:gap-3 ${lifetime ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <PlanCard
          label={words.monthly}
          price={price(quote.monthly)}
          term={words.perMonth}
          figure={monthlyPerDay}
          figureLabel={words.perDay}
          note={words.cancelAnytime}
          selected={plan === "monthly"}
          onSelect={() => onSelect("monthly")}
        />
        <PlanCard
          label={words.yearly}
          price={price(quote.yearly)}
          term={words.perYear}
          figure={perDay(quote.yearly, DAYS.yearly)}
          figureLabel={words.perDay}
          // Withheld if the yearly plan isn't actually cheaper — a struck figure lower than
          // the one beside it reads as a mistake, which in an oddly rounded currency it would be.
          wasFigure={saving > 0 ? monthlyPerDay : undefined}
          badge={
            saving > 0
              ? fill(words.save, {
                  percent: (saving / 100).toLocaleString(market.numberLocale, { style: "percent" }),
                })
              : undefined
          }
          note={words.billedYearly}
          selected={plan === "yearly"}
          onSelect={() => onSelect("yearly")}
        />
        {lifetime && (
          <PlanCard
            label={words.lifetime}
            // No `price`: the figure on the right *is* the price, and printing it on both sides
            // of one card reads as two numbers to compare.
            figure={price(quote.lifetime)}
            figureLabel={words.once}
            note={words.forever}
            tag={words.lifetimeLeft || undefined}
            selected={plan === "lifetime"}
            onSelect={() => onSelect("lifetime")}
          />
        )}
      </div>

      <Commit label={words.continue} proof={words.weekly} onContinue={onContinue}>
        <p className="text-center text-[14px] text-slate">{words.guarantee}</p>
      </Commit>

      <Reviews />
      <Faq />

      {/* The same action as the one above, not a second one: a reader who scrolled through the
          reviews and the questions should not have to scroll back up to act on them. */}
      <Commit label={words.continue} proof={words.weekly} onContinue={onContinue} className="mt-12" />

      {/* Last on the page, under everything a buyer reads before agreeing to it. */}
      <div className="mt-8 flex justify-center">
        <LegalNote />
      </div>
    </>
  );
}

/**
 * The one thing to press, with who else pressed it this week right under it. Set off from what
 * is above by more than the column's gap, and held to a button's width on a wide paywall.
 */
function Commit({
  label,
  proof,
  onContinue,
  className = "mt-6",
  children,
}: {
  label: string;
  proof: string;
  onContinue: () => void;
  /** The space above it: close under the plans, a section's worth after the questions. */
  className?: string;
  children?: ComponentChildren;
}) {
  return (
    <div className={`${className} flex w-full flex-col items-center gap-3 md:max-w-[420px] md:self-center`}>
      <button onClick={onContinue} className="btn">
        {label}
      </button>
      {proof && <p className="flex items-center justify-center gap-2.5">
        <span aria-hidden className="flex shrink-0 items-center">
          {Array.from({ length: FACES }, (_, index) => (
            <span
              key={index}
              style={{ backgroundImage: `url(/paywall/face-${index + 1}.webp)` }}
              className="-ml-2 size-7 rounded-full border-2 border-surface bg-track bg-cover bg-center first:ml-0"
            />
          ))}
        </span>
        {/* Slate rather than muted: these lines sit on the wash, where muted dips under 4.5:1. */}
        <span className="text-[13.5px] text-slate">{proof}</span>
      </p>}
      {children}
    </div>
  );
}

function PlanCard({
  label,
  price,
  term = "",
  figure,
  figureLabel,
  wasFigure,
  badge,
  note,
  tag,
  selected,
  onSelect,
}: {
  label: string;
  /** The recurring price, small, under the label. Omitted by the plan whose price is already
   * the big figure on the right. */
  price?: string;
  /** Spelled out by the caller: a card that derives this from the plan silently prints
   * "/ month" under anything it has not heard of. */
  term?: string;
  figure: string;
  figureLabel: string;
  /** The figure this one undercuts, struck through above it. */
  wasFigure?: string;
  badge?: string;
  note: string;
  /** Over the card's top edge. The scarcity line, on the one plan that has a cap. */
  tag?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const quiet = selected ? "text-on-ink-muted" : "text-muted";
  return (
    <button
      onClick={onSelect}
      data-selected={selected}
      aria-pressed={selected}
      className="choice choice--raised relative flex items-start justify-between gap-3 p-4 text-left"
    >
      {tag && <Tag text={tag} onInk={selected} className="absolute -top-2 right-4" />}

      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Radio selected={selected} />
          <span className="text-[17px] font-bold tracking-[-0.02em]">{label}</span>
          {badge && <Tag text={badge} onInk={selected} />}
        </span>
        {price && (
          <span className="mt-1.5 block">
            <span className="num text-[16px] font-medium">{price}</span>{" "}
            <span className={`text-[14px] ${quiet}`}>{term}</span>
          </span>
        )}
        <span className={`mt-1 block text-[13.5px] ${quiet}`}>{note}</span>
      </span>

      <span className="shrink-0 text-right">
        {wasFigure && <span className={`num block text-[13px] line-through ${quiet}`}>{wasFigure}</span>}
        <span className="num block text-[28px] font-semibold leading-none tracking-[-0.02em]">
          {figure}
        </span>
        <span className={`mt-1 block text-[11px] uppercase tracking-[0.08em] ${quiet}`}>
          {figureLabel}
        </span>
      </span>
    </button>
  );
}

/** `.tag`, ink on paper — or ink on amber once its card is the picked one and already ink. */
function Tag({ text, onInk, className = "" }: { text: string; onInk: boolean; className?: string }) {
  return <span className={`tag ${onInk ? "tag--on-ink" : ""} ${className}`}>{text}</span>;
}

/** A radio, not a tick: three plans where exactly one is chosen. Amber on the ink card. */
function Radio({ selected }: { selected: boolean }) {
  return (
    <svg
      aria-hidden
      width="20"
      height="20"
      viewBox="0 0 20 20"
      className={`shrink-0 ${selected ? "text-amber" : "text-chevron"}`}
    >
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      {selected && <circle cx="10" cy="10" r="4.5" fill="currentColor" />}
    </svg>
  );
}
