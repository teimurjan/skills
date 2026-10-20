import SwiftUI

/// The web funnel, as the phone reads it: `components/funnel/steps.ts` for the shape and
/// `components/funnel/copy/<tag>.ts` for the words, written into `Funnel.json` by
/// `bun run funnel:export-ios`. Never edited by hand — the file exists so the two funnels cannot
/// drift, and a question reworded on one side only is exactly that drift.
struct FunnelContent: Decodable {
    let spine: Spine
    let decks: [String: FunnelCopy]

    /// A bundled file that does not decode is a build that skipped the generator, caught by
    /// `FunnelContentTests` before it ships rather than handled here.
    static let bundled: FunnelContent = {
        guard let url = Bundle.main.url(forResource: "Funnel", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let content = try? JSONDecoder().decode(FunnelContent.self, from: data),
              content.decks["en"] != nil
        else { preconditionFailure("Funnel.json is missing or stale — run `bun run funnel:export-ios`") }
        return content
    }()

    /// The deck in the interface language, English where there is none.
    func copy(for language: String = InterfaceLanguage.current) -> FunnelCopy {
        decks[language] ?? decks["en"]!
    }

    struct Spine: Decodable {
        /// Up to and including the account step. The offer is `PaywallScreen`.
        let steps: [Step]
        /// What the progress counter counts: everything up to the recap.
        let surveyLength: Int
        /// The question each problem is the short form of, pinned into the recap beside it.
        let followUp: [String: String]
        /// Joins the answers of a question that takes several.
        let separator: String
    }

    struct Step: Decodable {
        let id: String
        let kind: Kind
        let question: Question?
        /// Reads differently by an earlier answer — the variant under that answer overlays the
        /// step's own copy line by line.
        let branch: Branch?

        enum Kind: String, Decodable {
            case question, statement, recap, account
        }

        struct Question: Decodable {
            /// Never translated: it names the answer in analytics.
            let key: String
            let multi: Bool?
            let options: [Option]
        }

        struct Option: Decodable {
            let value: String
            let emoji: String?
        }

        struct Branch: Decodable {
            let on: String
        }
    }
}

/// Every word the funnel says, in one language — the web deck's shape, cut to what the phone
/// draws.
struct FunnelCopy: Decodable {
    let chrome: Chrome
    let questions: [String: QuestionWords]
    let steps: [String: StatementWords]
    let recap: Recap
    let paywall: Paywall
    let account: Account

    struct Chrome: Decodable {
        let `continue`: String
        let letsGo: String
        let intro: String
        let back: String
        let progress: String
    }

    struct QuestionWords: Decodable {
        let headline: String
        let description: String?
        let options: [String: String]
        /// Answer → the line the recap reads back. No entry, no line.
        let recap: [String: String]?
    }

    struct StatementWords: Decodable {
        let headline: String?
        let body: String?
        let note: String?
        let variants: [String: StatementWords]?
    }

    struct Recap: Decodable {
        let closing: String
        let answers: [String]
    }

    struct Paywall: Decodable {
        let pros: [String]
        let monthly: String
        let yearly: String
        let lifetime: String
        let perMonth: String
        let perYear: String
        let perDay: String
        let once: String
        let cancelAnytime: String
        let billedYearly: String
        let save: String
        let forever: String
        let weekly: String
        let `continue`: String
    }

    struct Account: Decodable {
        let signIn: String
        let haveAccount: String
        /// Problem → the line of the plan that answers it, ticked on the account step.
        let fix: [String: String]
    }
}

// MARK: - Reading a deck

extension FunnelCopy {
    /// A statement step's words for this reader: the variant under their answer laid over the
    /// step's own, line by line.
    func statement(for step: FunnelContent.Step, answers: [String: String]) -> StatementWords {
        let own = steps[step.id]
        let variant = step.branch.flatMap { answers[$0.on] }.flatMap { own?.variants?[$0] }
        return StatementWords(
            headline: variant?.headline ?? own?.headline,
            body: variant?.body ?? own?.body,
            note: variant?.note ?? own?.note,
            variants: nil
        )
    }

    /// `{name}` filled in. A name with no value is left showing, so a typo in a deck is
    /// visible rather than silently blank.
    static func fill(_ template: String, _ values: [String: String]) -> String {
        values.reduce(template) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
    }

    /// `fill`, for a value set in its own face — a figure in mono inside a sentence whose word
    /// order is the language's.
    static func fill(_ template: String, _ name: String, with value: AttributedString) -> AttributedString {
        let parts = template.components(separatedBy: "{\(name)}")
        var out = AttributedString(parts[0])
        for part in parts.dropFirst() {
            out += value
            out += AttributedString(part)
        }
        return out
    }

    /// `[bracketed]` spans marked with an accent highlighter on paper, or in amber on ink.
    /// The accent as a text colour is too faint to read on paper.
    static func accented(_ text: String, onInk: Bool = false) -> AttributedString {
        text.components(separatedBy: "[").enumerated().reduce(into: AttributedString()) { out, entry in
            guard entry.offset > 0, let close = entry.element.firstIndex(of: "]") else {
                out += AttributedString(entry.element)
                return
            }
            var span = AttributedString(String(entry.element[..<close]))
            if onInk {
                span.foregroundColor = Palette.amber
            } else {
                span.backgroundColor = Palette.accent.opacity(0.45)
            }
            out += span
            out += AttributedString(String(entry.element[entry.element.index(after: close)...]))
        }
    }

    /// The account step's card: the problem the reader named and the line of the plan that
    /// answers it. Nil for an answer that names no problem. `problemFix` in `steps.ts`.
    func problemFix(answers: [String: String]) -> (problem: String, fix: String)? {
        guard let answer = answers["problem"],
              let problem = questions["problem"]?.recap?[answer],
              let fix = account.fix[answer] else { return nil }
        return (problem, fix)
    }

    /// The lines the recap reads back, in step order and capped — except the problem's line
    /// and its follow-up's, which survive whatever the cap. The problem's goes first: the
    /// recap draws the first card in red, and it has to be theirs. `recapLines` in `steps.ts`.
    func recapLines(
        answers: [String: String],
        spine: FunnelContent.Spine,
        limit: Int
    ) -> [(key: String, line: String)] {
        let problem = "problem"
        let all = spine.steps.compactMap { step -> (key: String, line: String)? in
            guard let key = step.question?.key,
                  let answer = answers[key],
                  let line = questions[key]?.recap?[answer] else { return nil }
            return (key, line)
        }
        let pinned: Set<String> = [problem, answers[problem].flatMap { spine.followUp[$0] } ?? ""]
        let kept = all.filter { pinned.contains($0.key) }
        let rest = all.filter { !pinned.contains($0.key) }.prefix(max(0, limit - kept.count))
        let keep = Set(kept.map(\.key) + rest.map(\.key))
        let lines = all.filter { keep.contains($0.key) }
        return lines.filter { $0.key == problem } + lines.filter { $0.key != problem }
    }
}
