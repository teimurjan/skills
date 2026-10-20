import { hydrate, render, type ComponentChild } from "preact";
import { initAnalytics, track } from "@/lib/analytics";
import { META_PIXEL_ID, flushMetaQueue, isMetaPixelConfigured } from "@/lib/metaPixel";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { DonePage } from "./DonePage";
import { FunnelShell } from "./FunnelShell";
import { LocaleProvider, readPageLocale } from "./locale";
import { readLocation } from "./location";

/**
 * The browser entry for the two funnel pages, in every language. `/start` is a file in
 * `public/`, so the pixel loader and the Amplitude boot that a Next layout does elsewhere are
 * done here by hand. The bundle holds no words: each page carries its own deck, which is how
 * one bundle serves eighteen languages without shipping seventeen of them.
 */

/** Which page the build rendered, stamped on the root so one bundle serves both. */
const PAGES: Record<string, () => ComponentChild> = {
  start: () => (
    <AuthProvider>
      <FunnelShell />
    </AuthProvider>
  ),
  done: () => <DonePage />,
};

/** Same tag `components/MetaPixel.tsx` renders on the Next pages. `flushMetaQueue` runs
 * unconditionally as well as on load, so a blocked loader settles rather than strands it. */
function mountPixel(): void {
  if (!isMetaPixelConfigured) return;
  const script = document.createElement("script");
  script.id = "fb-pixel";
  script.src = "/scripts/pixel.js";
  script.async = true;
  script.dataset.pixelId = META_PIXEL_ID;
  script.addEventListener("load", flushMetaQueue);
  document.body.appendChild(script);
  flushMetaQueue();
}

const root = document.getElementById("funnel-root");
const page = root && PAGES[root.dataset.page ?? ""];
const locale = readPageLocale();
if (root && page && locale) {
  const tree = <LocaleProvider locale={locale}>{page()}</LocaleProvider>;
  // The HTML is always step 0, and `hydrate` claims markup as-is. A reader arriving anywhere
  // else gets a plain render into an *emptied* root: `render` into a container with children
  // reuses them the way hydration does, and a step suspending on its `lazy()` chunk parks on
  // the first unclaimed node and leaves it in the page.
  if (root.dataset.page === "done" || readLocation().index === 0) {
    hydrate(tree, root);
  } else {
    root.replaceChildren();
    render(tree, root);
  }

  mountPixel();
  initAnalytics();
  track({ name: "page_viewed", path: window.location.pathname });
}
