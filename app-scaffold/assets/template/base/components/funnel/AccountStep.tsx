import { useEffect, useRef, useState } from "preact/hooks";
import { useAuth, type OAuthProvider } from "@/components/auth/AuthProvider";
import { track } from "@/lib/analytics";
import { funnelPath, type Lang } from "@/lib/i18n";
import { inAppBrowser } from "@/lib/inAppBrowser";
import { metaTrack } from "@/lib/metaPixel";
import { CodeForm } from "./account/CodeForm";
import { PlanCard } from "./account/PlanCard";
import { RequestForm } from "./account/RequestForm";
import { attempted, useEmailAuth } from "./account/useEmailAuth";
import { LegalNote } from "./LegalNote";
import { Headline, Note } from "./Headline";
import { goto } from "./location";
import { useLocale } from "./locale";
import { claimRegistration, storeAttempt, takeAttempt } from "./session";
import { ACCOUNT_STEP_INDEX, problemFix, type FunnelAnswers } from "./steps";

/** Where both round trips come back to: this step, which forwards a signed-in visitor on.
 * Not the checkout step directly — landing there skips the effect below and the one
 * registration event either path reports. The query string rides along because a confirmation
 * link is opened wherever the inbox is, which is regularly a different browser. */
const returnPath = (lang: Lang) =>
  `${funnelPath(lang)}${window.location.search}#step-${ACCOUNT_STEP_INDEX}`;

/** GoTrue stamps the identity that created the session onto `app_metadata.provider`, the only
 * marker of which button was tapped that survives an OAuth redirect. */
const asOAuthProvider = (value: unknown): OAuthProvider | null =>
  value === "facebook" || value === "apple" || value === "google" ? value : null;

/**
 * The account step. It exists because the entitlement has to land on a Supabase user id: the
 * funnel stamps that uid into the biller's metadata, the webhook reads it back, and both
 * clients find the subscription by signing into the same account.
 *
 * Placed after the recap and before the price, so the commitment is made before the number is.
 * That is the step readers leave most, so it carries their own problem forward under the head
 * count.
 */
export function AccountStep({
  headline,
  note,
  answers,
}: {
  headline: string;
  note?: string;
  answers: FunnelAnswers;
}) {
  const { user, configured, linkError, signInWithProvider } = useAuth();
  const { copy, lang } = useLocale();
  const auth = useEmailAuth(() => returnPath(lang));
  const [embedded, setEmbedded] = useState(false);
  /** Only a *new* account is a registration — someone who deep-links here already signed in
   * is passing through. */
  const wasSignedIn = useRef(Boolean(user));

  useEffect(() => {
    const app = inAppBrowser(navigator.userAgent);
    if (!app) return;
    setEmbedded(true);
    track({ name: "embedded_browser_detected", app });
  }, []);

  /** A round trip that came back failed lands here, the only place that can offer another
   * code. Which door it left through is in storage if it left from this tab, and nowhere
   * if it did not. */
  useEffect(() => {
    if (!linkError) return;
    // The provider's words are English; the deck has its own for this one.
    auth.setError(copy.authErrors.link_failed);
    track({ name: "sign_in_failed", provider: takeAttempt() ?? "unknown", reason: "link_failed" });
  }, [linkError]);

  useEffect(() => {
    if (!user) return;
    if (!wasSignedIn.current) {
      wasSignedIn.current = true;
      // Reported here rather than on the button, so an abandoned round trip doesn't count as
      // a registration. A session can land in front of this step more than once — the tab
      // that typed the code and the one the emailed link opened both see it — so the claim is
      // per account and Amplitude's `insert_id` drops a repeat from another browser.
      if (claimRegistration(user.id)) {
        const provider = asOAuthProvider(user.app_metadata?.provider) ?? auth.method.current;
        metaTrack("CompleteRegistration", { method: provider });
        track({ name: "sign_in_succeeded", provider }, { insertId: `registration:${user.id}` });
      }
    }
    // Replaced rather than pushed, so Back from the price skips this step instead of landing
    // on it and being sent straight forward again.
    goto(ACCOUNT_STEP_INDEX + 1, { replace: true });
  }, [user]);

  /** The attempt is recorded before the page is left, and remembered so the return trip can
   * name it if it fails. The SDK holds an unsent event across the navigation. */
  const startOAuth = (provider: OAuthProvider) => {
    attempted(provider);
    storeAttempt(provider);
    void signInWithProvider(provider, returnPath(lang));
  };

  const plan = problemFix(answers, copy);

  return (
    <>
      <Headline text={headline} />
      <Note text={note} />
      {plan && <PlanCard problem={plan.problem} fix={plan.fix} />}
      {!configured ? (
        <p className="card mt-6 px-4 py-3 text-[14px] text-muted">{copy.account.notConfigured}</p>
      ) : auth.phase === "code" ? (
        <CodeForm auth={auth} />
      ) : (
        <RequestForm auth={auth} embedded={embedded} onOAuth={startOAuth} />
      )}
      {/* Last on the page and centred, as on the offer. */}
      <div className="mt-8 flex justify-center">
        <LegalNote />
      </div>
    </>
  );
}
