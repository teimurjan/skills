import SwiftUI

/// A labelled text field as one row of a `RowCard`: the label on the left, the value typed
/// on the right.
struct TextFieldRow: View {
    let label: LocalizedStringResource
    @Binding var text: String
    var prompt: LocalizedStringResource?

    var body: some View {
        HStack(spacing: Metric.Space.m) {
            Text(label)
                .font(Typeface.ui(16, .medium, relativeTo: .subheadline))
                .foregroundStyle(Palette.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.9)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: Metric.Space.s)
            TextField(text: $text, prompt: prompt.map { Text($0) }) { EmptyView() }
                .multilineTextAlignment(.trailing)
                .font(Typeface.ui(15, .medium, relativeTo: .subheadline))
                .foregroundStyle(Palette.ink)
        }
        .padding(.horizontal, Metric.cardPadding)
        .padding(.vertical, 14)
    }
}
