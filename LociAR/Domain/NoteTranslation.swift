import Foundation
import NaturalLanguage

enum NoteTranslationPreference {
    static let key = "lociar.notes.on-device-translation.v1"
}

struct NoteTranslationRequest: Equatable, Sendable {
    let original: String
    let targetLanguage: String

    init?(text: String, targetLanguage: String, isReadable: Bool) {
        guard isReadable, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.utf16.count <= 4_096, let language = Self.canonicalLanguage(targetLanguage) else { return nil }
        original = text
        self.targetLanguage = language
    }

    static func canonicalLanguage(_ identifier: String) -> String? {
        let language = Locale.Language(identifier: identifier)
        guard let code = language.languageCode?.identifier, code != "und", (2...3).contains(code.count) else { return nil }
        if code == "zh", let script = language.script?.identifier { return "zh-\(script)" }
        return code
    }

    static func appLanguage(preferredLocalizations: [String] = Bundle.main.preferredLocalizations) -> String {
        preferredLocalizations.compactMap(canonicalLanguage).first ?? "en"
    }

    var detectedSource: String? {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(original)
        guard let best = recognizer.languageHypotheses(withMaximum: 1).first, best.value >= 0.65 else { return nil }
        return Self.canonicalLanguage(best.key.rawValue)
    }

    var isAlreadyInTargetLanguage: Bool { detectedSource == targetLanguage }
}

/// View-lifetime state only. No note text, translation or location is written to a cache on disk.
/// A generation prevents a late completion from reviving an old/locked note or a previous language.
struct NoteTranslationState {
    private(set) var request: NoteTranslationRequest?
    private(set) var generation = UUID()
    private(set) var translatedText: String?
    private(set) var showsOriginal = false

    mutating func reset(to request: NoteTranslationRequest?) {
        self.request = request
        generation = UUID()
        translatedText = nil
        showsOriginal = false
    }

    @discardableResult
    mutating func accept(_ text: String, generation: UUID) -> Bool {
        guard self.generation == generation, request != nil,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        translatedText = text
        showsOriginal = false
        return true
    }

    mutating func toggleOriginal() { if translatedText != nil { showsOriginal.toggle() } }

    func displayedText(for current: NoteTranslationRequest) -> String {
        guard request == current, !showsOriginal, let translatedText else { return current.original }
        return translatedText
    }
}
