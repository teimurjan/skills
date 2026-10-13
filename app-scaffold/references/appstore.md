# App Store, screenshots, translations

## Prerequisites
- `brew install fastlane`. There is no Gemfile.
- `npx playwright install chromium`.
- Xcode with an "iPhone 17" simulator runtime.
- The ASC API key (App Manager) `.p8` in `appstore/fastlane/`. The menu turns it into
  `asc-api-key.json` (gitignored) after asking for the Issuer ID.

## Files to edit after the scaffold
- `appstore/fastlane/Appfile`: `app_identifier` (already renamed). `Deliverfile` copies as-is
  (`skip_binary_upload`).
- `appstore/scripts/lib/locales.mjs`: `LOCALES` `{tag, sim, asc}` trimmed to the launch list,
  plus `PRIORITY_TAGS`.
- `appstore/scripts/lib/screenshot-kit.mjs`: this is the brand file. Edit `SCREENS` (`nn` → screen
  name in the harness), `PALETTE`, `FACES`/fonts and the background.
- `appstore/scripts/generate-app-store-screenshots.mjs`: the photo frame's fade starts from Oyno's
  canvas as a literal `rgba(255,248,239,0)`. Change it to the new `PALETTE.canvas` at zero alpha.
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
| `support_url.txt`, `marketing_url.txt` | — |

`review_information/`: first_name, last_name, email_address, phone_number, notes, plus
`demo_user.txt` and `demo_password.txt` (both or neither). deliver crashes without this folder.

**Never blank a .txt.** A missing file leaves the live value alone, and an empty one is skipped
silently.

ASC locale codes differ from the app tags (`no`, not `nb`; `de-DE`; `en-US`). `locales.mjs` is
the table.

## Screenshots
1. `ScreenshotHarness.swift` renders one screen against one seeded fixture shop. Every frame shares
   it, so the numbers agree across shots. The locale comes from launch args
   (`-AppleLanguages (tag) -AppleLocale sim_ID`).
2. `bun run screenshots:capture [--screens=NN] [--locales=…]` writes raw PNGs to
   `appstore/source/<tag>/` (gitignored).
3. `bun run screenshots:composite [--sources=NN]` writes 1290×2796 frames to
   `appstore/screenshots/<asc>/` (gitignored) and 480×1040 WebP to `public/screenshots/<asc>/`
   (**committed**; the site's gallery serves these). It also writes each raw capture, without a
   caption, to `public/screenshots/<asc>/screens/<slug>.webp`.

### Zoomed widgets (callouts)
A callout lifts one widget off the phone and draws it larger, over a veiled screen. Use one when
the caption's proof is a small part of the screen (a number, a card, a sheet). The reference is
Oyno (`~/Projects/oyno/appstore/captions/en.json`).
1. In SwiftUI, tag the widget: `.screenshotCallout("battery")` (`App/ScreenshotCallout.swift`). It
   does nothing outside a Debug screenshot run.
2. The capture writes `appstore/source/<tag>/NN.json` beside `NN.png`, with each tagged widget's
   frame in points. Recapture after you add or move a tag.
3. In the caption, name the id: `{"slug","source":"04","callout":"evidence","caption":…}`. An array
   (`["schedules","alwaysAllowed"]`) lifts the box that holds all of them. `"zoom": 1.8` overrides
   the default 1.3. The zoom is capped so the widget keeps a 48px margin on the canvas.
4. If the composite says a capture "reported no … callout", the widget was off screen or the
   capture is stale. Scroll it into view in the harness, then recapture.

### Photo frames
`{"slug","photo":"together.jpg","caption":…}` makes a frame without a phone. The photo
(`appstore/source/<file>`, `.jpg` or `.png`, committed) fills the canvas and fades into it under the
caption. A frame has either `source` or `photo`, never both. Use it to open the set with the
person the ad speaks to.

`bun run appstore:menu` wraps all of it: capture, composite, pull to `.download/`, validate, push
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
