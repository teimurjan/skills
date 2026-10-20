import UIKit

/// Every control that changes a value or commits a step gives one tick back.
enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)

    static func tap() {
        light.impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
}
