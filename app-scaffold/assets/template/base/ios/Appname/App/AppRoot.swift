import StoreKit
import SwiftUI

/// The composition root: every store is built here and handed down through the environment,
/// and every gate (splash, funnel, sign-in, paywall) is decided here rather than by a screen.
///
/// The first run is one sequence keyed on `didFinishFirstRun`: the funnel argues, sign-in is a
/// wall with no door, the paywall asks once, then Home. A subscription that lapses later never
/// walls the launch screen: reads are free, and `AppnameStore` refuses writes, which raises the
/// paywall here as a full-screen cover on its count of refusals.
struct AppRoot: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.requestReview) private var requestReview
    @State private var auth: AuthStore
    @State private var store: AppnameStore
    @State private var purchases: PurchaseStore

    @State private var didLoad = false
    @State private var splashDone = false
    /// True while a signed-in account's entitlement is on the wire during the first run, so a
    /// payer never sees the paywall flash.
    @State private var isRestoring = false
    /// `onChange` runs a frame after a new account appears; this covers that frame.
    @State private var adoptedUserID: String?
    @State private var paywall: PaywallContext?
    @AppStorage("appname.didOnboard") private var didFinishFirstRun = false
    @AppStorage("appname.didFunnel") private var didFunnel = false
    @AppStorage("appname.didAskForReview") private var didAskForReview = false
    @AppStorage(InterfaceLanguage.overrideKey) private var language = "en"

    init() {
        // Before any store, so an event emitted on the first frame has somewhere to land.
        Analytics.shared.configure(apiKey: AppConfig.amplitudeAPIKey, environment: AppConfig.analyticsEnvironment)
        let auth = AuthStore()
        _auth = State(initialValue: auth)
        // Purchases before the store, because the store asks it whether it may write.
        let purchases = PurchaseStore(
            accessToken: { [weak auth] in await auth?.accessToken() },
            userID: { [weak auth] in await auth?.currentUser?.id }
        )
        _purchases = State(initialValue: purchases)
        _store = State(initialValue: AppnameStore(isEntitled: { [weak purchases] in purchases?.isPaid ?? false }))
    }

    var body: some View {
        content
            .background(Palette.canvas.ignoresSafeArea())
            .task {
                store.load()
                // Claimed at launch too: `onChange` says nothing about a session that was already there.
                if let id = auth.currentUser?.id {
                    adoptedUserID = id
                    store.adopt(userID: id)
                }
                // What this device can answer offline, before the first frame.
                await purchases.resolveCachedEntitlement()
                isRestoring = needsEntitlement
                didLoad = true
                await refreshEntitlement()
                await purchases.loadProducts()
                // TestFlight and the App Store run the same Release build; only StoreKit tells them apart.
                if let resolved = await AppConfig.resolveAnalyticsEnvironment() {
                    Analytics.shared.setEnvironment(resolved)
                }
            }
            .onChange(of: auth.currentUser?.id) { _, id in
                guard let id else {
                    adoptedUserID = nil
                    purchases.forgetAccount()
                    return
                }
                Analytics.shared.identify(userID: id)
                adoptedUserID = id
                store.adopt(userID: id)
                isRestoring = !didFinishFirstRun
                Task {
                    // A subscription bought before signing in belongs to this account now.
                    await purchases.reconcileLocalEntitlement()
                    await refreshEntitlement()
                }
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                Task { await purchases.refreshServerEntitlement() }
            }
            // Every refusal, not just the first: the count is what makes a second one observable.
            .onChange(of: store.refusedActions) { _, count in
                guard count > 0 else { return }
                paywall = .writeBlocked
                // The client's belief may be stale; ask the authority while the page is up.
                Task { await purchases.refreshServerEntitlement() }
            }
            // Asked once, after the core action has been done a few times. Marked before asking:
            // iOS does not say whether it showed the prompt.
            .onChange(of: store.items.count) { _, count in
                guard count == 3, !didAskForReview else { return }
                didAskForReview = true
                Task {
                    try? await Task.sleep(for: .seconds(1))
                    requestReview()
                }
            }
            .fullScreenCover(item: $paywall) { PaywallScreen(context: $0) }
            // Below the cover on purpose: a presented view inherits the environment of the
            // view its modifier is attached to, so stores installed above it would not reach it.
            .environment(\.locale, InterfaceLanguage.locale)
            .environment(auth)
            .environment(store)
            .environment(purchases)
    }

    /// Whether the first run is still waiting on this account's answer.
    private var needsEntitlement: Bool { !didFinishFirstRun && auth.isSignedIn }

    private var isAwaitingAccount: Bool {
        !didFinishFirstRun && auth.isSignedIn && auth.currentUser?.id != adoptedUserID
    }

    /// Cleared on every path out: the first run must never wait on an answer that has arrived.
    private func refreshEntitlement() async {
        defer { isRestoring = false }
        guard auth.isSignedIn else { return }
        await purchases.refreshServerEntitlement()
    }

    @ViewBuilder
    private var content: some View {
        if !didLoad || !splashDone {
            // A branch rather than an overlay, so nothing underneath fires analytics early.
            SplashScreen { withAnimation(.easeOut(duration: 0.35)) { splashDone = true } }
                .transition(.opacity)
                .zIndex(1)
        } else {
            // `.identity`, so the next screen arrives opaque and the splash lifts off it.
            launched.transition(.identity)
        }
    }

    @ViewBuilder
    private var launched: some View {
        if !didFinishFirstRun && !didFunnel {
            // Rebuilt on a language change: this screen carries the picker and its deck.
            FunnelScreen(
                spine: FunnelContent.bundled.spine,
                copy: FunnelContent.bundled.copy(for: language),
                onSignIn: { didFunnel = true },
                onFinish: { didFunnel = true }
            )
            .id(language)
        } else if !auth.isSignedIn {
            SignInScreen()
        } else if isRestoring || isAwaitingAccount {
            RestoringScreen()
        } else if !didFinishFirstRun && !purchases.isPaid {
            PaywallScreen(context: .onboarding) { didFinishFirstRun = true }
        } else {
            NavigationStack { HomeScreen().tracksScreen(.home) }
                .onAppear { didFinishFirstRun = true }
        }
    }
}
