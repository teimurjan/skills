// The one place the shipping locales are written down, in all three spellings they need:
// the app's BCP-47 tag, the region identifier `simctl` wants, and App Store Connect's locale
// code. They disagree often enough (`it` / `it_IT` / `it`, `nb` / `nb_NO` / `no`) that three
// lists kept by hand end up capturing or uploading the wrong language.
//
// `asc` values must all be members of FastlaneCore::Languages::ALL_LANGUAGES — deliver
// refuses to run when it meets a directory it cannot map to a language.
//
// This list, `InterfaceLanguage.supported` in the app and `LOCALES` in `lib/i18n.ts` are one
// set. Adding a market means: a row here, a tag in `InterfaceLanguage`, a full
// `Localizable.xcstrings` column, a site and funnel copy deck, `appstore/captions/<tag>.json`
// and `appstore/metadata/<asc>/` (`bun run metadata:check` enforces the last one).

import { readFileSync } from "node:fs";

/** Ordered by market priority, which is the order every report prints in. */
export const LOCALES = [
  { tag: "en", sim: "en_US", asc: "en-US" },
];

export const APP_TAGS = LOCALES.map((locale) => locale.tag);
export const ASC_LOCALES = LOCALES.map((locale) => locale.asc);

/** Throws rather than defaulting: a typo in `--locales=` should stop the run, not
 * quietly capture English and label it Russian. */
export function localeFor(tag) {
  const locale = LOCALES.find((entry) => entry.tag === tag);
  if (!locale) throw new Error(`Unknown locale "${tag}" — expected one of ${APP_TAGS.join(", ")}`);
  return locale;
}

/** Every locale that can be captured. A capture needs a caption file
 * (`appstore/captions/<tag>.json`) beside the translation, so add both in the same commit. */
export const SCREENSHOT_TAGS = APP_TAGS;

/** The locales the capture picker ticks by default: the markets worth the most. */
export const PRIORITY_TAGS = ["en"];

/** The locales the marketing site is written in, read out of `lib/i18n.ts`.
 *
 * The generator writes a committed WebP set to `public/screenshots/<asc>` for the site's
 * gallery, so a locale with no page would commit files nothing serves. Parsed rather than
 * repeated, because a copied list goes stale. */
export const SITE_TAGS = (() => {
  const source = readFileSync(new URL("../../../lib/i18n.ts", import.meta.url), "utf8");
  const match = source.match(/export const LOCALES = \[([^\]]*)\]/s);
  if (!match) throw new Error("No 'LOCALES' array in lib/i18n.ts");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
})();
