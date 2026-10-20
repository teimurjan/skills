import { describe, expect, test } from "bun:test";
import { LOCALES } from "@/lib/i18n";
import { formatPercent, renderReminderEmail, renderUnsubscribePage } from "./render";

const input = {
  percent: 20,
  checkoutUrl: "https://appname.example/start?x=1#step-12",
  appStoreUrl: "https://apps.apple.com/app/id123",
  unsubscribeUrl: "https://appname.example/api/email/unsubscribe?token=t",
  postalAddress: "1 Main St <Suite 2>",
};

describe("renderReminderEmail", () => {
  test.each([...LOCALES])("%s carries the discount and every link", (lang) => {
    const email = renderReminderEmail({ ...input, lang });

    expect(email.subject).toContain(formatPercent(lang, 20));
    for (const part of [email.html, email.text]) {
      expect(part).toContain(formatPercent(lang, 20));
      expect(part).toContain(input.appStoreUrl);
      expect(part).toContain(input.unsubscribeUrl);
    }
    expect(email.html).toContain('href="https://appname.example/start?x=1#step-12"');
    expect(email.html).toContain("/badges/app-store.png");
    expect(email.text).toContain(input.checkoutUrl);
  });

  test("drops the iPhone half when there is no listing", () => {
    const email = renderReminderEmail({ ...input, lang: "en", appStoreUrl: null });
    expect(email.html).not.toContain("app-store.png");
    expect(email.text).not.toContain("App Store");
  });

  test("escapes what it did not write", () => {
    const { html } = renderReminderEmail({ ...input, lang: "en" });
    expect(html).toContain("1 Main St &#60;Suite 2&#62;");
  });
});

describe("renderUnsubscribePage", () => {
  test("asks with a form that posts back to the same link", () => {
    const page = renderUnsubscribePage("en", "ask", input.unsubscribeUrl);
    expect(page).toContain('method="post"');
    expect(page).toContain(`action="${input.unsubscribeUrl}"`);
  });

  test("confirms without a form once done", () => {
    expect(renderUnsubscribePage("en", "done", input.unsubscribeUrl)).not.toContain("<form");
  });
});
