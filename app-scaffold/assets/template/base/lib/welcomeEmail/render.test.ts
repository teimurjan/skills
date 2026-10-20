import { describe, expect, test } from "bun:test";
import { LOCALES } from "@/lib/i18n";
import { renderWelcomeEmail } from "./render";

const input = {
  email: "parent@example.com",
  provider: "facebook",
  appStoreUrl: "https://apps.apple.com/app/id123",
  postalAddress: "1 Main St <Suite 2>",
};

describe("renderWelcomeEmail", () => {
  test.each([...LOCALES])("%s names the account and links the app", (lang) => {
    const email = renderWelcomeEmail({ ...input, lang });

    for (const part of [email.html, email.text]) {
      expect(part).toContain(input.email);
      expect(part).toContain("Facebook");
      expect(part).toContain(input.appStoreUrl);
    }
    expect(email.html).toContain("/badges/app-store.png");
    expect(email.text.toLowerCase()).not.toContain("unsubscribe");
  });

  test("an email sign-in names no brand", () => {
    const { text } = renderWelcomeEmail({ ...input, lang: "en", provider: "email" });
    expect(text).toContain("Sign in with your email, parent@example.com.");
  });

  test("drops the badge when there is no listing", () => {
    const email = renderWelcomeEmail({ ...input, lang: "en", appStoreUrl: null });
    expect(email.html).not.toContain("app-store.png");
    expect(email.text).not.toContain("App Store");
  });

  test("escapes what it did not write", () => {
    const { html } = renderWelcomeEmail({ ...input, lang: "en" });
    expect(html).toContain("1 Main St &#60;Suite 2&#62;");
  });
});
