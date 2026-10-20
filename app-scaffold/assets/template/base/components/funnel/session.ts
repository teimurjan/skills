import { useCallback, useEffect, useState } from "preact/hooks";
import { SIGN_IN_PROVIDERS, setUserProperties, track, type SignInProvider } from "@/lib/analytics";
import { inAppBrowser } from "@/lib/inAppBrowser";
import { goto, normalizeLocation, readLocation } from "./location";
import type { Lang } from "@/lib/i18n";
import { OPENER_ID, WEB_FUNNEL, type FunnelAnswers } from "./steps";

/**
 * What the funnel has collected, across a page load — the account step ends in one, so
 * without this the answers and the ad that paid for the visit are gone by the time checkout
 * stamps the biller's metadata. `sessionStorage`, not `localStorage`: a funnel abandoned in March must
 * not stamp its ad id onto a purchase in June.
 */

/** Read by name rather than by sweeping the query string: the URL is whatever a stranger
 * pastes, and everything read here lands on the biller's record of the purchase. */
const ATTRIBUTION_KEYS = ["ad", "adset", "campaign"] as const;

export type Attribution = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>>;

/** Room over `{{campaign.id}}`'s seventeen digits, short enough that a hand-edited URL
 * cannot fill the transaction record. */
const MAX_VALUE_LENGTH = 64;

const ANSWERS_KEY = "appname.funnel.answers";
const ATTRIBUTION_KEY = "appname.funnel.attribution";
const REGISTERED_KEY = "appname.funnel.registered";
const ATTEMPT_KEY = "appname.funnel.attempt";
const DISCOUNT_KEY = "appname.funnel.discount";
const CLICK_KEY = "appname.funnel.click";
const PURCHASE_KEY = "appname.funnel.purchase";

/** The shape the checkout reminder mints. Anything else in `?discount=` is ignored. */
const DISCOUNT_CODE = /^[A-Z0-9]{4,32}$/;

/** A param that is present wins (two ads in one tab is last-click); one that is absent leaves
 * the stored value alone — the return from `/auth/callback` carries no query at all. */
export function captureAttribution(): Attribution {
  const stored = read(ATTRIBUTION_KEY);
  const params = new URLSearchParams(window.location.search);

  const merged: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = accepted(params.get(key)) ?? accepted(stored[key]);
    if (value) merged[key] = value;
  }

  // Organic traffic writes nothing rather than an empty record.
  if (Object.keys(merged).length) write(ATTRIBUTION_KEY, merged);
  return merged;
}

/** The reminder email's code, for a biller whose checkout applies it in the browser. Kept
 * because the account step's sign-in round trip comes back with no query string, and the card
 * field is on the far side of it. */
export function captureDiscount(): void {
  const code = new URLSearchParams(window.location.search).get("discount");
  if (code && DISCOUNT_CODE.test(code)) write(DISCOUNT_KEY, { code });
}

export const readDiscount = (): string | undefined => read(DISCOUNT_KEY).code;

/** What `/start/done` needs to report the conversion, for a biller that tells the page only by
 * redirecting there: the checkout writes this down and the success page reads it back. */
export interface PendingPurchase {
  /** The uuid the server's CAPI event carries too, so Meta collapses the pair. */
  eventId: string;
  plan: string;
  value: number;
  currency: string;
}

/** Overwritten on every breakdown, so the last one before the redirect, tax included, lands. */
export function rememberPurchase(purchase: PendingPurchase): void {
  try {
    window.sessionStorage.setItem(PURCHASE_KEY, JSON.stringify(purchase));
  } catch {
    /* The server's CAPI event still reports the purchase. */
  }
}

/** Read once and cleared, so reloading the success page cannot report a second conversion. */
export function takePurchase(): PendingPurchase | null {
  try {
    const raw = window.sessionStorage.getItem(PURCHASE_KEY);
    window.sessionStorage.removeItem(PURCHASE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isPendingPurchase(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const isPendingPurchase = (value: unknown): value is PendingPurchase => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.eventId === "string" &&
    typeof record.plan === "string" &&
    typeof record.value === "number" &&
    typeof record.currency === "string"
  );
};

/** What Meta appends to an ad's link. Bounded so a hand-edited URL cannot fill the transaction. */
const FBCLID = /^[\w-]{1,500}$/;

/**
 * The ad click as Meta's `fbc` (`fb.1.<first seen, ms>.<fbclid>`), built from the landing URL.
 * The Pixel writes the same value to `_fbc`, but a browser that blocks the Pixel never gets the
 * cookie, and without it the server Purchase cannot be tied to the ad. A new click replaces the
 * old one; the same click keeps the time it was first seen, as Meta asks.
 */
export function captureClickId(): void {
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbclid || !FBCLID.test(fbclid) || read(CLICK_KEY).fbclid === fbclid) return;
  write(CLICK_KEY, { fbclid, fbc: `fb.1.${Date.now()}.${fbclid}` });
}

export const readClickId = (): string | undefined => read(CLICK_KEY).fbc;

export const readAnswers = (): FunnelAnswers => read(ANSWERS_KEY);

export const storeAnswers = (answers: FunnelAnswers): void => write(ANSWERS_KEY, answers);

/**
 * Whether this browser has yet to report `userId`, claiming it on the way out.
 * **`localStorage`, the one exception above**: the account step can be open in two tabs — the
 * one that asked for the code and the one the emailed link opened — and both watch the same
 * session land. A uid rather than a flag, so a later second account still registers.
 */
export function claimRegistration(userId: string): boolean {
  try {
    if (window.localStorage.getItem(REGISTERED_KEY) === userId) return false;
    window.localStorage.setItem(REGISTERED_KEY, userId);
    return true;
  } catch {
    return true;
  }
}

/** The door the reader left through. Only a failure needs it — a session that lands names its
 * provider on `app_metadata`, but `auth_error=1` names nothing. Taken, not read. */
export const storeAttempt = (provider: SignInProvider): void => write(ATTEMPT_KEY, { provider });

export function takeAttempt(): SignInProvider | null {
  const { provider } = read(ATTEMPT_KEY);
  try {
    window.sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    /* Nothing stored, nothing to forget. */
  }
  return isSignInProvider(provider) ? provider : null;
}

const isSignInProvider = (value: string | undefined): value is SignInProvider =>
  (SIGN_IN_PROVIDERS as readonly string[]).includes(value ?? "");

const accepted = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= MAX_VALUE_LENGTH ? trimmed : undefined;
};

/** Storage can be disabled or over quota. A funnel that throws on its way to checkout is
 * worse than one that forgets which ad sent it. */
function read(key: string): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isStringRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function write(key: string, value: Record<string, string>): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The state held in memory is still right for this page load. */
  }
}

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

/** How long the tick on a chosen option is visible before the step moves. */
const ADVANCE_MS = 180;

/**
 * What the reader has said, and which ad paid for the visit. **Both start empty and are filled
 * only in the boot effect**: `hydrate()` does not re-check attributes on existing nodes and
 * `QuestionCard` writes `data-selected` off these, so seeding from storage during the first
 * render leaves a returning reader looking at a tick the prerendered HTML did not draw.
 *
 * Call after `useFunnelLocation` and before the shell's step tracking.
 */
export function useFunnelSession({
  index,
  lang,
  onStaticAnswer,
}: {
  index: number;
  /** Reported beside the opener, so a chart can split the funnel by the page's language. */
  lang: Lang;
  /** Fires when a pre-hydration tap carried its answer in the hash. The shell uses it to mark
   * step 0 seen, or the fastest readers report the top of the funnel twice. */
  onStaticAnswer: () => void;
}): { answers: FunnelAnswers; attribution: Attribution; pick: (value: string) => void } {
  const [answers, setAnswers] = useState<FunnelAnswers>({});
  const [attribution, setAttribution] = useState<Attribution>({});

  /** One effect and one ordered sequence: what an earlier page load collected, the ad that
   * paid for the visit, and whatever the prerendered first screen recorded in the hash.
   * `onStaticAnswer` is deliberately out of the deps — a re-render must not
   * capture the attribution or the user properties twice. */
  useEffect(() => {
    const stored = readAnswers();
    const { index: carriedIndex, answer } = readLocation();
    const merged = answer ? { ...stored, [answer.key]: answer.value } : stored;
    setAnswers(merged);
    if (answer) {
      storeAnswers(merged);
      onStaticAnswer();
      reportAnswer(answer.key, answer.value, "static");
    }
    // Leave the URL in the shell's own format, so a Back into this step doesn't re-apply an
    // answer the reader may since have changed.
    if (answer || new URLSearchParams(window.location.search).has("step")) {
      normalizeLocation(carriedIndex);
    }
    const captured = captureAttribution();
    setAttribution(captured);
    captureDiscount();
    captureClickId();
    setUserProperties({
      ...captured,
      funnel_variant: WEB_FUNNEL.id,
      opener: OPENER_ID,
      funnel_language: lang,
      in_app_browser: inAppBrowser(navigator.userAgent) ?? "none",
    });
  }, []);

  const pick = useCallback(
    (value: string) => {
      // The shape, not the worded step: an opener shares the problem question's key and is
      // single-answer too, so the key and `multi` are the same whichever first screen it was.
      const question = WEB_FUNNEL.steps[index].question;
      if (!question) return;
      const next = { ...answers, [question.key]: value };
      setAnswers(next);
      storeAnswers(next);
      reportAnswer(question.key, value, "live", Math.round(performance.now()));
      // Selecting an answer *is* the continue: an extra tap per question is another chance to
      // drop out. A question that takes several answers cannot, so it keeps the footer button.
      // `goto`, not the shell's `advance`: this path has never had that one's end-of-funnel guard.
      if (question.multi) return;
      setTimeout(() => goto(index + 1), ADVANCE_MS);
    },
    [answers, index],
  );

  return { answers, attribution, pick };
}

/** Amplitude, and the user property under the same key the answer is stored and billed under.
 * `elapsedMs` is for a live tap only: a static one was made before this code existed. */
function reportAnswer(
  key: string,
  value: string,
  source: "static" | "live",
  elapsedMs?: number,
): void {
  track({
    name: "onboarding_question_answered",
    question: key,
    answer: value,
    source,
    elapsed_ms: elapsedMs,
  });
  setUserProperties({ [key]: value });
}
