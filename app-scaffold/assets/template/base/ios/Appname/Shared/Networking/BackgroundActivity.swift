import UIKit

/// Keeps one piece of work alive across a brief trip to the background. iOS
/// grants roughly half a minute after the app leaves the screen, which covers
/// a request or two. When the grace runs out anyway the assertion is
/// released and the request dies its ordinary transport death — which the
/// caller already knows how to answer.
@MainActor
enum BackgroundActivity {
    static func run<T, E: Error>(named name: String,
                                 _ work: () async throws(E) -> T) async throws(E) -> T {
        let assertion = Assertion(named: name)
        defer { assertion.end() }
        return try await work()
    }
}

/// One `beginBackgroundTask`, held exactly as long as the work runs. A class so
/// the expiration handler can reach back and release it — holding past the
/// deadline is what gets an app killed, not the deadline itself.
@MainActor
private final class Assertion {
    private var id: UIBackgroundTaskIdentifier = .invalid

    init(named name: String) {
        id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            MainActor.assumeIsolated { self?.end() }
        }
    }

    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}
