import AmplitudeSwift
import Foundation

/// The one edge that talks to Amplitude. A main-actor singleton because events
/// fire from views and from the `@MainActor` stores (`AuthStore`, `AppnameStore`,
/// `PurchaseStore`) alike, and none of those can reach an injected environment. Every call is a no-op until `configure`
/// runs with a real key, so the Simulator, previews, and the unkeyed Debug
/// configuration emit nothing and call sites need no guards.
@MainActor
final class Analytics {
    static let shared = Analytics()

    private var amplitude: Amplitude?
    /// Tags every event so production, TestFlight, and dev traffic stay
    /// separable in one project.
    private let environmentTag = EnvironmentTagPlugin()

    private init() {}

    func configure(apiKey: String, environment: String) {
        environmentTag.environment = environment
        guard amplitude == nil, !apiKey.isEmpty else { return }
        let amplitude = Amplitude(configuration: Configuration(
            apiKey: apiKey,
            autocapture: [.sessions, .appLifecycles]
        ))
        amplitude.add(plugin: environmentTag)
        amplitude.identify(userProperties: ["environment": environment])
        self.amplitude = amplitude
    }

    /// Re-tag once StoreKit resolves the install's real environment (see
    /// `AppConfig.resolveAnalyticsEnvironment`). Also lands as a user property:
    /// an event property can't segment cohorts, retention, or revenue, so
    /// user-level charts would otherwise still mix TestFlight in with the App
    /// Store.
    func setEnvironment(_ environment: String) {
        guard environmentTag.environment != environment else { return }
        environmentTag.environment = environment
        amplitude?.identify(userProperties: ["environment": environment])
    }

    func track(_ event: AnalyticsEvent) {
        amplitude?.track(eventType: event.name, eventProperties: event.properties)
    }

    /// Tie subsequent events to the signed-in user (Supabase uuid) — the same id the
    /// backend keys entitlements on.
    func identify(userID: String) {
        amplitude?.setUserId(userId: userID)
    }

    /// Session cleared: drop the user id and start a fresh anonymous device id.
    /// The environment belongs to the install rather than the identity, so
    /// re-attach it to the new anonymous user.
    func reset() {
        amplitude?.reset()
        amplitude?.identify(userProperties: ["environment": environmentTag.environment])
    }
}

/// Stamps `environment` on every event on its way out — including the SDK's own
/// autocapture (`[Amplitude] Session Start`, `Application Opened`, …), which
/// never passes through `Analytics.track` and would otherwise ship untagged. Not
/// main-actor bound: Amplitude calls `execute` from its own queue, hence the
/// lock around the mutable tag.
private final class EnvironmentTagPlugin: EnrichmentPlugin {
    private let lock = NSLock()
    private var value = "unknown"

    var environment: String {
        get { lock.withLock { value } }
        set { lock.withLock { value = newValue } }
    }

    override func execute(event: BaseEvent) -> BaseEvent? {
        var properties = event.eventProperties ?? [:]
        properties["environment"] = environment
        event.eventProperties = properties
        return event
    }
}
