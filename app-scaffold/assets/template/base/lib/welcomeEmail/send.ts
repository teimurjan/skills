import "server-only";
import { appStoreUrl } from "@/lib/appStoreListing";
import { checkoutLang } from "@/lib/checkoutReminder/reminders";
import { isResendConfigured, postalAddress, sendEmail } from "@/lib/email/resend";
import { createAdminClient, isServiceConfigured } from "@/lib/supabase/admin";
import { renderWelcomeEmail } from "./render";

/**
 * The way in, mailed to whoever just paid on the web. A buyer who pays inside Meta's in-app
 * browser lands on a done page in a webview they will close, and nothing else tells them where
 * the app is or which account their purchase is on.
 */

export const isWelcomeEmailConfigured = isServiceConfigured && isResendConfigured;

export type WelcomeEmailOutcome = "sent" | "no_email" | "failed";

/** Never throws: a lost email must not fail the webhook that granted the purchase. Keyed on the
 * purchase, so the biller redelivering the event inside Resend's 24 hours sends nothing twice. */
export async function sendWelcomeEmail(userId: string, purchaseId: string): Promise<WelcomeEmailOutcome> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
    if (error) return "failed";
    const email = data.user.email;
    if (!email) return "no_email";

    const provider = data.user.app_metadata?.provider;
    const rendered = renderWelcomeEmail({
      lang: await checkoutLang(userId),
      email,
      provider: typeof provider === "string" ? provider : null,
      appStoreUrl,
      postalAddress,
    });
    const sent = await sendEmail({ to: email, ...rendered }, `welcome-email/${purchaseId}`);
    return sent ? "sent" : "failed";
  } catch (cause) {
    console.error("welcome email failed", cause);
    return "failed";
  }
}
