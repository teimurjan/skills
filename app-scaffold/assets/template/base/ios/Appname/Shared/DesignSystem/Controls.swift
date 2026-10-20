import SwiftUI

/// The screen's committing action: an accent capsule, full width at the bottom of it. One per
/// screen, and the only place the accent is allowed to be a fill.
struct PrimaryButton: View {
    private let label: Text
    private let enabled: Bool
    /// Red instead of the accent, for the one commit that deletes something.
    private let destructive: Bool
    private let action: () -> Void

    init(title: LocalizedStringResource, enabled: Bool = true, destructive: Bool = false, action: @escaping () -> Void) {
        self.init(label: Text(title), enabled: enabled, destructive: destructive, action: action)
    }

    /// For words that arrive already in the reader's language — the funnel's, from its deck.
    init(verbatim title: String, enabled: Bool = true, action: @escaping () -> Void) {
        self.init(label: Text(verbatim: title), enabled: enabled, destructive: false, action: action)
    }

    private init(label: Text, enabled: Bool, destructive: Bool, action: @escaping () -> Void) {
        self.label = label
        self.enabled = enabled
        self.destructive = destructive
        self.action = action
    }

    var body: some View {
        Button(action: {
            Haptics.tap()
            action()
        }) {
            label
                .font(Typeface.ui(17, .bold, relativeTo: .headline))
                .foregroundStyle(destructive ? Palette.onInk : Palette.onAccent)
                .frame(maxWidth: .infinity)
                .frame(height: Metric.primaryButton)
        }
        .buttonStyle(destructive ? FilledAccentStyle(fill: Palette.alert, pressed: Palette.alert.opacity(0.85)) : FilledAccentStyle())
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }
}

private struct FilledAccentStyle: ButtonStyle {
    var fill = Palette.accent
    var pressed = Palette.accentPressed

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? pressed : fill, in: .capsule)
    }
}

/// The add action a list keeps in its header.
///
/// A 44pt ink circle with a plus. Ink rather than the accent, because the accent fill belongs
/// to the screen's commit; the title is the button's spoken name.
struct HeaderButton: View {
    let title: LocalizedStringResource
    var symbol = "plus"
    let action: () -> Void

    var body: some View {
        Button(action: {
            Haptics.tap()
            action()
        }) {
            Glyph(symbol: symbol, size: 18, weight: .bold, color: Palette.surface)
                .frame(width: Metric.tapTarget, height: Metric.tapTarget)
                .background(Palette.ink, in: .circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(title))
    }
}

/// The quieter action beside or above a `PrimaryButton`: a paper capsule with a hairline.
struct SecondaryButton: View {
    let title: LocalizedStringResource
    var symbol: String?
    var height: CGFloat = Metric.secondaryButton
    let action: () -> Void

    var body: some View {
        Button(action: {
            Haptics.tap()
            action()
        }) {
            HStack(spacing: Metric.Space.s) {
                if let symbol { Glyph(symbol: symbol, size: 16, weight: .semibold) }
                Text(title)
                    .font(Typeface.ui(15, .semibold, relativeTo: .headline))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .ghostCapsule()
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
    }
}

extension View {
    /// The paper capsule with a hairline that every quiet control is drawn on: the back pill,
    /// Cancel, Edit, a filter.
    func ghostCapsule() -> some View {
        background(Palette.surface, in: .capsule)
            .overlay(Capsule().strokeBorder(Palette.hairline, lineWidth: 1))
    }
}

/// The pill at the top of a sheet or a pushed screen: Cancel, Done, Edit.
struct PillButton: View {
    let title: LocalizedStringResource
    var leadingSymbol: String?
    let action: () -> Void

    var body: some View {
        Button(action: {
            Haptics.tap()
            action()
        }) {
            HStack(spacing: Metric.Space.xs) {
                if let leadingSymbol { Glyph(symbol: leadingSymbol, size: 16, weight: .semibold) }
                Text(title)
                    .font(Typeface.ui(16, .medium, relativeTo: .body))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
            }
            .padding(.leading, leadingSymbol == nil ? 16 : 10)
            .padding(.trailing, 16)
            .frame(minWidth: 86, minHeight: Metric.tapTarget)
            .ghostCapsule()
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
    }
}

/// The round cross that closes a sheet. `title` is what VoiceOver reads: Cancel, Done or Close.
struct CloseButton: View {
    var title: LocalizedStringResource = "Cancel"
    let action: () -> Void

    var body: some View {
        IconButton(symbol: "xmark", size: 16, action: action)
            .accessibilityLabel(Text(title))
    }
}

/// The quieter action beside or below the primary one — Cancel, Back, Restore.
struct QuietButton: View {
    let title: LocalizedStringResource
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Typeface.ui(14, .regular, relativeTo: .subheadline))
                .foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity)
                .frame(height: Metric.tapTarget)
        }
        .buttonStyle(.plain)
    }
}

/// A paper circle holding one SF Symbol.
struct IconButton: View {
    let symbol: String
    var size: CGFloat = 19
    /// The square the glyph sits in: 44pt wherever it stands on its own.
    var side: CGFloat = Metric.tapTarget
    var tint: Color = Palette.ink
    let action: () -> Void

    @State private var pressed = false

    var body: some View {
        Button(action: {
            Haptics.tap()
            action()
        }) {
            Glyph(symbol: symbol, size: size, color: tint)
                .glyphButtonFace(side: side, pressed: pressed)
        }
        .buttonStyle(.plain)
        .onLongPressGesture(minimumDuration: 0, pressing: { pressed = $0 }, perform: {})
    }
}

/// A one-of-N choice rendered as a segmented row.
///
/// A well of `track` with the selected segment filled in ink. Ink, not the accent: the accent
/// belongs to the screen's commit, and two accent fills would be two primary things.
struct SegmentedRow<Value: Hashable>: View {
    /// What a segment shows: a word where the choice has a name worth reading, a symbol
    /// where the name would be longer than the control it has to fit inside.
    enum Face {
        case text(String)
        case symbol(String)
    }

    /// What the control is cut into: a grey well, or the paper of a `ListTile` it stands beside.
    enum Surface {
        case track
        case paper
    }

    private let options: [(value: Value, face: Face)]
    /// The control's overall height: a 40pt segment inside 4pt of padding. Passed smaller
    /// only where the row it sits in is chrome rather than the choice the screen is about,
    /// and then it has to match whatever it shares the line with — two bordered faces whose
    /// edges do not line up is the kind of thing this design system exists to stop.
    private let height: CGFloat
    private let surface: Surface
    @Binding var selection: Value

    init(
        options: [(value: Value, label: String)],
        selection: Binding<Value>,
        height: CGFloat = Metric.compactControl + inset * 2,
        surface: Surface = .track
    ) {
        self.options = options.map { ($0.value, .text($0.label)) }
        self.height = height
        self.surface = surface
        _selection = selection
    }

    init(
        symbols: [(value: Value, symbol: String)],
        selection: Binding<Value>,
        height: CGFloat = Metric.compactControl + inset * 2,
        surface: Surface = .track
    ) {
        self.options = symbols.map { ($0.value, .symbol($0.symbol)) }
        self.height = height
        self.surface = surface
        _selection = selection
    }

    /// The padding between the control's border and the selected segment's own. Computed
    /// rather than stored because Swift has no static storage in a generic type.
    private static var inset: CGFloat { 4 }

    /// The outer corner; the selected segment's is the inset less, so the two stay concentric.
    private var radius: CGFloat { surface == .paper ? Metric.Radius.tile : 16 }

    var body: some View {
        let row = HStack(spacing: 2) {
            ForEach(options, id: \.value) { option in
                let active = option.value == selection
                Button {
                    Haptics.tap()
                    selection = option.value
                } label: {
                    face(option.face, active: active)
                        .padding(.horizontal, 10)
                        .frame(maxWidth: .infinity)
                        .frame(height: height - Self.inset * 2)
                        .background(active ? Palette.ink : .clear, in: .rect(cornerRadius: radius - Self.inset))
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .padding(Self.inset)
        .animation(.easeOut(duration: 0.15), value: selection)

        switch surface {
        case .track: row.background(Palette.track, in: .rect(cornerRadius: radius))
        case .paper: row.paperCard(radius: radius)
        }
    }

    @ViewBuilder
    private func face(_ face: Face, active: Bool) -> some View {
        let tint = active ? Palette.surface : Palette.muted
        switch face {
        case .text(let label):
            Text(label)
                .font(Typeface.ui(15, .semibold, relativeTo: .subheadline))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        case .symbol(let symbol):
            Glyph(symbol: symbol, size: 17, color: tint)
        }
    }
}

/// A tag-shaped choice. Selecting inverts it to paper on ink rather than tinting, keeping
/// the accent free.
struct Chip: View {
    private let label: Text
    let active: Bool
    let action: () -> Void

    init(title: LocalizedStringResource, active: Bool, action: @escaping () -> Void) {
        label = Text(title)
        self.active = active
        self.action = action
    }

    /// For a value the user typed rather than one the app ships. Deliberately `verbatim`:
    /// user data run through the string catalog looks up a key that can never exist.
    init(text: String, active: Bool, action: @escaping () -> Void) {
        label = Text(verbatim: text)
        self.active = active
        self.action = action
    }

    var body: some View {
        Button(action: {
            Haptics.tap()
            action()
        }) {
            label
                .font(Typeface.ui(14, .semibold, relativeTo: .footnote))
                .foregroundStyle(active ? Palette.surface : Palette.ink)
                // Translations run longer than English; one line that tightens and then
                // shrinks keeps a row of chips a row.
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .allowsTightening(true)
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(active ? Palette.ink : Palette.canvas, in: .rect(cornerRadius: Metric.Radius.chip))
                .overlay(
                    RoundedRectangle(cornerRadius: Metric.Radius.chip)
                        .strokeBorder(active ? Palette.ink : Palette.hairline, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}
