import SwiftUI

/// The argument, made before the app asks for anything — the web funnel (`/start`), step for
/// step and word for word.
///
/// Its steps and its words are `FunnelContent`, generated from `components/funnel/steps.ts`
/// and the web's copy decks, so the ads measure one funnel on two surfaces and a reworded
/// question cannot land on one of them only. What is the phone's own is the chrome around it:
/// the language picker on the first screen, a way past the survey for somebody who already
/// has an account, and the account step, which is the app's sign-in rather than the web's
/// forms. The offer after it is `PaywallScreen`.
struct FunnelScreen: View {
    let spine: FunnelContent.Spine
    let copy: FunnelCopy
    /// "Already have an account?" — straight to sign-in, past the survey.
    let onSignIn: () -> Void
    /// The account step answered with an account.
    let onFinish: () -> Void

    @Environment(AuthStore.self) private var auth
    /// Watched so the picker's own label redraws when it is used. `AppRoot` rebuilds this
    /// screen on the same key, with the new language's deck.
    @AppStorage(InterfaceLanguage.overrideKey) private var language = "en"

    @State private var index = 0
    /// Keyed by question and never translated: these are analytics properties, the keys and
    /// values the web reports.
    @State private var answers: [String: String] = [:]
    /// Steps already reported, so stepping back does not count a page twice.
    @State private var seen: Set<String> = []

    private var step: FunnelContent.Step { spine.steps[index] }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(spacing: Metric.Space.s) { content }
                    .frame(maxWidth: 520)
                    .padding(.horizontal, Metric.gutter)
                    .padding(.vertical, 32)
                    .containerRelativeFrame(.horizontal)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            // Re-keyed per step, so the entrance replays and a tall step opens at its top.
            .id(step.id)

            footer
        }
        .background(Palette.canvas.ignoresSafeArea())
        .keyboardDismissBar()
        .signingInOverlay()
        .onAppear { arrive(at: index) }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if signedIn, step.kind == .account { onFinish() }
        }
    }

    // MARK: - Chrome

    /// The wordmark, and on its right the language on the first screen and the progress on
    /// every other. The row is one height either way, so nothing below it moves.
    private var header: some View {
        HStack(spacing: 24) {
            HStack(spacing: Metric.Space.xs) {
                Image("AppMark")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 26)
                Text(verbatim: "Appname")
                    .font(Typeface.wordmark(17))
                    .tracking(-0.17)
                    .foregroundStyle(Palette.ink)
            }
            .accessibilityElement(children: .combine)

            if index == 0 {
                Spacer(minLength: 0)
                languagePicker
            } else {
                FunnelProgress(index: index, count: spine.surveyLength, label: copy.chrome.progress)
            }
        }
        .frame(height: Metric.tapTarget)
        .padding(.horizontal, Metric.gutter)
        .padding(.vertical, 6)
    }

    /// The language in its own name — "Русский", not "Russian", because the person reaching
    /// for this is the one who cannot read the current one.
    private var languagePicker: some View {
        Menu {
            ForEach(InterfaceLanguage.supported, id: \.self) { tag in
                Button(InterfaceLanguage.displayName(tag)) { select(language: tag) }
            }
        } label: {
            HStack(spacing: 6) {
                Text(InterfaceLanguage.displayName(language))
                    .font(Typeface.ui(14, .medium, relativeTo: .subheadline))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                Glyph.caret()
            }
            .padding(.horizontal, 14)
            .frame(height: 36)
            .ghostCapsule()
            .frame(height: Metric.tapTarget)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    /// The same height on every step: the button's slot is kept even where the step owns its
    /// action, so the column above never re-centres between two taps.
    private var footer: some View {
        VStack(spacing: 0) {
            Group {
                if index == 0 {
                    Button {
                        Haptics.tap()
                        onSignIn()
                    } label: {
                        Text(verbatim: copy.account.haveAccount)
                            .font(Typeface.ui(15, .medium, relativeTo: .subheadline))
                            .foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                } else if !ownsItsAction {
                    PrimaryButton(
                        verbatim: step.kind == .recap ? copy.chrome.letsGo : copy.chrome.continue,
                        enabled: !waiting
                    ) { advance() }
                }
            }
            .frame(maxWidth: 420)
            .frame(height: Metric.primaryButton)

            Group {
                if index == 0 {
                    Text(verbatim: copy.chrome.intro)
                } else {
                    Button {
                        Haptics.tap()
                        arrive(at: index - 1)
                    } label: {
                        Text(verbatim: copy.chrome.back)
                            .frame(minWidth: 88, maxHeight: .infinity)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
            .font(Typeface.ui(14, .regular, relativeTo: .subheadline))
            .foregroundStyle(Palette.muted)
            .frame(height: Metric.tapTarget)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Metric.gutter)
        .padding(.bottom, Metric.Space.xs)
    }

    /// A single answer advances on the option, and the account step has the providers — a
    /// Continue beside either is two buttons competing for one tap.
    private var ownsItsAction: Bool {
        switch step.kind {
        case .account: true
        case .question: step.question?.multi != true
        default: false
        }
    }

    /// Nothing chosen yet on a question that takes several: a button that silently does
    /// nothing is worse than one that says so.
    private var waiting: Bool {
        guard let question = step.question, question.multi == true else { return false }
        return answers[question.key]?.isEmpty ?? true
    }

    // MARK: - Steps

    @ViewBuilder
    private var content: some View {
        switch step.kind {
        case .question:
            if let question = step.question, let words = copy.questions[question.key] {
                FunnelQuestion(
                    question: question,
                    words: words,
                    answer: answers[question.key],
                    separator: spine.separator
                ) { pick($0, for: question) }
            }
        case .account:
            FunnelAccount(
                words: copy.statement(for: step, answers: answers),
                plan: copy.problemFix(answers: answers)
            )
        case .recap:
            FunnelRecap(
                headline: copy.steps[step.id]?.headline ?? "",
                lines: copy.recapLines(answers: answers, spine: spine, limit: 5),
                recap: copy.recap
            )
        case .statement:
            FunnelStatement(words: copy.statement(for: step, answers: answers))
        }
    }

    // MARK: - Flow

    /// Picking an answer *is* the continue on a single-answer question — an extra tap per
    /// question is another chance to leave. The target is taken now, so a second tap in the
    /// pause lands on the same step rather than skipping one.
    private func pick(_ value: String, for question: FunnelContent.Step.Question) {
        answers[question.key] = value
        Analytics.shared.track(.funnelAnswered(question: question.key, answer: value))
        guard question.multi != true else { return }
        let next = index + 1
        Task {
            try? await Task.sleep(for: .milliseconds(180))
            arrive(at: next)
        }
    }

    private func advance() {
        if step.kind == .recap { Analytics.shared.track(.funnelCompleted(answers: answers)) }
        arrive(at: index + 1)
    }

    /// Every step is reported once, because the question the numbers answer is *which* step
    /// loses people.
    private func arrive(at next: Int) {
        guard spine.steps.indices.contains(next) else { return }
        let target = spine.steps[next]
        if seen.insert(target.id).inserted {
            Analytics.shared.track(.funnelPageViewed(index: next, kind: target.kind.rawValue, step: target.id))
        }
        index = next
        // Somebody already signed in has nothing to do here.
        if target.kind == .account, auth.isSignedIn { onFinish() }
    }

    private func select(language tag: String) {
        guard tag != language else { return }
        Haptics.tap()
        InterfaceLanguage.select(tag)
        Analytics.shared.track(.settingsChanged(field: "language"))
    }
}

/// A bar and a fraction in the header's right-hand corner. The width is eased — the first
/// answer is worth about a sixth of the bar, the last few a sliver each — but the value read
/// aloud is the true step, never the flattering one. `ProgressBar` in `FunnelChrome.tsx`.
private struct FunnelProgress: View {
    let index: Int
    let count: Int
    let label: String

    var body: some View {
        let step = min(index + 1, count)
        HStack(spacing: 10) {
            Spacer(minLength: 0)
            Capsule()
                .fill(Palette.track)
                .overlay(alignment: .leading) {
                    GeometryReader { geometry in
                        Capsule()
                            .fill(Palette.accent)
                            .frame(width: geometry.size.width * Self.fraction(index: index, count: count))
                    }
                }
                .frame(maxWidth: 192)
                .frame(height: 4)
                .layoutPriority(1)
            Text(verbatim: "\(step)/\(count)")
                .font(Typeface.mono(12, .medium, relativeTo: .caption))
                .monospacedDigit()
                .foregroundStyle(Palette.muted)
        }
        .animation(.easeOut(duration: 0.5), value: index)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: label))
        .accessibilityValue(Text(verbatim: "\(step)/\(count)"))
    }

    /// Never empty, monotonic, and exactly 1 on the last step.
    private static func fraction(index: Int, count: Int) -> CGFloat {
        guard count > 1 else { return 1 }
        let position = Double(min(max(index, 0), count - 1)) / Double(count - 1)
        return 0.04 + 0.96 * pow(position, 0.7)
    }
}
