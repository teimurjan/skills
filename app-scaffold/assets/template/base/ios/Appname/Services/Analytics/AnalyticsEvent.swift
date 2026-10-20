import Foundation

/// Where the paywall was raised from. Some of these are somebody asking to see the plans
/// and some are somebody being turned away, which is the difference that decides what a
/// conversion rate means.
enum PaywallContext: String, Identifiable {
    case onboarding
    case settings
    /// A write was refused for want of an entitlement: the reader reached for something
    /// and this is what was behind it.
    case writeBlocked = "write_blocked"

    var id: String { rawValue }
}

/// The places the app reports as visited. The web app's routes by the same names are what
/// `appname_web_page_viewed` reports, so the two clients chart alike.
enum AppScreen: String {
    case home, profile
}

/// Every product event the app emits, as one typed case. SDK-agnostic on purpose —
/// `name`/`properties` map to Amplitude in `Analytics`, so the emit sites stay free of
/// stringly-typed names and the whole funnel is auditable in one place.
enum AnalyticsEvent {
    // The funnel that runs before anything else.
    /// `step` is the step's id in `steps.ts`, stable across a reorder where `index` is not.
    case funnelPageViewed(index: Int, kind: String, step: String)
    /// The web funnel's keys and values, so the two segment alike.
    case funnelAnswered(question: String, answer: String)
    /// The recap's button: every answer, keyed by question.
    case funnelCompleted(answers: [String: String])

    // Auth
    case signInSucceeded(provider: String)
    case signedOut
    /// Session cleared without a gesture: the refresh token was definitively rejected.
    case autoLoggedOut(reason: String)
    case accountDeleted

    // The core loop
    /// A screen opened, or returned to from the background.
    case screenViewed(screen: AppScreen)
    case settingsChanged(field: String)
    /// The example write. Replace with the app's own core action.
    case itemAdded

    // Monetization
    case paywallViewed(context: PaywallContext)
    case purchaseStarted(productID: String)
    /// `environment` is the transaction's own StoreKit environment, not the install's —
    /// the same value the backend stores on `entitlements`, so a conversion in Amplitude
    /// reconciles against the row that granted it.
    case purchaseCompleted(productID: String, environment: String)
    case restoreStarted
    case restoreFinished(outcome: String)

    /// Namespaces this app's events in a shared Amplitude account. The web carries
    /// `appname_web_` and the server `appname_server_`.
    private static let prefix = "appname_"

    var name: String { Self.prefix + rawName }

    private var rawName: String {
        switch self {
        case .funnelPageViewed: "funnel_page_viewed"
        case .funnelAnswered: "funnel_answered"
        case .funnelCompleted: "funnel_completed"
        case .signInSucceeded: "sign_in_succeeded"
        case .signedOut: "signed_out"
        case .autoLoggedOut: "auto_logged_out"
        case .accountDeleted: "account_deleted"
        case .screenViewed: "screen_viewed"
        case .settingsChanged: "settings_changed"
        case .itemAdded: "item_added"
        case .paywallViewed: "paywall_viewed"
        case .purchaseStarted: "purchase_started"
        case .purchaseCompleted: "purchase_completed"
        case .restoreStarted: "restore_started"
        case .restoreFinished: "restore_finished"
        }
    }

    var properties: [String: Any]? {
        switch self {
        case let .funnelPageViewed(index, kind, step): ["index": index, "kind": kind, "step": step]
        case let .funnelAnswered(question, answer): ["question": question, "answer": answer]
        case let .funnelCompleted(answers): answers
        case let .signInSucceeded(provider): ["provider": provider]
        case let .autoLoggedOut(reason): ["reason": reason]
        case let .screenViewed(screen): ["screen": screen.rawValue]
        case let .settingsChanged(field): ["field": field]
        case let .paywallViewed(context): ["context": context.rawValue]
        case let .purchaseStarted(productID): ["product_id": productID]
        case let .purchaseCompleted(productID, environment):
            ["product_id": productID, "transaction_environment": environment]
        case let .restoreFinished(outcome): ["outcome": outcome]
        case .signedOut, .accountDeleted, .itemAdded, .restoreStarted:
            nil
        }
    }
}
