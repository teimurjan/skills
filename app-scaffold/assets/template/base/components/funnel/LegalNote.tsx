import { pathFor } from "@/lib/i18n";
import { useLocale } from "./locale";

/** Both pages live on the site, which is the host the funnel is served from, in the funnel's
 * own language. */
const LINK = "underline underline-offset-2 hover:text-ink";

/**
 * The two pages an account and a purchase both have to point at — the same line on the
 * account step and on the offer, because "continuing" covers an emailed code, an OAuth round
 * trip and a card alike.
 *
 * They open beside the funnel rather than over it: a reader who taps Terms three questions
 * from the price should come back to the price, not to a survey they have to find again.
 */
export function LegalNote() {
  const { copy, lang } = useLocale();
  return (
    <p className="flex items-center gap-4 text-center text-[12.5px] leading-[1.5] text-muted">
      <a href={pathFor(lang, "terms")} target="_blank" rel="noreferrer" className={LINK}>
        {copy.legal.terms}
      </a>{" "}
      <a href={pathFor(lang, "privacy")} target="_blank" rel="noreferrer" className={LINK}>
        {copy.legal.privacy}
      </a>
    </p>
  );
}
