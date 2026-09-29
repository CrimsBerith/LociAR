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

    func testFailedWorldMapSaveCanFallBackToApproximate() {
        // CreatePostView offers "Yaklaşık olarak devam et" after saveWorldMap fails in .mapping/.placed.
        XCTAssertTrue(PinSessionState.mapping.canTransition(to: .approximateOffered))
        XCTAssertTrue(PinSessionState.placed.canTransition(to: .approximateOffered))
        XCTAssertFalse(PinSessionState.publishReady.canTransition(to: .approximateOffered))
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
        // Multi-user world-map relocalization is attempted first, but a failed or timed-out
        // relocalization must always fall back to aim-assisted reveal, never block the post.
        XCTAssertTrue(viewerSource?.contains("if await relocalizeFromWorldMap() { return }\n                await revealWithAimGuidance()") == true)
    }
}
