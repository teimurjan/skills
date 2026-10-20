import type { CookieOptionsWithName } from "@supabase/ssr";

/** The session cookie's name, shared by the three clients (`browser.ts`, `server.ts`,
 * `middleware.ts`). Host-only: the site and the funnel are one host. */
export const SESSION_COOKIE = "appname-auth";

export const sessionCookieOptions: CookieOptionsWithName = { name: SESSION_COOKIE };

/**
 * Whether this browser holds a session, read off `document.cookie` alone — no client, no
 * request. `@supabase/ssr` splits a long session across `name.0`, `name.1`, … and writes
 * the PKCE verifier under `name-code-verifier`, so the test is the name itself or a chunk
 * of it, never the verifier. A `true` means "has an account", not "is signed in": the
 * cookie can be stale, and whatever acts on it has to be right to show a sign-in screen.
 */
export function hasSessionCookie(): boolean {
  try {
    return new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}(?:\\.\\d+)?=`).test(document.cookie);
  } catch {
    return false;
  }
}
