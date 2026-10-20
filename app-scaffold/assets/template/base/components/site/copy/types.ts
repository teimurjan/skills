import type { ReactNode } from "react";

/**
 * The shape every copy deck fills in.
 *
 * One structure, every language — rather than sets of pages that happen to look alike.
 * The site already learned this lesson in `components/funnel/steps.ts`: when a headline
 * and its translation live in two files that each own their own layout, a change lands in
 * one and the pages quietly stop being the same page.
 *
 * Long-form prose is a `ReactNode` rather than a string. The legal pages carry links and
 * emphasis, and the alternatives are worse: HTML in a string needs
 * `dangerouslySetInnerHTML`, and a markdown dependency is a parser shipped to render six
 * static pages.
 */

export interface Meta {
  title: string;
  description: string;
}

export interface NavCopy {
  pricing: string;
  support: string;
  privacy: string;
  terms: string;
  refund: string;
  /** The label the switcher's links are read out as. The links themselves are named in
   * `LOCALE_NAMES`, each in its own language — a name that belongs to the language rather
   * than to the deck of the page it happens to be on. */
  switchLabel: string;
  /** The header's button into the funnel. */
  start: string;
}

export interface Shot {
  src: string;
  alt: string;
}

export interface HomeCopy {
  meta: Meta;
  headline: ReactNode;
  sub: string;
  /** The hero's link into the funnel, beside the App Store badge. */
  webCta: string;
  shots: Shot[];
  shotsHeading: string;
  painsHeading: string;
  pains: { kicker: string; title: string; body: string }[];
  howHeading: string;
  howSub: string;
  steps: { n: string; title: string; body: string }[];
  plan: {
    eyebrow: string;
    pitch: string;
    monthly: string;
    yearly: string;
    lifetime: string;
    cta: string;
    appNote: string;
  };
  /** The words that close the page. The button belongs to the plan card directly
   * beneath them — one accent, spent once. */
  closer: { heading: string; body: string };
}

export interface PricingCopy {
  meta: Meta;
  eyebrow: string;
  heading: string;
  intro: string;
  web: {
    eyebrow: string;
    perMonth: string;
    /** The other two ways to pay, on one line under the monthly figure. */
    orOthers: (yearly: string, lifetime: string) => string;
    cta: string;
    note: string;
  };
  app: { eyebrow: string; headline: string; sub: string; note: string };
  body: ReactNode;
}

export interface ProsePageCopy {
  meta: Meta;
  eyebrow: string;
  heading: string;
  /** Legal pages only. Written out per language, because "31 August 2026" and
   * "31 августа 2026" are not the same string and neither is a date format. */
  updated?: string;
  updatedLabel?: string;
  intro?: ReactNode;
  body: ReactNode;
}

export interface SiteCopy {
  nav: NavCopy;
  home: HomeCopy;
  pricing: PricingCopy;
  support: ProsePageCopy;
  privacy: ProsePageCopy;
  terms: ProsePageCopy;
  refund: ProsePageCopy;
}
