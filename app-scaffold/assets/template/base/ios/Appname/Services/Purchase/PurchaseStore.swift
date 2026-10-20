import Foundation
import Observation
import StoreKit

/// StoreKit 2 purchase flow for the paid tier. Loads the subscription products,
/// runs the purchase, and forwards the signed transaction to the backend, which
/// verifies it with Apple and writes the entitlement against the signed-in
/// account — the database is the authority (see lib/entitlements.ts), and the
/// local `localPaid` mirror is only what the UI shows until it answers.
///
/// Every purchase is stamped with the buyer's Supabase uid as its
/// `appAccountToken`. Apple hands that id back on every later transaction for
/// the subscription, which is what lets the notifications webhook attribute a
/// renewal with no client involved, and what lets the server reject a reconcile
/// for somebody else's transaction.
@MainActor
@Observable
final class PurchaseStore {
    /// Longest period first so the better-value plan reads first.
    private(set) var products: [Product] = []
    private(set) var isPurchasing = false
    private(set) var isRestoring = false
    /// Local StoreKit entitlement (this Apple ID). Instant and offline, but only a
    /// mirror — the server is the authority once its value loads.
    private(set) var localPaid = false
    /// Server-side entitlement for the signed-in account (`nil` until first load).
    /// Server-wins: it can grant what this device's StoreKit can't see (a
    /// subscription bought on another phone) and withhold what a local sandbox
    /// purchase shows in a way production shouldn't.
    private(set) var serverPaid: Bool?
    /// Who bills this account, from the server: `app_store`, or the web biller's name.
    private(set) var provider: String?
    var isPaid: Bool { serverPaid ?? localPaid }
    /// Sold on the web, so managed in that biller's portal rather than StoreKit's sheet.
    var isWebSubscription: Bool { provider.map { $0 != "app_store" } ?? false }
    /// The App Store subscription group, read off a loaded product. Scopes the
    /// manage-subscriptions sheet to this app — StoreKit's unscoped sheet can
    /// surface other apps' subscriptions. `nil` until products load.
    var subscriptionGroupID: String? { products.first?.subscription?.subscriptionGroupID }
    /// Whether this Apple ID can still take the introductory offer. Eligibility is
    /// per subscription *group*, so one lookup covers every plan. StoreKit hands
    /// back `introductoryOffer` on the product whether or not the buyer can use
    /// it, so without this the paywall promises a free trial that Apple's sheet
    /// then declines to honour. `false` until `loadProducts()` resolves it.
    private(set) var isEligibleForIntroOffer = false
    private(set) var errorMessage: DisplayMessage?
    private(set) var didLoadProducts = false

    #if DEBUG
    /// Screenshot harness only: render the subscribed state without a purchase,
    /// so marketing shots don't carry a "See plans" prompt. Never reachable in a
    /// Release archive.
    func seedPaidForScreenshot() { serverPaid = true }
    #endif

    private let productIDs: [String]
    private let client: HTTPClient
    private let baseURL: URL
    /// Every entitlement route is account-scoped now, so a purchase can't be
    /// recorded or read without a token. Injected rather than reached for, so
    /// the store stays testable and doesn't depend on `AuthStore`.
    private let accessToken: AccessTokenProvider
    private let userID: UserIDProvider
    @ObservationIgnored private nonisolated(unsafe) var updatesTask: Task<Void, Never>?
    @ObservationIgnored private var redeemedTransactionIDs: Set<UInt64> = []
    /// The account `serverPaid` currently describes. A change resets it, so one
    /// person signing in after another on the same device never inherits their
    /// entitlement.
    @ObservationIgnored private var lastServerUID: String?
    /// Supersedes stale in-flight reads: a response that lands after a newer
    /// request was issued must not overwrite the newer answer.
    @ObservationIgnored private var serverRefreshGeneration = 0

    /// Two subscriptions and one perpetual unlock. The lifetime is a non-consumable, so its
    /// entitlement carries a null expiry, which the backend reads as perpetual.
    init(productIDs: [String] = ["com.example.appname.fullaccess.monthly",
                                 "com.example.appname.fullaccess.yearly",
                                 "com.example.appname.fullaccess.lifetime"],
         client: HTTPClient = HTTPClient(),
         baseURL: URL = AppConfig.apiBaseURL,
         accessToken: @escaping AccessTokenProvider = { nil },
         userID: @escaping UserIDProvider = { nil }) {
        self.productIDs = productIDs
        self.client = client
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.userID = userID
        // Catch renewals and purchases made outside the app (e.g. Ask to Buy).
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates { await self?.redeem(update) }
        }
    }

    deinit { updatesTask?.cancel() }

    func loadProducts() async {
        do {
            let loaded = try await Product.products(for: productIDs)
            products = loaded.sorted { periodRank($0) < periodRank($1) }
            // App Store Connect can resolve zero products even on success when the
            // Paid Apps Agreement is inactive or the subscriptions aren't approved yet.
            errorMessage = loaded.isEmpty ? .copy("Subscriptions are unavailable right now.") : nil
        } catch {
            errorMessage = .system(error.localizedDescription)
        }
        // Resolved before `didLoadProducts` flips, so the sheet's first render
        // already knows whether it is offering a trial or a plain subscription —
        // no flip from "Start free trial" to "Subscribe" under the reader.
        isEligibleForIntroOffer = await introOfferEligibility()
        didLoadProducts = true
        await refresh()
    }

    private func introOfferEligibility() async -> Bool {
        guard let groupID = subscriptionGroupID else { return false }
        return await Product.SubscriptionInfo.isEligibleForIntroOffer(for: groupID)
    }

    func purchase(_ product: Product) async {
        errorMessage = nil
        isPurchasing = true
        defer { isPurchasing = false }
        do {
            // Stamp the buyer's uid onto the transaction so Apple hands it back on
            // every renewal — the server needs no client round-trip to know whose
            // subscription this is. Supabase uids are uuids, so the conversion only
            // fails for the screenshot harness's placeholder identity.
            var options: Set<Product.PurchaseOption> = []
            if let id = await userID(), let token = UUID(uuidString: id) {
                options.insert(.appAccountToken(token))
            }
            switch try await product.purchase(options: options) {
            case let .success(verification):
                await redeem(verification)
            case .userCancelled, .pending:
                break
            @unknown default:
                break
            }
        } catch {
            errorMessage = .system(error.localizedDescription)
        }
    }

    /// Raw values double as the `restore_finished` event's `outcome`.
    enum RestoreOutcome: String, Equatable {
        /// An active entitlement is now in force.
        case restored
        /// The App Store returned no purchase for this Apple ID.
        case nothingToRestore = "nothing_to_restore"
        /// The reconcile call to the backend itself errored (offline, server down).
        case failed
        /// The user dismissed the App Store sign-in — surface nothing.
        case cancelled
    }

    /// Sync with Apple, then reconcile the server with Apple: push each active
    /// entitlement's signed transaction to the backend so its record matches, then
    /// re-read the authoritative server state. The returned outcome drives the alert.
    @discardableResult
    func restore() async -> RestoreOutcome {
        isRestoring = true
        defer { isRestoring = false }
        // `AppStore.sync()` re-downloads transactions, but it's only a refresh and is
        // flaky in Sandbox/TestFlight. The reconcile below doesn't depend on it, so a
        // sync error must not abort — only a dismissed sign-in is a cancel.
        do {
            try await AppStore.sync()
        } catch let error as StoreKitError {
            if case .userCancelled = error { return .cancelled }
        } catch {}
        await refreshLocalEntitlement()

        // Push any locally-cached active entitlement (verified purely by StoreKit —
        // no server creds needed), capturing an original transaction id along the way.
        var transactionID: String?
        let ids = Set(productIDs)
        for await result in Transaction.currentEntitlements {
            guard case let .verified(transaction) = result,
                  ids.contains(transaction.productID),
                  transaction.revocationDate == nil else { continue }
            transactionID = String(transaction.originalID)
            await syncToBackend(jws: result.jwsRepresentation)
        }

        // Server-authoritative reconcile: let the backend query Apple directly. Falls
        // back to the latest lapsed/already-owned transaction id when nothing's active
        // in the local cache — the case the client JWS push can't reach.
        if transactionID == nil { transactionID = await latestTransactionID() }
        let reconciled = await syncSubscription(transactionID: transactionID)

        await refreshServerEntitlement()
        if isPaid { return .restored }
        // A definitive server answer (even "not paid") is nothing-to-restore; only a
        // failure to reach the reconcile endpoint is a transient failure.
        return reconciled == nil ? .failed : .nothingToRestore
    }

    private func redeem(_ verification: VerificationResult<Transaction>) async {
        guard case let .verified(transaction) = verification else { return }
        // Idempotent: StoreKit hands the same purchase to both `purchase()` and the
        // `Transaction.updates` listener, so guard the side effects against a repeat.
        let isFirstRedeem = redeemedTransactionIDs.insert(transaction.id).inserted
        // Unlock from the local transaction first so the UI flips the instant Apple
        // confirms — the backend write is best-effort (the App Store Server
        // Notification webhook is the durable backstop) and must not gate the unlock.
        await transaction.finish()
        await refreshLocalEntitlement()
        guard isFirstRedeem else { return }
        // A genuine purchase, not a renewal arriving through `Transaction.updates`.
        if transaction.reason == .purchase {
            Analytics.shared.track(.purchaseCompleted(productID: transaction.productID,
                                                      environment: transaction.environment.rawValue))
        }
        await syncToBackend(jws: verification.jwsRepresentation)
        // `/api/purchase` commits the entitlement before returning, so this read
        // reflects the write.
        await refreshServerEntitlement()
    }

    /// Refresh both signals together: local resolves instantly, server overrides when
    /// it lands. Used for the initial load and any full reconciliation.
    func refresh() async {
        async let local: Void = refreshLocalEntitlement()
        async let server: Void = refreshServerEntitlement()
        _ = await (local, server)
    }

    /// Everything this device can answer with no network: the App Store's own record of
    /// what this Apple ID owns, and the last server answer cached for this account.
    ///
    /// Awaited before the first frame: resolving it a moment later would flash the paywall
    /// at somebody who has paid, on every cold launch with no signal. The authoritative
    /// read follows behind it and corrects both ways.
    func resolveCachedEntitlement() async {
        await refreshLocalEntitlement()
        seedCachedServerPaid(for: await userID())
    }

    /// Attribute a purchase made before there was an account to attribute it to.
    ///
    /// An Apple ID can hold a subscription before this account existed, and the server,
    /// asked about a brand-new account, correctly answers "not paid". Left alone, that
    /// answer overrides the local one and locks a payer out. So the signed transaction is
    /// pushed under the new identity before its entitlement is read.
    ///
    /// Cheaper than `restore()` on purpose: no `AppStore.sync()`, which can put an App
    /// Store password prompt in front of somebody who has just signed in.
    func reconcileLocalEntitlement() async {
        guard await accessToken() != nil else { return }
        let ids = Set(productIDs)
        for await result in Transaction.currentEntitlements {
            guard case let .verified(transaction) = result,
                  ids.contains(transaction.productID),
                  transaction.revocationDate == nil else { continue }
            await syncToBackend(jws: result.jwsRepresentation)
        }
        await refreshServerEntitlement()
    }

    private func refreshLocalEntitlement() async {
        let ids = Set(productIDs)
        for await result in Transaction.currentEntitlements {
            if case let .verified(transaction) = result,
               ids.contains(transaction.productID),
               transaction.revocationDate == nil {
                localPaid = true
                return
            }
        }
        localPaid = false
    }

    /// Read this account's entitlement from the backend (the authority). Keeps
    /// the last known value on a transient failure so a dropped network never
    /// revokes access the UI already showed.
    func refreshServerEntitlement() async {
        serverRefreshGeneration += 1
        let generation = serverRefreshGeneration

        let uid = await userID()
        seedCachedServerPaid(for: uid)

        // Signed out: there is no account entitlement to assert, so fall back to
        // the local StoreKit mirror.
        guard let uid else {
            if generation == serverRefreshGeneration { serverPaid = nil }
            return
        }
        // Signed in, but the token couldn't be refreshed right now (offline, or a
        // Supabase blip). Keep what we have — that's a failure to ask, not an
        // answer of "no".
        guard let token = await accessToken() else { return }

        guard let decoded = try? await client.get(baseURL.appendingPathComponent("api/entitlement"),
                                                  headers: BackendAuth.headers(token: token),
                                                  as: EntitlementResponse.self),
              generation == serverRefreshGeneration
        else { return }
        serverPaid = decoded.paid
        provider = decoded.provider
        Self.cacheServerPaid(decoded.paid, for: uid)
    }

    /// The web biller's customer portal, minted by the server. Nil when it could not be
    /// opened, which the caller reports rather than opening nothing silently.
    func webPortalURL() async -> URL? {
        guard let token = await accessToken() else { return nil }
        let response = try? await client.post(
            baseURL.appendingPathComponent("api/subscription/portal"),
            body: EmptyBody(),
            headers: BackendAuth.headers(token: token),
            as: PortalResponse.self
        )
        return response.flatMap { URL(string: $0.url) }
    }

    /// Sign-out. The last account's answer must not outlive its session — it is what let a
    /// signed-out phone keep writing as if it were paid.
    func forgetAccount() {
        serverRefreshGeneration += 1
        provider = nil
        seedCachedServerPaid(for: nil)
    }

    /// A new identity must never inherit the previous one's answer, so seed from this
    /// uid's own cached value (nil when there is none) while the read runs.
    private func seedCachedServerPaid(for uid: String?) {
        guard uid != lastServerUID else { return }
        lastServerUID = uid
        serverPaid = uid.flatMap(Self.cachedServerPaid(for:))
    }

    /// Last known server answer, kept per account so a returning subscriber reads
    /// paid at cold start before the network replies — and so the next person to
    /// sign in on this device reads their own answer, not the previous one's. An
    /// absent key means "never asked", which is not the same as "not paid".
    private static func cachedServerPaid(for uid: String) -> Bool? {
        let key = serverPaidKey(for: uid)
        guard UserDefaults.standard.object(forKey: key) != nil else { return nil }
        return UserDefaults.standard.bool(forKey: key)
    }

    private static func cacheServerPaid(_ paid: Bool, for uid: String) {
        UserDefaults.standard.set(paid, forKey: serverPaidKey(for: uid))
    }

    private static func serverPaidKey(for uid: String) -> String { "appname.serverPaid.\(uid)" }

    /// POST the signed transaction (JWS) to the backend for Apple-side verification
    /// and entitlement write. Best-effort: the App Store Server Notification webhook
    /// is the durable backstop if this call is lost.
    private func syncToBackend(jws: String) async {
        struct Body: Encodable { let signedTransaction: String }
        struct Ack: Decodable { let ok: Bool }
        guard let token = await accessToken() else { return }
        _ = try? await client.post(baseURL.appendingPathComponent("api/purchase"),
                                   body: Body(signedTransaction: jws),
                                   headers: BackendAuth.headers(token: token),
                                   as: Ack.self)
    }

    /// Ask the backend to reconcile our subscription against Apple's App Store Server
    /// API (the authority) and write the result. Returns the resulting paid state, or
    /// nil if the call couldn't complete. The caller re-reads `/api/entitlement`
    /// afterwards, so this only reports whether the reconcile happened — it leaves
    /// the published state to the one place that owns it.
    @discardableResult
    private func syncSubscription(transactionID: String?) async -> Bool? {
        guard let transactionID else { return nil }
        struct Body: Encodable { let transactionId: String }
        guard let token = await accessToken() else { return nil }
        return try? await client.post(baseURL.appendingPathComponent("api/subscription/sync"),
                                      body: Body(transactionId: transactionID),
                                      headers: BackendAuth.headers(token: token),
                                      as: EntitlementResponse.self).paid
    }

    /// The most recent transaction id for any of our products — active or lapsed.
    /// `currentEntitlements` lists only active subs, so this also surfaces an expired
    /// or already-owned one the server should still reconcile against Apple.
    private func latestTransactionID() async -> String? {
        for id in productIDs {
            if case let .verified(transaction)? = await Transaction.latest(for: id) {
                return String(transaction.originalID)
            }
        }
        return nil
    }

    /// The plan billed every `unit` — a month, a year, or `nil` for the perpetual unlock.
    func product(billedEvery unit: Product.SubscriptionPeriod.Unit?) -> Product? {
        products.first { $0.subscription?.subscriptionPeriod.unit == unit }
    }

    /// Sort key: yearly (0) ahead of monthly (1), with the lifetime non-consumable last
    /// — it has no `subscription` at all, so it falls into the default.
    ///
    /// Yearly leading also keeps `subscriptionGroupID` pointing at a real subscription:
    /// it reads `products.first`, and a non-consumable in that slot would silently
    /// disable the intro-offer eligibility check and hide the free trial.
    private func periodRank(_ product: Product) -> Int {
        switch product.subscription?.subscriptionPeriod.unit {
        case .year: 0
        case .month: 1
        default: 2
        }
    }
}

/// The `/api/entitlement` and `/api/subscription/sync` response shape.
private struct EntitlementResponse: Decodable {
    let paid: Bool
    /// Absent on `/api/subscription/sync`.
    let provider: String?
}

private struct EmptyBody: Encodable {}

private struct PortalResponse: Decodable {
    let url: String
}
