/**
 * Amplitude — the web half of product analytics.
 *
 * Deliberately the same shape as `ios/Appname/Services/Analytics/`: one typed union
 * of every event the site can emit, and one place that maps it onto the SDK, so call sites
 * stay free of stringly-typed names and the funnel is auditable in a single file.
 *
 * One Amplitude project serves the iOS app and this site, so **every name here carries the
 * `appname_web_` prefix** where iOS carries `appname_`. The prefix is applied
 * once, in `track`, so a new case cannot forget it. Where a concept exists on both surfaces
 * the unprefixed name is identical — the web funnel and the app's onboarding are the same
 * funnel measured against the same ads, and a chart comparing them should not have to
 * translate.
 *
 * Not to be confused with `lib/metaPixel.ts`, which is an ad-optimization signal pipe. Meta
 * gets told what to bid on; Amplitude is where the funnel is read.
 *
 * Nothing here records the content of what a user creates. That would contradict `/privacy`
 * and the App Privacy label, exactly as it would on iOS.
 */
import * as amplitude from "@amplitude/analytics-browser";
import type { InAppBrowser } from "./inAppBrowser";

export const AMPLITUDE_API_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY ?? "";

/** Inert until configured, the same shape as `isMetaPixelConfigured` and the biller's own
 * gate. A dev machine or a preview deploy therefore never has to be
 * filtered out of the numbers by hand. */
export const isAmplitudeConfigured = Boolean(AMPLITUDE_API_KEY);

const PREFIX = "appname_web_";

/** Stamped on every event, autocapture included, so production is separable from preview
 * and local. Mirrors `EnvironmentTagPlugin` on iOS. */
const ENVIRONMENT =
  process.env.NEXT_PUBLIC_VERCEL_ENV ??
  (process.env.NODE_ENV === "production" ? "production" : "development");

/** The doors the account step offers. `email_code` is the passwordless path, `email` the one
 * that set a password; the OAuth providers name themselves. A list rather than a bare union
 * so a value read back out of storage can be checked against it. */
export const SIGN_IN_PROVIDERS = ["facebook", "apple", "google", "email", "email_code"] as const;
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

/**
 * Every event the site emits. `name` is the wire name minus the prefix; every other field
 * is an event property, so adding a property is adding a field and nothing else.
 */
export type AnalyticsEvent =
  | { name: "page_viewed"; path: string }
  | { name: "landing_cta_clicked"; location: string }
  | { name: "app_store_clicked"; location: string }
  /** First view of step 0 — the top of the funnel, and the denominator for everything
   * below. Overcounts against ad clicks, because Instagram prefetches the destination.
   * `shell_ready_ms` is how long the prerendered first screen stood alone before the bundle
   * caught up, present only when the shell reports the start itself. */
  | { name: "funnel_started"; shell_ready_ms?: number }
  /** The tab went away while step 0 was still unanswered. `seen_ms` is on the same clock as a
   * live answer's `elapsed_ms`, so a mis-tap that left at once and a reader who read the
   * question and left anyway sit apart on one histogram. Fires once per load; a reader who
   * comes back and answers still reaches step 1. */
  | { name: "first_screen_left"; seen_ms: number }
  /** Named as iOS names it (`onboarding_page_viewed`), because it is the same step. `step`
   * is the step's stable id, unlike `index`, so a chart keeps meaning when a step moves. */
  | { name: "onboarding_page_viewed"; index: number; kind: string; step?: string }
  /** `source` distinguishes an answer tapped on the prerendered first screen before the
   * bundle arrived (`static`) from one tapped in the live shell (`live`). `elapsed_ms` is
   * how long after navigation a live tap landed: a reader takes seconds over the first
   * screen, and a crawler that slips past `isAutomated` answers it in well under one. */
  | {
      name: "onboarding_question_answered";
      question: string;
      answer: string;
      source?: "static" | "live";
      elapsed_ms?: number;
    }
  /** The plan reveal: post-quiz commitment, before the price. Meta's `Lead`. */
  | { name: "plan_viewed" }
  /** The reader committed to a door — asked for a code, submitted a password, or left for an
   * OAuth round trip. Against `sign_in_succeeded` it separates a step nobody tried from one
   * that turned people away, which the success event alone cannot: wave 1's third day read
   * "0 of 3" either way. */
  | { name: "sign_in_attempted"; provider: SignInProvider }
  /** `reason` is GoTrue's own error code — `otp_expired`, `over_email_send_rate_limit`,
   * `invalid_credentials` — or `link_failed` for a round trip that came back on
   * `?auth_error=1`. That last one names no provider of its own; `unknown` is what is left
   * when the tab that started it is not the tab it landed in. */
  | { name: "sign_in_failed"; provider: SignInProvider | "unknown"; reason: string }
  /** Gained an identity inside the funnel — not someone who arrived already signed in. */
  | { name: "sign_in_succeeded"; provider: SignInProvider }
  /** The account step was rendered inside one of Meta's in-app browsers, where Google's
   * button is withheld. The share of paid traffic that is in one at all reads off the
   * `in_app_browser` user property, which is on every event from the first screen. */
  | { name: "embedded_browser_detected"; app: InAppBrowser }
  | { name: "checkout_started"; plan: string }
  /** fbevents.js never arrived — a blocked tracker. Worth counting rather than shrugging
   * at: this share is how much of Meta's browser-side view is missing, and therefore how
   * much weight the CAPI half is carrying. Understates itself, since a blocker that stops
   * Meta often stops Amplitude too. */
  | { name: "meta_pixel_blocked"; buffered: number }
  | {
      name: "purchase_completed";
      plan: string;
      /** What the biller actually charged, in the buyer's own currency — not the list price. */
      value: number;
      currency: string;
      /** The same uuid the Meta browser and CAPI events dedupe on, so one conversion can
       * be followed across Amplitude, the Pixel and the biller. */
      transaction_id: string;
    };

/** Which web surface is talking: the marketing site, the funnel, or the app on the `app.`
 * host. Read off the `data-surface` `Document` stamps on `<body>`, so the funnel — whose
 * static build has no surface to declare — reports as the site it is served under. */
const surface = (): string => {
  if (typeof document === "undefined") return "site";
  return document.body?.dataset.surface ?? "site";
};

/**
 * Stamps `environment`, `platform` and `surface` on everything on its way out — including
 * the SDK's own autocapture, which never passes through `track` and so cannot carry the
 * name prefix. Without this those events are the one part of a shared project that cannot
 * be told apart from the app's, and the web app's events could not be told from the
 * funnel's.
 */
const environmentTag: amplitude.Types.EnrichmentPlugin = {
  name: "appname-web-environment-tag",
  type: "enrichment",
  setup: async () => undefined,
  execute: async (event) => ({
    ...event,
    event_properties: { ...event.event_properties, environment: ENVIRONMENT, platform: "web", surface: surface() },
  }),
};

let started = false;
/** Set once for a visitor that turned out to be a machine; every call below is then a no-op. */
let suppressed = false;

/**
 * Meta reviews an ad's landing page from its own data centres with a headless browser that
 * runs the page: on wave 1's first day every ad — including the three Meta itself reported
 * no clicks for — collected four `funnel_started`s and a tap on each of the first screen's
 * four options from Forest City, Prineville, Luleå and Clonee. Amplitude's own bot list
 * only knows the crawlers that name themselves, so the ones that do are matched here.
 * Meta's reviewer does not name itself and carries no automation flag, so it is excluded
 * in Amplitude by its network instead — see "Meta ad-review crawler" in CAMPAIGNS.md.
 */
const isAutomated = (): boolean =>
  navigator.webdriver === true ||
  /facebookexternalhit|meta-external|facebookcatalog|headlesschrome|crawler/i.test(
    navigator.userAgent,
  );

/**
 * Start the SDK. Safe to call more than once; a no-op without a key, so nothing else needs
 * a guard.
 *
 * `pageViews` autocapture is off: it emits an unprefixed name into a project shared with
 * the app, and it misses App Router client navigations anyway — `page_viewed` above is the
 * same thing under our own prefix. Attribution capture stays on, since putting utm and
 * referrer on the user is the whole point of a paid funnel.
 */
export function initAnalytics(): void {
  if (started || !isAmplitudeConfigured || typeof window === "undefined") return;
  started = true;
  if (isAutomated()) {
    suppressed = true;
    return;
  }
  amplitude.add(environmentTag);
  amplitude.init(AMPLITUDE_API_KEY, undefined, {
    autocapture: {
      attribution: true,
      sessions: true,
      pageViews: false,
      formInteractions: false,
      fileDownloads: false,
      elementInteractions: false,
    },
  });
}

/**
 * `insertId` is for an event that can be observed more than once but happened once — a
 * registration seen from two tabs. Amplitude keeps the first event under an id and drops
 * the rest for seven days, wherever they came from; the same job `notificationUUID` and the
 * biller's event id do for the webhooks.
 */
export function track(event: AnalyticsEvent, options?: { insertId: string }): void {
  if (!isAmplitudeConfigured || suppressed) return;
  const { name, ...properties } = event;
  amplitude.track(`${PREFIX}${name}`, properties, options && { insert_id: options.insertId });
}

/**
 * For an event fired as the tab is hidden. The batch waits a second and the default fetch is
 * cancelled with the page, so this one goes out at once over `sendBeacon`, which outlives it;
 * the transport is put back for a reader who returns.
 */
export function trackOnExit(event: AnalyticsEvent): void {
  if (!isAmplitudeConfigured || suppressed) return;
  amplitude.setTransport("beacon");
  track(event);
  void amplitude.flush().promise.finally(() => amplitude.setTransport("fetch"));
}

/**
 * Tie events to the Supabase user id — the same id `Analytics.identify` passes on iOS,
 * which is what makes a web subscriber and the phone they install it on one Amplitude user
 * rather than two, and the only reason a web purchase can be followed into app usage.
 */
export function identify(userId: string): void {
  if (!isAmplitudeConfigured || suppressed) return;
  amplitude.setUserId(userId);
}

/**
 * Funnel answers and the ad that paid for the visit, as user properties. Written under the
 * same keys iOS writes (`pursuit`, `blocker`) and so deliberately *not* prefixed: they
 * describe the person, not the platform. Putting the ad here as well as on the purchase is
 * what makes every step of the funnel readable per creative, not just the conversion.
 */
export function setUserProperties(properties: Record<string, string>): void {
  if (!isAmplitudeConfigured || suppressed || !Object.keys(properties).length) return;
  const identity = new amplitude.Identify();
  for (const [key, value] of Object.entries(properties)) identity.set(key, value);
  amplitude.identify(identity);
}
