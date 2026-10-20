import SwiftUI

/// The pieces every funnel step is built from — `Headline.tsx`, `StatementStep.tsx` and
/// `QuestionCard.tsx`. Each returns its parts as siblings rather than in a stack of its own,
/// because the step's entrance brings them in one after another.

/// A step's headline, centred, with its `[bracketed]` span marked in the accent.
struct FunnelHeadline: View {
    let text: String

    var body: some View {
        Text(FunnelCopy.accented(text))
            .font(Typeface.ui(29, .extrabold, relativeTo: .largeTitle))
            .tracking(-0.58)
            .foregroundStyle(Palette.ink)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, 32)
    }
}

struct FunnelBody: View {
    let text: String

    var body: some View {
        Text(verbatim: text)
            .font(Typeface.ui(16.5, .regular, relativeTo: .body))
            .lineSpacing(4)
            .foregroundStyle(Palette.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A count under a headline rather than a claim: small, centred, tucked up under it.
struct FunnelNote: View {
    let text: String

    var body: some View {
        Text(verbatim: text)
            .font(Typeface.ui(14, .regular, relativeTo: .subheadline))
            .foregroundStyle(Palette.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, -24)
    }
}

/// A statement step's headline, note and body. `parts` is how many it drew, so whatever
/// follows it in the step joins the entrance where it left off.
struct FunnelStatement: View {
    let words: FunnelCopy.StatementWords

    var parts: Int { [words.headline, words.note, words.body].compactMap { $0 }.count }

    var body: some View {
        if let headline = words.headline { FunnelHeadline(text: headline).funnelEntrance(0) }
        if let note = words.note { FunnelNote(text: note).funnelEntrance(1) }
        if let text = words.body { FunnelBody(text: text).funnelEntrance(parts - 1) }
    }
}

/// One question: the headline, the line under it, and its options. A single answer is the
/// continue; a question that takes several keeps the footer's button.
struct FunnelQuestion: View {
    let question: FunnelContent.Step.Question
    let words: FunnelCopy.QuestionWords
    let answer: String?
    let separator: String
    let onPick: (String) -> Void

    var body: some View {
        FunnelHeadline(text: words.headline).funnelEntrance(0)
        if let description = words.description { FunnelBody(text: description).funnelEntrance(1) }
        let first = words.description == nil ? 1 : 2
        ForEach(Array(question.options.enumerated()), id: \.element.value) { index, option in
            FunnelChoice(
                emoji: option.emoji,
                title: words.options[option.value] ?? option.value,
                selected: chosen.contains(option.value),
                multi: multi
            ) { pick(option.value) }
            .funnelEntrance(first + index)
        }
    }

    private var multi: Bool { question.multi ?? false }

    private var chosen: Set<String> {
        guard let answer else { return [] }
        return multi ? Set(answer.components(separatedBy: separator)) : [answer]
    }

    /// Joined in option order, not tap order, so the stored answer is stable.
    private func pick(_ value: String) {
        guard multi else { return onPick(value) }
        var next = chosen
        if next.remove(value) == nil { next.insert(value) }
        onPick(question.options.map(\.value).filter(next.contains).joined(separator: separator))
    }
}

/// One option, a paper card that turns ink when picked. Only the fill changes, so the rows
/// below stay where the thumb expects them.
private struct FunnelChoice: View {
    let emoji: String?
    let title: String
    let selected: Bool
    let multi: Bool
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: Metric.Space.m) {
                if let emoji {
                    Text(verbatim: emoji)
                        .font(.system(size: 19))
                        .accessibilityHidden(true)
                }
                Text(verbatim: title)
                    .font(Typeface.ui(17, .semibold, relativeTo: .body))
                    .foregroundStyle(selected ? Palette.onInk : Palette.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                FunnelTick(selected: selected, multi: multi)
            }
            .padding(.horizontal, Metric.cardPadding)
            .padding(.vertical, 16)
            .background(selected ? Palette.ink : Palette.surface, in: .rect(cornerRadius: Metric.Radius.card))
            .paperCard()
            .animation(.easeOut(duration: 0.15), value: selected)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A circle for one answer, a rounded square for several — the distinction a form makes.
/// Amber once picked, the highlight colour of an ink surface.
private struct FunnelTick: View {
    let selected: Bool
    let multi: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: multi ? 5 : 9)
        ZStack {
            shape.fill(selected ? Palette.amber : .clear)
            shape.strokeBorder(selected ? Palette.amber : Palette.chevron, lineWidth: 1.5)
            if selected {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Palette.ink)
            }
        }
        .frame(width: 18, height: 18)
        .frame(width: 20, height: 20)
        .accessibilityHidden(true)
    }
}

extension View {
    /// The step's entrance: each part scales up from its top edge a fraction of a second
    /// after the one above it — `.anim-step` in `app/globals.css`.
    func funnelEntrance(_ order: Int) -> some View {
        modifier(FunnelEntrance(order: order))
    }
}

private struct FunnelEntrance: ViewModifier {
    let order: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let visible = shown || reduceMotion
        content
            .opacity(visible ? 1 : 0)
            .scaleEffect(visible ? 1 : 0.9, anchor: .top)
            .onAppear {
                guard !reduceMotion else { return }
                let delay = 0.15 + 0.18 * Double(min(order, 9))
                withAnimation(.easeOut(duration: 0.3).delay(delay)) { shown = true }
            }
    }
}
