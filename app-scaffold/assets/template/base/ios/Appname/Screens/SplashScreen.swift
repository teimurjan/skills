import SwiftUI

/// The app mark over the wordmark, still, on the canvas.
///
/// **It is `LaunchScreen.storyboard` drawn again**: the same two images at the same sizes,
/// centred as one group with the same gap, so the handoff from the storyboard is nothing
/// moving. The word is an image (`LaunchWordmark`, the wordmark face in ink, rendered at 3x)
/// rather than text because a launch screen cannot use a font registered at runtime.
/// Change a size here and change it there.
///
/// `onFinish` is what the composition root hands in, after a short hold. Without it the
/// screenshot harness photographs the still and nothing is scheduled.
struct SplashScreen: View {
    var onFinish: (() -> Void)?

    var body: some View {
        VStack(spacing: Layout.gap) {
            Image("AppMark")
                .resizable()
                .scaledToFit()
                .frame(width: Layout.mark, height: Layout.mark)
            Image("LaunchWordmark")
                .accessibilityLabel(Text(verbatim: "Appname"))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.canvas.ignoresSafeArea())
        .task {
            guard let onFinish else { return }
            try? await Task.sleep(for: Layout.hold)
            onFinish()
        }
    }

    private enum Layout {
        static let mark: CGFloat = 168
        static let gap: CGFloat = 20
        static let hold = Duration.milliseconds(600)
    }
}
