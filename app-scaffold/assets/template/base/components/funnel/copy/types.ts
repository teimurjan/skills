import type { en } from "./en";

/** A deck with the English deck's keys, all the way down, and a string at every leaf. */
type Words<T> = T extends string ? string : { [K in keyof T]: Words<T[K]> };

/**
 * Every word the funnel says, in one language.
 *
 * The English deck is the shape: another deck is checked against it key for key, so a line
 * added in English and forgotten in Polish is a type error rather than a blank row in Warsaw.
 * What a type cannot see — an option value a deck has no title for — `validateCopy` catches
 * at build time.
 *
 * Plain strings only, so a deck can be written into the page as JSON (`scripts/build-funnel.tsx`)
 * and the bundle carries no language at all. `{name}` marks a value filled in at render
 * (`fill` in `../locale.tsx`) and `[brackets]` the span a headline puts in the accent.
 */
export type FunnelCopy = Words<typeof en>;
