import type { Metadata } from "next";
import { bricolage, inter, plexMono, spaceGrotesk } from "@/app/fonts";
import { AnalyticsBoot } from "@/components/AnalyticsBoot";
import { MetaPixel } from "@/components/MetaPixel";
import type { Lang } from "@/lib/i18n";

/**
 * The `<html>` shell, shared by the four root layouts.
 *
 * There are four because `<html lang>` has to be right, and a layout cannot change an
 * attribute on an element a layout above it rendered. So the English pages, every prefixed
 * locale's pages, the funnel and the app each own theirs — and this component is what
 * stops them from drifting apart. `app/[locale]` takes the tag from the segment, so the
 * count does not grow with the languages the site is written in.
 *
 * A `headers()` read in a single shared root layout would have been the alternative, and
 * it would have opted every page on the site into dynamic rendering — including `/start`,
 * whose whole design is that it paints from the CDN with no JavaScript.
 *
 * The stylesheet is the caller's. The site and the funnel share `app/globals.css`; the app
 * under `app/app/` has `app/app/app.css`, with shadcn's tokens in it and the marketing
 * sources scanned out — so each root layout imports its own, and this shell imports none.
 *
 * `surface` is the one thing that differs: the app is signed into, not advertised to, so
 * it carries no Meta pixel. Amplitude rides on both.
 */
export function Document({
  lang,
  surface = "site",
  children,
}: {
  lang: Lang;
  surface?: "site" | "app";
  children: React.ReactNode;
}) {
  return (
    <html
      lang={lang}
      className={`${inter.variable} ${plexMono.variable} ${spaceGrotesk.variable} ${bricolage.variable}`}
    >
      <body className="font-sans antialiased" data-surface={surface}>
        {children}
        {/* Both are inert until their key is set — a bare clone and a preview deploy
            therefore never have to be filtered out of the numbers by hand. */}
        <AnalyticsBoot />
        {surface === "site" && <MetaPixel />}
      </body>
    </html>
  );
}

/** The icons every root layout carries. Spread into each one's `metadata` rather than
 * repeated, so a new size is added in one place. */
export const siteIcons: Pick<Metadata, "manifest" | "icons"> = {
  manifest: "/ico/manifest.json",
  icons: {
    icon: [
      { url: "/ico/favicon.ico", sizes: "any" },
      { url: "/ico/icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/ico/apple-icon-180x180.png", sizes: "180x180" }],
  },
};
