import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import type { AuthError, User } from "@supabase/supabase-js";
import { identify } from "@/lib/analytics";
import { onIdle } from "@/lib/idle";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { hasSessionCookie } from "@/lib/supabase/cookie";

/** What a failed call hands back: the words for the screen, and GoTrue's code for the
 * analytics — `otp_expired`, `over_email_send_rate_limit`, `invalid_credentials`. The code
 * is what a chart groups on; the message is whatever the reader was shown. */
export type AuthFailure = { message: string; code: string };

type AuthResult = { error: AuthFailure | null };

/** A sign-up has three outcomes, not two. With email confirmation off it lands a session;
 * with it on it lands nothing but an email, which is the happy path and not an error —
 * reporting it as one paints "check your inbox" as a failure. */
export type SignUpResult =
  | { status: "signedIn" }
  | { status: "confirmationSent" }
  | { status: "error"; error: AuthFailure };

/** The OAuth providers the funnel offers. The app (`SupabaseAuth.swift`) also offers these;
 * every path lands on one Supabase user id, which is what the entitlement and the biller's
 * metadata are keyed on. */
export type OAuthProvider = "facebook" | "apple" | "google";

interface AuthValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  /** Set when the sign-in round trip came back failed (`/auth/callback` redirects to
   * `?auth_error=1`). Shown by the account step, the only place that can offer another. */
  linkError: string | null;
  signInWithProvider: (provider: OAuthProvider, redirectPath?: string) => Promise<void>;
  sendEmailCode: (email: string, redirectPath?: string) => Promise<AuthResult>;
  verifyEmailCode: (email: string, token: string) => Promise<AuthResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signUpWithPassword: (
    email: string,
    password: string,
    redirectPath?: string,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  /** The bearer every `/api/*` route reads. Null signed out. */
  accessToken: () => Promise<string | null>;
}

/** Both round trips — OAuth and the emailed link — come back through `/auth/callback`, which
 * trades the credential for a cookie session and forwards to `next`.
 *
 * `next` is always written, even when it is the default the route would have picked anyway,
 * so the URL always ends in a query string. The confirmation email template appends to it
 * (`{{ .RedirectTo }}&token_hash=…`), and against a bare path that `&` lands in the path
 * instead of the query. */
function callbackUrl(redirectPath = "/start"): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", redirectPath);
  return url.toString();
}

const LINK_ERROR = "That didn’t work. Send yourself a new code.";

const NOT_CONFIGURED: AuthFailure = { message: "Sign-in is not configured.", code: "not_configured" };

/** What to show for a failed call, and what to record about it.
 *
 * supabase-js turns every 5xx into an `AuthRetryableFetchError` before it reads the response
 * body, and its message extractor finds nothing on a raw `Response` — so the message is the
 * literal string "{}" for any server-side failure and the real one never leaves the network
 * tab. Nothing to show the reader there but our own copy. Those responses carry no `code`
 * either, and the error's class name is the most that can be said about them. */
function describeAuthError(error: AuthError): AuthFailure {
  const opaque = !error.message.trim() || error.message === "{}";
  return {
    message: opaque ? "Something went wrong on our side. Try again in a minute." : error.message,
    code: error.code ?? error.name,
  };
}

type Client = ReturnType<typeof import("@/lib/supabase/browser").createBrowserClient>;

let clientPromise: Promise<Client> | null = null;

/**
 * The browser client, created once per page and on demand.
 *
 * supabase-js is ~65kB gzipped, and this provider wraps the funnel from step 0 — a screen
 * that has no use for it. Loading it with `import()` keeps it out of the bundle that gates
 * the first paint; the provider asks for it on the first idle moment, and a sign-in method
 * called sooner simply waits on the same promise. Module-level so a remount reuses the client
 * rather than building another.
 */
function loadClient(): Promise<Client> {
  clientPromise ??= import("@/lib/supabase/browser").then((m) => m.createBrowserClient());
  return clientPromise;
}

/** Whether this browser has a session, or is about to. Cold traffic has neither and no use
 * for the client until the account step, several taps in. A reader back from the OAuth round
 * trip lands with the cookie `/auth/callback` set, and one who typed the emailed code lands
 * with the credential still in the URL — both want the client now, not on idle. */
function expectsSession(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has("code") || params.has("token_hash")) return true;
  return hasSessionCookie();
}

/** The failure flag `/auth/callback` sets, taken off the URL and cleared so a reload doesn't
 * show the error a second time. */
function takeAuthError(): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("auth_error")) return false;
  url.searchParams.delete("auth_error");
  window.history.replaceState(window.history.state, "", url.toString());
  return true;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ComponentChildren }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    if (takeAuthError()) setLinkError(LINK_ERROR);
    let cancelled = false;
    let subscription: { unsubscribe(): void } | undefined;
    const connect = () => {
      void loadClient().then(async (supabase) => {
        if (cancelled) return;
        subscription = supabase.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user ?? null);
        }).data.subscription;
        // The OAuth `code` and the emailed `token_hash` are both redeemed server-side by
        // `/auth/callback` before this page loads, so there is nothing to exchange here —
        // only a cookie session to read.
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        setUser(data.user ?? null);
        setLoading(false);
      });
    };
    let cancelIdle = () => {};
    if (expectsSession()) connect();
    else cancelIdle = onIdle(connect);
    return () => {
      cancelled = true;
      cancelIdle();
      subscription?.unsubscribe();
    };
  }, []);

  // The Supabase uid onto Amplitude, the moment a session is known — whether it was just
  // created on the account step or arrived from an earlier visit. This is the only thing that
  // joins the browser's funnel events to the purchase the webhook later reports on the same
  // uid; without it a buyer is one anonymous device here and a different user there, and the
  // web funnel never reaches its own conversion.
  const userId = user?.id;
  useEffect(() => {
    if (userId) identify(userId);
  }, [userId]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      configured: isSupabaseConfigured,
      linkError,
      /** `redirectPath` sends the reader back where they were after the OAuth round trip.
       * The funnel needs it: an account created mid-funnel must land back on the step that
       * asked for it, not on the home page. Both providers return a PKCE `code`, which
       * `/auth/callback` redeems — adding one is this call and a button, nothing further. */
      async signInWithProvider(provider, redirectPath) {
        if (!isSupabaseConfigured) return;
        const supabase = await loadClient();
        await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: callbackUrl(redirectPath) },
        });
      },
      /** One call for a new buyer and a returning one: `shouldCreateUser` defaults to true,
       * so there is no sign-up/sign-in distinction to make before sending. That is what lets
       * the funnel treat the password as optional.
       *
       * The email carries a code and no link (`supabase/templates/`). Paid traffic is inside
       * Meta's WKWebView; a link opens in the mail app's own browser, where the PKCE verifier
       * and the visitor's answers are not, and tapping it burns the one-time token the code
       * is. `emailRedirectTo` is kept right regardless, for any template that grows one. */
      async sendEmailCode(email, redirectPath) {
        if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };
        const supabase = await loadClient();
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: callbackUrl(redirectPath) },
        });
        return { error: error ? describeAuthError(error) : null };
      },
      /** `type: "email"` rather than `"magiclink"` or `"signup"`: which of those Supabase sent
       * depends on whether the address already had an account, which the page has no way to
       * know and shouldn't have to. */
      async verifyEmailCode(email, token) {
        if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };
        const supabase = await loadClient();
        const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
        return { error: error ? describeAuthError(error) : null };
      },
      async signInWithPassword(email, password) {
        if (!isSupabaseConfigured) return { error: NOT_CONFIGURED };
        const supabase = await loadClient();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ? describeAuthError(error) : null };
      },
      /** Creates the account, and signs it in too when email confirmation is off in the
       * Supabase dashboard. With it on there is no session until the link is clicked, so
       * `emailRedirectTo` has to carry `redirectPath` through the email — without it Supabase
       * falls back to the project's Site URL and drops a funnel visitor on the home page with
       * nothing to continue from. */
      async signUpWithPassword(email, password, redirectPath) {
        if (!isSupabaseConfigured) return { status: "error", error: NOT_CONFIGURED };
        const supabase = await loadClient();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl(redirectPath) },
        });
        if (error) return { status: "error", error: describeAuthError(error) };
        return data.session ? { status: "signedIn" } : { status: "confirmationSent" };
      },
      async signOut() {
        if (!isSupabaseConfigured) return;
        const supabase = await loadClient();
        await supabase.auth.signOut();
        setUser(null);
      },
      async accessToken() {
        if (!isSupabaseConfigured) return null;
        const supabase = await loadClient();
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      },
    }),
    [user, loading, linkError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
