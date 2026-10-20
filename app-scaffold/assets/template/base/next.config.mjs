/**
 * The funnel in every language but English lives under the language's tag, like the site's own
 * pages: `/de/start` is `public/funnel/de/index.html`. A pattern rather than the list, so a
 * language the funnel build adds is served with no edit here; a tag with no build behind it
 * rewrites to a file that is not there, which is a 404. Two letters, or two and a region
 * (`pt-BR`) — the same shape `proxy.ts` matches the site's prefixes with.
 */
const LANG = ":lang([a-z]{2}|[a-z]{2}-[A-Z]{2})";

/** The same rewrites once for English at the root and once for every prefixed language. */
const inEveryLanguage = (rule) => [
  rule("", "/funnel"),
  rule(`/${LANG}`, "/funnel/:lang"),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // The web funnel is not a Next page: `bun run funnel:build` (scripts/build-funnel.tsx)
      // prerenders it into `public/funnel/`, and these rewrites are the whole of how it is
      // served — a static file from the CDN, with no function, no React and no session
      // refresh on the path. The query string, which carries the ad ids, is preserved.
      ...inEveryLanguage((prefix, out) => [
        { source: `${prefix}/start`, destination: `${out}/index.html` },
        { source: `${prefix}/start/done`, destination: `${out}/done.html` },
      ]).flat(),
      // The icon set lives in `public/ico/` and is linked explicitly from the
      // metadata in `app/layout.tsx`. Crawlers and older clients still request the
      // well-known root paths blind, so point those at the same files rather than
      // keeping a second copy at the root.
      { source: "/favicon.ico", destination: "/ico/favicon.ico" },
      { source: "/apple-touch-icon.png", destination: "/ico/apple-icon-180x180.png" },
    ];
  },
  async headers() {
    // Everything the funnel build emits besides the two HTML files carries a content hash
    // in its name, so it can be cached the way `/_next/static` is. The HTML keeps the
    // platform default and is revalidated on every visit, which is how a new build reaches
    // a returning reader.
    const immutable = [
      "/funnel/:file(.+-[0-9a-z]{8}\\.js)",
      "/funnel/:file(.+-[0-9a-z]{8}\\.css)",
      "/funnel/fonts/:file(.+-[0-9a-z]{8}\\.woff2)",
    ].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }));
    return immutable;
  },
};

export default nextConfig;
