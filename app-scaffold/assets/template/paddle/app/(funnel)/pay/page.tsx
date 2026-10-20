"use client";

import { useEffect, useState } from "react";
import { initializePaddle } from "@paddle/paddle-js";
import Logo from "@/components/Logo";
import { paddleBrowserEnvironment, paddleClientToken } from "@/lib/paddlePrices";

/**
 * The default payment link — Paddle → Checkout → Checkout settings → Default payment link,
 * on a domain that has passed website approval.
 *
 * Paddle appends `?_ptxn=txn_...` and Paddle.js opens the checkout for that transaction on
 * its own as soon as it initializes. So this page holds no checkout code: initializing the
 * SDK *is* the implementation, and the markup is only what someone looks at while it loads.
 *
 * It exists because Paddle sends people here, not because the site links to it. A failed card
 * puts the subscription in `past_due`, and the "update payment method" link in Paddle's
 * recovery email is this URL. `past_due` still grants access (`PADDLE_LIVE_STATUSES` in
 * `lib/entitlements.ts`), so without this page those subscribers keep the product with no way
 * to fix the card, until Paddle exhausts its retries and cancels them.
 *
 * Under `(funnel)/` for the layout's `robots: noindex` — a payment link is not a search
 * result — and for its no-nav shell.
 */
export default function PayPage() {
  const [state, setState] = useState<"working" | "empty" | "unavailable">("working");

  useEffect(() => {
    if (!paddleClientToken) {
      setState("unavailable");
      return;
    }

    // Read the param off `location` rather than with useSearchParams: it decides a line of
    // copy, not what renders, and useSearchParams would force a Suspense boundary onto an
    // otherwise static page to say the same thing.
    const hasTransaction = new URLSearchParams(window.location.search).has("_ptxn");

    void initializePaddle({
      token: paddleClientToken,
      environment: paddleBrowserEnvironment,
      // The overlay opens itself here, so there is no `Checkout.open()` call to pass settings
      // to. These are the defaults it opens with instead. The site ships one appearance, so
      // the form is told which one rather than following the reader's system preference.
      checkout: { settings: { theme: "light" } },
    })
      .then(() => setState(hasTransaction ? "working" : "empty"))
      .catch(() => setState("unavailable"));
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <div className="w-full max-w-[420px]">
        <Logo />

        {state === "working" && (
          <>
            <p className="mt-7 text-[16px] leading-[1.5] opacity-70">Opening secure checkout…</p>
            <p className="mt-3 text-[12.5px] leading-[1.5] opacity-55">
              Billed by Paddle. If nothing opens, reload the page.
            </p>
          </>
        )}

        {state === "empty" && (
          <>
            <h1 className="font-semibold tracking-[-0.02em] mt-7 text-[22px] leading-[1.2]">Nothing to pay here.</h1>
            <p className="mt-4 text-[14.5px] leading-[1.5] opacity-70">
              This page opens a payment Paddle has sent you a link to. To subscribe, start from
              the beginning.{" "}
              <a href="/start" className="font-medium underline underline-offset-4">
                Get Appname
              </a>
            </p>
          </>
        )}

        {state === "unavailable" && (
          <p className="card mt-7 px-4 py-3.5 text-[14px] opacity-70">
            Checkout isn&rsquo;t configured in this environment.
          </p>
        )}
      </div>
    </div>
  );
}
