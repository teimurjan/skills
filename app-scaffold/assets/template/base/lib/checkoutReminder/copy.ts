import type { Lang } from "@/lib/i18n";

/**
 * The reminder is a letter from the founder, in each funnel deck's own register (du or Sie,
 * tu or vous), with the app's features spelled as the app spells them. Two ways to finish
 * follow the pitch: the web with the discount, and the App Store trial, which no discount
 * reaches. `percent` arrives already formatted for the language (`20 %`, `20%`).
 */
export interface ReminderCopy {
  subject: (percent: string) => string;
  intro: string;
  pitch: string;
  web: (percent: string) => string;
  webLink: string;
  ios: string;
  trial: string;
  /** Apple's own wording for the badge in this language; its alt text and the text part's label. */
  appStore: string;
  signature: string;
  reason: string;
  unsubscribe: string;
  unsubscribeTitle: string;
  unsubscribeButton: string;
  unsubscribed: string;
}

export const REMINDER_COPY: Record<Lang, ReminderCopy> = {
  en: {
    subject: (p) => `${p} off your first Appname payment`,
    intro: "You stopped just before paying, and your Appname account is already set up.",
    pitch: "Appname does the one thing it does, in two sentences. Say what the reader gets the first evening they use it.",
    web: (p) => `On the web, ${p} off your first payment, applied when you finish with this link:`,
    webLink: "Finish on the web",
    ios: "On iPhone, start with a free trial:",
    trial: "3 days free. Cancel during the trial and you pay nothing. Sign in with the same account.",
    appStore: "Download on the App Store",
    signature: "— Founder Name, founder of Appname",
    reason: "You got this because you started a checkout at Appname. It’s the only reminder we send.",
    unsubscribe: "Unsubscribe",
    unsubscribeTitle: "Stop emails from Appname?",
    unsubscribeButton: "Unsubscribe",
    unsubscribed: "Done. We won’t email you about a checkout again.",
  },
};
