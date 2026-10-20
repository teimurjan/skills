import Foundation
import Testing
@testable import Appname

/// The one thing the wire and the disk have to agree on: what a `Date` looks like.
struct JSONCodingTests {
    private struct Stamp: Codable, Equatable {
        var at: Date
    }

    @Test func encodesInstantsAsISO8601WithFractionalSeconds() throws {
        let at = Date(timeIntervalSince1970: 1_788_000_000.123)
        let json = String(decoding: try JSONCoding.encoder.encode(Stamp(at: at)), as: UTF8.self)
        #expect(json == #"{"at":"2026-08-29T10:40:00.123Z"}"#)
    }

    @Test func roundTripsToTheMillisecond() throws {
        let original = Stamp(at: Date(timeIntervalSince1970: 1_788_000_000.456))
        let data = try JSONCoding.encoder.encode(original)
        let decoded = try JSONCoding.decoder.decode(Stamp.self, from: data)
        #expect(abs(decoded.at.timeIntervalSince(original.at)) < 0.001)
    }

    @Test(arguments: [
        ("2026-01-02T03:04:05.678Z", 1_767_323_045.678),
        ("2026-01-02T03:04:05Z", 1_767_323_045),
        ("2026-01-02", 1_767_312_000),
    ])
    func decodesEverySpellingTheServerUses(spelling: String, expected: TimeInterval) throws {
        let data = Data(#"{"at":"\#(spelling)"}"#.utf8)
        let decoded = try JSONCoding.decoder.decode(Stamp.self, from: data)
        #expect(abs(decoded.at.timeIntervalSince1970 - expected) < 0.001)
    }

    /// What a bare `JSONEncoder()` writes: seconds since 2001. A file in that form is still readable.
    @Test func readsTheLegacyNumberOffDisk() throws {
        let data = Data(#"{"at":810057254.696056}"#.utf8)
        let decoded = try JSONCoding.decoder.decode(Stamp.self, from: data)
        #expect(abs(decoded.at.timeIntervalSinceReferenceDate - 810_057_254.696056) < 0.001)
    }

    @Test func refusesWhatIsNeitherAnInstantNorANumber() {
        let data = Data(#"{"at":"yesterday"}"#.utf8)
        #expect(throws: DecodingError.self) {
            try JSONCoding.decoder.decode(Stamp.self, from: data)
        }
    }
}
