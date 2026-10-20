import SwiftUI

/// The account step: the headline, the reader's own problem carried forward from the recap
/// with the line of the plan that answers it, and the app's sign-in. `AccountStep.tsx`.
struct FunnelAccount: View {
    let words: FunnelCopy.StatementWords
    let plan: (problem: String, fix: String)?

    @State private var showEmail = false

    var body: some View {
        if let headline = words.headline { FunnelHeadline(text: headline).funnelEntrance(0) }
        if let note = words.note { FunnelNote(text: note).padding(.bottom, Metric.Space.s).funnelEntrance(0) }
        if let plan { card(plan).funnelEntrance(1) }

        SignInProviders(showEmail: $showEmail).funnelEntrance(2)
    }

    /// The recap's red card, with the plan's answer ticked under it.
    private func card(_ plan: (problem: String, fix: String)) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            line(plan.problem, symbol: "exclamationmark.circle", color: Palette.alert, weight: .medium)
            Rectangle()
                .fill(Palette.alert.opacity(0.2))
                .frame(height: 1)
            line(plan.fix, symbol: "checkmark.circle.fill", color: Palette.ink, weight: .regular)
        }
        .padding(Metric.cardPadding)
        .background(Palette.alertWash, in: .rect(cornerRadius: Metric.Radius.card))
    }

    private func line(_ text: String, symbol: String, color: Color, weight: Typeface.Weight) -> some View {
        HStack(spacing: Metric.Space.m) {
            Glyph(symbol: symbol, size: 17, weight: .regular, color: color)
                .frame(width: 20)
                .accessibilityHidden(true)
            Text(verbatim: text)
                .font(Typeface.ui(15.5, weight, relativeTo: .body))
                .foregroundStyle(Palette.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
