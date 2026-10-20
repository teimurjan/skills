#!/usr/bin/env node
// Renders the App Store's creative assets — the product page header and the search result
// image — per locale, from the same captures, captions, fonts and palette as the screenshots.
//
// Usage: node appstore/scripts/generate-creative-assets.mjs [--locales=en,de,fr]
//
// Output: appstore/creatives/<ASC locale>/<name>-<ASC locale>.png, gitignored, and pushed by
// push-creative-assets.mjs — deliver has no idea these exist. The locale is in the filename
// because the Asset Library is one flat list across every language.
//
// The geometry is Apple's (developer.apple.com, "Creative assets specifications" and the
// static PSD templates): the header is 3840x1646, the search image 3840x2560, neither may
// carry alpha. The header's "art safe area" is read off its template's guide layer. On an
// iPhone the header is cropped to roughly 3:2 about its centre, with the back and share
// buttons over its top corners; the search image is shown whole. The app is iPhone-only,
// so that is the reading these are composed for — the header keeps every word inside the
// safe area, the search image follows Apple's own examples and runs its headline wider.

import { chromium } from "playwright";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { localeFor } from "./lib/locales.mjs";
import {
  backgroundCss,
  captionHtml,
  captionsFor,
  CREATIVES_DIR,
  dataUri,
  ensureDir,
  FACES,
  fontFaceCss,
  HIGHLIGHT_CSS,
  PALETTE,
  phoneMockupHtml,
  resolveScreen,
  ROOT,
  SOURCE_DIR,
} from "./lib/screenshot-kit.mjs";

const PLACEMENTS = {
  // Two lines, then three: the line after that is always the emphasis breaking in half.
  header: { w: 3840, h: 1646, safe: { x: 1097, y: 493, w: 1646, h: 661 }, sizes: [210, 190, 172, 156, 140], lines: [2, 3] },
  search: { w: 3840, h: 2560, sizes: [250, 228, 208, 190, 172] },
};

/** Each asset borrows a caption the listing already has, so nothing new needs translating.
 * Pick the two frames that sell hardest; the search image is read whole at a tenth of its size. */
const CREATIVES = [
  { name: "header", placement: "header", caption: "home", screen: "home" },
  { name: "search", placement: "search", caption: "paywall", screen: "paywall" },
];

/** A capture in the phone, leaning, with the shadow the screenshot frames give it. */
function phoneHtml({ capture, width, left, top, angle }) {
  return `
    <div style="position:absolute; left:${left}px; top:${top}px; transform:rotate(${angle}deg); transform-origin:50% 0; filter:drop-shadow(0 60px 90px rgba(10,10,10,0.24));">
      ${phoneMockupHtml(capture, width)}
    </div>`;
}

/** A plain accent disc that balances the phone. Swap it for the app's own art when it has some. */
function discHtml({ size, left, top }) {
  return `
    <div style="position:absolute; left:${left}px; top:${top}px; width:${size}px; height:${size}px; border-radius:50%; background:${PALETTE.accent};"></div>`;
}

/** A soft light behind the words so they sit on a surface rather than on the grid lines. */
const glowHtml = (x, y) => `
  <div style="position:absolute; inset:0; background:radial-gradient(ellipse 34% 48% at ${x}% ${y}%, rgba(255,255,255,0.7), rgba(255,255,255,0) 100%);"></div>`;

const headlineHtml = ({ caption, box, align }) => `
  <div class="box" style="position:absolute; left:${box.x}px; top:${box.y}px; width:${box.w}px; height:${box.h}px; display:flex; align-items:center; justify-content:${align === "center" ? "center" : "flex-start"};">
    <div class="caption" style="text-align:${align};">${captionHtml(caption)}</div>
  </div>`;

const HEADER_INSET = 150;

/** The header: the disc on the left, the phone on the right, the line between them. On an
 * iPhone's 3:2 crop the disc's edge and the top of the screen both stay in frame. */
function headerBody({ caption, capture }) {
  const { safe } = PLACEMENTS.header;
  // Narrower than the safe area, so the words keep clear air between the disc and the phone.
  const box = { ...safe, x: safe.x + HEADER_INSET, w: safe.w - 2 * HEADER_INSET };
  return `
    ${glowHtml(50, 50)}
    ${discHtml({ size: 1180, left: -60, top: 300 })}
    ${phoneHtml({ capture, width: 760, left: 2900, top: 310, angle: 7 })}
    ${headlineHtml({ caption, box, align: "center" })}`;
}

/** The search image: Apple's own examples are a headline on the left and a phone on the
 * right running off the bottom, read whole at about a tenth of its size. The disc peeks in
 * from the corner under the words. */
function searchBody({ caption, capture }) {
  return `
    ${glowHtml(26, 40)}
    ${discHtml({ size: 1400, left: -380, top: 1800 })}
    ${phoneHtml({ capture, width: 1240, left: 2300, top: 330, angle: 4 })}
    ${headlineHtml({ caption, box: { x: 300, y: 380, w: 1820, h: 1340 }, align: "left" })}`;
}

const BODIES = { header: headerBody, search: searchBody };

function pageHtml(creative, { caption, capture }) {
  const { w, h } = PLACEMENTS[creative.placement];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    ${HIGHLIGHT_CSS}
    ${fontFaceCss()}
    .caption { font-family:${FACES.heading}; line-height:1.04; letter-spacing:-0.03em; color:${PALETTE.ink}; hyphens:none; }
    /* The emphasis starts its own line, so a wrap never splits the claim. It stays inline so its band hugs the words. */
    .caption { text-wrap:balance; }
    .hl::before { content:"\\A"; white-space:pre; }
  </style></head><body>
    <div style="width:${w}px; height:${h}px; position:relative; overflow:hidden; ${backgroundCss({ cell: 96, rule: 2 })}">
      ${BODIES[creative.placement]({ caption, capture })}
    </div>
  </body></html>`;
}

/** Steps the headline down until it fits its box — both ways, since a single long word
 * (Finnish has several) overflows sideways rather than down. A placement with `lines`
 * prefers fewer lines at a smaller size to more at a larger one; the search image, read at
 * a tenth of its size, takes the largest size that fits however many lines it needs. */
async function fitHeadline(page, { sizes, lines: limits = [] }, label) {
  const measure = (px) => page.evaluate((size) => {
    const box = document.querySelector(".box");
    const caption = document.querySelector(".caption");
    caption.style.fontSize = `${size}px`;
    const { height } = caption.getBoundingClientRect();
    return {
      fits: caption.scrollWidth <= box.clientWidth && height <= box.clientHeight,
      lines: Math.round(height / parseFloat(getComputedStyle(caption).lineHeight)),
    };
  }, px);

  for (const maxLines of [...limits, Infinity]) {
    for (const size of sizes) {
      const { fits, lines } = await measure(size);
      if (!fits || lines > maxLines) continue;
      if (limits.length && lines > limits[0]) console.warn(`  ${label}: headline needs ${lines} lines — shorter copy would read better`);
      return;
    }
  }
  console.warn(`  ${label}: headline overruns even at ${sizes.at(-1)}px — shorten it`);
}

/** App Store Connect rejects an image with an alpha channel, and the size is the whole
 * spec. Read both back off the PNG header rather than trusting the viewport. */
function assertUploadable(file, { w, h }) {
  const png = readFileSync(file);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  if (width !== w || height !== h) throw new Error(`${file}: ${width}x${height}, expected ${w}x${h}`);
  if (colorType === 4 || colorType === 6) throw new Error(`${file}: has an alpha channel`);
}

function parseArgs(argv) {
  const flag = argv.find((arg) => arg.startsWith("--locales="))?.split("=")[1] ?? "en";
  const locales = flag.split(",").map((tag) => tag.trim()).filter(Boolean);
  locales.forEach(localeFor);
  return { locales };
}

async function main() {
  const { locales } = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch();
  const pages = Object.fromEntries(
    await Promise.all(Object.entries(PLACEMENTS).map(async ([key, { w, h }]) =>
      [key, await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })])),
  );

  let count = 0;
  for (const locale of locales) {
    const captions = captionsFor(locale);
    const asc = localeFor(locale).asc;
    const outDir = path.join(CREATIVES_DIR, asc);
    // A renamed asset would otherwise leave its old file beside the new one.
    rmSync(outDir, { recursive: true, force: true });
    ensureDir(outDir);
    console.log(`\n${locale}  ->  ${path.relative(ROOT, outDir)}`);

    for (const creative of CREATIVES) {
      const frame = captions.find((entry) => entry.slug === creative.caption);
      if (!frame) throw new Error(`${locale}: no caption with slug "${creative.caption}"`);
      const capturePath = path.join(SOURCE_DIR, locale, `${resolveScreen(creative.screen).nn}.png`);
      let capture;
      try {
        capture = dataUri(capturePath, "image/png");
      } catch {
        throw new Error(`No capture at ${path.relative(ROOT, capturePath)} — capture first`);
      }

      const page = pages[creative.placement];
      await page.setContent(pageHtml(creative, { caption: frame.caption, capture }), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await fitHeadline(page, PLACEMENTS[creative.placement], `${locale}/${creative.name}`);

      const file = path.join(outDir, `${creative.name}-${asc}.png`);
      await page.screenshot({ path: file });
      assertUploadable(file, PLACEMENTS[creative.placement]);
      console.log(`  rendered  ${path.basename(file)}`);
      count += 1;
    }
  }

  await browser.close();
  console.log(`\n${count} creative asset(s) written across {${locales.join(",")}}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
