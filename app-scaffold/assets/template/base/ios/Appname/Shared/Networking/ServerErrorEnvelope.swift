import Foundation

/// Backend errors arrive as `{"error": "<code>"}`. Only the code is read: the
/// words that go with it live in `ServerErrorCopy`, where they can be
/// translated. A body that isn't ours yields nil and the caller falls back on
/// the status.
enum ServerErrorEnvelope {
    private struct Envelope: Decodable { let error: String }

    static func code(in body: String) -> String? {
        guard let data = body.data(using: .utf8),
              let envelope = try? JSONDecoder().decode(Envelope.self, from: data)
        else { return nil }
        return envelope.error
    }
}
