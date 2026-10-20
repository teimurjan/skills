import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useAuth, type AuthFailure } from "@/components/auth/AuthProvider";
import { track, type SignInProvider } from "@/lib/analytics";
import type { FunnelCopy } from "../copy/types";
import { useLocale } from "../locale";

/** What Supabase → Authentication → Email OTP length is set to. Drives the auto-submit, and
 * is the one value to move if that setting changes. */
const CODE_LENGTH = 6;
/** Supabase allows 6–10, and the field accepts that whole range whatever `CODE_LENGTH` says. */
export const CODE_MIN = 6;
export const CODE_MAX = 10;
/** Supabase's own interval between two sends to one address, counted down so the rate-limit
 * error is never the first thing a visitor who taps twice sees. */
const RESEND_SECONDS = 60;

export const attempted = (provider: SignInProvider) => track({ name: "sign_in_attempted", provider });

const failed = (provider: SignInProvider, failure: AuthFailure) =>
  track({ name: "sign_in_failed", provider, reason: failure.code });

/**
 * The words for a refusal, by GoTrue's code rather than by its message, which is only ever
 * English. A code the deck has no entry for shows GoTrue's own words to an English reader and
 * the deck's catch-all to everyone else.
 */
export function authMessage(failure: AuthFailure, copy: FunnelCopy, english: boolean): string {
  const known = (copy.authErrors as Record<string, string>)[failure.code];
  return known ?? (english ? failure.message : copy.authErrors.unknown);
}

export type EmailPhase = "request" | "code";
export type EmailMode = "signUp" | "signIn";

/**
 * The email half of the account step: ask for an address, then ask for what was mailed to it.
 *
 * Nothing here advances the funnel. A session landing is what does that, through the effect
 * in `AccountStep` — success is the absence of an error, in every path below.
 */
export function useEmailAuth(returnPath: () => string) {
  const { sendEmailCode, verifyEmailCode, signUpWithPassword, signInWithPassword } = useAuth();
  const { copy, lang } = useLocale();
  const describe = (failure: AuthFailure) => authMessage(failure, copy, lang === "en");

  const [phase, setPhase] = useState<EmailPhase>("request");
  /** Off by default — the account exists so an entitlement has somewhere to land, and nothing
   * in this funnel ever asks for the password again. */
  const [usePassword, setUsePassword] = useState(false);
  const [mode, setMode] = useState<EmailMode>("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  /** `email_code` is passwordless, `email` set a password. The OAuth buttons leave the page,
   * so theirs is read back off the user instead. */
  const method = useRef<"email" | "email_code">("email");
  /** `busy` is a render behind when the code field auto-submits on its last digit. */
  const submitting = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** Every door reports the tap and every refusal, so "nobody signed in" can be told apart
   * from "nobody tried". Returns whether the call succeeded. */
  async function attempt(
    provider: SignInProvider,
    call: () => Promise<{ error: AuthFailure | null }>,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    const { error: failure } = await call();
    setBusy(false);
    if (!failure) return true;
    failed(provider, failure);
    setError(describe(failure));
    return false;
  }

  function askForCode() {
    setCode("");
    setCooldown(RESEND_SECONDS);
    setPhase("code");
  }

  async function submit(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!usePassword) {
      method.current = "email_code";
      attempted("email_code");
      if (await attempt("email_code", () => sendEmailCode(email, returnPath()))) askForCode();
      return;
    }

    method.current = "email";
    attempted("email");
    if (mode === "signIn") {
      await attempt("email", () => signInWithPassword(email, password));
      return;
    }

    setBusy(true);
    setError(null);
    const result = await signUpWithPassword(email, password, returnPath());
    setBusy(false);
    if (result.status === "error") {
      failed("email", result.error);
      setError(describe(result.error));
    }
    // A signup confirmation is an email OTP like any other, so the same code screen redeems
    // it and this path need not hop to whatever browser the inbox is in.
    if (result.status === "confirmationSent") askForCode();
  }

  /** Takes the code rather than reading state, so the last keystroke can submit itself. */
  async function verify(token: string) {
    if (submitting.current) return;
    submitting.current = true;
    method.current = usePassword ? "email" : "email_code";
    await attempt(method.current, () => verifyEmailCode(email, token));
    submitting.current = false;
  }

  /** Not a fresh attempt — the same one, asking again — but a refusal is still a refusal. */
  async function resend() {
    if (await attempt(method.current, () => sendEmailCode(email, returnPath()))) {
      setCode("");
      setCooldown(RESEND_SECONDS);
    }
  }

  return {
    phase,
    usePassword,
    mode,
    email,
    password,
    code,
    error,
    busy,
    cooldown,
    method,
    setError,
    setEmail,
    setPassword,
    submit,
    verify,
    resend,
    onCodeInput(value: string) {
      const digits = value.replace(/\D/g, "").slice(0, CODE_MAX);
      setCode(digits);
      if (digits.length === CODE_LENGTH) void verify(digits);
    },
    changeEmail() {
      setPhase("request");
      setCode("");
      setError(null);
    },
    togglePassword() {
      setUsePassword(!usePassword);
      setPassword("");
      setError(null);
    },
    toggleMode() {
      setMode(mode === "signUp" ? "signIn" : "signUp");
      setError(null);
    },
  };
}

export type EmailAuth = ReturnType<typeof useEmailAuth>;
