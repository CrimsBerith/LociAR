import XCTest
@testable import LociAR

final class NoteTranslationTests: XCTestCase {
    func testOnlyReadableNonemptyBoundedTextCanBeTranslated() {
        XCTAssertNil(NoteTranslationRequest(text: "Private note", targetLanguage: "en", isReadable: false))
        XCTAssertNil(NoteTranslationRequest(text: " \n ", targetLanguage: "en", isReadable: true))
        XCTAssertNil(NoteTranslationRequest(text: String(repeating: "a", count: 4_097), targetLanguage: "en", isReadable: true))
        XCTAssertNil(NoteTranslationRequest(text: "Note", targetLanguage: "und", isReadable: true))
    }

    func testAppLanguageKeepsScriptsAndDoesNotReplaceUnsupportedLanguages() {
        XCTAssertEqual(NoteTranslationRequest.appLanguage(preferredLocalizations: ["en-GB"]), "en")
        XCTAssertEqual(NoteTranslationRequest.appLanguage(preferredLocalizations: ["pt-BR"]), "pt")
        XCTAssertEqual(NoteTranslationRequest.appLanguage(preferredLocalizations: ["zh-Hans"]), "zh-Hans")
        XCTAssertEqual(NoteTranslationRequest.appLanguage(preferredLocalizations: ["zh-Hant"]), "zh-Hant")
        XCTAssertEqual(NoteTranslationRequest.appLanguage(preferredLocalizations: ["bn"]), "bn")
        XCTAssertEqual(NoteTranslationRequest.appLanguage(preferredLocalizations: ["Base"]), "en")
    }

    func testTranslationNeverReplacesTheOriginalAndCanBeToggled() throws {
        let request = try XCTUnwrap(NoteTranslationRequest(text: "  Gün batımında gel.\n", targetLanguage: "en", isReadable: true))
        var state = NoteTranslationState()
        state.reset(to: request)
        XCTAssertTrue(state.accept("Come at sunset.", generation: state.generation))
        XCTAssertEqual(state.displayedText(for: request), "Come at sunset.")
        state.toggleOriginal()
        XCTAssertEqual(state.displayedText(for: request), "  Gün batımında gel.\n")
        state.toggleOriginal()
        XCTAssertEqual(state.displayedText(for: request), "Come at sunset.")
        XCTAssertEqual(request.original, "  Gün batımında gel.\n")
    }

    func testLockOrDisappearDiscardsLateCompletion() throws {
        let request = try XCTUnwrap(NoteTranslationRequest(text: "Private note", targetLanguage: "tr", isReadable: true))
        var state = NoteTranslationState()
        state.reset(to: request)
        let previous = state.generation
        state.reset(to: nil)
        XCTAssertFalse(state.accept("Late private translation", generation: previous))
        XCTAssertNil(state.translatedText)
        XCTAssertNil(state.request)
        // Unlocking the same note must not accept a completion from its previous visit.
        state.reset(to: request)
        XCTAssertFalse(state.accept("Late private translation", generation: previous))
    }

    func testChangedNoteOrTargetCannotShowPreviousTranslation() throws {
        let first = try XCTUnwrap(NoteTranslationRequest(text: "First note", targetLanguage: "tr", isReadable: true))
        let second = try XCTUnwrap(NoteTranslationRequest(text: "Second note", targetLanguage: "tr", isReadable: true))
        let otherLanguage = try XCTUnwrap(NoteTranslationRequest(text: "First note", targetLanguage: "de", isReadable: true))
        var state = NoteTranslationState()
        state.reset(to: first)
        let previous = state.generation
        XCTAssertTrue(state.accept("İlk not", generation: previous))
        XCTAssertEqual(state.displayedText(for: second), second.original)
        XCTAssertEqual(state.displayedText(for: otherLanguage), otherLanguage.original)
        state.reset(to: otherLanguage)
        XCTAssertFalse(state.accept("İlk not", generation: previous))
        XCTAssertEqual(state.displayedText(for: otherLanguage), otherLanguage.original)
    }

    func testEmptyResultLeavesOriginalVisible() throws {
        let request = try XCTUnwrap(NoteTranslationRequest(text: "Original note", targetLanguage: "tr", isReadable: true))
        var state = NoteTranslationState()
        state.reset(to: request)
        XCTAssertFalse(state.accept(" \n", generation: state.generation))
        state.toggleOriginal()
        XCTAssertEqual(state.displayedText(for: request), request.original)
    }

    func testConfidentSameLanguageTextDoesNotNeedTranslation() throws {
        let request = try XCTUnwrap(NoteTranslationRequest(text: "The sunset is beautiful here. Walk along the waterfront to see the boats and enjoy the evening.", targetLanguage: "en", isReadable: true))
        XCTAssertTrue(request.isAlreadyInTargetLanguage)
    }
}
