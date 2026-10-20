/**
 * Writes the web funnel's shape and words into the iOS bundle (`ios/Appname/Resources/Funnel.json`),
 * so the app's first run asks what `/start` asks, in the same words, in every language.
 *
 * Generated rather than mirrored: `steps.ts` and `copy/<tag>.ts` stay the one source, and a
 * reworded question reaches the phone on the next run of this script. The steps stop at the
 * account step — the offer and the card are StoreKit's on the phone (`PaywallScreen.swift`),
 * which reads its words from the same decks.
 */
import { writeFileSync } from "node:fs";
import { FUNNEL_COPY } from "@/components/funnel/copy";
import { FUNNEL, SPINE } from "@/components/funnel/steps";
import { validateCopy } from "@/components/funnel/steps.validate";

const OUT = "ios/Appname/Resources/Funnel.json";

/** The step kinds `FunnelScreen.swift` has a view for. A kind added on the web fails here,
 * not as a funnel the app cannot decode on somebody's first launch. */
const IOS_KINDS = new Set(["question", "statement", "recap", "account"]);

/** The parts of a deck the phone reads. The rest is the web's own: its sign-in forms, the
 * biller's checkout, the page after it. A widget's section goes here when the app shows it. */
const SECTIONS = ["chrome", "questions", "steps", "recap", "paywall"] as const;

// `FUNNEL`'s order, not the web's: the app opens on the four-way question rather than the web's opener.
const accountIndex = FUNNEL.steps.findIndex((step) => step.kind === "account");
const steps = FUNNEL.steps.slice(0, accountIndex + 1);
const unknown = steps.filter((step) => !IOS_KINDS.has(step.kind));
if (unknown.length > 0) {
  throw new Error(
    `FunnelScreen.swift has no view for: ${unknown.map((step) => `${step.id} (${step.kind})`).join(", ")}`,
  );
}

const decks = Object.fromEntries(
  Object.entries(FUNNEL_COPY).map(([lang, copy]) => {
    validateCopy(lang, copy, SPINE);
    const shared = Object.fromEntries(SECTIONS.map((section) => [section, copy[section]]));
    const { signIn, haveAccount, fix } = copy.account;
    return [lang, { ...shared, account: { signIn, haveAccount, fix } }];
  }),
);

const funnel = {
  spine: {
    steps,
    surveyLength: accountIndex,
    followUp: SPINE.followUp,
    separator: SPINE.separator,
  },
  decks,
};

writeFileSync(OUT, `${JSON.stringify(funnel, null, 2)}\n`);
console.log(`Wrote ${OUT}: ${steps.length} steps, ${Object.keys(decks).length} decks`);
