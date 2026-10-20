#!/usr/bin/env bun
// Writes a new app from the bundled template: the shared base plus one web biller's overlay,
// renamed. Usage: bun scaffold.ts --dest ~/Projects/acme --target Acme --name "Acme" \
//   --slug acme --domain acme.app [--biller dodo|paddle] [--bundle com.x.acme]
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { homedir } from "node:os";

type Biller = "dodo" | "paddle";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1] ?? ""]);
    return pairs;
  }, []),
);

const required = ["dest", "target", "name", "slug", "domain"] as const;
const missing = required.filter((key) => !args[key]);
if (missing.length) {
  console.error(`missing --${missing.join(", --")}`);
  process.exit(1);
}

const expand = (path: string) => resolve(path.replace(/^~/, homedir()));
const DEST = expand(args.dest);
const TARGET = args.target;
const DISPLAY = args.name;
const SLUG = args.slug;
const DOMAIN = args.domain;
const BILLER = (args.biller ?? "dodo") as Biller;
const BUNDLE = args.bundle ?? `com.teimurjan.${SLUG}`;
const TEMPLATE = resolve(import.meta.dir, "../assets/template");

if (!/^[A-Z][A-Za-z0-9]*$/.test(TARGET)) throw new Error("--target must be PascalCase, e.g. AcmeNotes");
if (!/^[a-z][a-z0-9]*$/.test(SLUG)) throw new Error("--slug must be lowercase letters/digits, e.g. acmenotes");
if (BILLER !== "dodo" && BILLER !== "paddle") throw new Error("--biller must be dodo or paddle");
if (existsSync(DEST) && readdirSync(DEST).some((f) => f !== ".git" && f !== ".DS_Store"))
  throw new Error(`${DEST} is not empty`);

const BINARY = /\.(png|webp|jpe?g|ico|ttf|otf|woff2?|car)$/i;

/** Build files, where every "Appname" is the target. */
const BUILD = /\.(pbxproj|xcscheme|xcconfig|xcconfig\.example|plist|entitlements|resolved|yml)$|^package\.json$|^bun\.lock$/;

/** "Appname" as a reader sees it, not as a path, a module import, the project or the
 * `Appname (Local)` scheme: those stay the PascalCase target, the rest takes the display name. */
const DISPLAYED = /(?<![\w/.-])(?<!import )Appname(?![\w/]|\.xcodeproj|\.app\b| \(Local\))/g;

/** The placeholders the template is written in, most specific first. */
function rename(text: string, path: string): string {
  const named = text.replace(/com\.example\.appname/g, BUNDLE).replace(/appname\.example/g, DOMAIN);
  const displayed = BUILD.test(path) ? named : named.replace(DISPLAYED, DISPLAY);
  return displayed.replace(/Appname/g, TARGET).replace(/APPNAME/g, SLUG.toUpperCase()).replace(/appname/g, SLUG);
}

function walk(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The base first, then the overlay over it: an overlay file replaces the base's at the same path. */
const sources = new Map<string, string>();
for (const layer of ["base", BILLER]) {
  const root = join(TEMPLATE, layer);
  for (const file of walk(root)) sources.set(relative(root, file), file);
}

for (const [path, source] of sources) {
  const target = join(DEST, path.replace(/Appname/g, TARGET));
  mkdirSync(dirname(target), { recursive: true });
  if (BINARY.test(path)) copyFileSync(source, target);
  else writeFileSync(target, rename(readFileSync(source, "utf8"), path));
}

// Gitignored, and the Debug-Local scheme reads it.
copyFileSync(join(DEST, "ios/Config/Local.xcconfig.example"), join(DEST, "ios/Config/Local.xcconfig"));

const pbxproj = join(DEST, `ios/${TARGET}.xcodeproj/project.pbxproj`);
writeFileSync(
  pbxproj,
  readFileSync(pbxproj, "utf8").replace(/(INFOPLIST_KEY_CFBundleDisplayName = )[^;]+;/g, `$1"${DISPLAY}";`),
);

console.log(`wrote ${sources.size} files into ${DEST} (biller: ${BILLER})`);
