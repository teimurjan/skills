import type { Lang } from "./i18n";

/**
 * How each market writes a number. Keyed on the whole tag: `pt-BR` and `pt-PT` write money
 * differently, so the language alone is not the market. Add a row with each locale.
 *
 * Pure and dependency-free, because the funnel bundle imports it: nothing here may read
 * `process.env`.
 */
export interface Market {
  /** Where the digits, the separators and the symbol's placement come from. */
  numberLocale: string;
}

export const MARKETS: Record<Lang, Market> = {
  en: { numberLocale: "en-US" },
};
