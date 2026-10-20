import Foundation

/// Every machine code the backend can return, given words here rather than on
/// the server.
///
/// Routes send a code and never a `message` — the server has no idea what language the
/// reader is in. Keeping the copy on the client is the only way it can be translated at
/// all, so a reader sees a sentence rather than `(502) query_failed`.
///
/// Adding a code to a route means adding it here too. The set below is exactly what
/// `app/api/**` returns today.
enum ServerErrorCopy {
    static func message(code: String?, status: Int) -> LocalizedStringResource {
        switch code {
        case "requires_pro": "That needs an active subscription."
        case "unauthorized": "Your session expired. Sign in again to keep going."
        case "not_found": "That isn't here anymore."
        case "bad_request": "The server couldn't read that request."
        case "purchase_unavailable": "Subscriptions are unavailable right now."
        case "invalid_transaction": "That purchase couldn't be verified."
        case "query_failed": "The server lost its place. Try again."
        case "delete_failed": "Your account is still here — that didn't go through. Try again."
        // The status is kept in the fallback so a support conversation about an
        // unrecognised code still has something to go on.
        default: "The server turned the request down. (\(status))"
        }
    }
}
