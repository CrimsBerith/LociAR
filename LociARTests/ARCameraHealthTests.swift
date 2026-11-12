import ARKit
import XCTest
@testable import LociAR

/// The camera feed watchdog decisions: no test here needs a camera.
final class ARCameraHealthTests: XCTestCase {
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    private func action(after seconds: TimeInterval, lastFrame: TimeInterval?, attempts: Int = 0) -> ARCameraHealth.Action {
        ARCameraHealth.action(
            now: start.addingTimeInterval(seconds),
            expectedSince: start,
            lastFrameAt: lastFrame.map(start.addingTimeInterval),
            attempts: attempts
        )
    }

    func testRecentFrameIsHealthy() {
        XCTAssertEqual(action(after: 10, lastFrame: 9.5), .healthy)
        XCTAssertEqual(action(after: 10, lastFrame: 9.5, attempts: 2), .healthy)
    }

    func testNewSessionGetsTimeForItsFirstFrame() {
        // A cold start (no rerun yet) keeps the longer deadline: a rerun during warm-up only delays the first frame.
        XCTAssertGreaterThan(ARCameraHealth.initialFrameDeadline, ARCameraHealth.firstFrameDeadline)
        XCTAssertEqual(action(after: 0.5, lastFrame: nil), .waiting)
        XCTAssertEqual(action(after: ARCameraHealth.firstFrameDeadline, lastFrame: nil), .waiting)
        XCTAssertEqual(action(after: ARCameraHealth.initialFrameDeadline - 0.1, lastFrame: nil), .waiting)
        XCTAssertEqual(action(after: ARCameraHealth.initialFrameDeadline, lastFrame: nil), .rerun)
    }

    func testRerunSessionUsesTheShorterFirstFrameDeadline() {
        XCTAssertEqual(action(after: ARCameraHealth.firstFrameDeadline - 0.1, lastFrame: nil, attempts: 1), .waiting)
        XCTAssertEqual(action(after: ARCameraHealth.firstFrameDeadline, lastFrame: nil, attempts: 1), .rerun)
    }

    func testFrameFromBeforeTheRestartDoesNotCountAsDelivered() {
        // The last frame belongs to the previous run: the restarted session still gets the first-frame deadline.
        XCTAssertEqual(action(after: 2.5, lastFrame: -30), .waiting)
        XCTAssertEqual(action(after: ARCameraHealth.initialFrameDeadline, lastFrame: -30), .rerun)
        XCTAssertEqual(action(after: ARCameraHealth.firstFrameDeadline - 0.1, lastFrame: -30, attempts: 1), .waiting)
        XCTAssertEqual(action(after: ARCameraHealth.firstFrameDeadline, lastFrame: -30, attempts: 1), .rerun)
    }

    func testRunningFeedThatStopsIsRerunAfterTheStallThreshold() {
        XCTAssertEqual(action(after: 20 + ARCameraHealth.stallThreshold - 0.1, lastFrame: 20), .healthy)
        XCTAssertEqual(action(after: 20 + ARCameraHealth.stallThreshold, lastFrame: 20), .rerun)
    }

    func testFeedFailsOnlyAfterEveryRecoveryAttempt() {
        for attempts in 0..<ARCameraHealth.maximumRecoveryAttempts {
            XCTAssertEqual(action(after: 60, lastFrame: nil, attempts: attempts), .rerun)
        }
        XCTAssertEqual(action(after: 60, lastFrame: nil, attempts: ARCameraHealth.maximumRecoveryAttempts), .fail)
    }

    func testOnlySensorAndTrackingFailuresAreRestarted() {
        let domain = ARError.errorDomain
        XCTAssertEqual(ARCameraHealth.failureKind(domain: domain, code: ARError.Code.cameraUnauthorized.rawValue), .cameraDenied)
        for code in [ARError.Code.sensorUnavailable, .sensorFailed, .worldTrackingFailed] {
            XCTAssertEqual(ARCameraHealth.failureKind(domain: domain, code: code.rawValue), .restartable)
        }
        XCTAssertEqual(ARCameraHealth.failureKind(domain: domain, code: ARError.Code.unsupportedConfiguration.rawValue), .fatal)
        XCTAssertEqual(ARCameraHealth.failureKind(domain: NSCocoaErrorDomain, code: ARError.Code.sensorFailed.rawValue), .fatal)
        XCTAssertEqual(ARCameraHealth.failureKind(domain: domain, code: -1), .fatal)
    }

    func testCriticallyHotDeviceDoesNotStartTheCamera() {
        XCTAssertFalse(ARCameraHealth.mayStartSession(thermalState: .critical))
        for state in [ProcessInfo.ThermalState.nominal, .fair, .serious] {
            XCTAssertTrue(ARCameraHealth.mayStartSession(thermalState: state))
        }
    }

    func testDarkFeedIsReportedOnlyAfterItStaysDark() {
        var detector = DarkCameraFeedDetector()
        XCTAssertFalse(detector.update(luma: 16, now: start))
        XCTAssertFalse(detector.update(luma: 18, now: start.addingTimeInterval(DarkCameraFeedDetector.minimumDuration - 0.5)))
        XCTAssertTrue(detector.update(luma: DarkCameraFeedDetector.darkLuma, now: start.addingTimeInterval(DarkCameraFeedDetector.minimumDuration)))
        // One brighter sample clears it, and the clock starts again.
        XCTAssertFalse(detector.update(luma: 90, now: start.addingTimeInterval(7)))
        XCTAssertFalse(detector.update(luma: 16, now: start.addingTimeInterval(8)))
        XCTAssertFalse(detector.update(luma: 16, now: start.addingTimeInterval(12)))
        XCTAssertTrue(detector.update(luma: 16, now: start.addingTimeInterval(13)))
        detector.reset()
        XCTAssertFalse(detector.update(luma: 16, now: start.addingTimeInterval(14)))
    }

    func testAverageLumaReadsTheLumaPlane() throws {
        var buffer: CVPixelBuffer?
        let attributes = [kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary] as CFDictionary
        XCTAssertEqual(
            CVPixelBufferCreate(kCFAllocatorDefault, 64, 48, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, attributes, &buffer),
            kCVReturnSuccess
        )
        let pixels = try XCTUnwrap(buffer)
        XCTAssertEqual(CVPixelBufferLockBaseAddress(pixels, []), kCVReturnSuccess)
        let base = try XCTUnwrap(CVPixelBufferGetBaseAddressOfPlane(pixels, 0))
        memset(base, 16, CVPixelBufferGetBytesPerRowOfPlane(pixels, 0) * CVPixelBufferGetHeightOfPlane(pixels, 0))
        CVPixelBufferUnlockBaseAddress(pixels, [])
        XCTAssertEqual(ARCameraHealth.averageLuma(pixels), 16)

        XCTAssertEqual(CVPixelBufferLockBaseAddress(pixels, []), kCVReturnSuccess)
        let bright = try XCTUnwrap(CVPixelBufferGetBaseAddressOfPlane(pixels, 0))
        memset(bright, 200, CVPixelBufferGetBytesPerRowOfPlane(pixels, 0) * CVPixelBufferGetHeightOfPlane(pixels, 0))
        CVPixelBufferUnlockBaseAddress(pixels, [])
        XCTAssertEqual(ARCameraHealth.averageLuma(pixels), 200)
    }

    @MainActor
    func testStoppedEngineReportsNoDarkFeedAndNoFrame() {
        let engine = ARPinningEngine()
        engine.stopSession()
        XCTAssertFalse(engine.isCameraFeedDark)
        XCTAssertFalse(engine.hasRecentCameraFrame)
        XCTAssertFalse(engine.isPausedForThermalPressure)
        XCTAssertEqual(engine.state, .idle)
    }
}
