import SwiftUI

/// The whole palette: paper, a warm canvas and ink.
///
/// One accent, spent once per screen as a fill on the single action that screen exists for.
/// The ink fill is the second voice (the add button, a selected segment, the dark card that
/// holds the number a screen is about) and never competes with it for the commit.
///
/// `alert` means one thing: this loses you something. Never decoration.
enum Palette {
    /// Headings, values, anything the reader is meant to act on. Also the dark surfaces.
    static let ink = Color(hex: 0x201A14)
    /// Body copy.
    static let slate = Color(hex: 0x4A4038)
    /// Labels, captions, secondary metadata.
    static let muted = Color(hex: 0x6F6458)
    /// Mono annotations that sit beside a value.
    static let faint = Color(hex: 0x8C7E6E)
    /// Disclosure chevrons and dashed outlines.
    static let chevron = Color(hex: 0xB5A48F)

    /// Control borders.
    static let hairline = Color(hex: 0xE0D3C2)
    /// The lighter rule between rows inside one card.
    static let divider = Color(hex: 0xEFE6DA)
    /// The unfilled part of a bar, and the well a segmented control sits in.
    static let track = Color(hex: 0xE7DCCD)

    /// Cards and controls. A step lighter than the canvas, so a card reads as paper on card.
    static let surface = Color(hex: 0xFBF8F3)
    /// Every screen's background.
    static let canvas = Color(hex: 0xF2ECE3)

    static let accent = Color(hex: 0xC8955A)
    static let accentPressed = Color(hex: 0xB8844C)
    /// Words on an accent fill. Ink, not white: white on this accent fails contrast.
    static let onAccent = ink

    /// Words and figures on an ink surface.
    static let onInk = Color(hex: 0xF2ECE3)
    /// Secondary words on an ink surface.
    static let onInkMuted = Color(hex: 0xCDBFAE)
    /// A highlight on an ink surface: a picked plan, a ticked answer.
    static let amber = Color(hex: 0xF2C38A)

    static let alert = Color(hex: 0x9A3412)
    /// The wash behind an `alert` word.
    static let alertWash = Color(hex: 0xFBE1CF)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}
