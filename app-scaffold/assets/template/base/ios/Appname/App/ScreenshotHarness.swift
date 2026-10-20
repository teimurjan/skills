#if DEBUG
import SwiftUI

/// Debug-only harness that renders one screen in a deterministic, seeded state for
/// `appstore/scripts/capture-simulator-screens.mjs`. Selected by a `--screenshot <name>`
/// launch argument (see `AppnameApp`); compiled out of Release builds entirely, so it never
/// ships.
///
/// One seeded account, shared by every frame, keeps the whole set internally consistent.
struct ScreenshotHarness: View {
    let screen: String

    static var requestedScreen: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "--screenshot"), index + 1 < args.count else { return nil }
        return args[index + 1]
    }

    var body: some View {
        seeded
            // A capture launched with `-AppleLanguages (ru)` has to resolve the copy the app does.
            .environment(\.locale, InterfaceLanguage.locale)
            .environment(ScreenshotFixtures.store())
            .environment(ScreenshotFixtures.auth())
            .environment(ScreenshotFixtures.purchases())
    }

    @ViewBuilder private var seeded: some View {
        switch screen {
        case "splash":
            SplashScreen()
        case "signin":
            SignInScreen()
        case "home":
            NavigationStack { HomeScreen() }
        case "profile":
            NavigationStack { ProfileScreen() }
        // A simulator with no StoreKit configuration draws the plans as a spinner.
        case "paywall":
            PaywallScreen()
        default:
            Text(verbatim: "Unknown screenshot screen: \(screen)")
        }
    }
}

@MainActor
enum ScreenshotFixtures {
    /// Seeded in the capture's language, so a localized listing never shows English rows.
    static let items: [LocalizedStringResource] = ["Item"]

    static func store() -> AppnameStore {
        let store = AppnameStore(isEntitled: { true })
        store.seedForScreenshot(items.map { String(interface: $0) })
        return store
    }

    static func auth() -> AuthStore {
        let store = AuthStore()
        store.seedUserForScreenshot()
        return store
    }

    static func purchases() -> PurchaseStore {
        let store = PurchaseStore(accessToken: { nil }, userID: { nil })
        store.seedPaidForScreenshot()
        return store
    }
}
#endif
