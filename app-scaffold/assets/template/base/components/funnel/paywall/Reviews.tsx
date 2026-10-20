import { useRef, useState } from "preact/hooks";
import { SectionTitle } from "../Headline";
import { fill, useLocale } from "../locale";

/**
 * Three customers in their own words: a swipeable row with dots on a phone, three across from
 * `md`. Snap-start with the next card peeking in, so the row says it scrolls without a hint.
 * The dots are ink, not accent — the button below is still the one thing to press. No faces:
 * the paywall's are anonymous, and a picture beside a name says it is that person.
 */
export function Reviews() {
  const { copy } = useLocale();
  const words = copy.reviews;
  const row = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (words.items.length === 0) return null;

  const label = (index: number) => fill(words.dot, { n: index + 1, count: words.items.length });

  function onScroll() {
    const element = row.current;
    if (!element) return;
    setActive(Math.min(words.items.length - 1, Math.round(element.scrollLeft / cardStep(element))));
  }

  function go(index: number) {
    const element = row.current;
    element?.scrollTo({ left: index * cardStep(element), behavior: "smooth" });
  }

  return (
    <section aria-roledescription="carousel" aria-label={words.title} className="mt-12 flex flex-col gap-4">
      <SectionTitle text={words.title} />

      {/* Full-bleed on a phone so cards slide off the screen's edge rather than the column's. */}
      <div
        ref={row}
        onScroll={onScroll}
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {words.items.map((review, index) => (
          <figure
            key={review.role}
            role="group"
            aria-roledescription="slide"
            aria-label={label(index)}
            className="card flex shrink-0 basis-[86%] snap-start flex-col gap-3 px-4 py-4"
          >
            <blockquote className="flex-1 text-[15px] leading-[1.45] text-ink">{review.quote}</blockquote>
            <figcaption>
              <span
                role="img"
                aria-label={fill(words.rating, { n: review.rating })}
                className="emoji mb-1.5 block text-[15px] leading-none tracking-[0.08em]"
              >
                {"⭐".repeat(Number(review.rating))}
              </span>
              <span className="block text-[14px] font-semibold text-ink">{review.name}</span>
              <span className="block text-[13px] text-muted">{review.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="flex justify-center md:hidden">
        {words.items.map((review, index) => (
          <button
            key={review.role}
            onClick={() => go(index)}
            aria-label={label(index)}
            aria-current={index === active}
            className="flex h-11 w-7 items-center justify-center"
          >
            <span
              className={`h-2 rounded-full transition-[width,background-color] ${index === active ? "w-5 bg-ink" : "w-2 bg-ink/20"}`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

/** Measured between two cards rather than off one, so the gap is in it. */
function cardStep(row: HTMLElement): number {
  const [first, second] = [row.children[0], row.children[1]] as (HTMLElement | undefined)[];
  return first && second ? second.offsetLeft - first.offsetLeft : row.clientWidth;
}
