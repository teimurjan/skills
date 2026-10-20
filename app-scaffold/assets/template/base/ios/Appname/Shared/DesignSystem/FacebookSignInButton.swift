import SwiftUI

/// "Continue with Facebook", following Meta's Login button guidelines: their blue, the
/// white "f" and their wording. Only the height and the corner radius are ours, so it
/// sits in the same column as the Apple and Google buttons under it.
///
/// With `GoogleBrandSignInButton` and `SignInWithAppleButton`, one of the places the
/// one-accent palette does not apply.
struct FacebookSignInButton: View {
    var title: LocalizedStringResource = "Continue with Facebook"
    let action: () -> Void

    private static let surface = Color(hex: 0x1877F2)

    var body: some View {
        Button(action: {
            Haptics.tap()
            action()
        }) {
            HStack(spacing: 10) {
                Image("FacebookF")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)

                Text(title)
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: Metric.primaryButton)
            .background(Self.surface, in: .rect(cornerRadius: Metric.Radius.card))
            .contentShape(.rect(cornerRadius: Metric.Radius.card))
        }
        .buttonStyle(.plain)
    }
}
