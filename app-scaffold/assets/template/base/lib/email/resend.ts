import "server-only";

/**
 * Resend, over its REST API rather than its SDK: one POST is the whole of what is used.
 *
 * `RESEND_FROM` is the sender, on a domain verified in Resend. `EMAIL_POSTAL_ADDRESS` goes in
 * every footer, because CAN-SPAM requires a physical address on a commercial email, so nothing
 * is sent without it.
 */

const API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.RESEND_FROM ?? "";
export const postalAddress = process.env.EMAIL_POSTAL_ADDRESS ?? "";

export const isResendConfigured = Boolean(API_KEY && FROM && postalAddress);

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** One email per request, so one bad address fails alone. The idempotency key makes a retry a
 * no-op on Resend's side for 24 hours, so an email that did land is never sent twice. */
export async function sendEmail(email: OutgoingEmail, idempotencyKey: string): Promise<boolean> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ from: FROM, ...email }),
  });
  if (response.ok) return true;
  console.error("resend send failed", response.status, await response.text());
  return false;
}
