import SwiftUI

/// "Sign in with Google", following Google's brand guidelines: the unaltered
/// multicolor "G", a white surface, a #747775 stroke, and a #1F1F1F label. The mark,
/// the colours and the wording are Google's and must not be restyled — only the
/// height and the corner radius are ours, so it sits in the same column as the Apple
/// button above it rather than in its own dimensions.
///
/// This, `SignInWithAppleButton` and `FacebookSignInButton` are the places the one-accent
/// palette does not apply. No dark variant: the app is light-only.
struct GoogleBrandSignInButton: View {
    var title: LocalizedStringResource = "Sign in with Google"
    let action: () -> Void

    private static let surfaceStroke = Color(hex: 0x747775)
    private static let label = Color(hex: 0x1F1F1F)

    var body: some View {
        Button(action: {
            Haptics.tap()
            action()
        }) {
            HStack(spacing: 12) {
                Image("GoogleG")
                    .renderingMode(.original)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)

                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .tracking(0.25)
                    .foregroundStyle(Self.label)
            }
            .frame(maxWidth: .infinity)
            .frame(height: Metric.primaryButton)
        }
        .buttonStyle(GoogleSurfaceStyle(stroke: Self.surfaceStroke))
    }
}

/// Material's "state layer" press feedback, kept as subtle as the guidelines ask.
private struct GoogleSurfaceStyle: ButtonStyle {
    let stroke: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Color.white, in: .rect(cornerRadius: Metric.Radius.card))
            .overlay(
                RoundedRectangle(cornerRadius: Metric.Radius.card)
                    .strokeBorder(stroke, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.86 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .contentShape(.rect(cornerRadius: Metric.Radius.card))
    }
}
