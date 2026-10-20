import { badge, renderLetter, say, type RenderedEmail } from "@/lib/email/letter";
import type { Lang } from "@/lib/i18n";
import { WELCOME_COPY } from "./copy";

export interface WelcomeEmailInput {
  lang: Lang;
  email: string;
  /** `app_metadata.provider`. Anything but an OAuth brand reads as the email sign-in. */
  provider: string | null;
  /** Null drops the badge: there is no listing to send anybody to. */
  appStoreUrl: string | null;
  postalAddress: string;
}

const BRANDS: Record<string, string> = { facebook: "Facebook", apple: "Apple", google: "Google" };

/** Transactional, so no unsubscribe: it is the receipt's other half, sent once per purchase. */
export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const words = WELCOME_COPY[input.lang];
  const brand = (input.provider && BRANDS[input.provider]) || null;
  const iphone = input.appStoreUrl ? [say(words.ios), badge(words.appStore, input.appStoreUrl)] : [];
  const letter = [
    say(words.thanks),
    ...iphone,
    say(words.signIn(brand, input.email)),
    say(words.start),
    say(words.signature),
  ];
  const footer = [say(words.reason), say(input.postalAddress)];

  return renderLetter(input.lang, words.subject, letter, footer);
}
