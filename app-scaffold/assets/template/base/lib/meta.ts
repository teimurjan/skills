import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { logFields } from "./log";

/**
 * Meta Conversions API for web events — the server-side half of the purchase signal.
 *
 * The browser Pixel fires `Purchase` when the checkout reports success; this covers the
 * purchases that event never reaches Meta for (tab closed on the redirect, ad-blocker,
 * Safari dropping the script). Both carry the same `event_id` — a uuid the funnel mints
 * before opening checkout and hands to the biller as metadata, so the browser reads it
 * back off the success URL and the webhook reads it off the transaction. Meta collapses
 * the pair into one conversion without either side coordinating.
 *
 * Everything here is best-effort. A failed send must never fail the subscription write or
 * make the webhook return non-2xx, which would have the biller redeliver an event we already
 * applied.
 */

/** The Pixel dataset id. Note this is *not* the Meta app id that the old app-events
 * integration used: website events require a Pixel dataset, and an app dataset rejects
 * `action_source: "website"`. Same value as NEXT_PUBLIC_META_PIXEL_ID. */
const DATASET_ID = process.env.META_DATASET_ID ?? "";
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN ?? "";
/** Set while wiring up, to route events to Events Manager's Test Events tab. */
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE ?? "";
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";

export const isMetaConfigured = Boolean(DATASET_ID && ACCESS_TOKEN);

/**
 * Browser identity, collected at checkout time and carried through the biller's metadata.
 *
 * Meta matches a website event to an ad click through the `_fbp` (browser) and `_fbc`
 * (click) cookies, and a webhook call from the biller carries neither — it isn't the user's
 * browser. So the funnel reads them before opening checkout and forwards them, the same
 * problem the app-events integration solved with a stored device descriptor.
 *
 * `clientIpAddress` is the buyer's when the checkout carried it, never the
 * request's own, which on the webhook is the biller's. With the Pixel blocked it is, beside the
 * email, most of what Meta has to match the sale to an ad on.
 */
export interface MetaBrowserIdentity {
  fbp: string | null;
  fbc: string | null;
  userAgent: string | null;
  clientIpAddress: string | null;
}

/** Read the browser identity back off the biller's metadata. Every field is optional —
 * a checkout opened with cookies blocked has neither cookie, which is a weaker match
 * rather than a reason to drop the event. */
export function parseMetaBrowserIdentity(value: unknown): MetaBrowserIdentity {
  if (!value || typeof value !== "object") {
    return { fbp: null, fbc: null, userAgent: null, clientIpAddress: null };
  }
  const record = value as Record<string, unknown>;
  const ip = asString(record.ip);
  return {
    fbp: asString(record.fbp),
    fbc: asString(record.fbc),
    userAgent: asString(record.ua),
    // The browser wrote it, so it is checked rather than trusted.
    clientIpAddress: ip && isIP(ip) ? ip : null,
  };
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/** Meta requires PII normalized then SHA-256'd: trimmed, lowercased, hex digest. */
function hashed(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return createHash("sha256").update(normalized).digest("hex");
}

export interface MetaPurchaseEvent {
  /** The uuid shared with the browser Pixel. Absent means the funnel didn't mint one
   * (a purchase made outside it), and nothing is sent — an event that can't dedupe would
   * double-count against the browser's. */
  eventId: string | null;
  /** Supabase uid. Sent as `external_id` so Meta can tie repeat events to one person. */
  userId: string | null;
  email: string | null;
  browser: MetaBrowserIdentity;
  /** Where the purchase happened, for Meta's URL-level reporting. */
  eventSourceUrl: string;
  /** Minor units, as the biller reports totals (11999 → 119.99). */
  amountMinorUnits: number | string | undefined;
  currency: string | undefined;
  /** Unix seconds. */
  eventAtSeconds: number;
}

/**
 * Report a web purchase to Meta. Silent no-op when unconfigured or when no `event_id` was
 * carried through checkout — either of which leaves the browser Pixel as the only signal,
 * which is a degradation rather than a failure.
 */
export async function sendMetaPurchase(event: MetaPurchaseEvent): Promise<void> {
  if (!isMetaConfigured) return;
  if (!event.eventId) {
    logFields({ metaCapi: "no_event_id" });
    return;
  }

  const payload = {
    data: [
      {
        action_source: "website",
        event_name: "Purchase",
        event_time: event.eventAtSeconds,
        event_id: event.eventId,
        event_source_url: event.eventSourceUrl,
        user_data: {
          ...(hashed(event.email) ? { em: [hashed(event.email)] } : {}),
          ...(hashed(event.userId) ? { external_id: [hashed(event.userId)] } : {}),
          ...(event.browser.fbp ? { fbp: event.browser.fbp } : {}),
          ...(event.browser.fbc ? { fbc: event.browser.fbc } : {}),
          ...(event.browser.userAgent ? { client_user_agent: event.browser.userAgent } : {}),
          ...(event.browser.clientIpAddress
            ? { client_ip_address: event.browser.clientIpAddress }
            : {}),
        },
        ...customData(event),
      },
    ],
    ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
  };

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${DATASET_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      // `events_received` is what separates "Meta kept it" from "Meta answered 200 and
      // kept nothing". A bare 2xx is indistinguishable from a silent drop, and reading
      // the count is the difference between knowing and waiting. `fbtrace_id` is what
      // Meta support asks for when the count is right and the event still never appears.
      const body = (await response.json().catch(() => null)) as
        | { events_received?: number; fbtrace_id?: string }
        | null;
      logFields({
        metaCapi: "sent",
        metaCapiReceived: body?.events_received ?? null,
        metaCapiTrace: body?.fbtrace_id ?? null,
      });
      return;
    }
    // Codes, not the body — `lib/log` logs metadata only. They are what distinguishes the
    // rejections that look identical from the status alone: 190 is a dead token, 100 a
    // token that does not own this dataset, and a stale `test_event_code` its own subcode.
    // Without them a 400 says "refused" and nothing about what to change.
    const error = (await response.json().catch(() => null))?.error as
      | Record<string, unknown>
      | undefined;
    logFields({
      metaCapi: `error_${response.status}`,
      metaCapiCode: error?.code ?? null,
      metaCapiSubcode: error?.error_subcode ?? null,
      metaCapiTrace: error?.fbtrace_id ?? null,
    });
  } catch (cause) {
    // Meta being unreachable costs one optimization signal, nothing more. Swallow it so
    // the webhook still returns 2xx and the biller doesn't redeliver an event we applied.
    console.error("meta capi send failed", cause);
    logFields({ metaCapi: "unreachable" });
  }
}

/** Value and currency are what make this the optimization event rather than a counter.
 * Omitted together when the total couldn't be read — a zero would be a claim.
 * The caller passes what the customer was actually charged, tax included where the biller
 * says, which is what Meta's `value` means. */
function customData(event: MetaPurchaseEvent) {
  const minor = Number(event.amountMinorUnits);
  if (!event.amountMinorUnits || Number.isNaN(minor) || !event.currency) return {};
  return { custom_data: { value: minor / 100, currency: event.currency } };
}
