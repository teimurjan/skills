import Foundation

/// The language the app itself is drawn in.
///
/// Stored twice, on purpose. `AppleLanguages` is iOS's own per-app language
/// setting, the same key Settings → Appname → Language writes: putting the
/// choice there is what makes it hold across a relaunch, and what stops the two
/// places you can change it from disagreeing. `overrideKey` holds the same tag
/// as a plain string, which is what `@AppStorage` can watch and the array-valued
/// `AppleLanguages` cannot be.
///
/// The mirror is rewritten at launch from what the bundle actually resolved to,
/// which is what keeps it honest: a language picked in Settings between runs
/// arrives on its own, and a screenshot run launched with `-AppleLanguages`
/// leaves nothing behind for the next ordinary launch to pick up.
enum InterfaceLanguage {
    static let overrideKey = "appname.interfaceLanguage"
    private static let systemKey = "AppleLanguages"

    /// Every locale the app ships copy for, and nothing else.
    ///
    /// `bun run strings:check` fails if `Localizable.xcstrings` is missing a single key
    /// in any of them, which is what makes this list a promise rather than an intention.
    /// A language listed here but half-translated is worse than one that is absent: iOS
    /// falls back key by key, so the reader gets a translated screen with three English rows
    /// in the middle of it and no way to tell whether that is a bug or the product.
    ///
    /// Both faces cover Latin and Cyrillic, so the writing system is not the
    /// constraint here; the constraint is having a translation worth shipping.
    ///
    /// Ordered by market rather than alphabetically, which is the order the picker draws
    /// and the same order `LOCALES` in `appstore/scripts/lib/locales.mjs` prints in — the
    /// two lists are one set, and a market only really exists when both name it.
    static let supported = ["en"]

    /// The language's own name for itself — "Русский", not "Russian". The only spelling
    /// that works in a picker, because somebody who has the app in a language they cannot
    /// read is exactly the person reaching for it.
    static func displayName(_ tag: String) -> String {
        let locale = Locale(identifier: tag)
        guard let name = locale.localizedString(forIdentifier: tag) else { return tag }
        return name.sentenceCased(in: locale)
    }

    /// Read from defaults rather than cached in a `static var`: this is asked for every
    /// font the app draws *and* off the main actor, and a stored
    /// property written on the main thread while a background task reads it is a race for
    /// the sake of a lookup that was never the expensive part.
    static var current: String {
        UserDefaults.standard.string(forKey: overrideKey) ?? launchLocalization
    }

    private static let launchLocalization = Bundle.main.preferredLocalizations.first ?? "en"

    /// What the interface is resolved against. SwiftUI looks copy up in the
    /// environment's locale — a `Text` literal and a `LocalizedStringResource`
    /// alike — which is the whole reason the language can change without the
    /// process restarting.
    ///
    /// `Format` resolves against it too, so a screen cannot end up half-translated in the
    /// punctuation: a translated month beside "$1,234.50" is two languages in one line.
    ///
    /// Exactly the tag from `supported`, which is exactly the name of an `.lproj` — no
    /// region grafted on, and none taken off. Three of them carry one already
    /// (`es-MX`, `pt-BR`, `pt-PT`) because those are different translations rather than
    /// different regions of one, and where a region is present it decides the currency's
    /// *placement* and the separators.
    static var locale: Locale { Locale(identifier: current) }

    /// Called once at launch, before the first body. The bundle is the authority
    /// on what language this run came up in, so the mirror is corrected to it —
    /// which is also what makes a choice made in Settings win over one this app
    /// recorded before it.
    static func adoptLaunchLocalization() {
        UserDefaults.standard.set(launchLocalization, forKey: overrideKey)
    }

    /// The mirror is written last: it is what the tree redraws on, and the
    /// system key has to be true by then.
    static func select(_ tag: String) {
        UserDefaults.standard.set([tag], forKey: systemKey)
        UserDefaults.standard.set(tag, forKey: overrideKey)
    }
}

extension String {
    /// Copy resolved outside a `Text`, in the language the interface is drawn in.
    ///
    /// `String(localized:)` answers in the *process* localization, which the
    /// in-app language can now differ from, and its `locale:` argument only
    /// steers formatting — the one thing that picks a different `.lproj` is the
    /// locale carried on the resource itself.
    init(interface copy: LocalizedStringResource) {
        var copy = copy
        copy.locale = InterfaceLanguage.locale
        self.init(localized: copy)
    }

    /// Sentence case, for a name ICU hands back lower case.
    ///
    /// Russian writes months, languages and currencies in lower case inside a sentence and
    /// in upper case when the name *is* the title — so `.month(.wide)` answers "август"
    /// where a header wants "Август". English is unaffected: its month names
    /// are already capitals.
    func sentenceCased(in locale: Locale = InterfaceLanguage.locale) -> String {
        prefix(1).uppercased(with: locale) + dropFirst()
    }
}
