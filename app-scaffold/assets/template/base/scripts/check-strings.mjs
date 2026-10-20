// Fails if any language the app claims to ship is missing, unfinished, or malformed.
//
// `InterfaceLanguage.supported` is a promise made to the operator: it is the list the
// language picker draws from, and iOS falls back key by key, so a language that is 95%
// translated does not look 95% translated — it looks like a Russian screen with three
// English rows in the middle of it, which reads as a bug rather than as a gap. This is
// what keeps that list honest.
//
// Run it after `bun run strings:sync`, which is what puts new keys in the catalog in the
// first place. Sync extracts; this one checks. (They were the same file for a while, which
// meant `check` silently rewrote the catalog and passed.)

import { readFileSync } from "node:fs";

const CATALOG = "ios/Appname/Resources/Localizable.xcstrings";
const LANGUAGE_SOURCE = "ios/Appname/Shared/Localization/InterfaceLanguage.swift";

/** The plural categories each language actually has, per CLDR.
 *
 * Russian is the reason this file exists. It has four — 1 файл, 2 файла,
 * 5 файлов, 1,5 файла — where English has two, so an English
 * `count == 1 ? "file" : "files"` cannot produce a correct Russian string no matter
 * what is typed into it. A catalog entry that varies by plural has to carry every
 * category the language uses, and `other` alone is what a half-done translation looks
 * like.
 *
 * Transcribed from ICU rather than remembered, and worth re-deriving rather than
 * extending by hand:
 *
 *     new Intl.PluralRules(tag).resolvedOptions().pluralCategories
 *
 * The row that surprises people is `many` on Spanish, French, Italian and Portuguese.
 * CLDR 42 gave those languages a category for the millions — the form behind "1 millón
 * de bobinas" — so a plural entry in them is three slots, not two, and Xcode's catalog
 * editor draws all three. With `%lld` printed as digits the form is the same as `other`,
 * which is the correct answer rather than a placeholder for one. */
const PLURAL_CATEGORIES = {
  en: ["one", "other"],
  es: ["one", "many", "other"],
  "es-MX": ["one", "many", "other"],
  fr: ["one", "many", "other"],
  de: ["one", "other"],
  "pt-BR": ["one", "many", "other"],
  "pt-PT": ["one", "many", "other"],
  it: ["one", "many", "other"],
  nl: ["one", "other"],
  sv: ["one", "other"],
  da: ["one", "other"],
  nb: ["one", "other"],
  fi: ["one", "other"],
  pl: ["one", "few", "many", "other"],
  cs: ["one", "few", "many", "other"],
  tr: ["one", "other"],
  ru: ["one", "few", "many", "other"],
  uk: ["one", "few", "many", "other"],
};

/** Read the shipping languages out of the Swift rather than repeating them here. Two
 * lists that have to agree is one list that eventually does not. */
function supportedLanguages() {
  const source = readFileSync(LANGUAGE_SOURCE, "utf8");
  const match = source.match(/static let supported = \[([^\]]*)\]/s);
  if (!match) throw new Error(`No 'supported' array in ${LANGUAGE_SOURCE}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

/** Every format specifier in a string, normalised so `%1$@ %2$@` and `%@ %@` compare
 * equal. A translation that drops one shows a placeholder to the operator; a translation
 * that turns `%lld` into `%@` reads memory as a pointer, which is worse than either. */
function specifiers(value) {
  return [...value.matchAll(/%(\d+\$)?([@a-zA-Z]+)/g)]
    .map((match) => match[2])
    .sort();
}

const problems = [];
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const source = catalog.sourceLanguage;
const languages = supportedLanguages();

if (!languages.includes(source)) {
  problems.push(`${source} is the catalog's source language but is not in InterfaceLanguage.supported`);
}

/** Walk one localisation, which is either a single unit or a set of plural variations. */
function unitsOf(localisation) {
  if (localisation.stringUnit) return [["", localisation.stringUnit]];
  const plural = localisation.variations?.plural;
  if (!plural) return [];
  return Object.entries(plural).map(([category, entry]) => [category, entry.stringUnit]);
}

for (const [key, entry] of Object.entries(catalog.strings)) {
  if (entry.extractionState === "stale") {
    problems.push(`${JSON.stringify(key)}: stale — no longer in the source, delete it`);
    continue;
  }
  // `shouldTranslate: false` is the catalog's own way of saying a key is a token, not
  // copy. Nothing uses it yet; honouring it here means adding one later needs no change.
  if (entry.shouldTranslate === false) continue;

  const sourceValue = entry.localizations?.[source]?.stringUnit?.value ?? key;
  const wanted = specifiers(sourceValue);

  for (const language of languages) {
    if (language === source) continue;

    const localisation = entry.localizations?.[language];
    if (!localisation) {
      problems.push(`${JSON.stringify(key)}: no ${language} translation`);
      continue;
    }

    const units = unitsOf(localisation);
    if (units.length === 0) {
      problems.push(`${JSON.stringify(key)}: ${language} has neither a value nor plural variations`);
      continue;
    }

    // A plural entry has to carry every category the language uses. `other` on its own is
    // what a translation looks like when somebody filled in the English shape and stopped.
    if (units.length > 1) {
      const categories = units.map(([category]) => category);
      const missing = (PLURAL_CATEGORIES[language] ?? ["other"]).filter((c) => !categories.includes(c));
      if (missing.length) {
        problems.push(`${JSON.stringify(key)}: ${language} plural is missing ${missing.join(", ")}`);
      }
    }

    for (const [category, unit] of units) {
      const where = category ? `${language}/${category}` : language;
      if (!unit?.value?.trim()) {
        problems.push(`${JSON.stringify(key)}: ${where} is empty`);
        continue;
      }
      if (unit.state === "new" || unit.state === "needs_review") {
        problems.push(`${JSON.stringify(key)}: ${where} is marked "${unit.state}"`);
      }
      const got = specifiers(unit.value);
      if (got.join(",") !== wanted.join(",")) {
        problems.push(
          `${JSON.stringify(key)}: ${where} has [${got.join(", ")}] where the source has `
            + `[${wanted.join(", ")}] — a dropped or retyped specifier prints garbage`,
        );
      }
    }
  }
}

const keys = Object.keys(catalog.strings).length;
if (problems.length) {
  console.error(`${problems.length} problem(s) across ${keys} keys:\n`);
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
console.log(`${keys} keys × ${languages.join(", ")} — complete.`);
