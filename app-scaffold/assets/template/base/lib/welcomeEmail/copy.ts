import type { Lang } from "@/lib/i18n";

/**
 * The letter a web buyer gets once the payment lands: where the app is, which account to open
 * it with, and the first things to do in it. In each funnel deck's register, with the app's
 * features spelled as the app spells them, and the reminder's signature and badge wording.
 */
export interface WelcomeCopy {
  subject: string;
  thanks: string;
  /** `provider` is a brand name (Facebook, Apple, Google), or null for the email sign-in. */
  signIn: (provider: string | null, email: string) => string;
  ios: string;
  /** Apple's own wording for the badge in this language; its alt text and the text part's label. */
  appStore: string;
  start: string;
  signature: string;
  reason: string;
}

export const WELCOME_COPY: Record<Lang, WelcomeCopy> = {
  en: {
    subject: "Welcome to Appname",
    thanks: "Thanks for joining Appname. It’s on your account now, on every iPhone you sign in to.",
    signIn: (p, e) => (p ? `Sign in with ${p}, the account for ${e}.` : `Sign in with your email, ${e}.`),
    ios: "Get the app on your iPhone:",
    appStore: "Download on the App Store",
    start: "Then open Appname and do the first thing that shows its value, named as the app names it.",
    signature: "— Founder Name, founder of Appname",
    reason: "You got this because you bought Appname.",
  },
};
