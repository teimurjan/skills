import Foundation
import Observation

/// The user's data: the only type that changes it.
///
/// Reads are free and writes are gated. Opening the app and what it holds costs nothing;
/// every write asks `requireEntitlement()` first. `refusedActions` is a counter rather than a
/// flag, so a second refusal fires `onChange` in `AppRoot` again and the paywall comes back.
///
/// Kept on the device, in Application Support, keyed to the account that wrote it. `items`
/// is the example write; replace it with the app's own model.
@MainActor
@Observable
final class AppnameStore {
    private(set) var items: [String] = []
    private(set) var refusedActions = 0

    @ObservationIgnored private let isEntitled: () -> Bool
    @ObservationIgnored private let fileURL: URL
    @ObservationIgnored private var ownerID: String?

    init(
        isEntitled: @escaping () -> Bool,
        fileURL: URL = URL.applicationSupportDirectory.appending(path: "appname-items.json")
    ) {
        self.isEntitled = isEntitled
        self.fileURL = fileURL
    }

    /// Asks whether a write may happen, and counts the refusal when it may not.
    func requireEntitlement() -> Bool {
        if isEntitled() { return true }
        refusedActions += 1
        return false
    }

    /// False when there was nothing to add or the write was refused.
    @discardableResult
    func add(_ item: String) -> Bool {
        let trimmed = item.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, requireEntitlement() else { return false }
        items.append(trimmed)
        save()
        Analytics.shared.track(.itemAdded)
        return true
    }

    func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let stored = try? JSONCoding.decoder.decode(Stored.self, from: data)
        else { return }
        ownerID = stored.ownerID
        items = stored.items
    }

    /// Claims what is on this phone for `userID`. Data written by another account is dropped,
    /// so somebody signing in on a shared phone never inherits a stranger's.
    func adopt(userID: String) {
        if let ownerID, ownerID != userID { items = [] }
        ownerID = userID
        save()
    }

    /// Account deletion and sign-out both start clean.
    func reset() {
        items = []
        ownerID = nil
        try? FileManager.default.removeItem(at: fileURL)
    }

    #if DEBUG
    /// Screenshot harness only.
    func seedForScreenshot(_ seeded: [String]) { items = seeded }
    #endif

    private func save() {
        guard let data = try? JSONCoding.encoder.encode(Stored(ownerID: ownerID, items: items)) else { return }
        try? FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try? data.write(to: fileURL, options: .atomic)
    }

    private struct Stored: Codable {
        let ownerID: String?
        let items: [String]
    }
}
