import { SectionTitle } from "../Headline";
import { Glyph } from "../icons";
import { useLocale } from "../locale";

/**
 * The questions a buyer asks before paying, each answered with a fact the site already states.
 * Native `<details>`: it opens with no state and no script, from a keyboard, and reads right to a
 * screen reader.
 */
export function Faq() {
  const { copy } = useLocale();
  const words = copy.faq;

  return (
    <section className="mt-12 flex flex-col gap-4">
      <SectionTitle text={words.title} />
      <div className="card divide-y divide-divider">
        {words.items.map(({ question, answer }) => (
          <details key={question} className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[15px] font-medium leading-[1.35] text-ink [&::-webkit-details-marker]:hidden">
              {question}
              <span className="shrink-0 text-muted transition-transform group-open:rotate-180">
                <Glyph size={18} box={24} stroke={2}>
                  <path d="m6 9 6 6 6-6" />
                </Glyph>
              </span>
            </summary>
            <p className="px-4 pb-3.5 text-[14px] leading-[1.5] text-muted">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
