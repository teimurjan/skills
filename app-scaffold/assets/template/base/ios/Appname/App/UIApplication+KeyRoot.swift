import UIKit

extension UIApplication {
    /// Google's sign-in sheet needs a UIKit presenter, which SwiftUI doesn't hand out.
    static var keyRootViewController: UIViewController? {
        shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }?
            .rootViewController
    }

    /// Puts the keyboard away, whatever is holding it. Addressed to the responder chain
    /// rather than a `FocusState`, because the bar that calls it does not know which field
    /// is focused.
    static func dismissKeyboard() {
        shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}
