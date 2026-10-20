import SwiftUI

/// Every icon in the app is an SF Symbol, and this is the only place that says so.
///
/// One type rather than `Image(systemName:)` sprinkled through the screens, because what
/// has to stay consistent is not the name but the weight and the size. A symbol left at
/// the system default renders thin beside the interface face, and two screens that each
/// pick their own weight read as two different icon sets.
///
/// Fixed point sizes rather than Dynamic Type: these sit inside 44pt tap targets and
/// fixed-height rows, and an icon that grows out of the square it is centred in is worse
/// than one that stays put.
struct Glyph: View {
    let symbol: String
    var size: CGFloat = 19
    var weight: Font.Weight = .medium
    var color: Color = Palette.ink

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size, weight: weight))
            .foregroundStyle(color)
    }
}

extension Glyph {
    /// The chevron at the end of a row that pushes or presents. Semibold and small, which
    /// is what iOS's own disclosure indicator is.
    static let disclosure = Glyph(symbol: "chevron.right", size: 13, weight: .semibold, color: Palette.chevron)

    /// The caret on a control that opens a menu.
    ///
    /// A symbol rather than the `⌄` it replaces, and that is the whole fix: the character
    /// sits on the text baseline with a full ascender above it, so in a row centred on
    /// its own height it drew visibly low. A symbol's box is centred on the glyph.
    static func caret(_ color: Color = Palette.chevron) -> Glyph {
        Glyph(symbol: "chevron.down", size: 12, weight: .semibold, color: color)
    }
}

extension Image {
    /// A symbol for a menu row, drawn in the colour of the row's words rather than the
    /// app's tint. Original rendering because a menu re-tints a template image and ignores
    /// `foregroundStyle`; `.label` because the menu follows the phone's appearance.
    static func menuIcon(_ symbol: String) -> Image {
        let configuration = UIImage.SymbolConfiguration(paletteColors: [.label])
        let image = UIImage(systemName: symbol, withConfiguration: configuration)?.withRenderingMode(.alwaysOriginal)
        return Image(uiImage: image ?? UIImage())
    }
}

extension View {
    /// The paper circle a glyph-only control sits in: a header's icon buttons, `IconButton`.
    ///
    /// Bordered rather than filled, so a screen never has two things competing with its
    /// commit or with the ink add button.
    func glyphButtonFace(side: CGFloat = Metric.tapTarget, pressed: Bool = false) -> some View {
        frame(width: side, height: side)
            .background(pressed ? Palette.divider : Palette.surface, in: .circle)
            .overlay(Circle().strokeBorder(Palette.hairline, lineWidth: 1))
    }
}
