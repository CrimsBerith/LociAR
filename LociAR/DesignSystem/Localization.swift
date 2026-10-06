import Foundation

extension String {
    /// UI text that travels as a `String` (status and error messages, component titles, enum
    /// labels) is looked up in Localizable.xcstrings when it is shown. Catalog keys are the Turkish
    /// source texts, so a message set anywhere in the app is translated at the view; text without
    /// a catalog entry (user content, already formatted values) is shown unchanged.
    nonisolated var localizedUI: String {
        Bundle.main.localizedString(forKey: self, value: self, table: nil)
    }
}
