import Foundation

/// How numbers reach the screen.
///
/// Everything here resolves against `InterfaceLanguage.locale`, not the device's. The two
/// can differ, and a figure set with one language's separators beside another language's
/// words is not a translation, it is a bug: a Russian reader expects `1 250,50`, and
/// `String(format:)` would hand them `1250.50`.
enum Format {
    /// `digits` is the fraction shown; zero is for a figure large enough that cents are noise.
    static func money(_ value: Decimal, currency: String = "USD", digits: Int = 2) -> String {
        let formatter = cached("money|\(currency)|\(digits)") { formatter in
            formatter.numberStyle = .currency
            formatter.currencyCode = currency
            formatter.minimumFractionDigits = digits
            formatter.maximumFractionDigits = digits
        }
        return formatter.string(from: value as NSDecimalNumber) ?? "—"
    }

    /// "A, B and C", in the reader's own conjunction.
    static func list(_ items: [String]) -> String {
        items.formatted(.list(type: .and).locale(InterfaceLanguage.locale))
    }

    /// The percent sign's spacing is the locale's business: English sets it tight, Russian
    /// sets a non-breaking space before it. Takes 12.5 for 12.5%, not 0.125.
    static func percent(_ value: Decimal, decimals: Int = 1) -> String {
        let formatter = cached("percent|\(decimals)") { formatter in
            formatter.numberStyle = .percent
            formatter.multiplier = 1
            formatter.minimumFractionDigits = decimals
            formatter.maximumFractionDigits = decimals
        }
        return formatter.string(from: value as NSDecimalNumber) ?? "—"
    }

    /// A bare number in the interface locale, for a unit string to interpolate.
    static func number(_ value: Decimal, digits: Int) -> String {
        let formatter = cached("decimal|\(digits)") { formatter in
            formatter.numberStyle = .decimal
            formatter.minimumFractionDigits = digits
            formatter.maximumFractionDigits = digits
        }
        return formatter.string(from: value as NSDecimalNumber) ?? "—"
    }

    /// One formatter per (language, shape). The language belongs in the key: a formatter
    /// built in English keeps English separators forever, and the interface language can
    /// change without the process restarting.
    private static func cached(_ shape: String, _ configure: (NumberFormatter) -> Void) -> NumberFormatter {
        let locale = InterfaceLanguage.locale
        let key = "\(locale.identifier)|\(shape)" as NSString
        if let hit = formatters.object(forKey: key) { return hit }
        let formatter = NumberFormatter()
        formatter.locale = locale
        configure(formatter)
        formatters.setObject(formatter, forKey: key)
        return formatter
    }

    private static let formatters = NSCache<NSString, NumberFormatter>()
}
