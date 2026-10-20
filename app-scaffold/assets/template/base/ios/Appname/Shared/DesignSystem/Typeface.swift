import CoreText
import SwiftUI
import UIKit

/// Three families for the interface, split by job, and a fourth with exactly one caller.
///
/// Bricolage Grotesque carries language: titles, labels, prose. IBM Plex Mono carries the
/// numbers read down a column, because a figure that shifts left when it loses a digit makes
/// a list unscannable. The one figure a screen is built around is set in Bricolage at display
/// weight instead, with tabular figures: it is read once, large.
///
/// Bricolage has no Cyrillic, so a Russian or Ukrainian interface is set in Inter throughout
/// rather than letting the system cascade glyph by glyph.
///
/// Space Grotesk draws the wordmark and nothing else, the same face the website header uses.
///
/// The faces register themselves rather than going through `UIAppFonts`, so adding a weight
/// is a file drop with no Info.plist edit.
enum Typeface {
    enum Weight: String {
        case regular = "Regular"
        case medium = "Medium"
        case semibold = "SemiBold"
        case bold = "Bold"
        /// Display only: screen titles and the one headline figure.
        case extrabold = "ExtraBold"
    }

    private static let registered: Void = {
        let names = [
            "BricolageGrotesque-Regular", "BricolageGrotesque-Medium", "BricolageGrotesque-SemiBold",
            "BricolageGrotesque-Bold", "BricolageGrotesque-ExtraBold",
            "Inter-Regular", "Inter-Medium", "Inter-SemiBold", "Inter-Bold",
            "IBMPlexMono-Regular", "IBMPlexMono-Medium", "IBMPlexMono-SemiBold",
            "SpaceGrotesk-SemiBold",
        ]
        let urls = names.compactMap { Bundle.main.url(forResource: $0, withExtension: "ttf") } as CFArray
        CTFontManagerRegisterFontURLs(urls, .process, true, nil)
    }()

    static func register() { _ = registered }

    /// `Font.custom` takes a *PostScript* name, not a filename, and the families here
    /// disagree about what those look like. Bricolage's and Inter's follow the obvious
    /// pattern (Bricolage's were set by hand when the instances were cut); both IBM Plex
    /// faces are abbreviated to fit the 31-character limit older tooling imposed —
    /// `IBMPlexMono`, `IBMPlexMono-Medm`, `IBMPlexMono-SmBld`.
    ///
    /// Worth stating rather than deriving, because getting one wrong fails *silently*:
    /// SwiftUI falls back to the system font and nothing crashes or logs. Verified in
    /// `assertFontsResolve()` below.
    private static func postScriptName(_ family: Family, _ weight: Weight) -> String {
        switch (family, weight) {
        case (.bricolage, _): "BricolageGrotesque-\(weight.rawValue)"
        case (.inter, .regular): "Inter-Regular"
        case (.inter, .medium): "Inter-Medium"
        case (.inter, .semibold): "Inter-SemiBold"
        case (.inter, .bold), (.inter, .extrabold): "Inter-Bold"
        case (.mono, .regular): "IBMPlexMono"
        case (.mono, .medium): "IBMPlexMono-Medm"
        case (.mono, .semibold), (.mono, .bold), (.mono, .extrabold): "IBMPlexMono-SmBld"
        // The face ships in one weight, because the wordmark is set in one weight.
        case (.wordmark, _): "SpaceGrotesk-SemiBold"
        }
    }

    private enum Family { case bricolage, inter, mono, wordmark }

    /// The languages whose script the display face does not draw, set in Inter instead. Keyed on
    /// the interface language, because that decides the script of every word the app writes.
    private static let interLanguages: Set<String> = []

    private static var wordFamily: Family {
        interLanguages.contains(InterfaceLanguage.current) ? .inter : .bricolage
    }

    /// The interface face at a fixed size. Sizes come straight off the canvas, which
    /// specifies them in points; `relativeTo` still lets Dynamic Type scale them.
    static func ui(_ size: CGFloat, _ weight: Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        register()
        return .custom(postScriptName(wordFamily, weight), size: size, relativeTo: style)
    }

    /// IBM Plex Mono. Always pair with `.monospacedDigit()` at the call site — the face is
    /// monospaced, but the modifier is what keeps digits aligned if the bundle ever ships
    /// without the TTF.
    static func mono(_ size: CGFloat, _ weight: Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        register()
        return .custom(postScriptName(.mono, weight), size: size, relativeTo: style)
    }

    /// The wordmark, and the one face in here with no `relativeTo:`.
    ///
    /// Dynamic Type must not touch it. A mark is a fixed shape rather than something read at
    /// a comfortable size.
    static func wordmark(_ size: CGFloat) -> Font {
        register()
        return .custom(postScriptName(.wordmark, .semibold), fixedSize: size)
    }

    #if DEBUG
    /// Fails the launch of a Debug build if any face is missing or misnamed.
    ///
    /// The failure this guards against is invisible: a wrong PostScript name renders in
    /// the system font, which on iOS is close enough to Inter that a screenshot looks
    /// almost right — and every number silently loses the tabular figures the layout
    /// depends on. It shipped once already. Compiled out of Release, so a font that fails
    /// to register on a real device degrades rather than crashes.
    static func assertFontsResolve() {
        register()
        for (family, weights) in [
            (Family.bricolage, [Weight.regular, .medium, .semibold, .bold, .extrabold]),
            (.inter, [.regular, .medium, .semibold, .bold]),
            (.mono, [.regular, .medium, .semibold]),
            (.wordmark, [.semibold]),
        ] {
            for weight in weights {
                let name = postScriptName(family, weight)
                assert(
                    UIFont(name: name, size: 12) != nil,
                    "Font \"\(name)\" did not resolve — check the PostScript name and that the TTF is in the bundle"
                )
            }
        }
    }
    #endif
}

extension View {
    /// A screen's large title: 40pt ExtraBold, set tight. It shrinks rather than wraps.
    func appnameTitle(_ size: CGFloat = 40) -> some View {
        font(Typeface.ui(size, .extrabold, relativeTo: .largeTitle))
            .tracking(-size * 0.02)
            .foregroundStyle(Palette.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }

    /// The mono all-caps rule above a card's contents. Wide tracking is what makes 11pt legible.
    func appnameEyebrow(_ color: Color = Palette.muted) -> some View {
        font(Typeface.mono(11, .medium, relativeTo: .caption2))
            .tracking(0.9)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }

    /// A row's name.
    func appnameRowTitle() -> some View {
        font(Typeface.ui(16, .semibold, relativeTo: .subheadline)).foregroundStyle(Palette.ink)
    }

    /// A card's own heading.
    func appnameCardTitle() -> some View {
        font(Typeface.ui(15, .bold, relativeTo: .headline)).foregroundStyle(Palette.ink)
    }

    /// The line under a row title, and the caption under a card.
    func appnameCaption(_ color: Color = Palette.muted) -> some View {
        font(Typeface.ui(13, .regular, relativeTo: .caption)).foregroundStyle(color)
    }

    /// A number the reader compares against other numbers.
    func appnameValue(_ size: CGFloat = 15, _ weight: Typeface.Weight = .semibold, color: Color = Palette.ink) -> some View {
        font(Typeface.mono(size, weight, relativeTo: .subheadline))
            .monospacedDigit()
            .foregroundStyle(color)
    }

    /// The one number a screen is built around.
    func appnameHeadlineValue(_ size: CGFloat = 44, color: Color = Palette.ink) -> some View {
        font(Typeface.ui(size, .extrabold, relativeTo: .largeTitle))
            .monospacedDigit()
            .tracking(-size * 0.02)
            .foregroundStyle(color)
    }

    /// The mono annotation beside a value.
    func appnameNote(_ color: Color = Palette.muted) -> some View {
        font(Typeface.mono(11, .regular, relativeTo: .caption2))
            .monospacedDigit()
            .foregroundStyle(color)
    }
}
