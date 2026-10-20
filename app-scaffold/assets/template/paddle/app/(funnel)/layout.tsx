import type { Metadata } from "next";
import { Document, siteIcons } from "@/components/site/Document";
import "@/app/globals.css";

export const metadata: Metadata = {
  ...siteIcons,
  title: "Appname",
  description: "Subscribe, then sign in on the app.",
  // A funnel is an ad destination, not a search result. Keeping it out of the index also
  // keeps it from competing with the homepage for the brand query.
  robots: { index: false, follow: false },
};

/**
 * No nav, no footer, no links out — every exit on a funnel page is a leak.
 *
 * `/start` is no longer a Next page — it is a static file (`public/funnel/`, served by the
 * rewrite in `next.config.mjs`) that carries its own `AuthProvider`. The only route left under
 * this group is `/pay`, Paddle's recovery-link landing, which needs no auth. So this layout is
 * now just the no-nav shell and the funnel's `noindex` metadata.
 *
 * A root layout, not a nested one, so that `<html lang>` can differ between the site's root
 * layouts; see `components/site/Document.tsx`.
 */
export default function FunnelLayout({ children }: { children: React.ReactNode }) {
  return <Document lang="en">{children}</Document>;
}
