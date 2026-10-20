"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Starts Amplitude and reports client-side navigations.
 *
 * The SDK is imported dynamically rather than at the top of the module: this component
 * mounts in the root layout, and a static import would put ~30kB of analytics in front of
 * the paint of every page — including the funnel's first screen, which is the one number
 * this whole funnel is tuned for. Nothing is lost by starting it a tick late; the first
 * `page_viewed` is fired from inside the same import.
 */
export function AnalyticsBoot() {
  const pathname = usePathname();

  useEffect(() => {
    void import("@/lib/analytics").then(({ initAnalytics, track }) => {
      initAnalytics();
      track({ name: "page_viewed", path: pathname });
    });
  }, [pathname]);

  return null;
}
