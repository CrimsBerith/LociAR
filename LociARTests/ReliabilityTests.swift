import Foundation
import XCTest
@testable import LociAR

final class ReliabilityTests: XCTestCase {
    // MARK: ResumeOnce (ARCore callback vs. timeout vs. cancellation)

    func testResumeBeforeAttachIsDeliveredOnAttach() async {
        let once = ResumeOnce<String>()
        once.resume("early")
        let value: String? = await withCheckedContinuation { once.attach($0) }
        XCTAssertEqual(value, "early")
    }

    func testOnlyTheFirstResumeWins() async {
        let once = ResumeOnce<Int>()
        let value: Int? = await withCheckedContinuation { continuation in
            once.attach(continuation)
            once.resume(1)
            once.resume(2)
            once.resume(nil)
        }
        XCTAssertEqual(value, 1)
    }

    func testOnResumeRunsExactlyOnceEvenWhenSetLate() async {
        let counter = Counter()
        let once = ResumeOnce<Int>()
        once.setOnResume { counter.increment() }
        let value: Int? = await withCheckedContinuation { continuation in
            once.attach(continuation)
            once.resume(nil)
            once.resume(7)
        }
        XCTAssertNil(value)
        XCTAssertEqual(counter.value, 1)

        // A side effect registered after the resume runs at once.
        once.setOnResume { counter.increment() }
        XCTAssertEqual(counter.value, 2)
    }

    // MARK: PinCommitCoordinator

    @MainActor
    func testApproximateAndPreviewPinsNeedNoPersistence() async {
        let engine = ARPinningEngine()
        let arcore = ARCoreService(callables: nil)
        var statuses: [String?] = []

        let approximate = Self.anchor(quality: .freeSpaceApproximate)
        let outcome = await PinCommitCoordinator.commit(
            approximate, engine: engine, arcore: arcore, isOnline: true, isLocalPreview: false
        ) { statuses.append($0) }
        XCTAssertEqual(outcome, .committed)

        let preview = await PinCommitCoordinator.commit(
            Self.anchor(quality: .planeGeometry), engine: engine, arcore: arcore, isOnline: true, isLocalPreview: true
        ) { statuses.append($0) }
        XCTAssertEqual(preview, .committed)
        XCTAssertTrue(statuses.isEmpty, "nothing to save, so no saving banner")
    }

    @MainActor
    func testAlreadyPersistedPinIsNotSavedAgain() async {
        var anchor = Self.anchor(quality: .planeGeometry)
        var persistence = WorldLockPersistence(originalNativeAnchorId: anchor.id, hostedAt: Date())
        persistence.kind = .arcoreCloudAnchor
        persistence.cloudAnchorId = "ua-test"
        anchor.persistence = persistence
        var statuses: [String?] = []
        let outcome = await PinCommitCoordinator.commit(
            anchor, engine: ARPinningEngine(), arcore: ARCoreService(callables: nil), isOnline: true, isLocalPreview: false
        ) { statuses.append($0) }
        XCTAssertEqual(outcome, .committed)
        XCTAssertTrue(statuses.isEmpty)
    }

    // MARK: Backend transient errors (functions/src/errors.ts reasons)

    func testUnavailableWithKnownReasonIsTransient() {
        // gRPC unavailable = 14
        let paused: [String: Any] = ["details": ["reason": "service_paused"]]
        let busy: [String: Any] = ["details": ["reason": "busy_retry"]]
        XCTAssertEqual(BackendErrorPolicy.transient(code: 14, userInfo: paused), .servicePaused)
        XCTAssertEqual(BackendErrorPolicy.transient(code: 14, userInfo: busy), .busy)
        XCTAssertNil(BackendErrorPolicy.transient(code: 14, userInfo: [:]))
        XCTAssertNil(BackendErrorPolicy.transient(code: 14, userInfo: ["details": ["reason": "other"]]))
        // Only `unavailable` carries these reasons; a permanent code stays permanent.
        XCTAssertNil(BackendErrorPolicy.transient(code: 9, userInfo: paused))
        XCTAssertNil(BackendErrorPolicy.map(code: 14, message: "paused", userInfo: paused))
    }

    func testTransientErrorsHaveReadableMessages() {
        for error in [BackendTransientError.servicePaused, .busy] {
            XCTAssertFalse((error.errorDescription ?? "").isEmpty)
        }
    }

    // MARK: Terms consent

    func testTermsConsentRequiresTheCurrentVersion() {
        let defaults = UserDefaults.standard
        let saved = defaults.string(forKey: TermsConsent.storageKey)
        defer { defaults.set(saved, forKey: TermsConsent.storageKey) }

        defaults.removeObject(forKey: TermsConsent.storageKey)
        XCTAssertFalse(TermsConsent.isAccepted)
        XCTAssertNil(TermsConsent.acceptedVersion)

        defaults.set("2020-01-01", forKey: TermsConsent.storageKey)
        XCTAssertFalse(TermsConsent.isAccepted, "a consent to older terms must be asked again")

        defaults.set(TermsConsent.currentVersion, forKey: TermsConsent.storageKey)
        XCTAssertTrue(TermsConsent.isAccepted)
        XCTAssertEqual(TermsConsent.acceptedVersion, TermsConsent.currentVersion)
    }

    func testTermsVersionIsAnISODate() {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        XCTAssertNotNil(formatter.date(from: TermsConsent.currentVersion))
    }

    // MARK: Localization

    /// Every shipped language has its own translation of the sign-in screen (catalog built by
    /// scripts/l10n/build_catalog.py), so a missing .lproj or catalog entry fails here.
    func testSignInTextsAreTranslatedInEveryLanguage() throws {
        let app = Bundle(for: AppContainer.self)
        let languages = ["tr", "en", "zh-Hans", "hi", "es", "fr", "ar", "bn", "pt", "ru", "de", "ja"]
        for language in languages {
            let path = try XCTUnwrap(app.path(forResource: language, ofType: "lproj"), "\(language).lproj missing")
            let bundle = try XCTUnwrap(Bundle(path: path))
            for key in ["Giriş yap", "Kayıt ol"] {
                let value = bundle.localizedString(forKey: key, value: "", table: "Localizable")
                XCTAssertFalse(value.isEmpty, "\(key) missing in \(language)")
                if language != "tr" { XCTAssertNotEqual(value, key, "\(key) untranslated in \(language)") }
            }
        }
    }

    // MARK: Helpers

    private static func anchor(quality: PinQuality) -> SurfaceAnchor {
        SurfaceAnchor(
            transform: Array(repeating: 0, count: 16), pinQuality: quality,
            hitSource: quality == .freeSpaceApproximate ? .frontOfCamera : .planeGeometry,
            surfaceAlignment: .horizontal, trackingQuality: .normal, worldMappingStatus: .mapped
        )
    }
}

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    var value: Int { lock.withLock { count } }
    func increment() { lock.withLock { count += 1 } }
}
