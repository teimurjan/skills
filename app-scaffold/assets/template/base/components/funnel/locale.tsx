import { createContext, type ComponentChild, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import type { Lang } from "@/lib/i18n";
import { MARKETS, type Market } from "@/lib/markets";
import type { FunnelCopy } from "./copy/types";

/**
 * Which language one page of the funnel is in, and everything that follows from it: the deck,
 * and the market that decides how its numbers are written.
 *
 * Provided once at the root — by the build from the deck it is rendering, and in the browser
 * from the same deck written into the page (`readPageLocale`) — so the first render is the
 * same render on both sides and hydration claims the markup as-is.
 */
export interface FunnelLocale {
  lang: Lang;
  copy: FunnelCopy;
  market: Market;
}

export function funnelLocale(lang: Lang, copy: FunnelCopy): FunnelLocale {
  return { lang, copy, market: MARKETS[lang] };
}

/** The element the build writes the deck into. */
export const COPY_ELEMENT_ID = "funnel-copy";

/** The page's own language and deck, as the build wrote them: `<html lang>` and a JSON script.
 * Null on a page the build did not write, which the entry treats as nothing to mount. */
export function readPageLocale(): FunnelLocale | null {
  const source = document.getElementById(COPY_ELEMENT_ID)?.textContent;
  if (!source) return null;
  return funnelLocale(document.documentElement.lang as Lang, JSON.parse(source) as FunnelCopy);
}

const LocaleContext = createContext<FunnelLocale | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: FunnelLocale;
  children: ComponentChildren;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): FunnelLocale {
  const locale = useContext(LocaleContext);
  if (!locale) throw new Error("useLocale must be used within a LocaleProvider");
  return locale;
}

/** `{name}` in a deck's string, filled in. A name with no value is left showing, so a typo
 * in a deck is visible on the page rather than silently blank. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** `fill`, for values that are markup — a figure set in mono inside a sentence whose word
 * order is the language's, not ours. */
export function fillNodes(
  template: string,
  values: Record<string, ComponentChild>,
): ComponentChild[] {
  return template
    .split(/\{(\w+)\}/g)
    .map((part, index) => (index % 2 === 1 && part in values ? values[part] : part));
}

/** `[bracketed]` spans in a deck's string, marked in the accent — or in amber on an ink card. */
export function Accented({ text, onInk = false }: { text: string; onInk?: boolean }) {
  const parts = text.split(/\[([^\]]+)\]/);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className={onInk ? "hl-on-ink" : "hl"}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
