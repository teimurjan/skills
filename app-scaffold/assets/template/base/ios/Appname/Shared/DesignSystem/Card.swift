import SwiftUI

/// The one container on every screen: paper on the canvas, 24pt corners, no border.
///
/// The shadow is a 1pt hairline under the card rather than a blur, enough to lift it off the
/// canvas without reading as a floating panel. `raised` gives the card that leads its screen
/// a soft drop instead.
struct Card<Content: View>: View {
    var padding: CGFloat = Metric.cardPadding
    var raised = false
    var radius: CGFloat = Metric.Radius.card
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .paperCard(raised: raised, radius: radius)
    }
}

/// A card whose rows supply their own padding, because a divider has to run edge to edge
/// inside it while the rows inset from it.
struct RowCard<Content: View>: View {
    var raised = false
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .paperCard(raised: raised, radius: Metric.Radius.card)
    }
}

/// The card that carries a screen's headline figure: ink, with paper-coloured words. One
/// per screen at most, because it is the loudest surface in the app after the commit.
struct InkCard<Content: View>: View {
    var padding: CGFloat = 18
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(Palette.onInk)
            .background(Palette.ink, in: .rect(cornerRadius: Metric.Radius.hero))
    }
}

/// The rule between two rows of one card. Inset from the edge so the card's corner radius
/// stays intact.
struct RowDivider: View {
    var inset: CGFloat = Metric.cardPadding
    var body: some View {
        Rectangle()
            .fill(Palette.divider)
            .frame(height: 1)
            .padding(.horizontal, inset)
    }
}

extension View {
    /// Paper on the canvas: the surface every card and tile is drawn on.
    func paperCard(raised: Bool = false, radius: CGFloat = Metric.Radius.card) -> some View {
        background(Palette.surface, in: .rect(cornerRadius: radius))
            .shadow(color: Color(hex: 0x502E0F).opacity(raised ? 0.14 : 0.08), radius: raised ? 12 : 0, y: raised ? 2 : 1)
    }
}
