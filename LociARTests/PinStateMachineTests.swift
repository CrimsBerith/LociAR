import XCTest
@testable import LociAR

final class PinStateMachineTests: XCTestCase {
    func testPhysicalPinPath() {
        let path: [PinSessionState] = [.idle, .initializing, .coaching, .scanning, .candidateReady, .placing, .placed, .mapping, .publishReady]
        for pair in zip(path, path.dropFirst()) {
            XCTAssertTrue(pair.0.canTransition(to: pair.1), "\(pair.0) should transition to \(pair.1)")
        }
    }

    func testApproximateRequiresOfferState() {
        XCTAssertFalse(PinSessionState.scanning.canTransition(to: .placed))
        XCTAssertTrue(PinSessionState.scanning.canTransition(to: .approximateOffered))
        XCTAssertTrue(PinSessionState.approximateOffered.canTransition(to: .placed))
    }

    func testRelocalizedContentPath() {
        XCTAssertTrue(PinSessionState.placed.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.scanning.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.candidateReady.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.placing.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.approximateOffered.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.mapping.canTransition(to: .relocalizing))
        XCTAssertTrue(PinSessionState.relocalizing.canTransition(to: .resolved))
        XCTAssertFalse(PinSessionState.failed.canTransition(to: .scanning))
        XCTAssertTrue(PinSessionState.failed.canTransition(to: .initializing))
        XCTAssertTrue(PinSessionState.resolved.canTransition(to: .resolved))
    }

    func testWorldLockedContentDoesNotRequireVisualPatternMatch() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        guard FileManager.default.fileExists(atPath: root.appendingPathComponent("LociAR.xcodeproj").path) else {
            throw XCTSkip("Bu kaynak denetimi Mac üzerindeki dosya sistemini gerektirir.")
        }
        let engineSource = try? String(
            contentsOf: root.appendingPathComponent("LociAR/ARCore/ARPinningEngine.swift"),
            encoding: .utf8
        )
        let viewerSource = try? String(
            contentsOf: root.appendingPathComponent("LociAR/Features/AR/ARPostViewerView.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(engineSource?.contains("revealIfSurfaceReady") == true)
        XCTAssertTrue(engineSource?.contains("beginAimAssistedReveal") == true)
        XCTAssertTrue(viewerSource?.contains("ar-aim-guidance") == true)
        XCTAssertFalse(viewerSource?.contains("Yüzeye bağla") == true)
        XCTAssertFalse(viewerSource?.contains("Bu yüzeye bağla") == true)
        XCTAssertFalse(viewerSource?.contains("restoreWorldMap") == true)
    }
}
