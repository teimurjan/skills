# App Store, screenshots, translations

## Prerequisites
- `brew install fastlane`. There is no Gemfile.
- `npx playwright install chromium`.
- Xcode with an "iPhone 17" simulator runtime. For the other slots, also "iPad Pro 13-inch (M5)",
  "iPad Air 11-inch (M4)" and "iPhone Duo".
- For iPhone Duo frames, a fastlane later than 2.241.0 (fastlane#30444). An older deliver refuses
  the whole upload. The menu checks the version before a push.
- The ASC API key (App Manager) `.p8` in `appstore/fastlane/`. The menu turns it into
  `asc-api-key.json` (gitignored) after asking for the Issuer ID.

## Files to edit after the scaffold
- `appstore/fastlane/Appfile`: `app_identifier` (already renamed). `Deliverfile` copies as-is
  (`skip_binary_upload`).
- `appstore/scripts/lib/locales.mjs`: `LOCALES` `{tag, sim, asc}` trimmed to the launch list,
  plus `PRIORITY_TAGS`.
- `appstore/scripts/lib/screenshot-kit.mjs`: this is the brand file. Edit `SCREENS` (`nn` → screen
  name in the harness), `PALETTE`, `FACES`/fonts and the background. Trim `DEVICES` to the store
  slots the app ships. For an iPhone-only app, keep only `iphone`.
- `appstore/scripts/lib/simulator.mjs`: `SCHEME`, `BUNDLE_ID`, `DEFAULT_DEVICE`.
- `appstore/scripts/check-metadata.mjs`: the brand in `name.txt` and `REQUIRED_LINKS` (the privacy
  URL plus Apple's standard EULA).
- `generate-creative-assets.mjs` / `push-creative-assets.mjs` are optional (ASC header and search
  images). Edit `CREATIVES` and `SEARCH_CHOICES` or leave them unused.
- `appstore/captions/<tag>.json`: `{"default":[{"slug","source":"NN","caption":"Text [one emphasis]"}]}`.
  Exactly one `[…]` per caption. Frame 01 is the winning ad's line. A frame can also zoom a widget
  or be a photo (see Screenshots).

## Metadata (`appstore/metadata/<asc-locale>/`)
| File | Limit |
|---|---|
| `name.txt` | 30, must contain the brand |
| `subtitle.txt` | 30 |
| `promotional_text.txt` | 170 |
| `keywords.txt` | 100, comma-separated, must differ from en-US in other locales |
| `description.txt` | 4000, must contain the EULA and privacy URLs |
| `release_notes.txt` | 4000 |
| `support_url.txt`, `marketing_url.txt` | none |

`review_information/`: first_name, last_name, email_address, phone_number, notes, plus
`demo_user.txt` and `demo_password.txt` (both or neither). deliver crashes without this folder.

**Never blank a .txt.** A missing file leaves the live value alone, and an empty one is skipped
silently.

ASC locale codes differ from the app tags: `no` for `nb`, `de-DE`, `en-US`. `locales.mjs` is
the table.

## Screenshots
1. `ScreenshotHarness.swift` renders one screen against one seeded fixture shop. Every frame shares
   it, so the numbers agree across shots. The locale comes from launch args
   (`-AppleLanguages (tag) -AppleLocale sim_ID`).
2. `bun run screenshots:capture [--screens=NN] [--locales=…]` writes raw PNGs to
   `appstore/source/<tag>/` (gitignored).
3. `bun run screenshots:composite [--sources=NN]` writes 1290×2796 frames to
   `appstore/screenshots/<asc>/` (gitignored) and 480×1040 WebP to `public/screenshots/<asc>/`
   (**committed**, because the site's gallery serves these). It also writes each raw capture, without a
   caption, to `public/screenshots/<asc>/screens/<slug>.webp`.

### Zoomed widgets (callouts)
A callout lifts one widget off the phone and draws it larger, over a veiled screen. If the caption's proof is a small part of the screen
(a number, a card, a sheet), use one.
1. In SwiftUI, tag the widget: `.screenshotCallout("total")` (`App/ScreenshotCallout.swift`). It
   does nothing outside a Debug screenshot run.
2. The capture writes `appstore/source/<tag>/NN.json` beside `NN.png`, with each tagged widget's
   frame in points. Recapture after you add or move a tag.
3. In the caption, name the id: `{"slug","source":"04","callout":"total","caption":…}`. An array
   (`["total","streak"]`) lifts the box that holds all of them. `"zoom": 1.8` overrides
   the default 1.3. The zoom is capped so the widget keeps a 48px margin on the canvas.
4. If the composite says a capture "reported no … callout", the widget was off screen or the
   capture is stale. Scroll it into view in the harness, then recapture.

### Photo frames
`{"slug","photo":"photo.jpg","caption":…}` makes a frame without a phone. The photo
(`appstore/source/<file>`, `.jpg` or `.png`, committed) fills the canvas and fades into it under the
caption. A frame has either `source` or `photo`, never both. Use it to open the set with the
person the ad speaks to.

### iPad and iPhone Duo
`DEVICES` in `screenshot-kit.mjs` lists the screenshot sets, with one simulator each.

| Set | `--device` | Canvas | Posture in Device Hub |
|---|---|---|---|
| iPhone 6.9" | `iphone` | 1290×2796 | upright |
| iPad 13" | `ipad` | 2752×2064 | on its side |
| iPad 11" | `ipad-11` | 2360×1640 | on its side |
| iPhone Duo, inner display | `duo` | 2853×2007 | open, on its side |
| iPhone Duo, outer display | `duo-outer` | 1398×2034 | closed, upright |

1. Set the posture in Device Hub before you capture. Only Device Hub turns or folds a simulator.
   The capture reads the lit display. If the posture is wrong, it stops and says what to fix. If a
   capture is not the slot's pixel size, it also stops.
2. `bun run screenshots:capture --device=ipad` writes to `appstore/source/ipad/<tag>/`. The
   iPhone's captures stay at `appstore/source/<tag>/`.
3. `bun run screenshots:composite --devices=ipad,duo` puts each capture under the transparent
   screen of a device photograph, below the caption. The photographs are
   `appstore/source/{ipad,ipad-11,duo,duo-frame-open}*.png` (committed). Each `mockup.screen` is
   measured in its photograph's pixels, so a new photograph needs new numbers. On a canvas wider
   than it is tall, a photo frame puts the photo on the left and the caption beside it.
4. Each device's frames carry a prefix (`ipad-`, `ipad11-`, `duo-`, `duo-outer-`) in the same
   locale folder, because deliver sorts the files by pixel size. Only the iPhone set goes to
   `public/screenshots/`.
5. Both Duo sets fill one App Store slot of at most 10 screenshots per locale. The menu refuses a
   push over that limit.

`bun run appstore:menu` wraps all of it: capture, composite, pull to `.download/`, check, push
metadata and screenshots, push creatives.

## Strings pipeline
1. Swift `Text("…")` / `String(interface:)` → `ios/<Target>/Resources/Localizable.xcstrings`, the
   one vocabulary.
2. `bun run strings:sync` does a Debug build, then `xcstringstool sync`. **Copy the catalogue aside
   first**: sync can blank translations of keys added outside Xcode. Never sync twice in a row.
   Diff key by key as JSON afterwards.
3. Translate in the catalogue. Every key, every plural category, every specifier.
4. `bun run strings:check` is the gate against `InterfaceLanguage.supported`.

The site and the funnel use their own decks (`components/site/copy`, `components/funnel/copy`),
not the catalogue.

## First submission
1. Create the ASC record and products (`services.md` §2).
2. Archive and upload via Xcode Organizer.
3. Run `strings:sync`, then `strings:check`.
4. Write the metadata and `review_information`, then `bun run metadata:check`.
5. Capture → composite. Commit `public/screenshots/`.
6. Menu → Validate (no upload), then push metadata and screenshots.
7. In ASC, attach the build, then fill in pricing, App Privacy, age rating, the IAPs with their
   review screenshots, and the subscription group localization. Submit by hand.
