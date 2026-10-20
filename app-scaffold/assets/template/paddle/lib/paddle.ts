import "server-only";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

/**
 * Paddle Billing — the web half of the paid tier, beside Apple's StoreKit.
 *
 * Paddle is the merchant of record, so tax, invoicing and the customer portal are all
 * theirs; what this file owns is the API client and the "am I configured" gate every
 * service in this repo has.
 */

const API_KEY = process.env.PADDLE_API_KEY ?? "";
/** Signs every webhook. Distinct from the API key — a different secret, from
 * Notifications → your destination in the Paddle dashboard. */
const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET ?? "";
/** "sandbox" or "production". Sandbox keys only work against the sandbox API and vice
 * versa, so this must agree with which key is set. */
const ENVIRONMENT = process.env.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";

export const isPaddleConfigured = Boolean(API_KEY && WEBHOOK_SECRET);
export const paddleWebhookSecret = WEBHOOK_SECRET;
export const paddleEnvironment = ENVIRONMENT;

let client: Paddle | null = null;

/** Memoized client. Only call behind `isPaddleConfigured` — the SDK throws on an empty key. */
export function paddleClient(): Paddle {
  if (!client) {
    client = new Paddle(API_KEY, {
      environment: ENVIRONMENT === "production" ? Environment.production : Environment.sandbox,
    });
  }
  return client;
}

// The price ids and `planForPriceId` live in lib/paddlePrices.ts — a checkout page needs
// them in the browser, and this module is server-only.
