import { $ } from "bun";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { VNode } from "preact";
import { renderToString } from "preact-render-to-string";
import { compress } from "wawoff2";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { DonePage } from "@/components/funnel/DonePage";
import { FUNNEL_COPY } from "@/components/funnel/copy";
import type { FunnelCopy } from "@/components/funnel/copy/types";
import { FunnelShell } from "@/components/funnel/FunnelShell";
import { COPY_ELEMENT_ID, funnelLocale, LocaleProvider } from "@/components/funnel/locale";
import { SPINE } from "@/components/funnel/steps";
import { validateCopy } from "@/components/funnel/steps.validate";
import { DEFAULT_LANG, LOCALES, type Lang } from "@/lib/i18n";
import { BILLER } from "@/lib/biller";

/**
 * Builds the web funnel into `public/funnel/`: `/start` and `/start/done` as prerendered
 * HTML, one Preact bundle and one stylesheet, rewritten onto those paths by
 * `next.config.mjs`. No Next function on the path.
 *
 * The HTML is the shell's own step 0, rendered from the same components the bundle hydrates
 * it with — **`hydrate()` claims the markup as-is, so the two must be one render**. One file
 * per first screen per language: English at the root of the output (`/start`), every other
 * language in a directory named for its tag (`/<tag>/start`). The rewrites pick between them
 * off the path and the ad's URL.
 *
 * Each page carries its language's whole deck as JSON, and the bundle reads it from there
 * rather than importing it — one bundle for every language, with none of them inside it.
 *
 * JSX here and in everything this imports compiles to Preact: `bunfig.toml` for the bun
 * runtime, the `Bun.build` call below, and `tsconfig.funnel.json` for the typechecker.
 *
 * `--dev` is what `scripts/dev.ts` runs on every change: the fonts already on disk are reused
 * rather than recompressed (five of the build's five and a half seconds), and each page gets a
 * build id and a snippet that reloads the open tab.
 */

const DEV = process.argv.includes("--dev");
const ROOT = path.resolve(import.meta.dir, "..");
const OUT = path.join(ROOT, "public/funnel");
/** Straight out of the iOS bundle — the same TTFs `app/fonts.ts` reads, so the two cannot drift. */
const FONTS = path.join(ROOT, "ios/Appname/Resources/Fonts");
/** The URL prefix the output is served under — `public/` maps onto the site root. */
const BASE = "/funnel";

/** The languages the display face has no glyphs for, set in Inter throughout. A tag added here
 * goes into `:lang(…)` in `app/base.css` and `Typeface.interLanguages` in the app too. */
const INTER_LANGS: readonly Lang[] = [];

/**
 * Only what the first screen draws is preloaded, and only in the face its language reads in:
 * the headline (ExtraBold, or Inter's Bold under it), the options (600) and the line under
 * them (400). Everything else is fetched on demand under `font-display: swap`; Inter in a
 * Latin language only for a glyph Bricolage lacks.
 */
const FACES = [
  { family: "Bricolage Grotesque", weight: 400, file: "BricolageGrotesque-Regular.ttf", preload: "bricolage" },
  { family: "Bricolage Grotesque", weight: 500, file: "BricolageGrotesque-Medium.ttf", preload: false },
  { family: "Bricolage Grotesque", weight: 600, file: "BricolageGrotesque-SemiBold.ttf", preload: "bricolage" },
  { family: "Bricolage Grotesque", weight: 700, file: "BricolageGrotesque-Bold.ttf", preload: false },
  { family: "Bricolage Grotesque", weight: 800, file: "BricolageGrotesque-ExtraBold.ttf", preload: "bricolage" },
  { family: "Inter", weight: 400, file: "Inter-Regular.ttf", preload: "inter" },
  { family: "Inter", weight: 500, file: "Inter-Medium.ttf", preload: false },
  { family: "Inter", weight: 600, file: "Inter-SemiBold.ttf", preload: "inter" },
  { family: "Inter", weight: 700, file: "Inter-Bold.ttf", preload: "inter" },
  { family: "IBM Plex Mono", weight: 400, file: "IBMPlexMono-Regular.ttf", preload: false },
  { family: "IBM Plex Mono", weight: 500, file: "IBMPlexMono-Medium.ttf", preload: false },
  { family: "IBM Plex Mono", weight: 600, file: "IBMPlexMono-SemiBold.ttf", preload: false },
  { family: "Space Grotesk", weight: 600, file: "SpaceGrotesk-SemiBold.ttf", preload: "always" },
] as const;


/** The `--font-*` variables `app/globals.css` builds its families from. */
const FONT_VARIABLES: Record<string, string> = {
  "--font-bricolage": "Bricolage Grotesque",
  "--font-inter": "Inter",
  "--font-plex-mono": "IBM Plex Mono",
  "--font-space-grotesk": "Space Grotesk",
};

const PAGES: Record<string, { page: string; body: () => VNode }> = {
  "index.html": {
    page: "start",
    body: () => (
      <AuthProvider>
        <FunnelShell />
      </AuthProvider>
    ),
  },
  "done.html": { page: "done", body: () => <DonePage /> },
};

/** Where a language's pages go under `public/funnel/`: English at the root, whose URLs every
 * live ad already points at, the rest in a directory per tag. */
const dirFor = (lang: Lang) => (lang === DEFAULT_LANG ? "" : lang);

/** Eight hex characters of the content's SHA-256. */
const contentHash = (bytes: Uint8Array | string) =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 8);

/** What a previous build left under `fonts/`, or nothing if any face is missing. Only `--dev`
 * asks; the URL is still the woff2's own hash, so what is reused is what a full build writes. */
async function cachedFonts(): Promise<Map<string, string> | undefined> {
  const dir = path.join(OUT, "fonts");
  if (!(await stat(dir).catch(() => undefined))) return undefined;
  const present = await readdir(dir);
  const entries = FACES.map((face) => {
    const stem = face.file.replace(/\.ttf$/, "");
    const hit = present.find((name) => name.startsWith(`${stem}-`) && name.endsWith(".woff2"));
    return hit ? ([face.file, `${BASE}/fonts/${hit}`] as const) : undefined;
  });
  return entries.every((entry) => entry !== undefined) ? new Map(entries) : undefined;
}

async function emitFonts(): Promise<Map<string, string>> {
  if (DEV) {
    const cached = await cachedFonts();
    if (cached) return cached;
  }
  await mkdir(path.join(OUT, "fonts"), { recursive: true });
  // woff2 is about a third smaller over the wire, and no other build step produces it. The
  // hash is of the woff2 bytes, so a re-compression that changes nothing changes no URL.
  const entries = await Promise.all(
    FACES.map(async (face) => {
      const woff2 = await compress(await Bun.file(path.join(FONTS, face.file)).bytes());
      const name = face.file.replace(/\.ttf$/, `-${contentHash(woff2)}.woff2`);
      await Bun.write(path.join(OUT, "fonts", name), woff2);
      return [face.file, `${BASE}/fonts/${name}`] as const;
    }),
  );
  return new Map(entries);
}

/** What `next/font/local` does for the Next pages, by hand. */
function fontFaceCss(served: Map<string, string>): string {
  const faces = FACES.map(
    (face) =>
      `@font-face{font-family:"${face.family}";font-style:normal;font-weight:${face.weight};src:url(${served.get(face.file)}) format("woff2");font-display:swap}`,
  );
  const variables = Object.entries(FONT_VARIABLES)
    .map(([variable, family]) => `${variable}:"${family}"`)
    .join(";");
  return `${faces.join("")}:root{${variables}}`;
}

async function emitStylesheet(served: Map<string, string>): Promise<string> {
  // Tailwind scans the repo, so the marketing pages' classes come along — as they do in the
  // Next build too.
  const tailwind = await $`bunx tailwindcss -i ${path.join(ROOT, "app/globals.css")} --minify`
    .cwd(ROOT)
    .quiet()
    .text();
  const css = fontFaceCss(served) + tailwind;
  const name = `funnel-${contentHash(css)}.css`;
  await Bun.write(path.join(OUT, name), css);
  return `${BASE}/${name}`;
}

/**
 * **Every `NEXT_PUBLIC_*` the funnel's client code reads.** A `process.env.X` left in a
 * browser bundle throws on load, and bun's `env` option only substitutes the set ones — so the
 * unset are defined as `undefined` here, and the guard below fails the build if any reference
 * survives. A new variable read from `lib/` shows up as a failed build, not a blank funnel.
 */
const PUBLIC_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_META_PIXEL_ID",
  "NEXT_PUBLIC_AMPLITUDE_API_KEY",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_PUBLIC_APP_STORE_ID",
  ...BILLER.publicEnv,
];

async function emitBundle(): Promise<string> {
  const define = Object.fromEntries(
    PUBLIC_ENV.map((name) => [
      `process.env.${name}`,
      process.env[name] === undefined ? "undefined" : JSON.stringify(process.env[name]),
    ]),
  );
  const result = await Bun.build({
    entrypoints: [path.join(ROOT, "components/funnel/entry.tsx")],
    outdir: OUT,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    naming: { entry: "[name]-[hash].[ext]", chunk: "chunk-[hash].[ext]" },
    publicPath: `${BASE}/`,
    tsconfig: path.join(ROOT, "tsconfig.funnel.json"),
    jsx: { runtime: "automatic", importSource: "preact" },
    env: "disable",
    define: { ...define, "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("funnel bundle failed");
  }
  for (const output of result.outputs) {
    const leaked = (await output.text()).match(/process\.env\.[A-Z_]+/);
    if (leaked) throw new Error(`${leaked[0]} reached the browser bundle — add it to PUBLIC_ENV`);
  }
  const entry = result.outputs.find((output) => output.kind === "entry-point");
  if (!entry) throw new Error("funnel bundle produced no entry point");
  return `${BASE}/${path.basename(entry.path)}`;
}

/** The page fetches itself every half second and reloads when the build id comes back
 * different. Itself and not a stamp file, because which HTML `/start` is depends on the query
 * the tab is open with, and the tab already knows that. */
function devReload(id: string): string {
  return (
    `<meta name="funnel-build" content="${id}">` +
    `<script>(async()=>{for(;;){await new Promise(r=>setTimeout(r,500));try{` +
    `const html=await(await fetch(location.href,{cache:"no-store"})).text();` +
    `const seen=html.match(/name="funnel-build" content="(\\d+)"/);` +
    `if(seen&&seen[1]!=="${id}")location.reload()}catch{}}})()</script>`
  );
}

function iconLinks(): string {
  return (
    `<link rel="manifest" href="/ico/manifest.json">` +
    `<link rel="icon" href="/ico/favicon.ico" sizes="any">` +
    `<link rel="icon" href="/ico/icon-32.png" type="image/png" sizes="32x32">` +
    `<link rel="apple-touch-icon" href="/ico/apple-icon-180x180.png" sizes="180x180">`
  );
}

/** A deck inside a `<script>`, with nothing in it that can close the element early. */
const inlineJson = (copy: FunnelCopy) => JSON.stringify(copy).replace(/</g, "\\u003c");

const escapeAttribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function document(
  lang: Lang,
  copy: FunnelCopy,
  page: string,
  body: string,
  stylesheet: string,
  script: string,
  served: Map<string, string>,
  build: string,
): string {
  const words = INTER_LANGS.includes(lang) ? "inter" : "bricolage";
  const preloads = FACES.filter((face) => face.preload === "always" || face.preload === words)
    .map(
      (face) =>
        `<link rel="preload" href="${served.get(face.file)}" as="font" type="font/woff2" crossorigin>`,
    )
    .join("");
  // **`maximum-scale=1` is the iOS focus-zoom fix**: Safari zooms in on a field under 16px
  // and does not zoom back out, and the card fields are the biller's, inside their iframe. Pinch
  // still works — Safari ignores the restriction for deliberate gestures.
  return (
    `<!doctype html><html lang="${lang}"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">` +
    // An ad destination, not a search result.
    `<title>${escapeAttribute(copy.meta.title)}</title>` +
    `<meta name="description" content="${escapeAttribute(copy.meta.description)}">` +
    `<meta name="robots" content="noindex, nofollow">` +
    preloads +
    `<link rel="stylesheet" href="${stylesheet}">` +
    `<script type="module" src="${script}"></script>` +
    iconLinks() +
    (DEV ? devReload(build) : "") +
    `</head><body>` +
    `<div id="funnel-root" data-page="${page}">${body}</div>` +
    `<script type="application/json" id="${COPY_ELEMENT_ID}">${inlineJson(copy)}</script>` +
    `</body></html>\n`
  );
}

async function clean() {
  // A dev rebuild keeps `fonts/` for `cachedFonts` and drops everything else, so the hashed
  // output of every previous edit does not pile up.
  const keep = DEV ? ["fonts"] : [];
  await mkdir(OUT, { recursive: true });
  for (const entry of await readdir(OUT)) {
    if (!keep.includes(entry)) await rm(path.join(OUT, entry), { recursive: true, force: true });
  }
}

async function main() {
  const started = performance.now();
  const build = String(Date.now());
  await clean();

  const served = await emitFonts();
  const [stylesheet, script] = await Promise.all([emitStylesheet(served), emitBundle()]);

  for (const lang of LOCALES) {
    const copy = FUNNEL_COPY[lang];
    // A missing word fails the build rather than shipping a blank row to one market.
    validateCopy(lang, copy, SPINE);
    const locale = funnelLocale(lang, copy);
    for (const [file, { page, body }] of Object.entries(PAGES)) {
      const markup = renderToString(<LocaleProvider locale={locale}>{body()}</LocaleProvider>);
      const html = document(lang, copy, page, markup, stylesheet, script, served, build);
      await Bun.write(path.join(OUT, dirFor(lang), file), html);
    }
  }

  if (DEV) {
    console.log(`funnel rebuilt in ${Math.round(performance.now() - started)} ms`);
    return;
  }

  // Every language's pages are the same size give or take its words, so one set is printed —
  // English's, at the root — and the rest are counted.
  const languages = LOCALES.filter((lang) => lang !== DEFAULT_LANG);
  const files = (await readdir(OUT, { recursive: true })).filter(
    (file) =>
      !file.endsWith("fonts") &&
      !languages.some((lang) => file === lang || file.startsWith(`${lang}/`)),
  );
  const sizes = await Promise.all(
    files.map(async (file) => {
      const bytes = await Bun.file(path.join(OUT, file)).bytes();
      return { file, raw: bytes.byteLength, gz: Bun.gzipSync(bytes).byteLength };
    }),
  );
  for (const { file, raw, gz } of sizes.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`${String(gz).padStart(7)} gz ${String(raw).padStart(8)} raw  ${BASE}/${file}`);
  }
  console.log(`  + the same ${Object.keys(PAGES).length} pages in ${languages.length} more languages`);
}

await main();
