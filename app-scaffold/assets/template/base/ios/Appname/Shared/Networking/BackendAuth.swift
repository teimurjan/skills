import Foundation

/// How the app proves who it is to its own backend. Every route behind the
/// sign-in wall reads the Supabase access token off this header; sending none
/// simply earns a 401, which the callers map to "sign in again".
///
/// Every request also carries the build's marketing version, with or without a
/// token: it's what lets a route serve a payload shaped to what this build can
/// decode (`lib/client-version.ts`) instead of breaking older installs when a
/// response grows a field.
enum BackendAuth {
    static func headers(token: String?) -> [String: String] {
        var headers = ["X-App-Version": AppConfig.appVersion]
        if let token { headers["Authorization"] = "Bearer \(token)" }
        return headers
    }
}

/// Hands out a live access token, refreshing it if need be. `AuthStore` supplies
/// the real one; the closure keeps the networking layer from having to know that.
typealias AccessTokenProvider = @MainActor @Sendable () async -> String?

/// Who is signed in, as a Supabase uid. Separate from the token because a
/// purchase needs the *identity* (to stamp onto the App Store transaction) at a
/// moment when the token itself isn't what's being sent.
typealias UserIDProvider = @MainActor @Sendable () async -> String?
