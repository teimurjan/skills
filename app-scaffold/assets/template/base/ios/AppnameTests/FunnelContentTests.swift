import Foundation
import Testing
@testable import Appname

/// `Funnel.json` is generated from the web's decks and decoded on the first launch; a file
/// that no longer matches `FunnelContent` is a first run that cannot start.
struct FunnelContentTests {
    @Test func everyShippedLanguageHasADeck() {
        let decks = FunnelContent.bundled.decks
        #expect(InterfaceLanguage.supported.filter { decks[$0] == nil }.isEmpty)
    }

    @Test func everyQuestionIsWordedInEveryDeck() {
        let content = FunnelContent.bundled
        for (language, copy) in content.decks {
            for question in content.spine.steps.compactMap(\.question) {
                let words = copy.questions[question.key]
                #expect(words != nil, "\(language) has no words for \(question.key)")
                #expect(question.options.allSatisfy { words?.options[$0.value] != nil }, "\(language): \(question.key)")
            }
        }
    }

    /// Answers every question with its first option that has a recap line.
    @Test func theRecapLeadsWithTheProblemAndStaysWithinItsLimit() {
        let content = FunnelContent.bundled
        let copy = content.copy(for: "en")
        var answers: [String: String] = [:]
        for question in content.spine.steps.compactMap(\.question) {
            let recap = copy.questions[question.key]?.recap ?? [:]
            answers[question.key] = question.options.first { recap[$0.value] != nil }?.value
        }
        let lines = copy.recapLines(answers: answers, spine: content.spine, limit: 3)
        #expect(lines.count <= 3)
        if answers["problem"] != nil { #expect(lines.first?.key == "problem") }
    }
}
