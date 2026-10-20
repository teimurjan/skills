import SwiftUI

/// A line of error text on its way to the screen, tagged with who wrote it.
///
/// The two are not interchangeable. Our own copy has to be looked up in the
/// catalog to come out in the reader's language; a `localizedDescription` from
/// URLError, StoreKit or GoTrue has *already* been translated by the system and
/// would be nonsense as a catalog key. Before this distinction existed both were
/// `String`, so the only way to keep them apart was to remember to.
enum DisplayMessage: Equatable {
    case copy(LocalizedStringResource)
    case system(String)
}

extension Text {
    init(_ message: DisplayMessage) {
        switch message {
        case .copy(let resource): self.init(resource)
        case .system(let string): self.init(verbatim: string)
        }
    }
}
