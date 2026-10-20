#!/usr/bin/env node
// Renders the web favicon set and the header mark from one inline SVG. The iOS app icon is an
// Icon Composer document (ios/Appname/AppIcon.icon) and is not generated here.
//
// Usage: bun run icons:build
//
// The mark is a placeholder: an ink tile with one accent dot, in the palette's values. Replace
// `markSvg` with the product's mark and run it again.

import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const INK = "#201A14";
const ACCENT = "#C8955A";
const PAPER = "#F2ECE3";

function markSvg(size) {
  const tile = size * 0.78;
  const inset = (size - tile) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${PAPER}"/>
    <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${tile * 0.24}" fill="${INK}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${tile * 0.16}" fill="${ACCENT}"/>
  </svg>`;
}

const WEB_ICONS = [
  { out: "public/ico/icon-32.png", size: 32 },
  { out: "public/ico/icon-192.png", size: 192 },
  { out: "public/ico/icon-512.png", size: 512 },
  { out: "public/ico/apple-icon-180x180.png", size: 180 },
  // The header's mark, drawn at 24px by `components/Logo.tsx`.
  { out: "public/ico/mark.png", size: 96 },
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const { out, size } of WEB_ICONS) {
    const target = path.join(ROOT, out);
    mkdirSync(path.dirname(target), { recursive: true });
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0">${markSvg(size)}</body></html>`,
      { waitUntil: "load" },
    );
    await page.screenshot({ path: target, omitBackground: false });
    console.log(`  ${out}  ${size}×${size}`);
  }

  await browser.close();

  // An .ico is what a bare `/favicon.ico` request wants; browsers accept a PNG payload in
  // one, and every target this ships to does.
  const favicon = path.join(ROOT, "public/ico/favicon.ico");
  if (!existsSync(favicon)) {
    const { readFileSync } = await import("node:fs");
    writeFileSync(favicon, readFileSync(path.join(ROOT, "public/ico/icon-32.png")));
    console.log("  public/ico/favicon.ico  (from icon-32)");
  }

  writeFileSync(
    path.join(ROOT, "public/ico/manifest.json"),
    JSON.stringify(
      {
        name: "Appname",
        short_name: "Appname",
        icons: [
          { src: "/ico/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/ico/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        theme_color: PAPER,
        background_color: PAPER,
        display: "standalone",
      },
      null,
      2,
    ) + "\n",
  );
  console.log("  public/ico/manifest.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
