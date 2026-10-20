// Shared brand kit for the screenshot generator: palette, fonts, and the device-frame
// geometry — one source of truth so the store frames and the app render the same visual
// system.
//
// The fonts are read directly out of the iOS bundle (ios/Appname/Resources/Fonts), so
// marketing can never drift from what ships: the caption above the phone is set in the
// app's own Bricolage Grotesque, with Inter for Cyrillic. The device mockups in
// appstore/source/ are brand-neutral device photography, not app-specific art.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const APPSTORE_DIR = path.resolve(__dirname, "..", "..");
export const ROOT = path.resolve(APPSTORE_DIR, "..");
export const IOS_DIR = path.join(ROOT, "ios");
export const IOS_PROJECT = path.join(IOS_DIR, "Appname.xcodeproj");
export const FONTS_DIR = path.join(IOS_DIR, "Appname", "Resources", "Fonts");
export const CACHE_DIR = path.join(APPSTORE_DIR, ".cache");
export const SOURCE_DIR = path.join(APPSTORE_DIR, "source");
export const CAPTIONS_DIR = path.join(APPSTORE_DIR, "captions");

/** Which harness screen the capture run photographs, and what it is filed as.
 *
 * Each `screen` is a `--screenshot <name>` case in `ScreenshotHarness.swift`. Plan the frames
 * before adding screens: the first three are all most people see, so they carry the pitch;
 * each frame makes one claim in its caption; and when the proof is a small widget, tag it
 * with `.screenshotCallout(id)` and give its frame `"callout": id` to lift it out larger.
 *
 * `nn` is what a caption's `source` points at, so the order here is the order screens were
 * added, and the captions decide the order frames appear in. A screen that animates in takes
 * a longer `delay` in ms. Lives here, not in the capture script, because the menu offers the
 * same list for capturing and for compositing. */
export const SCREENS = [
  { nn: "01", screen: "home" },
  // A simulator with no StoreKit configuration draws the plans as a spinner.
  { nn: "02", screen: "paywall" },
  { nn: "03", screen: "profile" },
];

/** The store slots the kit fills, one simulator each.
 *
 * The iPhone set is a 6.3" capture in the phone mockup on the 6.9" canvas. iPad 13" and the
 * open iPhone Duo are photographed on their side, so a layout with two columns either side
 * of the centre line shows at its best. The closed Duo stays upright on its outer display. Each capture is the slot's own size, so it is checked against `size`, and laid
 * under the transparent screen of `mockup`, measured in that photograph's pixels, its corners
 * clockwise from the top left. An upright photograph of a device shot on its side is
 * `turned`. The files carry `prefix`, because deliver files every size in a locale's folder
 * by its pixels. Both Duo sets fill the one iPhone Duo slot of ten, so a set may keep only
 * the caption `slugs` it names. */
export const DEVICES = {
  iphone: { simulator: "iPhone 17", canvas: { w: 1290, h: 2796 }, prefix: "" },
  ipad: {
    simulator: "iPad Pro 13-inch (M5)",
    canvas: { w: 2752, h: 2064 },
    size: { w: 2752, h: 2064 },
    prefix: "ipad-",
    landscape: true,
    mockup: { file: path.join(SOURCE_DIR, "ipad-frame.png"), w: 2290, h: 2960, screen: { x: 121, y: 114, w: 2048, h: 2732, radius: [37, 37, 37, 37] }, turned: true },
  },
  // An 1180x820pt iPad. Its frame is the 13" one with the bezel lengthened to the
  // taller screen, a cut made in the plain middle so the camera and corners keep their shape.
  "ipad-11": {
    simulator: "iPad Air 11-inch (M4)",
    canvas: { w: 2360, h: 1640 },
    size: { w: 2360, h: 1640 },
    prefix: "ipad11-",
    landscape: true,
    mockup: { file: path.join(SOURCE_DIR, "ipad-11-frame.png"), w: 2290, h: 3175, screen: { x: 121, y: 114, w: 2048, h: 2947, radius: [37, 37, 37, 37] }, turned: true },
  },
  duo: {
    simulator: "iPhone Duo",
    canvas: { w: 2853, h: 2007 },
    size: { w: 2853, h: 2007 },
    prefix: "duo-",
    landscape: true,
    open: true,
    mockup: { file: path.join(SOURCE_DIR, "duo-frame-open.png"), w: 1033, h: 750, screen: { x: 40, y: 40, w: 952, h: 670, radius: [55, 55, 55, 55] } },
  },
  "duo-outer": {
    simulator: "iPhone Duo",
    canvas: { w: 1398, h: 2034 },
    size: { w: 1398, h: 2034 },
    prefix: "duo-outer-",
    open: false,
    slugs: ["home"],
    mockup: { file: path.join(SOURCE_DIR, "duo-frame.png"), w: 525, h: 732, screen: { x: 30, y: 27, w: 465, h: 677, radius: [9, 59, 59, 9] } },
  },
};

export function deviceFor(name) {
  const device = DEVICES[name];
  if (!device) throw new Error(`Unknown device "${name}". Have: ${Object.keys(DEVICES).join(", ")}`);
  return device;
}

/** The iPhone's captures stay at `source/<tag>/`, where the creatives read them. */
export const sourceDirFor = (name, tag) => path.join(SOURCE_DIR, deviceFor(name).prefix ? name : "", tag);

/** A screen named the way a person names it — "paywall", "02", or "2" — resolved to the
 * `nn` everything downstream keys on. Null for a name no screen answers to, so the caller
 * can list what it does have rather than capture the wrong thing. */
export function resolveScreen(name) {
  const trimmed = String(name).trim();
  const padded = /^\d+$/.test(trimmed) ? pad2(Number(trimmed)) : trimmed;
  return SCREENS.find((s) => s.nn === padded || s.screen === trimmed) ?? null;
}

/** deliver's `screenshots_path`. Everything written here is uploaded, and every directory
 * in it must be an App Store Connect locale code — which is why the raw captures and the
 * captions live beside it, not under it. */
export const SCREENSHOTS_DIR = path.join(APPSTORE_DIR, "screenshots");
export const METADATA_DIR = path.join(APPSTORE_DIR, "metadata");

/** The header and search-result creative assets. Deliver cannot upload them, so this is
 * where they wait to be dragged into App Store Connect. */
export const CREATIVES_DIR = path.join(APPSTORE_DIR, "creatives");

/** The marketing site's copy of the same frames, `public/screenshots/<ASC locale>/`.
 *
 * Downscaled WebP rather than the uploaded PNGs themselves: the gallery draws them 240pt
 * wide and the store wants 1290px, so serving the originals ships a 500 kB image to render
 * a thumbnail. These are the one generated set that *is* committed — the site builds on a
 * runner with no simulator captures and no browser to composite with. */
export const WEB_DIR = path.join(ROOT, "public", "screenshots");

/** Twice the site's 240pt width, which covers every display the page is read on: the
 * images are an impression of the app at that size, not something anyone reads the
 * numbers off. The height follows each image's own aspect. */
export const WEB_FRAME = { w: 480, quality: 0.82 };

/** Mirrors ios/Appname/Shared/DesignSystem/Palette.swift and `app/base.css` `:root`.
 *
 * The frames spend colour the way the app does: ink words on the canvas, the accent as a fill
 * behind the one claim a caption makes, and the alert colour only for something being lost. */
export const PALETTE = {
  ink: "#201A14",
  slate: "#4A4038",
  muted: "#6F6458",
  faint: "#8C7E6E",
  hairline: "#E0D3C2",
  surface: "#FBF8F3",
  canvas: "#F2ECE3",
  accent: "#C8955A",
  alert: "#9A3412",
};

/** Mirrors Shared/DesignSystem/Typeface.swift: Bricolage Grotesque for words, display weight
 * for headlines. The names are the faces' own; `fontFaceCss` lends each one Inter's Cyrillic. */
export const FACES = {
  heading: "'BricolageGrotesque-ExtraBold'",
  body: "'BricolageGrotesque-Regular'",
};

/** Bricolage has no Cyrillic, so those letters come from Inter, as in the app. */
const CYRILLIC = "U+0400-04FF, U+0500-052F, U+2DE0-2DFF, U+A640-A69F, U+1C80-1C8F";

// Inter ships no ExtraBold, so headlines take its Bold, the same substitution Typeface.swift makes.
const FONT_FILES = [
  { name: "BricolageGrotesque-ExtraBold", file: "BricolageGrotesque-ExtraBold.ttf" },
  { name: "BricolageGrotesque-ExtraBold", file: "Inter-Bold.ttf", range: CYRILLIC },
  { name: "BricolageGrotesque-Regular", file: "BricolageGrotesque-Regular.ttf" },
  { name: "BricolageGrotesque-Regular", file: "Inter-Regular.ttf", range: CYRILLIC },
];

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function dataUri(filePath, mime) {
  const contents = readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${contents}`;
}

/** Inline every bundled font face as base64 — no network fetch, no cache: the same TTFs
 * the app itself ships are the source of truth. A ranged face is declared last, so it wins
 * for its letters. */
export function fontFaceCss() {
  return FONT_FILES.map(({ name, file, range }) => {
    const uri = dataUri(path.join(FONTS_DIR, file), "font/ttf");
    const unicodeRange = range ? ` unicode-range: ${range};` : "";
    return `@font-face { font-family: '${name}'; src: url('${uri}') format('truetype'); font-display: block;${unicodeRange} }`;
  }).join("\n");
}

/** The caption file holds the listing's frames under `default` (the key a second store
 * page would sit beside). A file still in the old flat `{ sub, frames }` shape is a mistake
 * worth failing on rather than rendering an empty set nobody looks at before upload. */
export function captionsFor(tag) {
  const file = path.join(CAPTIONS_DIR, `${tag}.json`);
  if (!existsSync(file)) throw new Error(`No captions for ${tag} at ${path.relative(ROOT, file)}`);
  const frames = JSON.parse(readFileSync(file, "utf8")).default;
  if (!Array.isArray(frames) || !frames.length) {
    throw new Error(`${tag}: expected a non-empty array of frames under "default"`);
  }
  // The slug names the uploaded file. A missing one used to produce `01-undefined.png`,
  // which uploads perfectly happily.
  for (const [index, frame] of frames.entries()) {
    if (!frame.slug) throw new Error(`${tag}: frame ${index + 1} has no slug`);
    if (!frame.source === !frame.photo) throw new Error(`${tag}: frame ${index + 1} needs a source or a photo, not both`);
  }
  return frames;
}

/** Emphasis is written inline, as `Say the outcome, [the part that sells it]`.
 *
 * One field rather than a separate `accent` string that has to be a substring of the caption:
 * a translation that reorders the words would silently drop the emphasis, so a caption
 * without exactly one span fails instead. Emphasise an outcome or a number, not a feature. */
export function captionHtml(caption) {
  const match = caption.match(/^([^[\]]*)\[([^\]]+)\]([^[\]]*)$/);
  if (!match) {
    throw new Error(`Caption needs exactly one [emphasis] span: ${JSON.stringify(caption)}`);
  }
  const [, before, emphasis, after] = match;
  return escapeHtml(before)
    + `<span class="hl">${escapeHtml(emphasis)}</span>`
    + escapeHtml(after);
}

/** The emphasis run: ink words on an accent band, as the app puts ink words on its one accent
 * fill. Accent-coloured text would fail contrast on the canvas. */
export const HIGHLIGHT_CSS = `
  .hl {
    background: linear-gradient(transparent 58%, ${PALETTE.accent} 58%, ${PALETTE.accent} 94%, transparent 94%);
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
`;

/** The ground every frame sits on: the canvas with a faint grid, so the set reads as one at
 * thumbnail size. A canvas shown smaller wants a coarser grid and heavier rules. */
export function backgroundCss({ cell = 64, rule = 1 } = {}) {
  return `
    background-color: ${PALETTE.canvas};
    background-image:
      linear-gradient(rgba(10,10,10,0.045) ${rule}px, transparent ${rule}px),
      linear-gradient(90deg, rgba(10,10,10,0.045) ${rule}px, transparent ${rule}px);
    background-size: ${cell}px ${cell}px;
  `;
}

export const FRAME_PNG = path.join(SOURCE_DIR, "frame.png");

// Screen rect measured from source/frame.png (flood-fill of the screen fill colour).
export const FRAME = { w: 1424, h: 2956, sx: 52, sy: 44, sw: 1320, sh: 2868, r: 215 };

/** The Dynamic Island, as fractions of the screen's width: an iPhone 17's 125x37pt pill,
 * 11pt below the top of a 402pt screen. A simulator capture never contains it, so the
 * mockup draws it over the capture. */
const ISLAND = { w: 125 / 402, h: 37 / 402, top: 11 / 402 };

/** Device + screen geometry for a target on-canvas phone width. */
export function deviceGeometry(displayWidth) {
  const k = displayWidth / FRAME.w;
  const DEVICE = { w: displayWidth, h: FRAME.h * k };
  const SCREEN = { x: FRAME.sx * k, y: FRAME.sy * k, w: FRAME.sw * k, h: FRAME.sh * k, r: FRAME.r * k };
  return { k, DEVICE, SCREEN };
}

/** A capture composited into the phone mockup at `displayWidth`: the frame image as the
 * base layer, the screenshot layered on top and clipped to the measured screen rect — the
 * frame's own screen fill is opaque, so stacking order (not alpha) is what makes the real
 * capture show through. Falls back to a dashed placeholder if the source capture is
 * missing, so a run with one screen not yet captured still produces a reviewable sheet. */
export function phoneMockupHtml(imgDataUri, displayWidth) {
  const { DEVICE, SCREEN } = deviceGeometry(displayWidth);
  const screenContent = imgDataUri
    ? `<img src="${imgDataUri}" style="width:100%; height:100%; object-fit:cover;">`
    : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:${PALETTE.surface}; font-family:${FACES.body}; font-size:22px; color:${PALETTE.muted}; text-align:center; padding:24px;">Missing capture — run capture-simulator-screens.mjs first.</div>`;
  return `
    <div style="position:relative; width:${DEVICE.w}px; height:${DEVICE.h}px;">
      <img src="${dataUri(FRAME_PNG, "image/png")}" style="position:absolute; inset:0; width:100%; height:100%;">
      <div style="position:absolute; left:${SCREEN.x}px; top:${SCREEN.y}px; width:${SCREEN.w}px; height:${SCREEN.h}px; border-radius:${SCREEN.r}px; overflow:hidden;">
        ${screenContent}
        <div style="position:absolute; left:50%; top:${ISLAND.top * SCREEN.w}px; width:${ISLAND.w * SCREEN.w}px; height:${ISLAND.h * SCREEN.w}px; transform:translateX(-50%); border-radius:9999px; background:#000;"></div>
      </div>
    </div>
  `;
}

/** Pixel dimensions of a PNG, via `sips`. Used to sanity-check a capture before it is
 * composited — a 0-byte or half-written screenshot otherwise reaches the store as a
 * blank phone. */
export function pixelSize(pngPath) {
  const output = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", pngPath]).toString();
  return {
    width: Number(output.match(/pixelWidth:\s*(\d+)/)?.[1]),
    height: Number(output.match(/pixelHeight:\s*(\d+)/)?.[1]),
  };
}
