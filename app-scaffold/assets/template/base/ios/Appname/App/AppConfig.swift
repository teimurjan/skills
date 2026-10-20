import Foundation
import StoreKit

/// Build-time config injected via `ios/Config/*.xcconfig` → Info.plist → here.
/// Debug and Release both point at the production backend — Debug only blanks
/// the Amplitude key; the `Appname (Local)` scheme's Debug-Local
/// configuration is the one that points at a local `next dev` server. See
/// `ios/Config/Local.xcconfig.example`.
enum AppConfig {
    static var apiBaseURL: URL {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
              let url = URL(string: raw), !raw.isEmpty
        else { fatalError("API_BASE_URL is missing or invalid — check ios/Config/*.xcconfig") }
        return url
    }

    static var environment: String {
        string("APP_ENVIRONMENT") ?? "production"
    }

    /// The marketing version (`MARKETING_VERSION` → `CFBundleShortVersionString`),
    /// stamped onto every backend request as `X-App-Version` so routes can shape
    /// a response to what this build understands — see `BackendAuth.headers` and
    /// `lib/client-version.ts`. "0" compares older than any gate, which is the
    /// right answer for a bundle with no version at all.
    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    /// Supabase project origin. Sign-in is simply unavailable when unset, rather
    /// than crashing the way a missing `API_BASE_URL` does — an app that can't
    /// reach its own backend is broken, but one without auth configured is just
    /// a checkout someone hasn't finished setting up.
    static var supabaseURL: URL? {
        string("SUPABASE_URL").flatMap(URL.init(string:))
    }

    /// Client-safe by design — it ships in the binary. The secret key never
    /// leaves the Next.js app.
    static var supabasePublishableKey: String {
        string("SUPABASE_PUBLISHABLE_KEY") ?? ""
    }

    static var isSupabaseConfigured: Bool {
        supabaseURL != nil && !supabasePublishableKey.isEmpty
    }

    /// Amplitude write key. The Local configuration ships it blank, which keeps
    /// `Analytics` a no-op — Xcode runs and the Simulator never reach the
    /// production Amplitude project.
    static var amplitudeAPIKey: String { string("AMPLITUDE_API_KEY") ?? "" }

    /// Last environment StoreKit reported, cached so only a first launch ever
    /// tags events before `resolveAnalyticsEnvironment` lands.
    private static let storeEnvironmentKey = "appname.storeEnvironment"

    /// Environment tag for analytics: the build configuration's `environment`,
    /// narrowed for a `production` build by StoreKit's verdict on this install.
    /// TestFlight and App Review run the same Release build against Apple's
    /// Sandbox, so StoreKit is the only thing that separates beta traffic from
    /// real revenue — the same split the backend records on `entitlements`.
    /// Reads the cached answer; `unknown` until the first resolve, never a guess
    /// of `production`.
    static var analyticsEnvironment: String {
        guard environment == "production" else { return environment }
        return UserDefaults.standard.string(forKey: storeEnvironmentKey) ?? "unknown"
    }

    /// Ask StoreKit which environment this install belongs to, and cache it.
    /// `AppTransaction` is the only non-deprecated source. Returns nil when
    /// StoreKit can't answer, leaving the cached value untouched.
    @discardableResult
    static func resolveAnalyticsEnvironment() async -> String? {
        guard environment == "production" else { return environment }
        guard case let .verified(appTransaction) = try? await AppTransaction.shared else { return nil }
        let resolved = switch appTransaction.environment {
        case .sandbox: "sandbox"
        case .xcode: "xcode"
        default: "production"
        }
        UserDefaults.standard.set(resolved, forKey: storeEnvironmentKey)
        return resolved
    }

    /// Empty rather than absent when an xcconfig leaves the value blank, which
    /// is how the placeholders ship — treat both as "not configured".
    private static func string(_ key: String) -> String? {
        let value = Bundle.main.object(forInfoDictionaryKey: key) as? String
        return value?.isEmpty == false ? value : nil
    }
}
