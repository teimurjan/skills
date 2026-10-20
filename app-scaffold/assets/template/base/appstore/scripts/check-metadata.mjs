// Checks appstore/metadata against App Store Connect's field limits before a push.
//
// Every locale times six fields is exactly the shape of thing that goes over a
// cap unnoticed and comes back as a submission error, so it is cheaper to fail
// here. Locales still to be written are reported separately from locales that are
// written and wrong — the first is work outstanding, the second is a bug.
//
// It also catches the failure deliver is deliberately quiet about: an empty file.
// `upload_metadata.rb` skips any value whose length is zero, so a blanked field
// uploads as a no-op and the old copy silently stays live. That is the right
// default for a field you never filled in, and the wrong one for a field you
// meant to change, and only this script can tell the difference.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ASC_LOCALES } from "./lib/locales.mjs";
import { METADATA_DIR } from "./lib/screenshot-kit.mjs";

/** deliver's filenames, and the caps App Store Connect enforces on them. */
const LIMITS = {
  "name.txt": 30,
  "subtitle.txt": 30,
  "promotional_text.txt": 170,
  "keywords.txt": 100,
  "description.txt": 4000,
  "release_notes.txt": 4000,
};

const FIELDS = Object.keys(LIMITS);

/** Links every description must carry, whatever language it is written in. */
const REQUIRED_LINKS = {
  "Terms of Use (EULA)": "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
  "privacy policy": "https://appname.example/privacy",
};

/** deliver `.strip`s every value before uploading, so a trailing newline is not
 * an overrun and must not be counted as one. */
const valueOf = (dir, file) => {
  const filePath = path.join(dir, file);
  return existsSync(filePath) ? readFileSync(filePath, "utf8").trim() : null;
};

const problems = [];
const pending = [];

const present = existsSync(METADATA_DIR)
  ? readdirSync(METADATA_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];

// A directory deliver cannot map to a language aborts the whole run, so name it
// here rather than thirty seconds into an upload. `review_information` is
// deliver's own and is expected.
for (const dir of present) {
  if (dir !== "review_information" && !ASC_LOCALES.includes(dir)) {
    problems.push(`${dir}/: not an App Store Connect locale — deliver will refuse to run`);
  }
}

const english = Object.fromEntries(
  FIELDS.map((file) => [file, valueOf(path.join(METADATA_DIR, "en-US"), file)]),
);

for (const locale of ASC_LOCALES) {
  const dir = path.join(METADATA_DIR, locale);
  if (!existsSync(dir)) {
    pending.push(locale);
    continue;
  }

  for (const file of FIELDS) {
    const value = valueOf(dir, file);
    // Absent is fine: deliver leaves the live value alone, which is how a locale
    // gets written one field at a time. Present but empty is not.
    if (value === null) {
      problems.push(`${locale}/${file}: missing`);
      continue;
    }
    if (!value) {
      problems.push(`${locale}/${file}: empty — deliver would skip it and leave the live copy in place`);
      continue;
    }
    if (value.length > LIMITS[file]) {
      problems.push(`${locale}/${file}: ${value.length} chars, limit ${LIMITS[file]}`);
    }
  }

  // The mark itself is never translated, so a name that has lost it is a
  // translation that went one field too far.
  const name = valueOf(dir, "name.txt");
  if (name && !name.includes("Appname")) {
    problems.push(`${locale}/name.txt: brand "Appname" is missing — it is never translated`);
  }

  // App Store Connect refuses any space but U+0020 in the name, such as French typography's
  // no-break space before a colon.
  if (name && /[^\S ]/.test(name)) {
    problems.push(`${locale}/name.txt: contains a space other than U+0020 — App Store Connect refuses it`);
  }

  // Guideline 3.1.2 wants the subscription's Terms of Use and privacy policy
  // reachable from the App Store listing, not only from the paywall. The EULA
  // link is Apple's standard one; point the paywall at the same URL so the two
  // places a reviewer checks agree.
  const description = valueOf(dir, "description.txt");
  for (const [label, url] of Object.entries(REQUIRED_LINKS)) {
    if (description && !description.includes(url)) {
      problems.push(`${locale}/description.txt: ${label} link is missing — ${url}`);
    }
  }

  // A keyword string that reads like the English one usually means it was
  // translated rather than researched, which is the expensive mistake.
  const keywords = valueOf(dir, "keywords.txt");
  if (locale !== "en-US" && keywords && keywords === english["keywords.txt"]) {
    problems.push(`${locale}/keywords.txt: identical to en-US — needs local search terms, not a translation`);
  }
}

// ── App Review information ───────────────────────────────────────────────────
//
// Absent, this crashes `deliver` rather than degrading: `upload_metadata` only
// creates the AppStoreReviewDetail record when review info is present, but then
// calls `review_attachment_file` unconditionally, which fetches that record with
// no rescue. The result is `RuntimeError: No data` from deep inside spaceship,
// with nothing pointing at the actual cause.
//
// App Store Connect requires all four contact fields, and `notes.txt` is what
// stops a reviewer concluding a paid app is empty: say how to sign in and reach
// the content behind the paywall.
const REVIEW_REQUIRED = [
  "first_name.txt", "last_name.txt", "email_address.txt", "phone_number.txt", "notes.txt",
];

/** Optional: leave both out when a reviewer can create their own account. Both
 * files must be present or neither — deliver only sets `demo_account_required`
 * when it has a name *and* a password, so filling one alone silently uploads a
 * demo account that App Review is never told to use. */
const REVIEW_DEMO = ["demo_user.txt", "demo_password.txt"];

const reviewDir = path.join(METADATA_DIR, "review_information");
if (!existsSync(reviewDir)) {
  problems.push(
    "review_information/: missing — deliver will crash with \"No data\" while "
      + "uploading metadata, because it only creates the review-detail record when "
      + "this exists but always reads it back",
  );
} else {
  for (const file of REVIEW_REQUIRED) {
    const value = valueOf(reviewDir, file);
    if (value === null) {
      problems.push(`review_information/${file}: missing`);
    } else if (!value) {
      problems.push(`review_information/${file}: empty — App Review needs this filled in`);
    }
  }

  const demo = REVIEW_DEMO.map((file) => [file, valueOf(reviewDir, file)]);
  const filled = demo.filter(([, value]) => value);
  if (filled.length === 1) {
    const [name] = demo.find(([, value]) => !value);
    problems.push(
      `review_information/${name}: a demo account needs both files — with only one, `
        + "deliver leaves demo_account_required off and the credentials go unused",
    );
  }
}

if (pending.length) {
  console.log(`${pending.length} locale(s) not yet written: ${pending.join(", ")}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
console.log(`${ASC_LOCALES.length - pending.length}/${ASC_LOCALES.length} locales pass.`);
