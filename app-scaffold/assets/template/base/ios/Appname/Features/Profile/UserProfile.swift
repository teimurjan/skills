import Foundation

/// Which door someone came in through.
enum AuthProvider: String, Codable, Sendable {
    case facebook
    case apple
    case google
    case email

    var displayName: String {
        switch self {
        case .facebook: "Facebook"
        case .apple: "Apple"
        case .google: "Google"
        case .email: "Email"
        }
    }
}

/// A signed-in user. `displayName`/`email` may be absent — Apple hands over
/// the name only on the very first authorization, and never again.
struct UserProfile: Codable, Equatable, Sendable {
    let id: String
    let displayName: String?
    let email: String?
    let provider: AuthProvider

    /// What to greet them with when Apple withheld everything.
    var shortName: String {
        displayName ?? email.map { String($0.prefix(while: { $0 != "@" })) } ?? "you"
    }
}
