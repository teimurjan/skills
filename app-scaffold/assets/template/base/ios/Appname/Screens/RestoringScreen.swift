import SwiftUI

/// The pause between an account appearing and the first run knowing whether it has paid.
/// Deliberately not the splash: this says "your account is on the way", which is what
/// somebody who has just signed in on a new phone is waiting to read.
struct RestoringScreen: View {
    var body: some View {
        Screen(scrolls: false) {
            Spacer(minLength: 0)

            VStack(spacing: Metric.Space.m) {
                ProgressView()
                    .tint(Palette.ink)
                Text("Getting your account")
                    .appnameTitle()
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)

            Spacer(minLength: 0)
        }
    }
}
