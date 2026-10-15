#!/usr/bin/env bun
// Copies the generic stack out of the reference repos' committed HEAD into a new
// directory, renamed. Usage: bun scaffold.ts --dest ~/Projects/acme --target Acme \
//   --name "Acme" --slug acme --domain acme.app [--biller paddle|dodo] [--bundle com.x.acme]
//   [--ref ~/Projects/takt] [--dodo-ref ~/Projects/wait-professor] [--shots-ref ~/Projects/oyno]
import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

type Biller = "paddle" | "dodo";
type Group = "core" | Biller;
type Entry = { path: string; group?: Group; to?: string; skip?: RegExp };

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
const BILLER = (args.biller ?? "paddle") as Biller;
const BUNDLE = args.bundle ?? `com.teimurjan.${SLUG}`;
const REF = expand(args.ref ?? "~/Projects/takt");
const DODO_REF = expand(args["dodo-ref"] ?? "~/Projects/wait-professor");
const SHOTS_REF = expand(args["shots-ref"] ?? "~/Projects/oyno");

if (!/^[A-Z][A-Za-z0-9]*$/.test(TARGET)) throw new Error("--target must be PascalCase, e.g. WaitProfessor");
if (!/^[a-z][a-z0-9]*$/.test(SLUG)) throw new Error("--slug must be lowercase letters/digits, e.g. waitprofessor");
if (existsSync(DEST) && readdirSync(DEST).some((f) => f !== ".git" && f !== ".DS_Store"))
  throw new Error(`${DEST} is not empty`);

const DOMAIN_WIDGETS = /(Buckets|Contrast|OrderNote|Shelf|Underpriced)Step\.tsx$|\/shelf\//;
const NON_EN_COPY = /\/copy\/(?!en\.tsx?$|index\.ts$|types\.ts$)/;
const IOS = "ios/Printyard";

// Paths are the reference repo's; `to` overrides the destination before renaming.
const TAKT: Entry[] = [
  // Root config
  ...["bunfig.toml", "tsconfig.json", "tsconfig.funnel.json", "next.config.mjs", "postcss.config.mjs",
    "proxy.ts", ".gitignore", ".env.local.example", ".github/workflows/deploy.yml"].map((path) => ({ path })),
  { path: "vercel.json", group: "paddle" },
  // Site + auth + api
  { path: "app/(site)" }, { path: "app/[locale]" }, { path: "app/auth" }, { path: "app/lang" },
  { path: "app/base.css" }, { path: "app/globals.css" }, { path: "app/fonts.ts" },
  { path: "app/(funnel)", group: "paddle" },
  ...["account", "appstore", "entitlement", "purchase", "subscription/sync", "client-ip"].map((r) => ({ path: `app/api/${r}` })),
  ...["paddle", "subscription/portal", "checkout", "cron", "email"].map((r) => ({ path: `app/api/${r}`, group: "paddle" as const })),
  // Components
  { path: "components/funnel", skip: new RegExp(`${DOMAIN_WIDGETS.source}|${NON_EN_COPY.source}`) },
  { path: "components/auth" },
  { path: "components/site", skip: new RegExp(`receiptEconomy|${NON_EN_COPY.source}`) },
  ...["AnalyticsBoot.tsx", "AppStoreBadge.tsx", "Logo.tsx", "MetaPixel.tsx"].map((c) => ({ path: `components/${c}` })),
  // Lib
  ...["supabase", "email", "purchaseEmail", "account.ts", "appstore.ts", "resend.ts", "meta.ts", "metaPixel.ts",
    "analytics.ts", "serverAnalytics.ts", "log.ts", "client-version.ts", "inAppBrowser.ts", "inAppBrowser.test.ts",
    "idle.ts", "appStoreListing.ts", "i18n.ts", "markets.ts", "appHost.ts"].map((l) => ({ path: `lib/${l}` })),
  ...["entitlements.ts", "paddle.ts", "paddleClient.ts", "paddlePrices.ts", "checkoutReminder"].map((l) => ({ path: `lib/${l}`, group: "paddle" as const })),
  // Scripts
  ...["build-funnel.tsx", "dev.ts", "build-funnel-ios.ts", "wawoff2.d.ts", "sync-strings.mjs", "check-strings.mjs",
    "build-icons.mjs"].map((s) => ({ path: `scripts/${s}` })),
  // Database + email templates
  { path: "supabase/migrations/0001_accounts_entitlements.sql" },
  { path: "supabase/migrations/0002_paddle_entitlements.sql", group: "paddle" },
  { path: "supabase/migrations/0008_paddle_lifetime_entitlements.sql", group: "paddle", to: "supabase/migrations/0003_paddle_lifetime_entitlements.sql" },
  { path: "supabase/migrations/0015_checkout_reminders.sql", group: "paddle", to: "supabase/migrations/0004_checkout_reminders.sql" },
  { path: "supabase/templates" },
  { path: "public/badges" }, { path: "public/scripts/pixel.js" },
  // App Store
  { path: "appstore/fastlane/Appfile" }, { path: "appstore/fastlane/Deliverfile" },
  { path: "appstore/captions/en.json" }, { path: "appstore/source/frame.png" },
  { path: "appstore/metadata/en-US" },
  // iOS
  ...["Debug.xcconfig", "Production.xcconfig", "Local.xcconfig.example"].map((c) => ({ path: `ios/Config/${c}` })),
  { path: "ios/Config/Local.xcconfig.example", to: "ios/Config/Local.xcconfig" },
  { path: "ios/Printyard.xcodeproj/project.pbxproj" }, { path: "ios/Printyard.xcodeproj/xcshareddata" },
  ...["AppConfig", "AppRoot", "PrintyardApp", "ScreenshotHarness", "UIApplication+KeyRoot"].map((f) => ({ path: `${IOS}/App/${f}.swift` })),
  ...["Info.plist", "PrivacyInfo.xcprivacy", "Features/Profile", "Services/Analytics", "Services/Auth", "Services/Purchase",
    "Shared/Networking", "Domain/Formatting.swift", "Resources/LaunchScreen.storyboard", "Resources/Assets.xcassets",
    "Resources/Fonts", "Resources/Localizable.xcstrings"].map((f) => ({ path: `${IOS}/${f}` })),
  ...["DisplayMessage", "InterfaceLanguage"].map((f) => ({ path: `${IOS}/Shared/Localization/${f}.swift` })),
  ...["Palette", "Typeface", "ScreenScaffold", "Metric", "Haptics", "Card", "Controls", "Glyph",
    "GoogleBrandSignInButton", "FacebookSignInButton"].map((f) => ({ path: `${IOS}/Shared/DesignSystem/${f}.swift` })),
  ...["SignInScreen", "PaywallScreen", "SplashScreen", "RestoringScreen", "ProfileScreen"].map((f) => ({ path: `${IOS}/Screens/${f}.swift` })),
  ...["FunnelScreen", "FunnelContent", "FunnelParts", "FunnelRecap"].map((f) => ({ path: `${IOS}/Screens/Funnel/${f}.swift` })),
  ...["JSONCodingTests", "FunnelContentTests"].map((t) => ({ path: `ios/PrintyardTests/${t}.swift` })),
];

// The server half of Dodo is self-contained; the funnel half is ported by hand (see payments.md).
const WAIT_PROFESSOR: Entry[] = [
  ...["dodo.ts", "dodoCheckout.ts", "checkoutSession.ts", "plans.ts", "entitlements.ts"].map((l) => ({ path: `lib/${l}`, group: "dodo" as const })),
  ...["dodo", "funnel", "subscription/portal"].map((r) => ({ path: `app/api/${r}`, group: "dodo" as const })),
  { path: "supabase/migrations/0006_dodo_entitlements.sql", group: "dodo", to: "supabase/migrations/0002_dodo_entitlements.sql" },
  { path: "supabase/migrations/0009_restore_apply_dodo_entitlement_event.sql", group: "dodo", to: "supabase/migrations/0003_apply_dodo_entitlement_event.sql" },
];

// Oyno's store pipeline is takt's plus callouts (a widget zoomed out of the phone), photo frames,
// and the iPad and iPhone Duo slots, whose device photographs `DEVICES` in screenshot-kit reads.
const OYNO: Entry[] = [
  { path: "appstore/scripts" },
  { path: "ios/Oyno/App/ScreenshotCallout.swift" },
  ...["ipad-frame", "ipad-11-frame", "duo-frame", "duo-frame-open"].map((f) => ({ path: `appstore/source/${f}.png` })),
];

const TAKT_RENAMES: [RegExp, string][] = [
  [/com\.teimurjan\.printyard/g, BUNDLE],
  [/printyard\.app/g, DOMAIN],
  [/Printyard/g, TARGET],
  [/printyard/g, SLUG],
  [/PRINTYARD/g, SLUG.toUpperCase()],
];
const DODO_RENAMES: [RegExp, string][] = [
  [/com\.teimurjan\.waitprofessor/g, BUNDLE],
  [/waitprofessor\.com/g, DOMAIN],
  [/Wait Professor/g, DISPLAY],
  [/WaitProfessor/g, TARGET],
  [/wait-professor|waitprofessor/g, SLUG],
];

const OYNO_RENAMES: [RegExp, string][] = [
  [/com\.teimurjan\.oyno/g, BUNDLE],
  [/oyno\.app/g, DOMAIN],
  [/Oyno/g, TARGET],
  [/oyno/g, SLUG],
];

const BINARY = /\.(png|webp|jpe?g|ico|ttf|otf|woff2?|p8|car)$/i;

const rename = (text: string, renames: [RegExp, string][]) =>
  renames.reduce((out, [from, to]) => out.replace(from, to), text);

const filesAt = async (repo: string, path: string) =>
  (await $`git -C ${repo} ls-tree -r --name-only HEAD -- ${path}`.text()).split("\n").filter(Boolean);

const wanted = (entry: Entry) => !entry.group || entry.group === "core" || entry.group === BILLER;

async function copy(repo: string, entries: Entry[], renames: [RegExp, string][]) {
  const absent: string[] = [];
  let written = 0;
  for (const entry of entries.filter(wanted)) {
    const files = await filesAt(repo, entry.path);
    if (!files.length) absent.push(entry.path);
    for (const file of files.filter((f) => !entry.skip?.test(f))) {
      const relative = entry.to && files.length === 1 ? entry.to : file;
      const target = join(DEST, rename(relative, renames));
      const blob = Buffer.from(await $`git -C ${repo} show HEAD:${file}`.arrayBuffer());
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, BINARY.test(file) ? blob : rename(blob.toString("utf8"), renames));
      written++;
    }
  }
  return { absent, written };
}

const DROP_DEPS = ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities", "@pdf-lib/fontkit", "pdf-lib", "uqr",
  "recharts", "cmdk", "cn", "class-variance-authority", "lucide-react", "radix-ui", "shadcn", "sonner", "tw-animate-css"];

async function writePackageJson() {
  const pkg = JSON.parse(await $`git -C ${REF} show HEAD:package.json`.text());
  pkg.name = SLUG;
  for (const dep of DROP_DEPS) delete pkg.dependencies[dep];
  for (const script of ["tokens:check", "shorts:menu", "strings:build"]) delete pkg.scripts[script];
  pkg.scripts.build = "bun run funnel:build && next build";
  if (BILLER === "dodo") {
    const dodoPkg = JSON.parse(await $`git -C ${DODO_REF} show HEAD:package.json`.text());
    delete pkg.dependencies["@paddle/paddle-js"];
    delete pkg.dependencies["@paddle/paddle-node-sdk"];
    for (const dep of ["dodopayments", "dodopayments-checkout"]) pkg.dependencies[dep] = dodoPkg.dependencies[dep];
  }
  writeFileSync(join(DEST, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.applesignin</key>
	<array>
		<string>Default</string>
	</array>
</dict>
</plist>
`;

const DOMAIN_TERMS = "shop|Shop|spool|Spool|filament|Filament|printer|Printer|Costing|costing|resin|Resin|ShopStore|demoShop|kidhours|toddler|Toddler";

async function leftovers() {
  const hits = await $`grep -rlwE ${DOMAIN_TERMS} ${DEST} ${"--exclude=*.xcstrings"}`.nothrow().text();
  return hits.split("\n").filter(Boolean).map((f) => f.replace(`${DEST}/`, ""));
}

mkdirSync(DEST, { recursive: true });
const core = await copy(REF, TAKT, TAKT_RENAMES);
const shots = await copy(SHOTS_REF, OYNO, OYNO_RENAMES);
const dodo = BILLER === "dodo" ? await copy(DODO_REF, WAIT_PROFESSOR, DODO_RENAMES) : { absent: [], written: 0 };
await writePackageJson();
writeFileSync(join(DEST, `ios/${TARGET}/${TARGET}.entitlements`), ENTITLEMENTS);
const pbxproj = join(DEST, `ios/${TARGET}.xcodeproj/project.pbxproj`);
writeFileSync(pbxproj, (await Bun.file(pbxproj).text()).replace(/(INFOPLIST_KEY_CFBundleDisplayName = )[^;]+;/g, `$1"${DISPLAY}";`));

const absent = [...core.absent, ...shots.absent, ...dodo.absent];
console.log(`copied ${core.written + shots.written + dodo.written} files into ${DEST} (biller: ${BILLER})`);
if (absent.length) console.log(`\nmissing in the reference HEAD (moved or deleted, port by hand):\n  ${absent.join("\n  ")}`);
console.log(`\nfiles still naming the reference product's domain (strip these):\n  ${(await leftovers()).join("\n  ")}`);
