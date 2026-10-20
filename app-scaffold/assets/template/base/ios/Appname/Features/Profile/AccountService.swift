import Foundation

/// Erasing the account, and nothing else — the in-app deletion path App Store
/// guideline 5.1.1(v) requires of an app you have to sign in to use.
///
/// Kept apart from `AuthStore`, which talks to Supabase Auth directly: this is one call
/// to our own backend, which is what knows how to take the account's data down with the
/// identity. The session is dropped by the caller, and only once the server has said the
/// account is gone.
struct AccountService: Sendable {
    var client = HTTPClient()
    var baseURL: URL = AppConfig.apiBaseURL
    let accessToken: AccessTokenProvider

    /// Nil when the account is gone. Otherwise the line to put on screen, with the user
    /// still signed in to an account that still exists.
    func delete() async -> DisplayMessage? {
        guard let token = await accessToken() else {
            return .copy("Your session expired. Sign in again to keep going.")
        }
        do {
            _ = try await client.delete(baseURL.appendingPathComponent("api/account"),
                                        headers: BackendAuth.headers(token: token),
                                        as: OkResponse.self)
            return nil
        } catch {
            return message(for: error)
        }
    }

    private func message(for error: HTTPError) -> DisplayMessage {
        switch error {
        // URLError and a decoder's own complaint are both already in the
        // reader's language — neither is a catalog key.
        case let .transport(detail): .system(detail)
        case let .decoding(detail): .system(detail)
        case let .status(code, body):
            code == 401
                ? .copy("Your session expired. Sign in again to keep going.")
                : .copy(ServerErrorCopy.message(code: ServerErrorEnvelope.code(in: body),
                                                status: code))
        }
    }
}

private struct OkResponse: Decodable { let ok: Bool }
