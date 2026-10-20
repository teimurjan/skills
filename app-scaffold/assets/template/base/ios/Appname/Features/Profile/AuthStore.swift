import AuthenticationServices
import CryptoKit
import GoogleSignIn
import Observation
import SwiftUI

/// Who's signed in, backed by Supabase. The native Google and Apple flows each
/// yield an OIDC id_token and Facebook's browser sheet a PKCE code, each exchanged
/// for a Supabase session (`SupabaseAuth`).
/// The session is persisted and refreshed; its access token authorizes every
/// backend call.
@MainActor
@Observable
final class AuthStore {
    private(set) var currentUser: UserProfile?
    /// Last sign-in failure, shown on the wall; cleared on the next attempt.
    private(set) var errorMessage: DisplayMessage?
    /// True only while the identity token is being exchanged — the couple of
    /// seconds the UI has to show progress for. Not set during the provider's
    /// own sheet, where Apple and Google draw their own UI.
    private(set) var isAuthenticating = false

    private var session: SupabaseSession? {
        didSet { persistSession() }
    }

    /// The raw nonce sent (hashed) with the Apple request, checked against the
    /// returned token at exchange time. Set per attempt, consumed once.
    ///
    /// Deliberately outside observation. `@Observable` tracks every stored property,
    /// private ones included, and this one is written from inside
    /// `SignInWithAppleButton`'s `onRequest` — which runs while the button is building
    /// its `ASAuthorizationController`. Observing it there invalidated the sign-in
    /// screen mid-request, SwiftUI rebuilt the button's representable underneath the
    /// controller, and the authorization died without ever calling back: the button
    /// looked tapped and nothing happened. Nothing reads this from a view, so there is
    /// nothing to observe.
    @ObservationIgnored private var appleNonce: String?

    var isSignedIn: Bool { currentUser != nil }

    init() {
        session = Self.loadSession()
        currentUser = session.map(Self.profile(from:))
    }

    // MARK: Google

    /// Google's SDK presents its own sheet from a UIKit controller, so the caller
    /// hands one over — see `UIApplication.keyRootViewController`.
    func signInWithGoogle(presenting: UIViewController) async {
        errorMessage = nil
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenting)
            guard let idToken = result.user.idToken?.tokenString else {
                errorMessage = .copy("Google didn't return an identity token.")
                return
            }
            isAuthenticating = true
            defer { isAuthenticating = false }
            apply(try await SupabaseAuth.signInWithGoogle(idToken: idToken))
        } catch let error as GIDSignInError where error.code == .canceled {
            return
        } catch {
            errorMessage = .system(error.localizedDescription)
        }
    }

    // MARK: Facebook

    /// GoTrue's OAuth round trip in a browser sheet, redeemed with PKCE. Facebook's SDK
    /// signs in through the same sheet in Limited Login, so it would buy nothing but a
    /// package and a privacy label; the caller hands over SwiftUI's environment session.
    func signInWithFacebook(using webAuthentication: WebAuthenticationSession) async {
        errorMessage = nil
        let verifier = Self.randomNonce(length: 64)
        guard let url = SupabaseAuth.authorizeURL(provider: "facebook",
                                                  redirectTo: Self.oauthCallback,
                                                  codeChallenge: Self.base64URLSHA256(verifier)) else {
            errorMessage = .system(SupabaseAuthError.notConfigured.localizedDescription)
            return
        }
        do {
            let callback = try await webAuthentication.authenticate(
                using: url,
                callbackURLScheme: Self.oauthCallback.scheme!,
                preferredBrowserSession: .shared
            )
            guard let code = Self.parameter("code", in: callback) else {
                errorMessage = Self.parameter("error_description", in: callback).map(DisplayMessage.system)
                    ?? .copy("Facebook couldn't complete that. Try again, or use another way in.")
                return
            }
            isAuthenticating = true
            defer { isAuthenticating = false }
            apply(try await SupabaseAuth.exchangeCode(code, verifier: verifier))
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return
        } catch {
            errorMessage = .system(error.localizedDescription)
        }
    }

    /// Where GoTrue sends the browser back to. Listed under the Supabase project's
    /// redirect URLs; the sheet catches the scheme itself, so Info.plist needn't claim it.
    private static let oauthCallback = URL(string: "appname://auth-callback")!

    /// GoTrue answers in the query, or in the fragment when it is reporting an error.
    private static func parameter(_ name: String, in url: URL) -> String? {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let fragment = components?.fragment.flatMap { URLComponents(string: "?\($0)")?.queryItems } ?? []
        return ((components?.queryItems ?? []) + fragment).first { $0.name == name }?.value
    }

    // MARK: Apple

    /// Attach scopes and a hashed nonce to the Apple request. Call from the
    /// button's `onRequest`; the matching raw nonce is held for the exchange.
    ///
    /// Touches no observed state, and that is load-bearing rather than tidy — see
    /// `appleNonce`. The previous failure was cleared here, which is exactly the write
    /// that tore the request down; it is cleared on the answer instead.
    func requestAppleScopes(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        appleNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
    }

    /// Handle the Apple button's `onCompletion`, folding in the name Apple
    /// reveals only on first authorization.
    func signInWithApple(_ result: Result<ASAuthorization, Error>) {
        errorMessage = nil
        switch result {
        case let .success(authorization):
            isAuthenticating = true
            Task { await completeAppleSignIn(authorization) }
        case let .failure(error):
            guard let message = Self.appleFailure(error) else { return }
            errorMessage = message
        }
    }

    /// What to say when Apple refuses.
    ///
    /// `ASAuthorizationError`'s own `localizedDescription` is "The operation couldn't be
    /// completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)",
    /// which tells the user nothing and tells us nothing either. The codes are few
    /// and each has one real cause worth naming — `.unknown` in particular is almost
    /// always a device with no Apple Account signed in, which the person holding it can
    /// fix in a minute if anybody says so. `nil` is a cancel, which is not a failure.
    private static func appleFailure(_ error: Error) -> DisplayMessage? {
        guard let authorization = error as? ASAuthorizationError else {
            return .system(error.localizedDescription)
        }
        switch authorization.code {
        case .canceled: return nil
        case .unknown:
            return .copy("Apple couldn't complete that. Check that an Apple Account is signed in under iOS Settings, then try again.")
        case .notHandled, .failed:
            return .copy("Apple couldn't complete that. Try again in a moment, or use Google or email.")
        case .invalidResponse:
            return .copy("Apple returned a sign-in this app couldn't read. Try again, or use Google or email.")
        default:
            return .system(error.localizedDescription)
        }
    }

    private func completeAppleSignIn(_ authorization: ASAuthorization) async {
        defer { appleNonce = nil; isAuthenticating = false }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            errorMessage = .copy("Apple didn't return an identity token.")
            return
        }
        guard let nonce = appleNonce else {
            errorMessage = .copy("That sign-in expired. Try again.")
            return
        }
        do {
            let session = try await SupabaseAuth.signInWithApple(idToken: idToken, nonce: nonce)
            apply(session, fallbackName: Self.formatName(credential.fullName))
        } catch {
            errorMessage = .system(error.localizedDescription)
        }
    }

    // MARK: Email

    /// The email door, and the app's one way to create an account by hand: the first code
    /// mailed to a new address makes it. Answers whether the mail went, so the form only
    /// moves on to the code field when there is a code to type.
    /// Leaves `isAuthenticating` alone: "Signing you in" over a form that is only mailing a
    /// code says something that is not happening yet.
    func sendEmailCode(to email: String) async -> Bool {
        errorMessage = nil
        do {
            try await SupabaseAuth.sendEmailCode(email: email)
            return true
        } catch {
            errorMessage = .system(error.localizedDescription)
            return false
        }
    }

    func verifyEmailCode(email: String, code: String) async {
        errorMessage = nil
        isAuthenticating = true
        defer { isAuthenticating = false }
        do {
            apply(try await SupabaseAuth.verifyEmailCode(email: email, code: code))
        } catch {
            errorMessage = .system(error.localizedDescription)
        }
    }

    /// Sign in an account provisioned server-side — App Review needs a demo
    /// account to get past the wall.
    func signInWithEmail(email: String, password: String) async {
        errorMessage = nil
        isAuthenticating = true
        defer { isAuthenticating = false }
        do {
            apply(try await SupabaseAuth.signInWithPassword(email: email, password: password))
        } catch {
            errorMessage = .system(error.localizedDescription)
        }
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        session = nil
        currentUser = nil
    }

    /// A valid access token for API calls, refreshing if it's near expiry.
    /// `nil` when signed out or the refresh fails.
    func accessToken() async -> String? {
        guard let current = session else { return nil }
        guard current.isExpiringSoon else { return current.accessToken }
        do {
            let refreshed = try await SupabaseAuth.refresh(refreshToken: current.refreshToken)
            // Refreshes drop the name — Apple never re-sends it. Carry it forward.
            apply(refreshed, fallbackName: current.fullName)
            return refreshed.accessToken
        } catch {
            // A definitive rejection — dead refresh token, deleted user, a session
            // from another Supabase project — can never recover, so clear it rather
            // than leave a "signed in but every call 401s" phantom. A transient
            // failure (offline, timeout, 5xx) must NOT sign out: keep the session
            // and let the next call retry.
            if case let SupabaseAuthError.http(code, _) = error, (400 ... 403).contains(code) {
                Analytics.shared.track(.autoLoggedOut(reason: "http_\(code)"))
                signOut()
            }
            return nil
        }
    }

    // MARK: Session

    /// `fallbackName` fills in a name the token lacks (Apple reveals one only on the very
    /// first authorization and never again) without overwriting one it carries (Google),
    /// and persists it — otherwise a relaunch or a token refresh would silently blank the
    /// user's name.
    private func apply(_ session: SupabaseSession, fallbackName: String? = nil) {
        let merged = session.fullName == nil ? session.withFullName(fallbackName) : session
        // A refresh lands here too, carrying the same user — only a change of
        // identity is somebody signing in.
        let isSignIn = currentUser?.id != merged.userID
        self.session = merged
        currentUser = Self.profile(from: merged)
        if isSignIn { Analytics.shared.track(.signInSucceeded(provider: merged.provider.rawValue)) }
    }

    private static func profile(from session: SupabaseSession) -> UserProfile {
        UserProfile(id: session.userID, displayName: session.fullName,
                    email: session.email, provider: session.provider)
    }

    private static func formatName(_ components: PersonNameComponents?) -> String? {
        guard let components else { return nil }
        let name = PersonNameComponentsFormatter().string(from: components)
        return name.isEmpty ? nil : name
    }

    /// A cryptographically random nonce; its SHA-256 goes to Apple, the raw value to
    /// Supabase.
    ///
    /// Rejection sampling rather than `% count`: the charset is 65 characters, which does
    /// not divide 256, so the modulo would draw the first 61 of them slightly more often
    /// than the rest. The bias is small and this is a single-use value, but a nonce is a
    /// security primitive and "small enough not to matter" is not a property worth
    /// asserting without measuring it.
    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        let ceiling = UInt8(charset.count * (256 / charset.count) - 1)
        var out = ""
        out.reserveCapacity(length)
        while out.count < length {
            var byte: UInt8 = 0
            let status = SecRandomCopyBytes(kSecRandomDefault, 1, &byte)
            guard status == errSecSuccess else { fatalError("SecRandomCopyBytes failed: \(status)") }
            guard byte <= ceiling else { continue }
            out.append(charset[Int(byte) % charset.count])
        }
        return out
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// The PKCE `s256` challenge: the same digest, base64url without padding.
    private static func base64URLSHA256(_ input: String) -> String {
        Data(SHA256.hash(data: Data(input.utf8))).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func persistSession() {
        if let session, let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.storageKey)
        }
    }

    private static func loadSession() -> SupabaseSession? {
        UserDefaults.standard.data(forKey: storageKey)
            .flatMap { try? JSONDecoder().decode(SupabaseSession.self, from: $0) }
    }

    private static let storageKey = "appname.supabaseSession"
}

#if DEBUG
extension AuthStore {
    /// Screenshot harness only: the seeded screens sit behind the sign-in wall,
    /// so they need an account. Never reachable in a Release archive.
    func seedUserForScreenshot() {
        currentUser = UserProfile(id: "screenshot", displayName: nil, email: nil, provider: .apple)
    }
}
#endif
