import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

/** The types an emailed link may carry. Checked rather than forwarded: `EmailOtpType`
 * widens to `string`, so an unvalidated `?type=` would reach the auth server verbatim. */
const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

const isEmailOtpType = (value: string): value is EmailOtpType =>
  (EMAIL_OTP_TYPES as readonly string[]).includes(value);

/**
 * Where both round trips out of the funnel come back — turns whichever credential the link
 * carries into a cookie session, then forwards to `next`.
 *
 * Two credentials, because they are not redeemable in the same places. OAuth returns a PKCE
 * `code`, and the verifier that unlocks it is a cookie in the browser that started the round
 * trip — fine, because that is the browser it comes back to. A confirmation email is not: it
 * is opened wherever the inbox is, which is regularly a different browser, and there the
 * exchange has nothing to exchange with. So email templates point here with `token_hash`,
 * which `verifyOtp` redeems anywhere.
 *
 * `code` is still handled, and handled second: a template left on Supabase's default
 * `{{ .ConfirmationURL }}` keeps arriving that way.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const home = "/start";
  // Same-origin paths only. `${origin}${next}` would turn `//evil.com` into a
  // protocol-relative URL, so anything that is not a single-slash path is discarded rather
  // than sanitized.
  const requested = searchParams.get("next") ?? "";
  const next = /^\/(?!\/)/.test(requested) ? requested : home;

  if (await establishSession(searchParams)) return NextResponse.redirect(`${origin}${next}`);

  // Back to where the round trip started, so the funnel lands on its account step in the
  // reader's language with the ad's query intact, and that step can show and report the failure.
  const failed = new URL(next, origin);
  failed.searchParams.set("auth_error", "1");
  return NextResponse.redirect(failed);
}

async function establishSession(params: URLSearchParams): Promise<boolean> {
  const tokenHash = params.get("token_hash");
  const type = params.get("type") ?? "";
  const code = params.get("code");

  if (tokenHash) {
    if (!isEmailOtpType(type)) return false;
    const supabase = await createServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    return !error;
  }

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }

  return false;
}
