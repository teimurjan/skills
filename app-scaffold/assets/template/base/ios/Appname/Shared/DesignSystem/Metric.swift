import SwiftUI

/// Spacing, radii and the control heights, so a new screen inherits the rhythm instead of
/// re-deriving it.
enum Metric {
    static let gutter: CGFloat = 20
    static let cardPadding: CGFloat = 16

    enum Space {
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 14
        static let xl: CGFloat = 20
    }

    /// Soft corners everywhere: a card is a sheet of paper, a control is a pebble. The hero
    /// card that leads a screen is a little rounder than the cards under it.
    enum Radius {
        static let hero: CGFloat = 28
        static let card: CGFloat = 24
        static let tile: CGFloat = 18
        static let control: CGFloat = 14
        static let chip: CGFloat = 10
        static let swatch: CGFloat = 5
        static let bar: CGFloat = 3
    }

    /// Apple's minimum, and the reason every icon button is a 44pt circle.
    static let tapTarget: CGFloat = 44
    /// The one committing action per screen sits taller than everything around it.
    static let primaryButton: CGFloat = 56
    /// A quieter full-width action beside the commit.
    static let secondaryButton: CGFloat = 48
    /// A control that shares a line rather than standing alone: a filter, a segmented picker.
    static let compactControl: CGFloat = 40
}
