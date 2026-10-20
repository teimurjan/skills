import StoreKit
import SwiftUI

/// The one place the app asks for money: the web funnel's offer (`PaywallStep.tsx`), sold
/// through StoreKit, in the web deck's words (`FunnelContent`).
///
/// Where it differs from the web, an App Store rule decided it: the billed amount is the big
/// figure on each card and the per-day price sits under the plan's name (3.1.2), there is no
/// money-back promise (Apple refunds), and the trial's terms, Restore and the renewal
/// disclosure are added at the point of sale.
///
/// A page, never a sheet: a step in the first run, and a full-screen cover over a refused
/// write. It has a way out, because the wall stands in front of writing, not reading.
struct PaywallScreen: View {
    /// Why the reader is looking at this, for the funnel. A refused edit and a lapse are
    /// the same sheet and a different event.
    var context: PaywallContext = .writeBlocked
    /// What "not now" does when this screen is a step in the first run rather than
    /// something presented over the app. Absent inside the cover, which closes itself.
    var onSkip: (() -> Void)?

    @Environment(PurchaseStore.self) private var purchases
    @Environment(\.dismiss) private var dismiss

    /// The yearly, the middle card, as on the web.
    @State private var plan = Plan.yearly
    @State private var restoreMessage: LocalizedStringResource?

    /// Apple's standard licence. A subscription sold inside an app has to link a EULA at
    /// the point of sale, and an app that does not ship one of its own falls under this
    /// document — App Review checks the link is here and that it works.
    private static let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    private static let privacyURL = URL(string: "https://appname.example/privacy")!

    /// A month is 30 days and not 30.44: the figure illustrates scale, and a buyer checking
    /// it will divide by 30.
    private static let days: [Plan: Decimal] = [.monthly: 30, .yearly: 365]

    private enum Plan: CaseIterable {
        case monthly, yearly, lifetime

        var unit: Product.SubscriptionPeriod.Unit? {
            switch self {
            case .monthly: .month
            case .yearly: .year
            case .lifetime: nil
            }
        }
    }

    var body: some View {
        let copy = FunnelContent.bundled.copy()

        ScrollView {
            VStack(spacing: Metric.Space.s) {
                FunnelHeadline(text: copy.steps["paywall"]?.headline ?? "")
                pros(copy.paywall)
                    .padding(.bottom, Metric.Space.s)
                plans(copy.paywall)
                commit(copy.paywall)
                    .padding(.top, Metric.Space.s)
            }
            .frame(maxWidth: 520)
            .padding(.horizontal, Metric.gutter)
            .padding(.vertical, 32)
            .containerRelativeFrame(.horizontal)
        }
        .scrollIndicators(.hidden)
        .background(PaywallWash())
        .task {
            Analytics.shared.track(.paywallViewed(context: context))
            await purchases.loadProducts()
        }
        .onChange(of: purchases.isPaid) { _, paid in
            if paid { close() }
        }
        .alert(
            "Restore",
            isPresented: .init(get: { restoreMessage != nil }, set: { if !$0 { restoreMessage = nil } })
        ) {
            Button("OK", role: .cancel) { restoreMessage = nil }
        } message: {
            if let restoreMessage { Text(restoreMessage) }
        }
    }

    /// What the money buys, above what it costs. Ink marks, so the button stays the only
    /// accent fill on the page.
    private func pros(_ words: FunnelCopy.Paywall) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(words.pros, id: \.self) { line in
                HStack(spacing: Metric.Space.m) {
                    Glyph(symbol: "checkmark.circle.fill", size: 17, color: Palette.ink)
                        .frame(width: 22)
                        .accessibilityHidden(true)
                    Text(verbatim: line)
                        .font(Typeface.ui(15.5, .regular, relativeTo: .body))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func plans(_ words: FunnelCopy.Paywall) -> some View {
        if !purchases.didLoadProducts {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, Metric.Space.xl)
        } else if purchases.products.isEmpty {
            Text("Plans aren't available right now. Check your connection and try again.")
                .appnameCaption()
        } else {
            VStack(spacing: 10) {
                ForEach(Plan.allCases, id: \.self) { plan in
                    if let product = purchases.product(billedEvery: plan.unit) {
                        card(plan, product, words)
                    }
                }
            }
        }
    }

    private func card(_ plan: Plan, _ product: Product, _ words: FunnelCopy.Paywall) -> some View {
        let (label, term): (String, String) = switch plan {
        case .monthly: (words.monthly, words.perMonth)
        case .yearly: (words.yearly, words.perYear)
        case .lifetime: (words.lifetime, words.once)
        }
        let saving = plan == .yearly ? yearlySaving : nil
        return PlanCard(
            label: label,
            price: product.displayPrice,
            term: term,
            perDay: Self.days[plan].map { perDay(product, days: $0, words: words) },
            was: saving == nil ? nil : yearOfMonthly,
            badge: saving.map { FunnelCopy.fill(words.save, ["percent": Format.percent(Decimal($0), decimals: 0)]) },
            note: note(plan, product, words),
            selected: self.plan == plan
        ) { self.plan = plan }
    }

    /// The trial's terms where there is one — Apple requires the price after it on the card
    /// that sells it — and the web's line where there is not.
    private func note(_ plan: Plan, _ product: Product, _ words: FunnelCopy.Paywall) -> String {
        if plan != .lifetime, purchases.isEligibleForIntroOffer {
            return String(interface: "3 days free, then \(product.displayPrice)")
        }
        return switch plan {
        case .monthly: words.cancelAnytime
        case .yearly: words.billedYearly
        case .lifetime: words.forever
        }
    }

    /// Keeps the currency's own precision: a per-day figure rounded to whole units would read
    /// as the same number on two cards.
    private func perDay(_ product: Product, days: Decimal, words: FunnelCopy.Paywall) -> AttributedString {
        var figure = AttributedString((product.price / days).formatted(product.priceFormatStyle))
        figure.font = Typeface.mono(16, .medium, relativeTo: .body)
        return figure + AttributedString(" \(words.perDay)")
    }

    /// The yearly's saving against twelve months, in whole percent — nil unless it is
    /// actually cheaper, because a struck figure lower than the one beside it reads as a
    /// mistake.
    private var yearlySaving: Int? {
        guard let monthly = purchases.product(billedEvery: .month),
              let yearly = purchases.product(billedEvery: .year),
              monthly.price > 0 else { return nil }
        let share = NSDecimalNumber(decimal: yearly.price / (monthly.price * 12)).doubleValue
        let saving = Int(((1 - share) * 100).rounded())
        return saving > 0 ? saving : nil
    }

    private var yearOfMonthly: String? {
        guard let monthly = purchases.product(billedEvery: .month),
              let yearly = purchases.product(billedEvery: .year) else { return nil }
        return (monthly.price * 12).formatted(yearly.priceFormatStyle)
    }

    /// The picked plan, or the first one there is if the App Store did not return it.
    private var selection: Product? {
        purchases.product(billedEvery: plan.unit) ?? purchases.products.first
    }

    private func commit(_ words: FunnelCopy.Paywall) -> some View {
        let enabled = selection != nil && !purchases.isPurchasing
        return VStack(spacing: Metric.Space.m) {
            if purchases.isEligibleForIntroOffer && selection?.subscription != nil {
                PrimaryButton(title: "Start 3-day free trial", enabled: enabled) { buy() }
            } else {
                PrimaryButton(verbatim: words.continue, enabled: enabled) { buy() }
            }

            HStack(spacing: Metric.Space.l) {
                Button("Restore") { restore() }
                Spacer()
                Button("Not now") { close() }
            }
            .font(Typeface.ui(14, .medium, relativeTo: .footnote))
            .foregroundStyle(Palette.slate)
            .buttonStyle(.plain)
            .frame(height: Metric.tapTarget)

            Text(agreement)
                .font(Typeface.ui(11, .regular, relativeTo: .caption2))
                .foregroundStyle(Palette.slate)
                .tint(Palette.ink)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func buy() {
        guard let product = selection else { return }
        Analytics.shared.track(.purchaseStarted(productID: product.id))
        Task { await purchases.purchase(product) }
    }

    private func restore() {
        Analytics.shared.track(.restoreStarted)
        Task {
            let outcome = await purchases.restore()
            Analytics.shared.track(.restoreFinished(outcome: outcome.rawValue))
            restoreMessage = switch outcome {
            case .restored: "Your subscription is active again."
            case .nothingToRestore: "No purchase found for this Apple ID."
            case .failed: "Couldn't reach the server. Try again in a moment."
            case .cancelled: nil
            }
        }
    }

    /// The renewal disclosure and the two documents Apple requires at the point of sale,
    /// in one sentence. Underlined rather than accented: the accent on this screen belongs
    /// to the button above them.
    ///
    /// The links are carried as Markdown in the catalog and pointed at sentinel URLs,
    /// which are swapped for the real ones here. Matching on the English words instead
    /// fails silently the moment the sentence is translated — no crash, no log, just two
    /// legally required links quietly gone in every translation. Sentinels also mean a
    /// translator can move or reword the link text but can never retarget it.
    ///
    /// Resolved through `String(interface:)` and parsed here, rather than by
    /// `AttributedString(localized:)`: that initializer's `locale:` steers formatting and
    /// not which `.lproj` answers, so on a phone set to English with the app set to
    /// Russian it would print the disclosure in the wrong language. One unbroken literal,
    /// because a `LocalizedStringResource` has to *be* one to carry a catalog key.
    private static let agreementText: LocalizedStringResource = "Subscriptions renew automatically until cancelled. Manage or cancel in your Apple Account settings. By continuing you agree to the [Terms of Use](appname://terms) and the [Privacy Policy](appname://privacy)."

    private var agreement: AttributedString {
        let sentence = String(interface: Self.agreementText)
        // Inline only: this is one sentence, and the block-level parse would wrap it in a
        // paragraph intent for no gain.
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        guard var text = try? AttributedString(markdown: sentence, options: options) else {
            assertionFailure("Paywall agreement is not valid Markdown in \(InterfaceLanguage.current)")
            return AttributedString(sentence)
        }
        // Ranges collected before anything is written: `runs` is a view onto the string
        // being mutated, and setting an attribute re-segments it underneath the loop.
        // Indices survive an attribute change, so applying them afterwards is safe.
        let targets = text.runs.compactMap { run -> (Range<AttributedString.Index>, URL)? in
            switch run.link?.absoluteString {
            case "appname://terms": (run.range, Self.termsURL)
            case "appname://privacy": (run.range, Self.privacyURL)
            default: nil
            }
        }
        for (range, destination) in targets {
            text[range].link = destination
            text[range].underlineStyle = .single
        }
        assert(
            text.runs.contains { $0.link == Self.termsURL }
                && text.runs.contains { $0.link == Self.privacyURL },
            "Paywall agreement lost a required disclosure link — check that this locale "
                + "kept both appname:// Markdown links intact."
        )
        return text
    }

    private func close() {
        if let onSkip { onSkip() } else { dismiss() }
    }
}

/// One plan: its name and what it bills on the left, the billed amount on the right. The
/// web's `PlanCard`, with the two figures swapped for the App Store (see `PaywallScreen`).
/// Paper, and ink once picked.
private struct PlanCard: View {
    let label: String
    /// The billed amount — the most prominent price on the card, always.
    let price: String
    let term: String
    let perDay: AttributedString?
    /// Twelve months at the monthly price, struck through above the yearly one.
    let was: String?
    let badge: String?
    let note: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(alignment: .top, spacing: Metric.Space.m) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: Metric.Space.s) {
                        Radio(selected: selected)
                        Text(verbatim: label)
                            .font(Typeface.ui(17, .bold, relativeTo: .headline))
                            .tracking(-0.34)
                            .foregroundStyle(ink)
                        if let badge { PlanTag(text: badge, onInk: selected) }
                    }
                    if let perDay {
                        Text(perDay)
                            .font(Typeface.ui(14, .regular, relativeTo: .subheadline))
                            .foregroundStyle(ink)
                            .padding(.top, 6)
                    }
                    Text(verbatim: note)
                        .font(Typeface.ui(13.5, .regular, relativeTo: .footnote))
                        .foregroundStyle(quiet)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, Metric.Space.xs)
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 0) {
                    if let was {
                        Text(verbatim: was)
                            .font(Typeface.mono(13, .regular, relativeTo: .footnote))
                            .monospacedDigit()
                            .strikethrough()
                            .foregroundStyle(quiet)
                    }
                    Text(verbatim: price)
                        .font(Typeface.mono(26, .semibold, relativeTo: .title2))
                        .monospacedDigit()
                        .tracking(-0.52)
                        .foregroundStyle(ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(verbatim: term)
                        .font(Typeface.ui(11, .regular, relativeTo: .caption2))
                        .tracking(0.88)
                        .textCase(.uppercase)
                        .foregroundStyle(quiet)
                        .padding(.top, Metric.Space.xs)
                }
                .layoutPriority(1)
            }
            .padding(.horizontal, Metric.cardPadding)
            .padding(.vertical, Metric.cardPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? Palette.ink : Palette.surface, in: .rect(cornerRadius: Metric.Radius.card))
            .paperCard(raised: selected)
            .animation(.easeOut(duration: 0.15), value: selected)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var ink: Color { selected ? Palette.onInk : Palette.ink }
    private var quiet: Color { selected ? Palette.onInkMuted : Palette.muted }
}

/// A radio, not a tick: three plans where exactly one is chosen.
private struct Radio: View {
    let selected: Bool

    var body: some View {
        ZStack {
            Circle().strokeBorder(selected ? Palette.amber : Palette.chevron, lineWidth: 1.5)
            if selected { Circle().fill(Palette.amber).frame(width: 9, height: 9) }
        }
        .frame(width: 17, height: 17)
        .accessibilityHidden(true)
    }
}

/// The mark on the plan that is the better deal — paper on ink, or ink on amber once its
/// card is the picked one and already ink.
private struct PlanTag: View {
    let text: String
    let onInk: Bool

    var body: some View {
        Text(verbatim: text)
            .font(Typeface.mono(10, .semibold, relativeTo: .caption2))
            .tracking(0.6)
            .textCase(.uppercase)
            .lineLimit(1)
            .foregroundStyle(onInk ? Palette.ink : Palette.surface)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(onInk ? Palette.amber : Palette.ink, in: .capsule)
    }
}

/// The offer's own ground: two soft pools of the accent on the canvas, `.paywall-page` in
/// `app/globals.css`.
private struct PaywallWash: View {
    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            ZStack {
                Palette.canvas
                pool(
                    at: CGPoint(x: 0, y: size.height * 0.04),
                    radii: CGSize(width: size.width * 0.75, height: size.height * 0.52),
                    stops: [(0.30, 0), (0.11, 0.42), (0, 0.70)]
                )
                pool(
                    at: CGPoint(x: size.width, y: size.height * 0.60),
                    radii: CGSize(width: size.width * 0.72, height: size.height * 0.50),
                    stops: [(0.24, 0), (0.08, 0.44), (0, 0.72)]
                )
            }
        }
        .ignoresSafeArea()
    }

    /// An elliptical radial gradient: a circular one, squashed to the ellipse's proportions.
    private func pool(at centre: CGPoint, radii: CGSize, stops: [(opacity: Double, location: CGFloat)]) -> some View {
        Circle()
            .fill(RadialGradient(
                stops: stops.map { .init(color: Palette.accent.opacity($0.opacity), location: $0.location) },
                center: .center,
                startRadius: 0,
                endRadius: radii.width
            ))
            .frame(width: radii.width * 2, height: radii.width * 2)
            .scaleEffect(x: 1, y: radii.height / radii.width)
            .position(centre)
    }
}
