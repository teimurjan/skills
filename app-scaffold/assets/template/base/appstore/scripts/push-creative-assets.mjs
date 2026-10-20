#!/usr/bin/env node
// Pushes the rendered creative assets (appstore/creatives/) onto an App Store version:
// uploads each image to the app's Asset Library, then places it as that localization's
// product page header or search result asset. They go to review with the version.
//
// Usage: node appstore/scripts/push-creative-assets.mjs --version=1.10 [--locales=en,de] [--yes]
//
// Deliver has no notion of these, and Apple's published OpenAPI (4.5) has none of the
// resources either: the Asset Library routes used here are live but undocumented, as
// verified by app-store-connect-cli. A call that starts failing is Apple's docs catching up.
//
// Only an editable version is touched. Placing on a live one would mean swapping the header
// people are looking at for art nobody has approved, and Apple only allows approved assets
// there anyway — that path is the Asset Library's own review, in App Store Connect.
//
// Re-running is safe. Uploads are named by their content hash, so an image already in the
// library is reused rather than uploaded again, and a slot already holding it is left alone.

import { confirm } from "@inquirer/prompts";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { API_KEY_PATH, createClient, uploadParts, waitFor } from "./lib/asc-api.mjs";
import { localeFor } from "./lib/locales.mjs";
import { APPSTORE_DIR, CREATIVES_DIR, ROOT } from "./lib/screenshot-kit.mjs";

const PLACEMENT_TYPES = { header: "PRODUCT_PAGE_HEADER_ASSET", search: "APP_STORE_SEARCH_RESULTS_ASSET" };

/** The states App Store Connect lets a version's media be edited in. */
const EDITABLE = ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"];

function parseArgs(argv) {
  const flag = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  const version = flag("version");
  if (!version) throw new Error("--version is required, e.g. --version=1.10");
  const locales = flag("locales")?.split(",").map((tag) => localeFor(tag.trim()).asc) ?? null;
  return { version, locales, yes: argv.includes("--yes") };
}

/** deliver's Appfile is where the bundle id is written down; reading it keeps one copy. */
function bundleId() {
  const appfile = readFileSync(path.join(APPSTORE_DIR, "fastlane", "Appfile"), "utf8");
  const id = appfile.match(/^app_identifier\s+"([^"]+)"/m)?.[1];
  if (!id) throw new Error("No app_identifier in appstore/fastlane/Appfile");
  return id;
}

/** What goes where, per locale, from what is on disk. A locale the version has no
 * localization for is reported rather than created: adding a language to the listing is
 * a decision, not a side effect of an image upload. */
function plan({ locales }, localizations) {
  const dirs = existsSync(CREATIVES_DIR) ? readdirSync(CREATIVES_DIR) : [];
  const wanted = locales ?? dirs;
  return wanted.map((asc) => {
    const files = [
      { slot: "header", file: path.join(CREATIVES_DIR, asc, `header-${asc}.png`) },
      { slot: "search", file: path.join(CREATIVES_DIR, asc, `search-${asc}.png`) },
    ];
    const missing = files.filter(({ file }) => !existsSync(file)).map(({ file }) => path.relative(ROOT, file));
    return { asc, localizationId: localizations.get(asc), files, missing };
  });
}

/** The upload name carries the content hash, which is what makes a re-run find its own
 * earlier upload instead of sending the same 2.5 MB again. */
function uploadName(file, bytes) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  return `${path.basename(file, ".png")}-${hash}.png`;
}

/** What one slot holds right now: its placements, and the image in it with its review state. */
async function slotNow(api, localizationId, slot) {
  const response = await api.get(
    `/v1/appStoreVersionLocalizations/${localizationId}/placements?filter[placementType]=${PLACEMENT_TYPES[slot]}&include=image`,
  );
  const imageId = response.data[0]?.relationships?.image?.data?.id;
  return { placements: response.data, image: response.included?.find((item) => item.id === imageId) ?? null };
}

const describe = (image) => `${image.attributes.fileName} [${image.attributes.state}]`;

async function findVersion(api, appId, versionString) {
  const { data } = await api.get(
    `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${encodeURIComponent(versionString)}`,
  );
  const version = data[0];
  if (!version) throw new Error(`No iOS version ${versionString} in App Store Connect — create it there first`);
  const state = version.attributes.appVersionState ?? version.attributes.appStoreState;
  if (!EDITABLE.includes(state)) {
    throw new Error(`Version ${versionString} is ${state}; creative assets can only be placed on an editable version`);
  }
  return version;
}

/** Reserve, send, commit, and wait until Apple has processed it. */
async function uploadImage(api, libraryId, fileName, bytes, step) {
  const { data: reserved } = await api.request("POST", "/v1/appAssetLibraryImages", {
    data: {
      type: "appAssetLibraryImages",
      attributes: { fileName, fileSize: bytes.length, category: "CREATIVE_ASSETS" },
      relationships: { assetLibrary: { data: { type: "appAssetLibraries", id: libraryId } } },
    },
  });
  step(`uploading ${(bytes.length / 1e6).toFixed(1)} MB`);
  await uploadParts(bytes, reserved.attributes.uploadOperations);
  await api.request("PATCH", `/v1/appAssetLibraryImages/${reserved.id}`, {
    data: { type: "appAssetLibraryImages", id: reserved.id, attributes: { uploaded: true } },
  });
  step("processing");
  return waitFor(async () => {
    const { data } = await api.get(`/v1/appAssetLibraryImages/${reserved.id}`);
    if (data.attributes.state === "FAILED") {
      throw new Error(`${fileName} failed processing: ${JSON.stringify(data.attributes.stateDetails)}`);
    }
    return data.attributes.imageAsset?.width ? data : null;
  }, { label: `${fileName} to process` });
}

/** Points one slot at one image, replacing whatever was there. Delete first: a slot holds
 * one asset, and creating beside an occupant is refused. */
async function place(api, localizationId, slot, imageId, placements) {
  for (const placement of placements) await api.request("DELETE", `/v1/appAssetLibraryPlacements/${placement.id}`);
  await api.request("POST", "/v1/appAssetLibraryPlacements", {
    data: {
      type: "appAssetLibraryPlacements",
      attributes: { placementType: PLACEMENT_TYPES[slot], placementGroup: "DEFAULT_PROFILE" },
      relationships: {
        image: { data: { type: "appAssetLibraryImages", id: imageId } },
        appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: localizationId } },
      },
    },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(API_KEY_PATH)) {
    throw new Error(`No API key at ${path.relative(ROOT, API_KEY_PATH)} — run \`bun run appstore:menu\` once to set it up`);
  }
  const api = createClient();

  const { data: apps } = await api.get(`/v1/apps?filter[bundleId]=${bundleId()}`);
  if (!apps[0]) throw new Error(`No app with bundle id ${bundleId()}`);
  const appId = apps[0].id;
  const version = await findVersion(api, appId, args.version);
  const localizations = new Map(
    (await api.all(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=200`))
      .map((localization) => [localization.attributes.locale, localization.id]),
  );
  const { data: library } = await api.get(`/v1/apps/${appId}/assetLibrary`);
  const known = new Map(
    (await api.all(`/v1/appAssetLibraries/${library.id}/images?limit=200`))
      .filter((image) => image.attributes.imageAsset?.width && image.attributes.state !== "FAILED")
      .map((image) => [image.attributes.fileName, image]),
  );

  console.log(`\nVersion ${args.version} (${version.attributes.appVersionState ?? version.attributes.appStoreState}) — now → after:`);
  const work = [];
  for (const target of plan(args, localizations)) {
    const label = target.asc.padEnd(6);
    if (!target.localizationId) {
      console.log(`  ${label} no such localization on this version — skipped`);
      continue;
    }
    if (target.missing.length) {
      console.log(`  ${label} missing ${target.missing.join(", ")} — run creatives:render`);
      continue;
    }
    for (const { slot, file } of target.files) {
      const bytes = readFileSync(file);
      const fileName = uploadName(file, bytes);
      const now = await slotNow(api, target.localizationId, slot);
      const inLibrary = known.get(fileName);
      const unchanged = now.image?.attributes.fileName === fileName;
      const after = unchanged ? "unchanged"
        : inLibrary ? `place ${describe(inLibrary)}`
          : `upload + place ${path.basename(file)}`;
      console.log(`  ${label} ${slot.padEnd(6)} ${now.image ? describe(now.image) : "empty"} → ${after}`);
      if (!unchanged) work.push({ ...target, slot, bytes, fileName, inLibrary, placements: now.placements });
    }
  }
  if (!work.length) return console.log("\nNothing to change.");
  if (!args.yes && !(await confirm({ message: `Change ${work.length} slot(s)?`, default: false }))) {
    return console.log("Nothing sent.");
  }

  console.log("");
  const failures = [];
  for (const item of work) {
    process.stdout.write(`  ${item.asc.padEnd(6)} ${item.slot.padEnd(6)}`);
    const step = (text) => process.stdout.write(` ${text}…`);
    try {
      const image = item.inLibrary ?? await uploadImage(api, library.id, item.fileName, item.bytes, step);
      step("placing");
      await place(api, item.localizationId, item.slot, image.id, item.placements);
      console.log(` done [${image.attributes.state}]`);
    } catch (error) {
      // One locale failing should not strand the others half-done.
      failures.push(`${item.asc} ${item.slot}: ${error.message}`);
      console.log(" FAILED");
    }
  }

  if (failures.length) throw new Error(`${failures.length} slot(s) failed:\n  ${failures.join("\n  ")}`);
  console.log("\nDone. Check them with Preview on the version page, then submit the version as usual.");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
