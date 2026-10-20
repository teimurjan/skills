"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { META_PIXEL_ID, flushMetaQueue, isMetaPixelConfigured, metaTrack } from "@/lib/metaPixel";

/**
 * Mounts the Meta Pixel. Renders nothing when `NEXT_PUBLIC_META_PIXEL_ID` is unset.
 *
 * Loaded by `src` rather than inline. Two things went wrong with inline versions and are
 * worth not rediscovering: `strategy="beforeInteractive"` emits the snippet as a queued
 * `__next_s` push that never executes, and inline content is what makes the server and
 * client trees disagree at hydration. A `src` script also gives us `onLoad`, which is a real
 * readiness signal — better than assuming an effect ordering.
 *
 * The runtime helpers live in `lib/metaPixel.ts`.
 */
export function MetaPixel() {
  const pathname = usePathname();
  /** The loader fires the first PageView itself; this skips the initial run so it is not
   * counted twice. Subsequent runs are real client-side navigations. */
  const isFirstPath = useRef(true);

  // Also from a mount effect, not only the tag's `onLoad`: a blocker that takes
  // `/scripts/pixel.js` itself never fires that handler, and without this the buffer would
  // wait forever instead of settling as blocked. `flushMetaQueue` is idempotent.
  useEffect(flushMetaQueue, []);

  useEffect(() => {
    if (isFirstPath.current) {
      isFirstPath.current = false;
      return;
    }
    metaTrack("PageView");
  }, [pathname]);

  if (!isMetaPixelConfigured) return null;
  return (
    <Script
      id="fb-pixel"
      src="/scripts/pixel.js"
      strategy="afterInteractive"
      data-pixel-id={META_PIXEL_ID}
      // Anything the funnel tracked while this was still loading is buffered rather than
      // dropped; replay it now that `fbq` exists.
      onLoad={flushMetaQueue}
    />
  );
}
