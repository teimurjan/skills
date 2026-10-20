// Pulls every string the compiler found in source into the String Catalogs.
//
// Xcode does this automatically on an IDE build, but `xcodebuild` only emits the
// intermediate `.stringsdata` and never writes back to the `.xcstrings`. So a
// catalog edited only from the command line silently drifts behind the code:
// new copy never appears, and copy deleted from source stays forever.
//
// Run it after any change that adds, removes, or rewords a `LocalizedStringResource`,
// a `Text("…")` literal, or a `String(localized:)` call.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PROJECT = "ios/Appname.xcodeproj";
const SCHEME = "Appname";
const CATALOGS = [
  "ios/Appname/Resources/Localizable.xcstrings",
];

/** Ask xcodebuild where this configuration actually writes its intermediates.
 * Globbing DerivedData instead would be a trap: a renamed project leaves an old
 * directory behind, and its stale `.stringsdata` would resurrect keys for source
 * files that no longer exist. */
function objroot(configuration) {
  const settings = execFileSync(
    "xcodebuild",
    ["-project", PROJECT, "-scheme", SCHEME, "-configuration", configuration,
     "-sdk", "iphonesimulator", "-showBuildSettings"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const match = settings.match(/^\s*OBJROOT = (.+)$/m);
  if (!match) throw new Error(`No OBJROOT in build settings for ${configuration}`);
  return match[1].trim();
}

function stringsdata(root, configuration) {
  const base = join(root, `${SCHEME}.build`, `${configuration}-iphonesimulator`,
                    `${SCHEME}.build`, "Objects-normal");
  if (!existsSync(base)) throw new Error(`No build output at ${base} — build first`);
  // Both slices carry the same keys; one arch is enough and avoids duplicates.
  const arch = readdirSync(base).sort()[0];
  const dir = join(base, arch);
  return readdirSync(dir).filter((f) => f.endsWith(".stringsdata")).map((f) => join(dir, f));
}

// Debug, not Release: `ScreenshotHarness` is `#if DEBUG`, so a Release build
// would report its ~50 fixture strings as absent and mark them stale.
const configuration = "Debug";
const files = stringsdata(objroot(configuration), configuration);
console.log(`Syncing ${CATALOGS.length} catalogs from ${files.length} .stringsdata files`);

execFileSync("xcrun", ["xcstringstool", "sync", ...CATALOGS, "--stringsdata", ...files],
             { stdio: "inherit" });

for (const catalog of CATALOGS) {
  const keys = execFileSync("xcrun", ["xcstringstool", "print", catalog], { encoding: "utf8" });
  const count = keys.split("\n").filter((line) => line.trim()).length;
  console.log(`  ${catalog}: ${count} keys`);
}
