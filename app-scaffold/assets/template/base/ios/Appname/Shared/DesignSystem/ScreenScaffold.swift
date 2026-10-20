import SwiftUI
import UIKit

/// The frame every screen sits in: canvas background, 20pt gutters, and a title block
/// that pairs a large title with one line of context and an optional trailing control.
///
/// The context line is not decoration: each screen states what it holds in it, so a glance
/// is enough to know whether the screen needs attention.
struct ScreenHeader<Trailing: View>: View {
    let title: LocalizedStringResource
    let subtitle: String
    /// The way back out of a pushed screen.
    ///
    /// `Screen` hides the navigation bar so each screen can draw its own title, which also
    /// takes the system's back button with it. Any screen that is pushed rather than
    /// presented has to pass this.
    var onBack: (() -> Void)?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: Metric.Space.l) {
            if let onBack {
                Button {
                    Haptics.tap()
                    onBack()
                } label: {
                    Glyph(symbol: "chevron.left", size: 17, weight: .semibold)
                        .glyphButtonFace()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Back"))
            }

            HStack(alignment: .top, spacing: Metric.Space.m) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title).appnameTitle()
                    Text(subtitle)
                        .font(Typeface.mono(13, .regular, relativeTo: .footnote))
                        .monospacedDigit()
                        .foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: Metric.Space.s)
                HStack(spacing: Metric.Space.s) { trailing }
            }
        }
        .padding(.top, Metric.Space.s)
    }
}

extension ScreenHeader where Trailing == EmptyView {
    init(title: LocalizedStringResource, subtitle: String, onBack: (() -> Void)? = nil) {
        self.init(title: title, subtitle: subtitle, onBack: onBack) { EmptyView() }
    }
}

/// The bar across the top of an editor sheet or a pushed screen: a close cross or a back
/// pill on the left, the title centred, and an optional control on the right.
///
/// The two sides are held to the same minimum width, so the title stays centred on the
/// screen whichever side is wider.
struct SheetHeader<Leading: View, Trailing: View>: View {
    let title: Text
    let leading: Leading
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: Metric.Space.s) {
            leading.frame(minWidth: 86, alignment: .leading)
            Spacer(minLength: 0)
            title
                .font(Typeface.ui(17, .bold, relativeTo: .headline))
                .foregroundStyle(Palette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .layoutPriority(1)
            Spacer(minLength: 0)
            HStack(spacing: Metric.Space.s) { trailing }
                .frame(minWidth: 86, alignment: .trailing)
        }
        .padding(.horizontal, Metric.gutter)
        .padding(.top, Metric.Space.m)
        .padding(.bottom, Metric.Space.s)
        .background(Palette.canvas)
    }
}

extension SheetHeader where Trailing == EmptyView {
    init(title: Text, leading: Leading) {
        self.init(title: title, leading: leading) { EmptyView() }
    }
}

extension View {
    /// An editor's chrome: the system bar hidden, a `SheetHeader` with the close cross in its
    /// place. `cancel` is the cross's spoken label.
    ///
    /// Every editor in the app wears it, so the way out is always where the thumb looks for it
    /// and every sheet's title is set in the app's face rather than the system's.
    func editorChrome<Trailing: View>(
        title: Text,
        cancel: LocalizedStringResource = "Cancel",
        onCancel: @escaping () -> Void,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        safeAreaInset(edge: .top, spacing: 0) {
            SheetHeader(title: title, leading: CloseButton(title: cancel, action: onCancel), trailing: trailing)
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    func editorChrome(title: Text, cancel: LocalizedStringResource = "Cancel", onCancel: @escaping () -> Void) -> some View {
        editorChrome(title: title, cancel: cancel, onCancel: onCancel) { EmptyView() }
    }
}

/// Wraps a screen's content in the canvas and the standard gutter, and hides the
/// navigation chrome — these screens draw their own titles.
///
/// The content is pinned to the viewport's width: a vertical `ScrollView` still scrolls
/// sideways when one row overflows, and a clipped row gets noticed and fixed where a screen
/// that drifts sideways just feels broken.
struct Screen<Content: View>: View {
    var scrolls = true
    @ViewBuilder var content: Content

    var body: some View {
        Group {
            if scrolls {
                ScrollView {
                    VStack(alignment: .leading, spacing: Metric.Space.l) { content }
                        .padding(.horizontal, Metric.gutter)
                        .padding(.top, Metric.Space.s)
                        .padding(.bottom, Metric.Space.xl)
                        .containerRelativeFrame(.horizontal)
                }
                .scrollDismissesKeyboard(.interactively)
            } else {
                VStack(alignment: .leading, spacing: Metric.Space.l) { content }
                    .padding(.horizontal, Metric.gutter)
                    .padding(.top, Metric.Space.s)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        // Past every safe area, the keyboard's included. The keypad's backdrop is
        // translucent, so a canvas that stops at the keyboard shows the window's black
        // through it — and the home indicator strip below it with nothing painted at all.
        .background(Palette.canvas.ignoresSafeArea())
        .background { SwipeBackGesture() }
        .toolbar(.hidden, for: .navigationBar)
        .keyboardDismissBar()
    }
}

/// The system's swipe-from-the-left-edge back gesture, put back.
///
/// UIKit switches its interactive pop gesture off whenever the navigation bar is hidden, and
/// `Screen` hides it everywhere. The delegate says yes only when there is something to pop
/// back to: swiping on the root of a stack wedges a `UINavigationController`.
private struct SwipeBackGesture: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController { Host() }

    func updateUIViewController(_ controller: UIViewController, context: Context) {}

    final class Host: UIViewController, UIGestureRecognizerDelegate {
        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .clear
            view.isUserInteractionEnabled = false
        }

        /// Claimed on every appearance rather than once. The delegate reference is weak,
        /// so popping back to a screen whose host set it earlier arrives with it already
        /// cleared by the screen that has just gone away.
        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            guard let gesture = navigationController?.interactivePopGestureRecognizer else { return }
            gesture.delegate = self
            gesture.isEnabled = true
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let navigation = navigationController else { return false }
            // Something to go back to, and nothing already on its way: a swipe begun on
            // top of a push that is still animating is the other half of the same
            // wedged-stack bug.
            return navigation.viewControllers.count > 1 && navigation.transitionCoordinator == nil
        }

        /// What the system's own delegate answered and ours dropped: every other gesture waits
        /// for the edge swipe to fail, or a swipe begun on a row is taken by the row.
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            true
        }
    }
}

extension View {
    /// One "Done" above the keyboard, for every field on the screen below it.
    ///
    /// Number pads have no return key, and `scrollDismissesKeyboard` answers only where there
    /// is something to scroll. This answers everywhere, and sits on `Screen` so a new screen
    /// inherits it.
    func keyboardDismissBar() -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { UIApplication.dismissKeyboard() }
            }
        }
    }
}

extension View {
    /// The bar pinned to the bottom of a screen, such as an editor's save button. It floats
    /// over the content on a fade of the canvas, and steps aside for the keyboard rather than
    /// stacking under the Done bar `keyboardDismissBar` draws.
    func pinnedBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
        modifier(PinnedBar(bar: bar()))
    }
}

private struct PinnedBar<Bar: View>: ViewModifier {
    let bar: Bar
    @State private var keyboardIsUp = false

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom) {
                if !keyboardIsUp { bar.pinnedBarBackground() }
            }
            // SwiftUI can keep part of the keyboard's inset after it closes (an interactive
            // dismissal, or Reduce Motion with cross-fade), which floats the bar off the bottom.
            .ignoresSafeArea(keyboardIsUp ? [] : .keyboard, edges: .bottom)
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) {
                setKeyboard(up: true, from: $0)
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) {
                setKeyboard(up: false, from: $0)
            }
    }

    /// Timed off the notification rather than a constant, so the bar leaves with the
    /// keyboard instead of blinking out from under it.
    private func setKeyboard(up: Bool, from note: Notification) {
        let duration = note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
        withAnimation(.easeOut(duration: duration)) { keyboardIsUp = up }
    }
}

private extension View {
    /// The ground under a pinned bar: the canvas, faded in over its top edge so the content
    /// scrolling under it disappears into the paper instead of under a rule.
    func pinnedBarBackground() -> some View {
        padding(.top, Metric.Space.m)
            .background {
                LinearGradient(
                    stops: [.init(color: Palette.canvas.opacity(0), location: 0), .init(color: Palette.canvas, location: 0.3)],
                    startPoint: .top, endPoint: .bottom
                )
                .ignoresSafeArea()
            }
    }
}
