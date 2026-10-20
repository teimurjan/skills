import "server-only";
import { logFields } from "./log";

/**
 * Amplitude — the server half of product analytics, beside `lib/analytics.ts` (browser)
 * and `Services/Analytics/` in the app.
 *
 * It exists for the events no client of ours is present for. A subscription is cancelled
 * in iOS Settings or in the web biller's customer portal, and it lapses on a date nobody opens the
 * app on, so the biller's webhook is the only thing that ever learns about either. Every
 * other event in this product is emitted by the surface the person was looking at.
 *
 * Names carry `appname_server_` where the web carries `appname_web_` and the
 * app `appname_`, so the three surfaces stay separable in one project — and because
 * `user_id` is the Supabase uid on all three, a cancellation lands on the same Amplitude
 * user as the `purchase_completed` that preceded it, whichever surface sold it. That is
 * what makes "bought, then cancelled before we charged them" one funnel.
 *
 * Nothing here records lesson or topic *content*, exactly as on the other two surfaces.
 */

/** Deliberately the same variable the browser half reads. An Amplitude write key *is* the
 * project key, and the whole point of these events is that they land on the user the
 * purchase landed on — two variables could drift to two projects, and the symptom would be
 * a funnel that silently never joins. Reading a `NEXT_PUBLIC_` value on the server is not a
 * leak: it is already public by construction. */
const API_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY ?? "";

/** Inert until configured, the same shape as `isMetaConfigured` and the biller's own gate,
 * so a dev machine or a preview deploy never has to be filtered out of the numbers. */
export const isServerAnalyticsConfigured = Boolean(API_KEY);

const PREFIX = "appname_server_";

const ENDPOINT = "https://api2.amplitude.com/2/httpapi";

/** Stamped on every event beside `platform`, mirroring the browser's enrichment plugin and
 * `EnvironmentTagPlugin` on iOS. `VERCEL_ENV`, not its `NEXT_PUBLIC_` twin — this half
 * never runs in a browser. */
const ENVIRONMENT =
  process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development");

/** What every subscription lifecycle event carries, whichever biller sent it. Uniform on
 * purpose: one chart should be able to read Apple and web churn side by side and split
 * them on `provider` rather than on which properties happen to exist. */
interface SubscriptionProperties {
  provider: "app_store" | "dodo" | "paddle";
  /** Whether the period being given up is a free trial. The headline property: it is what
   * separates someone cancelling before we ever charged them from someone leaving a
   * subscription they paid for. Structurally false on the web, which sells no trial. */
  in_trial: boolean;
  /** Apple's product id, or the web biller's product or price id. Raw rather than mapped to a plan name:
   * both already encode the term, and only one of the two has a mapper. */
  product_id: string;
  /** When access actually ends. Null for a grant with no expiry left to honour. */
  expires_at: string | null;
  /** The *biller's* environment — "Sandbox"/"Production" from StoreKit, "sandbox"/
   * "production" from the web biller. Named as iOS names it on `purchase_completed`, and
   * deliberately not `environment`, which above means the deployment. */
  transaction_environment: string;
}

/**
 * Every event the server emits. Same shape as `AnalyticsEvent` on the other two surfaces:
 * `name` is the wire name minus the prefix, and every other field is an event property.
 */
export type ServerAnalyticsEvent =
  /** Auto-renew turned off, or a cancellation scheduled. The *gesture* — access usually
   * continues to the end of the paid period, so this is intent, not departure. */
  | ({ name: "subscription_cancel_requested" } & SubscriptionProperties)
  /** Turned back on before it took effect. The denominator that keeps the event above from
   * reading as churn it isn't. */
  | ({ name: "subscription_cancel_reverted" } & SubscriptionProperties)
  /** Access actually ended. `reason` is what separates someone leaving from a card that
   * failed — "voluntary", "billing_retry", "refund", "canceled", … */
  | ({ name: "subscription_ended"; reason: string } & SubscriptionProperties);

/** Who the event is about, and which biller message produced it. */
export interface ServerAnalyticsContext {
  /** The Supabase uid — the same id `identify` sets on web and iOS, and the only reason
   * this event can join the purchase that preceded it. */
  userId: string;
  /** What makes this event one event. Amplitude drops a repeat of an `insert_id` it has
   * seen in the last 7 days, and both webhooks have their own way of arriving twice:
   * either is retried on a non-2xx, and a web biller may also re-report a standing
   * scheduled cancellation on every unrelated `subscription.updated`. So each caller
   * passes whichever key its duplicates share — the biller's message id where redelivery
   * is the only risk, the state being reported where it isn't. Getting this wrong
   * double-counts churn, which is the one number this file exists to produce. */
  dedupeKey: string;
  /** The biller's timestamp, so a notification redelivered an hour later still lands at
   * the moment the person actually cancelled. */
  occurredAt: string;
}

/**
 * Send one event to Amplitude's HTTP V2 API.
 *
 * Best-effort, exactly like `sendMetaPurchase`: a failure here costs one row in a chart,
 * while a thrown error or a non-2xx would have the biller redeliver an entitlement event
 * that already landed. Awaited rather than deferred to `after()` for the reason given in
 * the web biller's webhook — `after()` runs outside the AsyncLocalStorage context
 * `withLogging` establishes, which would silently no-op every `logFields` below.
 */
export async function trackServerEvent(
  context: ServerAnalyticsContext,
  event: ServerAnalyticsEvent,
): Promise<void> {
  if (!isServerAnalyticsConfigured) {
    // Logged rather than returned silently: an unset key and an event that simply doesn't
    // apply are otherwise the same absence in the log line, and telling them apart is the
    // whole of diagnosing "the cancellation never reached Amplitude".
    logFields({ analytics: "unconfigured" });
    return;
  }
  const { name, ...properties } = event;

  const payload = {
    api_key: API_KEY,
    events: [
      {
        user_id: context.userId,
        event_type: `${PREFIX}${name}`,
        event_properties: { ...properties, environment: ENVIRONMENT, platform: "server" },
        time: Date.parse(context.occurredAt) || Date.now(),
        // Suffixed with the name so one notification could ever yield two events without
        // the second being swallowed as a duplicate of the first.
        insert_id: `${context.dedupeKey}:${name}`,
      },
    ],
  };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Analytics must never be what holds a webhook open. Apple and the web biller both retry on
      // a timeout of their own, and the `insert_id` above makes that retry free.
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      // `events_ingested`, not a bare 2xx: Amplitude answers 200 with a body that says how
      // many events it actually kept, and a silently-dropped event is otherwise
      // indistinguishable from a delivered one. Same reasoning as `events_received` on the
      // Meta send.
      const body = (await response.json().catch(() => null)) as { events_ingested?: number } | null;
      logFields({ analytics: "sent", analyticsIngested: body?.events_ingested ?? null });
      return;
    }
    // 400 carries the field it rejected, 429 means throttled by user or device id, 413 too
    // large. The status alone says "refused" and nothing about what to change.
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    logFields({ analytics: `error_${response.status}`, analyticsError: error?.error ?? null });
  } catch (cause) {
    console.error("amplitude server send failed", cause);
    logFields({ analytics: "unreachable" });
  }
}
