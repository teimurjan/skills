import { badge, escape, link, renderLetter, say, type RenderedEmail } from "@/lib/email/letter";
import type { Lang } from "@/lib/i18n";
import { REMINDER_COPY } from "./copy";

/** `Palette.swift`'s ink and canvas, and the one typeface, for the page that is not an email. */
const INK = "#18202e";
const CANVAS = "#fff8ef";
const HAIRLINE = "#dfe3e9";
const SANS = "Figtree,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface ReminderEmailInput {
  lang: Lang;
  percent: number;
  checkoutUrl: string;
  /** Null drops the iPhone half: there is no listing to send anybody to. */
  appStoreUrl: string | null;
  unsubscribeUrl: string;
  postalAddress: string;
}

/** `20%`, `20 %`: where the sign goes is the language's. */
export const formatPercent = (lang: Lang, percent: number): string =>
  new Intl.NumberFormat(lang, { style: "percent" }).format(percent / 100);

/** One link and Apple's badge, in `renderLetter`'s shape. */
export function renderReminderEmail(input: ReminderEmailInput): RenderedEmail {
  const words = REMINDER_COPY[input.lang];
  const percent = formatPercent(input.lang, input.percent);
  const iphone = input.appStoreUrl
    ? [say(words.ios), say(words.trial), badge(words.appStore, input.appStoreUrl)]
    : [];
  const letter = [
    say(words.intro),
    say(words.pitch),
    say(words.web(percent)),
    link(words.webLink, input.checkoutUrl),
    ...iphone,
    say(words.signature),
  ];
  const footer = [say(words.reason), say(input.postalAddress), link(words.unsubscribe, input.unsubscribeUrl)];

  return renderLetter(input.lang, words.subject(percent), letter, footer);
}

/** The page the footer link opens. It asks before acting, because mail scanners open every
 * link in a message and an unsubscribe on GET would act for whichever scanner came first. */
export function renderUnsubscribePage(lang: Lang, state: "ask" | "done", action: string): string {
  const words = REMINDER_COPY[lang];
  const content =
    state === "ask"
      ? `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;">${escape(words.unsubscribeTitle)}</h1>
<form method="post" action="${escape(action)}"><button type="submit" style="width:100%;min-height:52px;border:0;border-radius:999px;background:${INK};color:#ffffff;font:700 16px ${SANS};cursor:pointer;">${escape(words.unsubscribeButton)}</button></form>`
      : `<p style="margin:0;font-size:16px;line-height:1.5;">${escape(words.unsubscribed)}</p>`;

  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Appname</title></head>
<body style="margin:0;padding:48px 16px;background:${CANVAS};font-family:${SANS};color:${INK};">
<main style="max-width:420px;margin:0 auto;padding:32px 28px;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:22px;">
<p style="margin:0 0 24px;font-size:15px;font-weight:700;">Appname</p>
${content}
</main>
</body>
</html>`;
}
