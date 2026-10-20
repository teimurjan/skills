import SwiftUI

extension View {
    /// Reports `screen` each time it comes into view: on appear, which covers a tab switch and
    /// a pop back to it, and on a return from the background, which `onAppear` never sees.
    func tracksScreen(_ screen: AppScreen) -> some View {
        modifier(ScreenViewTracking(screen: screen))
    }
}

private struct ScreenViewTracking: ViewModifier {
    let screen: AppScreen
    @Environment(\.scenePhase) private var scenePhase
    @State private var isVisible = false
    /// Only a real return counts. Control Center or a system alert passes through `inactive`
    /// without leaving the app, and that is not a second visit.
    @State private var wasBackgrounded = false

    func body(content: Content) -> some View {
        content
            .onAppear {
                isVisible = true
                Analytics.shared.track(.screenViewed(screen: screen))
            }
            .onDisappear { isVisible = false }
            .onChange(of: scenePhase) { _, phase in
                switch phase {
                case .background:
                    wasBackgrounded = true
                case .active where wasBackgrounded:
                    wasBackgrounded = false
                    if isVisible { Analytics.shared.track(.screenViewed(screen: screen)) }
                default:
                    break
                }
            }
    }
}
