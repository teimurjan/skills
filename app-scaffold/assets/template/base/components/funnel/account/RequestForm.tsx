import {
  AppleSignInButton,
  FacebookSignInButton,
  GoogleSignInButton,
} from "@/components/auth/OAuthButtons";
import type { OAuthProvider } from "@/components/auth/AuthProvider";
import { useLocale } from "../locale";
import type { EmailAuth } from "./useEmailAuth";
import { FIELD, QUIET } from "./styles";

/** The first screen: an address, and the four doors. A password is a hidden option behind
 * "Use a password instead". */
export function RequestForm({
  auth,
  embedded,
  onOAuth,
}: {
  auth: EmailAuth;
  /** Inside Meta's WKWebView, where **Google refuses OAuth** (`disallowed_useragent`). A
   * button that cannot work costs more than a missing one, so it is not rendered at all. */
  embedded: boolean;
  onOAuth: (provider: OAuthProvider) => void;
}) {
  const { busy, email, error, mode, password, usePassword } = auth;
  const words = useLocale().copy.account;

  const submitTitle = busy
    ? words.busy
    : !usePassword
      ? words.continue
      : mode === "signUp"
        ? words.createAccount
        : words.signIn;

  return (
    <div className="mt-5 flex flex-col gap-3">
      <form onSubmit={auth.submit} className="flex flex-col gap-2">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder={words.emailPlaceholder}
          value={email}
          onInput={(event) => auth.setEmail(event.currentTarget.value)}
          className={FIELD}
        />
        {usePassword && (
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            placeholder={words.passwordPlaceholder}
            value={password}
            onInput={(event) => auth.setPassword(event.currentTarget.value)}
            className={FIELD}
          />
        )}
        <button type="submit" disabled={busy} className="btn">
          {submitTitle}
        </button>
        {!usePassword && <p className="text-center text-[13px] leading-snug text-muted">{words.noPassword}</p>}
      </form>

      {error && <p className="text-[14px] leading-snug text-alert">{error}</p>}

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-hairline" />
        <span className="eyebrow">{words.or}</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      {/* Facebook leads, and is never hidden: the paid traffic is Meta's, so it is the door most
          readers are already signed in to. Apple above Google, per Apple's HIG and App Review 4.8. */}
      <div className="flex flex-col gap-2">
        <FacebookSignInButton label={words.facebook} onClick={() => onOAuth("facebook")} />
        <AppleSignInButton label={words.apple} onClick={() => onOAuth("apple")} />
        {!embedded && <GoogleSignInButton label={words.google} onClick={() => onOAuth("google")} />}
      </div>

      <button onClick={auth.togglePassword} className={QUIET}>
        {usePassword ? words.useCode : words.usePassword}
      </button>

      {usePassword && (
        <button onClick={auth.toggleMode} className={QUIET}>
          {mode === "signUp" ? words.haveAccount : words.newHere}
        </button>
      )}
    </div>
  );
}
