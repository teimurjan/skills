import "server-only";
import {
  APIException,
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  type StatusResponse,
} from "@apple/app-store-server-library";

const BUNDLE_ID = process.env.APPLE_BUNDLE_ID ?? "";
const APP_APPLE_ID = process.env.APPLE_APP_APPLE_ID ? Number(process.env.APPLE_APP_APPLE_ID) : undefined;

// App Store Server API credentials — an In-App Purchase key from App Store Connect
// (Users and Access → Integrations → In-App Purchase). Distinct from the root certs
// below, which only verify signatures; these authenticate outbound queries to Apple.
const INAPP_KEY_ID = process.env.APPLE_INAPP_KEY_ID ?? "";
const INAPP_ISSUER_ID = process.env.APPLE_INAPP_ISSUER_ID ?? "";
// The .p8 contents: a raw PEM, or base64-encoded to survive single-line env storage.
const INAPP_PRIVATE_KEY = ((raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.includes("BEGIN PRIVATE KEY") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
})(process.env.APPLE_INAPP_PRIVATE_KEY ?? "");

// Apple Root CA certificates (DER), base64-encoded and comma-separated. Downloaded
// from https://www.apple.com/certificateauthority/ — at minimum Apple Root CA - G3.
const ROOT_CERTS = (process.env.APPLE_ROOT_CERTS_BASE64 ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => Buffer.from(entry, "base64"));

export const isAppleConfigured = Boolean(BUNDLE_ID && ROOT_CERTS.length);

const verifiers = new Map<Environment, SignedDataVerifier>();
function verifier(environment: Environment): SignedDataVerifier {
  let cached = verifiers.get(environment);
  if (!cached) {
    // Online checks revoke-validate the signing certs against Apple's OCSP.
    cached = new SignedDataVerifier(ROOT_CERTS, true, environment, BUNDLE_ID, APP_APPLE_ID);
    verifiers.set(environment, cached);
  }
  return cached;
}

/** Verify against Production first, falling back to Sandbox on an environment
 * mismatch. StoreKit signs App Review and TestFlight purchases in Sandbox even
 * for the production app, so a single-environment verifier would reject one of
 * {real customers, reviewers}. Only INVALID_ENVIRONMENT triggers the retry —
 * every other failure is a genuinely bad payload and propagates unchanged. */
async function verifyAcrossEnvironments<T>(verify: (verifier: SignedDataVerifier) => Promise<T>): Promise<T> {
  try {
    return await verify(verifier(Environment.PRODUCTION));
  } catch (error) {
    if (error instanceof VerificationException && error.status === VerificationStatus.INVALID_ENVIRONMENT) {
      return verify(verifier(Environment.SANDBOX));
    }
    throw error;
  }
}

/** Verify a StoreKit `signedTransaction` (JWS) and return its decoded payload. */
export function verifyTransaction(signedTransaction: string): Promise<JWSTransactionDecodedPayload> {
  return verifyAcrossEnvironments((v) => v.verifyAndDecodeTransaction(signedTransaction));
}

/** Verify an App Store Server Notification V2 `signedPayload`. */
export function verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
  return verifyAcrossEnvironments((v) => v.verifyAndDecodeNotification(signedPayload));
}

/** Verify a `signedRenewalInfo` (JWS) — carries `gracePeriodExpiresDate`. */
export function verifyRenewalInfo(signedRenewalInfo: string): Promise<JWSRenewalInfoDecodedPayload> {
  return verifyAcrossEnvironments((v) => v.verifyAndDecodeRenewalInfo(signedRenewalInfo));
}

/** Shape of the id we stamp as `appAccountToken` — Apple only guarantees a UUID,
 * so anything else was never written by us. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The buyer's Supabase uid, as stamped onto the purchase by the client
 * (`Product.PurchaseOption.appAccountToken`). Apple round-trips it untouched
 * onto every later transaction for that subscription, which is what lets the
 * notifications webhook attribute a renewal with no client involved, and what
 * makes the ownership check on the sync reconcile sound. Null for anything
 * that isn't a well-formed uuid — the value comes back through Apple, so it is
 * only trustworthy once it's the shape we wrote. */
export function accountToken(transaction: JWSTransactionDecodedPayload): string | null {
  const token = transaction.appAccountToken;
  return token && UUID_PATTERN.test(token) ? token : null;
}

/** Is this a Sandbox-signed transaction? App Review and TestFlight sign in Sandbox even
 * against the production app. Such a purchase is honored — the app must unlock during
 * review — but held perpetual: this single production deployment never receives a sandbox
 * subscription's renewal/expiry notifications, so its real (~5 min) expiry would strand a
 * reviewer. Recorded via the entitlement's `environment` column so sandbox grants stay
 * distinguishable from real Production revenue. */
export function isSandbox(environment: Environment | string | undefined): boolean {
  return environment === Environment.SANDBOX;
}

/** Whether outbound App Store Server API queries are configured (In-App Purchase key
 * present). Purchase-verify and notifications don't need this — only the
 * server-initiated subscription-status sync does. */
export const isAppleAPIConfigured = Boolean(isAppleConfigured && INAPP_KEY_ID && INAPP_ISSUER_ID && INAPP_PRIVATE_KEY);

const apiClients = new Map<Environment, AppStoreServerAPIClient>();
function apiClient(environment: Environment): AppStoreServerAPIClient {
  let cached = apiClients.get(environment);
  if (!cached) {
    cached = new AppStoreServerAPIClient(INAPP_PRIVATE_KEY, INAPP_KEY_ID, INAPP_ISSUER_ID, BUNDLE_ID, environment);
    apiClients.set(environment, cached);
  }
  return cached;
}

/** Ask Apple for the live status of every auto-renewable subscription in the group
 * that owns `transactionId`. Queries Production first, then Sandbox — a sandbox
 * transaction id 404s against Production — mirroring the verifier's env fallback.
 * This is the authority: it reflects renewals, expiries, and refunds even when a
 * notification was missed, without trusting the client's local StoreKit cache. */
export async function getSubscriptionStatuses(transactionId: string): Promise<StatusResponse> {
  try {
    return await apiClient(Environment.PRODUCTION).getAllSubscriptionStatuses(transactionId);
  } catch (error) {
    if (error instanceof APIException) {
      return apiClient(Environment.SANDBOX).getAllSubscriptionStatuses(transactionId);
    }
    throw error;
  }
}
