import Foundation

/// A Supabase auth session (GoTrue tokens) obtained by exchanging a provider's
/// identity token or authorization code. Persisted so the user stays signed in across launches.
struct SupabaseSession: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
    let userID: String
    let email: String?
    let fullName: String?
    let provider: AuthProvider

    /// Refresh a minute before expiry rather than racing a 401.
    var isExpiringSoon: Bool { expiresAt.timeIntervalSinceNow < 60 }

    /// Apple returns the name once, in the credential — never in the token, and
    /// never again on refresh. So it is folded in client-side and persisted.
    func withFullName(_ name: String?) -> SupabaseSession {
        SupabaseSession(accessToken: accessToken, refreshToken: refreshToken, expiresAt: expiresAt,
                        userID: userID, email: email, fullName: name, provider: provider)
    }
}

enum SupabaseAuthError: LocalizedError {
    case notConfigured
    case http(Int, String)

    /// `LocalizedError` fixes the type as `String?`, so these are resolved here
    /// rather than handed on as `LocalizedStringResource` — the name of the
    /// protocol requirement is the whole reason it has to be done explicitly.
    var errorDescription: String? {
        switch self {
        case .notConfigured: String(interface: "Sign-in isn't set up yet.")
        case let .http(code, message):
            message.isEmpty
                ? String(interface: "Sign-in failed (\(code)).")
                : String(interface: "Sign-in failed: \(message)")
        }
    }
}

/// Thin REST client for Supabase GoTrue — no SDK dependency. Exchanges a
/// provider identity token or PKCE code for a Supabase session, and refreshes it.
enum SupabaseAuth {
    /// Google's native flow yields an id_token with no nonce of ours to bind — the SDK
    /// mints and checks its own, so there is nothing to carry across.
    static func signInWithGoogle(idToken: String) async throws -> SupabaseSession {
        try await token(grant: "id_token", body: ["provider": "google", "id_token": idToken])
    }

    /// Apple's native flow yields an OIDC id_token bound to a one-time `nonce`;
    /// GoTrue re-hashes the nonce and checks it against the token's claim.
    static func signInWithApple(idToken: String, nonce: String) async throws -> SupabaseSession {
        try await token(grant: "id_token", body: ["provider": "apple", "id_token": idToken, "nonce": nonce])
    }

    /// GoTrue's own OAuth page for `provider`, which comes back to `redirectTo` with a
    /// one-time `code` bound to `codeChallenge` — base64url SHA-256 of the verifier.
    static func authorizeURL(provider: String, redirectTo: URL, codeChallenge: String) -> URL? {
        guard AppConfig.isSupabaseConfigured, let base = AppConfig.supabaseURL else { return nil }
        var components = URLComponents(url: base.appendingPathComponent("auth/v1/authorize"),
                                       resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "redirect_to", value: redirectTo.absoluteString),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "s256"),
        ]
        return components?.url
    }

    /// Redeems the `code` an `authorizeURL` round trip came back with.
    static func exchangeCode(_ authCode: String, verifier: String) async throws -> SupabaseSession {
        try await token(grant: "pkce", body: ["auth_code": authCode, "code_verifier": verifier])
    }

    /// Email + password, for accounts provisioned server-side — App Review needs
    /// a demo account to get past the sign-in wall.
    static func signInWithPassword(email: String, password: String) async throws -> SupabaseSession {
        try await token(grant: "password", body: ["email": email, "password": password])
    }

    static func refresh(refreshToken: String) async throws -> SupabaseSession {
        try await token(grant: "refresh_token", body: ["refresh_token": refreshToken])
    }

    /// Mail a six-digit code. One call for a new address and a known one — `create_user`
    /// is what makes this the app's sign-up, the same as the web's `signInWithOtp`.
    static func sendEmailCode(email: String) async throws {
        _ = try await post("otp", body: ["email": email, "create_user": true])
    }

    /// `type: "email"` redeems whichever of the confirmation and magic-link codes Supabase
    /// sent, so the caller needn't know whether the address was new.
    static func verifyEmailCode(email: String, code: String) async throws -> SupabaseSession {
        try decode(try await post("verify", body: ["type": "email", "email": email, "token": code]))
    }

    private static func token(grant: String, body: [String: String]) async throws -> SupabaseSession {
        try decode(try await post("token", query: [URLQueryItem(name: "grant_type", value: grant)], body: body))
    }

    private static func post(_ path: String, query: [URLQueryItem] = [], body: [String: Any]) async throws -> Data {
        guard AppConfig.isSupabaseConfigured, let base = AppConfig.supabaseURL else {
            throw SupabaseAuthError.notConfigured
        }

        var components = URLComponents(url: base.appendingPathComponent("auth/v1/\(path)"),
                                       resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }

        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        // Bounded, so a stalled network surfaces an error instead of hanging the
        // sign-in spinner forever.
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppConfig.supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw SupabaseAuthError.http(-1, "no response") }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw SupabaseAuthError.http(http.statusCode,
                                         shortMessage(from: String(data: data, encoding: .utf8) ?? ""))
        }
        return data
    }

    /// Pull a human message out of a GoTrue error body, else trim the raw body.
    private static func shortMessage(from body: String) -> String {
        if let data = body.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for key in ["error_description", "msg", "error_code", "error", "message"] {
                if let value = json[key] as? String, !value.isEmpty { return value }
            }
        }
        return String(body.prefix(160))
    }

    private static func decode(_ data: Data) throws -> SupabaseSession {
        struct Payload: Decodable {
            struct User: Decodable {
                struct Meta: Decodable { let full_name: String? }
                struct AppMeta: Decodable { let provider: String? }
                let id: String
                let email: String?
                let user_metadata: Meta?
                let app_metadata: AppMeta?
            }
            let access_token: String
            let refresh_token: String
            let expires_in: Int
            let user: User
        }
        let payload = try JSONDecoder().decode(Payload.self, from: data)
        return SupabaseSession(
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token,
            expiresAt: Date().addingTimeInterval(TimeInterval(payload.expires_in)),
            userID: payload.user.id,
            email: payload.user.email,
            fullName: payload.user.user_metadata?.full_name,
            provider: payload.user.app_metadata?.provider.flatMap(AuthProvider.init(rawValue:)) ?? .email,
        )
    }
}
