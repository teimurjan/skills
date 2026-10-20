import SwiftUI

/// The reader's own answers, a card apiece. **The first card is red and only the first**:
/// it is the problem they named on the first screen. Five red cards is an accusation.
/// `RecapStep.tsx`.
struct FunnelRecap: View {
    let headline: String
    let lines: [(key: String, line: String)]
    let recap: FunnelCopy.Recap

    var body: some View {
        FunnelHeadline(text: headline).funnelEntrance(0)

        ForEach(Array(lines.enumerated()), id: \.element.key) { index, entry in
            let problem = index == 0
            HStack(spacing: Metric.Space.m) {
                Glyph(symbol: problem ? "exclamationmark.circle" : "circle", size: 18, weight: .regular, color: problem ? Palette.alert : Palette.faint)
                    .frame(width: 20)
                    .accessibilityHidden(true)
                Text(verbatim: entry.line)
                    .font(Typeface.ui(15.5, problem ? .medium : .regular, relativeTo: .body))
                    .foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, Metric.cardPadding)
            .padding(.vertical, 14)
            .background(problem ? Palette.alertWash : Palette.surface, in: .rect(cornerRadius: Metric.Radius.card))
            .paperCard()
            .funnelEntrance(index + 1)
        }

        // The ink card, so after the grey ones the answer looks like the answer; the footer's
        // button stays the only accent fill on the screen.
        InkCard {
            VStack(alignment: .leading, spacing: Metric.Space.m) {
                Text(FunnelCopy.accented(recap.closing, onInk: true))
                    .font(Typeface.ui(17, .bold, relativeTo: .body))
                    .foregroundStyle(Palette.onInk)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: Metric.Space.s) {
                    ForEach(recap.answers, id: \.self) { line in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Glyph(symbol: "checkmark.circle.fill", size: 16, color: Palette.amber)
                                .accessibilityHidden(true)
                            Text(verbatim: line)
                                .font(Typeface.ui(14.5, .regular, relativeTo: .subheadline))
                                .foregroundStyle(Palette.onInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
        .funnelEntrance(lines.count + 1)
    }
}
