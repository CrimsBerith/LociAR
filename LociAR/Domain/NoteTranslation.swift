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

    /// Views ask this from `body` (the AR viewer re-renders on every engine/location change), so
    /// the language model runs once per note text, not once per render.
    var detectedSource: String? {
        let key = original as NSString
        if let cached = DetectedLanguageCache.shared.object(forKey: key) { return cached.language }
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(original)
        let language = recognizer.languageHypotheses(withMaximum: 1).first
            .flatMap { $0.value >= 0.65 ? Self.canonicalLanguage($0.key.rawValue) : nil }
        DetectedLanguageCache.shared.setObject(DetectedLanguage(language), forKey: key)
        return language
    }

    var isAlreadyInTargetLanguage: Bool { detectedSource == targetLanguage }
}

/// Text-only memo (no location, no account): NSCache is thread-safe and evicts under memory pressure.
private final class DetectedLanguage: NSObject {
    let language: String?
    init(_ language: String?) { self.language = language }
}

private enum DetectedLanguageCache {
    nonisolated(unsafe) static let shared: NSCache<NSString, DetectedLanguage> = {
        let cache = NSCache<NSString, DetectedLanguage>()
        cache.countLimit = 256
        return cache
    }()
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
