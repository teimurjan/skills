import GoogleSignIn
import SwiftUI

@main
struct AppnameApp: App {
    init() {
        Typeface.register()
        #if DEBUG
        Typeface.assertFontsResolve()
        #endif
        InterfaceLanguage.adoptLaunchLocalization()
    }

    var body: some Scene {
        WindowGroup {
            root
                .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
                // Re-establishes the Google SDK's own keychain state for a later
                // interactive sign-in. It must never gate anything: the Supabase
                // session is restored synchronously in `AuthStore.init`.
                .task { _ = try? await GIDSignIn.sharedInstance.restorePreviousSignIn() }
        }
    }

    @ViewBuilder private var root: some View {
        #if DEBUG
        if let screen = ScreenshotHarness.requestedScreen {
            ScreenshotHarness(screen: screen)
        } else {
            AppRoot()
        }
        #else
        AppRoot()
        #endif
    }
}
