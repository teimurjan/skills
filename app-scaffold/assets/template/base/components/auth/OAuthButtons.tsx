/**
 * The three OAuth buttons, kept out of `AccountStep` because they are markup, not logic — and
 * because none is ours to design.
 *
 * Same exemption the app's `FacebookSignInButton`, `GoogleBrandSignInButton` and
 * `SignInWithAppleButton` get: Meta's guidelines, Apple's HIG and Google's button generator
 * each specify a mark, a surface and a typeface, and redrawing any of them in the site's
 * one-accent palette would breach the terms that let us offer the provider at all. Only the
 * geometry is shared — the app's 56px height and 24px corners, full width — so the stack
 * reads as one control group with the field and the commit above it. See
 * `.gsi-material-button` and `.brand-signin-button` in `app/base.css`.
 */

interface BrandButtonProps {
  onClick: () => void;
  disabled?: boolean;
  /** The provider's own wording in the page's language — Apple's translation of "Continue with
   * Apple", Google's of "Sign in with Google". Neither is ours to rephrase. */
  label?: string;
}

/** Meta's "Continue with Facebook" button: their blue, their white "f", their wording. First
 * in every sign-in stack, and shown inside Meta's own in-app browser, where it is the one
 * provider already signed in. */
export function FacebookSignInButton({
  onClick,
  disabled,
  label = "Continue with Facebook",
}: BrandButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="brand-signin-button brand-signin-button--facebook"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}

/** "Continue with Apple" is one of the two strings Apple permits; the black fill is the
 * variant the app already uses, so the two surfaces show the same button. Above Google per
 * Apple's HIG and App Review guideline 4.8. */
export function AppleSignInButton({
  onClick,
  disabled,
  label = "Continue with Apple",
}: BrandButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="brand-signin-button brand-signin-button--apple"
    >
      <svg viewBox="0 0 384 512" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}

/** Google's own markup, from their generator, down to the nested state layer and the
 * duplicated hidden label that balances the centring. Not to be tidied. */
export function GoogleSignInButton({
  onClick,
  disabled,
  label = "Sign in with Google",
}: BrandButtonProps) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="gsi-material-button">
      <div className="gsi-material-button-state"></div>
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            viewBox="0 0 48 48"
            style={{ display: "block" }}
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
            <path fill="none" d="M0 0h48v48H0z" />
          </svg>
        </div>
        <span className="gsi-material-button-contents">{label}</span>
        <span style={{ display: "none" }}>{label}</span>
      </div>
    </button>
  );
}
