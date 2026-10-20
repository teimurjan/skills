import SwiftUI

extension View {
    /// Names a widget a store frame can lift out of the screen. Does nothing outside a
    /// Debug screenshot run.
    func screenshotCallout(_ id: String) -> some View {
        #if DEBUG
        modifier(ScreenshotCallout(id: id))
        #else
        self
        #endif
    }
}

#if DEBUG
private struct ScreenshotCallout: ViewModifier {
    let id: String
    @Environment(\.displayScale) private var scale

    func body(content: Content) -> some View {
        content.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
            ScreenshotCallouts.record(id, frame: frame, scale: scale)
        }
    }
}

/// Where each named widget sits on screen, written for `capture-simulator-screens.mjs` to
/// copy beside the capture.
@MainActor
enum ScreenshotCallouts {
    static let fileURL = URL.documentsDirectory.appending(path: "screenshot-callouts.json")

    private struct Rect: Encodable {
        let x, y, w, h: CGFloat
    }

    private struct Report: Encodable {
        let scale: CGFloat
        let callouts: [String: Rect]
    }

    private static var frames: [String: Rect] = [:]

    static func record(_ id: String, frame: CGRect, scale: CGFloat) {
        guard ScreenshotHarness.requestedScreen != nil else { return }
        frames[id] = Rect(x: frame.minX, y: frame.minY, w: frame.width, h: frame.height)
        try? JSONEncoder().encode(Report(scale: scale, callouts: frames)).write(to: fileURL, options: .atomic)
    }
}
#endif
