#!/usr/bin/env node
// One entrypoint for everything the App Store listing needs: `bun run appstore:menu`.
//
// The listing is edited in four different registers — raw simulator captures,
// composited marketing frames, per-locale copy, and whatever App Store Connect
// currently believes — and the order they have to happen in is not guessable from
// the folder. Capture before generate, pull before push, validate before either.
// A menu that only offers the next legal move is cheaper than a README nobody
// rereads at 1am before a submission.
//
// Every App Store Connect action is fastlane deliver. This script does not
// reimplement any of it: it collects the two things deliver cannot infer without
// a binary (which version, which credentials), shows what is about to change, and
// gets out of the way. Usage: node appstore/scripts/menu.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkbox, confirm, input, select, Separator } from "@inquirer/prompts";
import { API_KEY_PATH } from "./lib/asc-api.mjs";
import { APP_TAGS, ASC_LOCALES, localeFor, PRIORITY_TAGS, SCREENSHOT_TAGS } from "./lib/locales.mjs";
import { APPSTORE_DIR, CAPTIONS_DIR, CREATIVES_DIR, DEVICES, IOS_PROJECT, METADATA_DIR, ROOT, SCREENS, SCREENSHOTS_DIR } from "./lib/screenshot-kit.mjs";

const SCRIPTS_DIR = path.join(APPSTORE_DIR, "scripts");
const PBXPROJ = path.join(IOS_PROJECT, "project.pbxproj");

/** Scratch space for what App Store Connect currently holds. Gitignored, and
 * deliberately not the live tree — see pull(). */
const DOWNLOAD_DIR = path.join(APPSTORE_DIR, ".download");


/** Fail before a prompt rather than thirty seconds into an upload. */
function requireFastlane() {
  try {
    execFileSync("which", ["fastlane"], { stdio: "ignore" });
  } catch {
    throw new Error("fastlane is not installed. Run: brew install fastlane");
  }
}

/** App Store Connect holds one iPhone Duo set per locale, both displays in it. */
const DUO_SET_LIMIT = 10;

/** deliver learned the iPhone Duo's sizes after 2.241.0 (fastlane#30444). Before that it
 * refuses the whole upload over one Duo frame. App Store Connect refuses a set over its
 * limit, so the count is checked first. */
function requireDuoSupport() {
  const duoCounts = localeDirs(SCREENSHOTS_DIR).map((locale) => ({
    locale,
    count: readdirSync(path.join(SCREENSHOTS_DIR, locale)).filter((file) => file.startsWith(DEVICES.duo.prefix)).length,
  }));
  if (!duoCounts.some(({ count }) => count)) return;
  const over = duoCounts.filter(({ count }) => count > DUO_SET_LIMIT);
  if (over.length) {
    const list = over.map(({ locale, count }) => `${locale} (${count})`).join(", ");
    throw new Error(`The iPhone Duo set takes ${DUO_SET_LIMIT} screenshots, inner and outer together: ${list}. Delete the extra duo-* files.`);
  }
  const version = execFileSync("fastlane", ["--version"]).toString().match(/fastlane (\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  const known = version && (version[0] - 2 || version[1] - 241 || version[2]) > 0;
  if (!known) {
    throw new Error("This fastlane cannot upload iPhone Duo screenshots. Run: brew upgrade fastlane (a release after 2.241.0)");
  }
}

/** Apple hands out a `.p8`; deliver's --api_key_path wants JSON with the PEM
 * embedded as a string. Doing that conversion by hand means pasting a multi-line
 * private key into a JSON literal with escaped newlines, which fails silently as
 * an unhelpful JWT error, so do it here instead. The key id is the filename —
 * that is Apple's own convention, `AuthKey_<key id>.p8`. */
function findPrivateKey() {
  const dir = path.join(APPSTORE_DIR, "fastlane");
  const keys = (existsSync(dir) ? readdirSync(dir) : []).filter((file) => file.endsWith(".p8"));
  if (keys.length > 1) throw new Error(`More than one .p8 in ${path.relative(ROOT, dir)} — leave the one you want`);
  if (!keys.length) return null;

  const keyId = keys[0].match(/^AuthKey_(.+)\.p8$/)?.[1];
  if (!keyId) throw new Error(`Cannot read a key id out of "${keys[0]}" — expected AuthKey_<key id>.p8`);
  return { file: path.join(dir, keys[0]), keyId };
}

async function requireApiKey() {
  if (existsSync(API_KEY_PATH)) return API_KEY_PATH;

  const p8 = findPrivateKey();
  if (!p8) {
    throw new Error(
      `No App Store Connect API key in ${path.relative(ROOT, path.dirname(API_KEY_PATH))}.\n` +
        "  Create one at App Store Connect > Users and Access > Integrations > App Store Connect API,\n" +
        "  with the App Manager role — Developer cannot edit metadata. Drop the downloaded\n" +
        "  AuthKey_<key id>.p8 in that folder (it is gitignored) and run this again.",
    );
  }

  console.log(`\nFound ${path.relative(ROOT, p8.file)} — key id ${p8.keyId}.`);
  const issuerId = await input({
    message: "Issuer ID (App Store Connect > Users and Access > Integrations, above the key list)",
    validate: (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim()) ||
      "That is not a UUID. Copy the Issuer ID from the App Store Connect API tab, not the In-App Purchase one.",
  });

  writeFileSync(
    API_KEY_PATH,
    JSON.stringify(
      {
        key_id: p8.keyId,
        issuer_id: issuerId.trim(),
        key: readFileSync(p8.file, "utf8"),
        duration: 1200,
        in_house: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(`Wrote ${path.relative(ROOT, API_KEY_PATH)} — gitignored, and reused from now on.\n`);
  return API_KEY_PATH;
}

/** The version to edit. deliver normally reads this off the .ipa; with
 * skip_binary_upload there is no .ipa, so it has to be supplied every time. The
 * three build configurations must agree — if they have drifted, the project is
 * the thing to fix, not this prompt. */
function marketingVersion() {
  const found = [...readFileSync(PBXPROJ, "utf8").matchAll(/^\s*MARKETING_VERSION = (.+);$/gm)]
    .map((match) => match[1].trim());
  const distinct = [...new Set(found)];
  if (distinct.length !== 1) {
    console.warn(`  MARKETING_VERSION differs across configurations: ${distinct.join(", ")}`);
  }
  return distinct[0] ?? "";
}

const run = (file, args) =>
  execFileSync(process.execPath, [path.join(SCRIPTS_DIR, file), ...args], { cwd: ROOT, stdio: "inherit" });

const deliver = (args) =>
  execFileSync("fastlane", ["deliver", ...args], { cwd: APPSTORE_DIR, stdio: "inherit" });

const localeDirs = (dir) =>
  (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [])
    .filter((entry) => entry.isDirectory() && ASC_LOCALES.includes(entry.name))
    .map((entry) => entry.name);

/** Only offer locales that can actually be generated — the generator throws on a
 * missing captions file, and finding that out after picking six locales is worse
 * than not being offered them. */
const captionedTags = () =>
  (existsSync(CAPTIONS_DIR) ? readdirSync(CAPTIONS_DIR) : [])
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.basename(file, ".json"))
    .filter((tag) => APP_TAGS.includes(tag));

async function pickLocales(tags, message) {
  if (!tags.length) throw new Error(`No captions in ${path.relative(ROOT, CAPTIONS_DIR)}`);
  // The priority markets start ticked, so the common run is one keypress.
  const picked = await checkbox({
    message,
    choices: tags.map((tag) => ({ name: tag, value: tag, checked: PRIORITY_TAGS.includes(tag) })),
  });
  if (!picked.length) throw new Error("No locales selected");
  return picked;
}

/** Which screens a run touches, everything ticked, since one changed screen makes one frame
 * stale. Returns null when nothing was unticked, so the scripts keep their own "everything"
 * defaults. */
async function pickScreens(message) {
  const choices = SCREENS.map(({ nn, screen }) => ({ name: `${nn} ${screen}`, value: nn, checked: true }));
  const picked = await checkbox({ message, choices });
  if (!picked.length) throw new Error("No screens selected");
  return picked.length === choices.length ? null : picked;
}

async function askVersion() {
  return input({ message: "App Store version to edit", default: marketingVersion() });
}

/** Say what is about to go up, per locale, before asking. `overwrite_screenshots`
 * clears the live set first, so a half-populated directory is the failure mode
 * worth seeing spelled out. */
function summarize({ metadata, screenshots }) {
  if (metadata) {
    console.log(`  metadata:    ${localeDirs(METADATA_DIR).join(", ")}`);
  }
  if (screenshots) {
    const counts = localeDirs(SCREENSHOTS_DIR).map((locale) => {
      const files = readdirSync(path.join(SCREENSHOTS_DIR, locale)).filter((file) => file.endsWith(".png"));
      return `${locale} (${files.length})`;
    });
    console.log(`  screenshots: ${counts.join(", ")}`);
    console.log("  existing screenshots on this version are cleared first");
  }
}

async function push({ metadata, screenshots }) {
  requireFastlane();
  const key = await requireApiKey();
  if (metadata) run("check-metadata.mjs", []);

  // deliver's default metadata_path is ./fastlane/metadata, which under this
  // layout is a folder that does not exist. If the Deliverfile ever stops being
  // read, the symptom is a run that reports success and changes nothing.
  if (metadata && !localeDirs(METADATA_DIR).length) {
    throw new Error(`No locales in ${path.relative(ROOT, METADATA_DIR)} — pull from App Store Connect first.`);
  }
  if (screenshots && !localeDirs(SCREENSHOTS_DIR).length) {
    throw new Error(`No locales in ${path.relative(ROOT, SCREENSHOTS_DIR)} — generate screenshots first.`);
  }
  if (screenshots) requireDuoSupport();

  const version = await askVersion();
  console.log(`\nAbout to change App Store Connect version ${version}:`);
  summarize({ metadata, screenshots });

  const go = await confirm({ message: "Push to App Store Connect?", default: false });
  if (!go) return console.log("Nothing sent.");

  deliver([
    "--api_key_path", key,
    "--app_version", version,
    ...(metadata ? [] : ["--skip_metadata", "true"]),
    ...(screenshots ? [] : ["--skip_screenshots", "true"]),
  ]);
}

/** Pulls land in appstore/.download/, never on top of the live tree.
 *
 * deliver's downloads overwrite rather than merge, so aiming one at the real
 * folder silently reverts every local edit that has not been uploaded yet. For
 * screenshots it is worse: download_screenshots writes App Store Connect's own
 * filenames (`0_APP_IPHONE_67_0.png`), which the next generator run would leave
 * sitting beside the real frames rather than replacing. Downloading somewhere else
 * and diffing costs one command and takes the whole failure mode off the table. */
async function pull(subcommand, pathFlag, into) {
  requireFastlane();
  const key = await requireApiKey();
  const target = path.join(DOWNLOAD_DIR, into);

  const go = await confirm({ message: `Fetch into ${path.relative(ROOT, target)}?`, default: true });
  if (!go) return console.log("Nothing fetched.");

  deliver([subcommand, "--api_key_path", key, pathFlag, path.join(".download", into)]);
  console.log(`\nCompare with: diff -r ${path.relative(ROOT, target)} ${path.relative(ROOT, into === "metadata" ? METADATA_DIR : SCREENSHOTS_DIR)}`);
}

const ACTIONS = {
  async capture() {
    const kind = await select({ message: "Store slot", choices: Object.keys(DEVICES).map((name) => ({ name, value: name })) });
    const device = await input({ message: "Simulator device", default: DEVICES[kind].simulator });
    const locales = await pickLocales(SCREENSHOT_TAGS, "Locales to capture");
    const screens = await pickScreens("Screens to capture");
    run("capture-simulator-screens.mjs", [
      `--device=${kind}`,
      device,
      `--locales=${locales.join(",")}`,
      ...(screens ? [`--screens=${screens.join(",")}`] : []),
    ]);
  },

  async generateAppStore() {
    const locales = await pickLocales(captionedTags(), "Locales to generate");
    // By capture, not by frame number: re-shooting one screen is the reason to be here.
    const sources = await pickScreens("Captures to composite");
    const devices = await checkbox({
      message: "Store slots",
      choices: Object.keys(DEVICES).map((name) => ({ name, value: name, checked: true })),
      required: true,
    });
    run("generate-app-store-screenshots.mjs", [
      `--devices=${devices.join(",")}`,
      `--locales=${locales.join(",")}`,
      ...(sources ? [`--sources=${sources.join(",")}`] : []),
    ]);
  },

  async generateCreatives() {
    const locales = await pickLocales(captionedTags(), "Locales to render");
    run("generate-creative-assets.mjs", [`--locales=${locales.join(",")}`]);
  },

  /** Not deliver: it has no notion of these. The script shows what each slot holds now and
   * what it would hold after, then asks itself. */
  async pushCreatives() {
    const rendered = localeDirs(CREATIVES_DIR);
    if (!rendered.length) {
      throw new Error(`No locales in ${path.relative(ROOT, CREATIVES_DIR)} — generate header and search assets first.`);
    }
    const locales = await pickLocales(
      APP_TAGS.filter((tag) => rendered.includes(localeFor(tag).asc)),
      "Locales to push",
    );
    await requireApiKey();
    const version = await askVersion();
    run("push-creative-assets.mjs", [`--version=${version}`, `--locales=${locales.join(",")}`]);
  },

  pullMetadata: () => pull("download_metadata", "--metadata_path", "metadata"),
  pullScreenshots: () => pull("download_screenshots", "--screenshots_path", "screenshots"),
  pushMetadata: () => push({ metadata: true, screenshots: false }),
  pushScreenshots: () => push({ metadata: false, screenshots: true }),
  pushBoth: () => push({ metadata: true, screenshots: true }),

  async validate() {
    run("check-metadata.mjs", []);
    requireFastlane();
    const key = await requireApiKey();
    deliver(["--api_key_path", key, "--app_version", await askVersion(), "--verify_only", "true"]);
  },
};

const CHOICES = [
  new Separator("— Screenshots —"),
  { name: "Capture simulator screens", value: "capture" },
  { name: "Generate App Store screenshots", value: "generateAppStore" },
  { name: "Generate header and search assets", value: "generateCreatives" },
  new Separator("— App Store Connect —"),
  { name: "Pull metadata", value: "pullMetadata" },
  { name: "Pull screenshots", value: "pullScreenshots" },
  { name: "Validate, no upload", value: "validate" },
  { name: "Push metadata", value: "pushMetadata" },
  { name: "Push screenshots", value: "pushScreenshots" },
  { name: "Push metadata and screenshots", value: "pushBoth" },
  { name: "Push header and search assets", value: "pushCreatives" },
  new Separator(),
  { name: "Exit", value: "exit" },
];

try {
  for (;;) {
    const action = await select({ message: "App Store", choices: CHOICES, pageSize: 18 });
    if (action === "exit") break;
    try {
      await ACTIONS[action]();
    } catch (error) {
      // A failed step should not end the session — the fix is usually one prompt
      // away (install fastlane, shorten a caption, write the missing locale).
      if (error.name === "ExitPromptError") throw error;
      console.error(`\n${error.message}\n`);
    }
  }
} catch (error) {
  // Ctrl-C is how people leave a menu; it is not a crash.
  if (error.name !== "ExitPromptError") throw error;
}
