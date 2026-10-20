import Link from "next/link";
import { BILLER } from "@/lib/biller";
import { pathFor } from "@/lib/i18n";
import type { SiteCopy } from "./types";

const to = (page: Parameters<typeof pathFor>[1]) => pathFor("en", page);

/** Placeholders the product fills in: who runs it, where to write, and when these pages changed. */
const OPERATOR = "Operator Name";
const SUPPORT = "support@appname.example";
const UPDATED = "1 January 2027";

const mail = <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>;

export const en: SiteCopy = {
  nav: {
    pricing: "Pricing",
    support: "Support",
    privacy: "Privacy",
    terms: "Terms",
    refund: "Refunds",
    switchLabel: "Switch language",
    start: "Get started",
  },

  home: {
    meta: {
      title: "Appname: one line on what it fixes",
      description: "Two sentences on who it is for and what changes for them, in the words the ads use.",
    },
    headline: (
      <>
        Name the outcome, <span className="hl">in the ad’s words</span>
      </>
    ),
    sub: "One or two sentences on what the app does and how fast the reader sees it work.",
    webCta: "Or start on the web →",

    shotsHeading: "What it looks like",
    /** The App Store screenshots, e.g. `{ src: "/screenshots/en-US/01-home.webp", alt: "…" }`. */
    shots: [],

    painsHeading: "Three ways the problem costs you",
    pains: [
      { kicker: "Time", title: "The first pain, as a title", body: "One or two sentences on how the app answers it." },
      { kicker: "Money", title: "The second pain, as a title", body: "One or two sentences on how the app answers it." },
      { kicker: "Peace of mind", title: "The third pain, as a title", body: "One or two sentences on how the app answers it." },
    ],

    howHeading: "How it works",
    howSub: "Three steps from download to the first result.",
    steps: [
      { n: "1", title: "Answer a few questions", body: "The plan is built from what you say." },
      { n: "2", title: "Sign in on your iPhone", body: "Your plan is waiting on your account." },
      { n: "3", title: "See the first result", body: "Name what happens on the first day." },
    ],

    plan: {
      eyebrow: "One plan",
      pitch: "Everything Appname does, on every iPhone you sign in to.",
      monthly: "Monthly",
      yearly: "Yearly",
      lifetime: "Lifetime",
      cta: "Get Appname",
      appNote: "Or download it and start with a free trial from the App Store.",
    },
    closer: {
      heading: "Ready when you are",
      body: "One sentence that closes the argument the page made.",
    },
  },

  pricing: {
    meta: {
      title: "Pricing | Appname",
      description: "One plan, monthly or yearly, on the web or in the iPhone app with a free trial.",
    },
    eyebrow: "Pricing",
    heading: "One plan, everything in it",
    intro: "There is no free tier and no usage meter. Say why that is the honest choice for this product.",
    web: {
      eyebrow: "On the web",
      perMonth: " / month",
      orOthers: (yearly, lifetime) => `or ${yearly} a year, or ${lifetime} once for good`,
      cta: "Get Appname",
      note: "Prices are shown in your own currency at checkout.",
    },
    app: {
      eyebrow: "In the iPhone app",
      headline: "3 days free",
      sub: "then monthly or yearly",
      note: "The free trial is an App Store introductory offer. Apple charges nothing until it ends, and it can be cancelled from your Apple ID settings at any point before then.",
    },
    body: (
      <>
        <h2>What you get</h2>
        <ul>
          <li>The first thing it does</li>
          <li>The second thing it does</li>
          <li>Your data on every iPhone you sign in to</li>
        </ul>

        <h2>Cancelling</h2>
        <p>
          A web subscription is cancelled from the customer portal, reachable from Settings in the
          app or from the receipt emailed to you. An App Store subscription is cancelled in your
          Apple ID settings, and only Apple can do that, so deleting the app or your Appname
          account will not stop it.
        </p>
        <p>The lifetime unlock renews nothing, so there is nothing to cancel.</p>
        <p>
          Either way your data stays readable after a subscription lapses; what stops is adding
          more. Money back is covered on the <Link href={to("refund")}>refunds page</Link>.
        </p>
      </>
    ),
  },

  support: {
    meta: {
      title: "Support | Appname",
      description: "How to reach us, and answers to the questions that come up most.",
    },
    eyebrow: "Support",
    heading: "Something not working?",
    intro: <>Write to {mail}. A real person answers, usually within a day.</>,
    body: (
      <>
        <h2>I paid on the web but the app still shows a paywall</h2>
        <p>
          Sign in on the app with the same account you used at checkout. The purchase is attached
          to the account, not to the device.
        </p>

        <h2>How do I cancel?</h2>
        <p>
          If you subscribed in the app, in your Apple ID settings. Only Apple can cancel that. If
          you subscribed on this website, through the customer portal, reachable from Settings in
          the app or from your receipt. The lifetime unlock has nothing to cancel. See{" "}
          <Link href={to("terms")}>Terms</Link>, and <Link href={to("refund")}>Refunds</Link> for
          money back.
        </p>

        <h2>How do I delete my data?</h2>
        <p>
          <strong>Settings → Delete account</strong> in the app. It erases everything, immediately.
          See <Link href={to("privacy")}>Privacy</Link> for what “everything” covers.
        </p>
      </>
    ),
  },

  refund: {
    meta: {
      title: "Refunds | Appname",
      description: "The refund policy for a purchase on this website, and how App Store refunds work.",
    },
    eyebrow: "Refunds",
    heading: "Money back",
    updatedLabel: "Last updated",
    updated: UPDATED,
    intro: (
      <>
        Its own page rather than a paragraph inside <Link href={to("terms")}>Terms</Link>, because
        it is the one clause anybody looks for before paying.
      </>
    ),
    body: (
      <>
        <h2>Bought on this website</h2>
        <p>
          <strong>Thirty days, no questions.</strong> Write to {mail} from the address you paid
          with, say you want a refund, and you will get one.
        </p>
        <p>
          {BILLER.name} is the merchant of record and issues the money, so it returns to the card
          you paid with. Most land within five to ten working days depending on your bank. Access
          ends when the refund is issued, whether it was a subscription or the lifetime unlock.
        </p>

        <h2>Bought in the app</h2>
        <p>
          Refunds for an App Store purchase are Apple’s to give, and we cannot issue them. Request
          one at <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a> with the
          Apple ID you bought it on.
        </p>

        <h2>The free trial</h2>
        <p>
          The trial is an App Store introductory offer. Nothing is charged until it ends, so
          cancelling before then costs nothing. Cancel in your Apple ID settings; deleting the app
          does not do it.
        </p>

        <h2>Your statutory rights</h2>
        <p>
          If you are a consumer in the EU or the UK, you have a 14-day right to withdraw from a
          distance contract. Nothing on this page takes that right away.
        </p>

        <h2>Contact</h2>
        <p>{mail}</p>
      </>
    ),
  },

  privacy: {
    meta: {
      title: "Privacy | Appname",
      description: "What Appname stores, what it never stores, and how to get rid of all of it.",
    },
    eyebrow: "Privacy",
    heading: "Your data is yours",
    updatedLabel: "Last updated",
    updated: UPDATED,
    body: (
      <>
        <p>
          Appname is operated by {OPERATOR}. This page describes what the app and this website
          store, why, and how to remove it.
        </p>

        <h2>What we store</h2>
        <h3>Your account</h3>
        <p>
          An email address, and the identifier Apple, Google or Facebook gives us if you signed in
          with one of them, with the name and email address it shares. Sign in with Apple lets you
          hide your real address; if you do, we only ever see the relay address. We never see a
          password you use with those providers.
        </p>

        <h3>What you create in the app</h3>
        <p>Describe the records the app keeps, where they live and whether they leave the phone.</p>

        <h3>Your subscription</h3>
        <p>
          If you subscribed in the app: Apple’s transaction identifier, the product, the expiry
          date and whether it is live. Apple does not give us your card details, your name or your
          address.
        </p>
        <p>
          If you subscribed on the web: {BILLER.name} is the merchant of record. It takes the
          payment and holds the card details, which we never see. We store the customer and
          subscription identifiers it gives us, the status and the end of the paid period.
        </p>

        <h3>Emails</h3>
        <p>
          We email you a sign-in code when you ask for one, a welcome note after a web purchase,
          and, if you start a checkout on this website and do not finish it, one reminder. Every
          reminder carries an unsubscribe link. Resend delivers these emails for us.
        </p>

        <h3>Product analytics</h3>
        <p>
          We record which screens are opened and which actions are taken through Amplitude. No
          event carries the content of what you create. You can opt out of app tracking in iOS
          Settings, and the app respects it.
        </p>

        <h3>Advertising</h3>
        <p>
          This website loads the Meta pixel to measure which ads bring people who subscribe. It is
          not loaded at all for readers in the EEA, the UK or Switzerland. When a purchase
          completes we send Meta a hashed email address so the conversion can be matched.
        </p>

        <h3>Your language</h3>
        <p>
          If you use the language switcher, we store your choice in a cookie named{" "}
          <code>appname.lang</code>. It holds a language tag and nothing else.
        </p>

        <h2>What we never store</h2>
        <ul>
          <li>Card numbers. Apple and {BILLER.name} handle payment; we never touch a card.</li>
          <li>Your location, your contacts, your photos or your files.</li>
        </ul>

        <h2>Who else sees it</h2>
        <ul>
          <li>
            <strong>Supabase</strong>: the database, and the service that authenticates your sign-in.
          </li>
          <li>
            <strong>Vercel</strong>: hosting for this website and the API the app talks to.
          </li>
          <li>
            <strong>{BILLER.name}</strong>: merchant of record for web purchases.
          </li>
          <li>
            <strong>Amplitude</strong>: product analytics.
          </li>
          <li>
            <strong>Resend</strong>: email delivery.
          </li>
        </ul>
        <p>Nobody else. We do not sell or share your data with advertisers or data brokers.</p>

        <h2 id="delete">Deleting everything</h2>
        <p>
          In the app: <strong>Settings → Delete account</strong>. It erases your account and
          everything attached to it, immediately, and it cannot be undone.
        </p>
        <p>
          Signed in with Facebook? You can also remove Appname under{" "}
          <strong>Settings &amp; privacy → Settings → Apps and websites</strong>. That stops
          Facebook sharing anything further with us, but it does not erase your Appname account;
          the step above does.
        </p>
        <p>
          Deleting your account does not cancel a subscription. An App Store subscription lives on
          your Apple ID and only Apple can cancel it; a web subscription is cancelled through the
          customer portal. Cancel first, then delete. Or write to {mail} and we will do it and
          confirm.
        </p>

        <h2>Your rights</h2>
        <p>
          If you are in the EEA or the UK, you have the right to access, correct, export and erase
          your data, and to object to processing. Write to {mail} for anything the app does not
          already cover.
        </p>

        <h2>Children</h2>
        <p>Appname is not directed at children. We do not knowingly collect data from anyone under 13.</p>

        <h2>Changes</h2>
        <p>
          If this page changes in a way that affects what we store or who sees it, we will say so
          in the app before the change takes effect.
        </p>

        <h2>Contact</h2>
        <p>{mail}</p>
      </>
    ),
  },

  terms: {
    meta: {
      title: "Terms | Appname",
      description: "The terms for using Appname and for the subscription sold on this site.",
    },
    eyebrow: "Terms of service",
    heading: "Terms",
    updatedLabel: "Last updated",
    updated: UPDATED,
    body: (
      <>
        <p>
          These terms cover the Appname app and this website, both operated by {OPERATOR}. Using
          either means accepting them.
        </p>

        <h2>What Appname is</h2>
        <p>Describe what the app does, and what it does not promise.</p>

        <h2>Your account</h2>
        <p>
          Keep your credentials to yourself; you are responsible for what happens under your
          account. You can delete it at any time from <strong>Settings → Delete account</strong>.
        </p>

        <h2>Subscriptions and the lifetime unlock</h2>
        <h3>Bought on this website</h3>
        <p>
          Payment is taken by {BILLER.name}, the merchant of record
          {BILLER.buyerTermsUrl ? (
            <>
              , whose <a href={BILLER.buyerTermsUrl}>buyer terms</a> apply to the transaction
            </>
          ) : null}
          . Subscriptions renew automatically at the interval you chose until cancelled. Prices are
          shown in your own currency before you pay and include any tax that must be collected.
        </p>
        <p>
          Cancel from the customer portal, reachable from Settings in the app or from your
          receipt. Cancelling stops the next renewal; the subscription stays live until the end of
          the period you already paid for. The lifetime unlock does not renew and is tied to the
          account you bought it with.
        </p>

        <h3>Bought in the app</h3>
        <p>
          Payment is taken by Apple under your Apple ID and Apple’s{" "}
          <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">
            standard end-user licence agreement
          </a>
          . Subscriptions renew automatically unless cancelled at least 24 hours before the end
          of the current period. Manage or cancel in your Apple ID settings.
        </p>

        <h3>Refunds</h3>
        <p>
          Thirty days on a web purchase, and Apple’s to give on an App Store one. The detail is on
          the <Link href={to("refund")}>refunds page</Link>.
        </p>

        <h2>Acceptable use</h2>
        <p>
          Do not attempt to break, overload or reverse-engineer the service, or resell access. We
          may suspend an account that does, and will say why.
        </p>

        <h2>Liability</h2>
        <p>
          To the extent the law allows, Appname is provided as-is and our liability is limited to
          what you paid in the twelve months before the claim. Nothing here limits liability that
          cannot lawfully be limited.
        </p>

        <h2>Changes</h2>
        <p>
          Material changes will be announced in the app before they take effect, and continuing to
          use Appname after that means accepting them.
        </p>

        <h2>Contact</h2>
        <p>{mail}</p>
      </>
    ),
  },
};
