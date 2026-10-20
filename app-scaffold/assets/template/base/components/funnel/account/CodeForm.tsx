import { fillNodes, fill, useLocale } from "../locale";
import { CODE_MAX, CODE_MIN, type EmailAuth } from "./useEmailAuth";
import { FADE, FIELD } from "./styles";

/** The second screen: what was mailed to the address. */
export function CodeForm({ auth }: { auth: EmailAuth }) {
  const { busy, code, cooldown, email, error } = auth;
  const words = useLocale().copy.account;

  return (
    <div className="mt-5 flex flex-col gap-3">
      <p className="text-[14px] leading-[1.5] text-muted">
        {fillNodes(words.codeSent, { email: <span className="font-medium text-ink">{email}</span> })}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void auth.verify(code);
        }}
        className="flex flex-col gap-2"
      >
        <input
          // `one-time-code` puts the code on the keyboard bar instead of making them switch apps.
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={CODE_MAX}
          autoFocus
          value={code}
          // `onInput`, not `onChange`: Preact wires `onChange` to the native `change` event,
          // which fires on blur — and this field submits itself on its last digit.
          onInput={(event) => auth.onCodeInput(event.currentTarget.value)}
          // `!` because `.field` is unlayered and its 15px would win.
          className={`${FIELD} num text-center text-[22px]! font-medium tracking-[0.35em]`}
        />
        <button type="submit" disabled={busy || code.length < CODE_MIN} className="btn">
          {busy ? words.busy : words.continue}
        </button>
      </form>

      {error && <p className="text-[14px] leading-snug text-alert">{error}</p>}

      <div className="flex items-center justify-between text-[14px] text-muted">
        <button
          onClick={() => void auth.resend()}
          disabled={busy || cooldown > 0}
          className={`min-h-11 ${FADE} disabled:opacity-40`}
        >
          {cooldown > 0 ? fill(words.resendIn, { seconds: cooldown }) : words.resend}
        </button>
        <button onClick={auth.changeEmail} className={`min-h-11 ${FADE}`}>
          {words.changeEmail}
        </button>
      </div>
    </div>
  );
}
