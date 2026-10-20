#!/usr/bin/env node
// Boots a simulator, builds the Debug configuration (so the #if DEBUG
// ScreenshotHarness is compiled in), and captures one raw PNG per seeded
// screen. Run this first; then generate-app-store-screenshots.mjs composites the
// results.
//
// The simulator itself — boot, build, install, launch, the crash check — is
// lib/simulator.mjs.
//
// Usage: node appstore/scripts/capture-simulator-screens.mjs [--device=iphone|ipad|ipad-11|duo|duo-outer]
//                                                            ["iPhone 17"]
//                                                            [--locales=en]
//                                                            [--screens=paywall,03]

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { localeFor } from "./lib/locales.mjs";
import { deviceFor, ensureDir, pixelSize, resolveScreen, ROOT, SCREENS, sourceDirFor } from "./lib/screenshot-kit.mjs";
import { captureScreen, clearStatusBar, prepareSimulator, warmUp } from "./lib/simulator.mjs";

/** Which store slot to capture for, and so which simulator and posture. */
const DEVICE = process.argv.find((a) => a.startsWith("--device="))?.split("=")[1] ?? "iphone";
const PROFILE = deviceFor(DEVICE);
const DEVICE_NAME = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? PROFILE.simulator;

/** Which languages to capture. Passed to the app as launch arguments rather than
 * by switching the simulator's system language — they land in NSArgumentDomain,
 * the same route `--screenshot` already takes, so no device state changes and
 * the locales can be captured back to back. */
const LOCALES = (process.argv.find((a) => a.startsWith("--locales="))?.split("=")[1] ?? "en")
  .split(",").map((tag) => tag.trim()).filter(Boolean);

/** Which screens to photograph, defaulting to every one.
 *
 * One changed screen is the usual reason to run this, and each screen costs a launch and a
 * wait in every locale. Captures persist in `appstore/source/<tag>/` between runs, so the
 * ones skipped stay as they were. They are not committed, so a fresh clone needs a full run.
 */
function selectedScreens() {
  const flag = process.argv.find((a) => a.startsWith("--screens="))?.split("=")[1];
  if (!flag) return SCREENS;
  return flag.split(",").map((name) => name.trim()).filter(Boolean).map((name) => {
    const found = resolveScreen(name);
    if (!found) {
      throw new Error(
        `Unknown screen "${name}". Have: ${SCREENS.map((s) => `${s.nn} ${s.screen}`).join(", ")}`,
      );
    }
    return found;
  });
}

async function main() {
  const screens = selectedScreens();
  if (screens.length !== SCREENS.length) {
    console.log(`Capturing ${screens.length} of ${SCREENS.length} screens: ${screens.map((s) => s.screen).join(", ")}`);
  }
  const device = prepareSimulator(DEVICE_NAME, PROFILE);
  await warmUp(device, screens[0].screen);

  for (const locale of LOCALES) {
    const outDir = sourceDirFor(DEVICE, locale);
    ensureDir(outDir);
    console.log(`Capturing ${locale} -> ${path.relative(ROOT, outDir)}`);
    await captureLocale(device, locale, outDir, screens);
  }

  clearStatusBar(device);

  for (const locale of LOCALES) {
    const outDir = sourceDirFor(DEVICE, locale);
    const captured = readdirSync(outDir).filter((f) => f.endsWith(".png"));
    console.log(`Done — ${captured.length} raw ${locale} screenshots in ${path.relative(ROOT, outDir)}/.`);
  }
  // The same subset, handed on, so compositing does not rewrite frames this run did not touch.
  const sources = screens.length === SCREENS.length ? "" : ` --sources=${screens.map((s) => s.nn).join(",")}`;
  console.log(`Next: node appstore/scripts/generate-app-store-screenshots.mjs --devices=${DEVICE} --locales=${LOCALES.join(",")}${sources}`);
}

async function captureLocale(device, locale, outDir, screens) {
  // No two seeded screens look alike, so two identical frames mean the delay ran out
  // before the app drew and `simctl` photographed the launch screen twice. That is the
  // same failure `assertStillRunning` exists for — an image that uploads perfectly happily
  // and looks deliberate — and it has to stop the run rather than be found later.
  const seen = new Map();

  for (const { nn, screen, delay } of screens) {
    console.log(`  "${screen}" → ${nn}.png`);
    const file = path.join(outDir, `${nn}.png`);
    await captureScreen(device, { screen, locale, sim: localeFor(locale).sim, file, delay });

    // A device turned or folded mid-run photographs another slot's size, which deliver files elsewhere.
    const { width, height } = pixelSize(file);
    if (PROFILE.size && (width !== PROFILE.size.w || height !== PROFILE.size.h)) {
      throw new Error(`${locale}: "${screen}" came out ${width}x${height}, not ${PROFILE.size.w}x${PROFILE.size.h}. Check the posture in Device Hub.`);
    }

    const digest = createHash("sha1").update(readFileSync(file)).digest("hex");
    const twin = seen.get(digest);
    if (twin) {
      throw new Error(
        `${locale}: "${screen}" and "${twin}" captured the same image — the app had not `
        + "finished drawing when the screenshot was taken. Raise DEFAULT_DELAY and run again.",
      );
    }
    seen.set(digest, screen);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
