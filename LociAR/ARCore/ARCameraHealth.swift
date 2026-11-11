import ARKit
import CoreVideo
import Foundation

/// Pure decisions that keep the AR camera feed from staying black or frozen without an explanation.
/// `ARPinningEngine` owns the session; everything here is testable without a camera.
enum ARCameraHealth {
    /// How long a (re)started session may take to deliver its first frame before it is run again.
    nonisolated static let firstFrameDeadline: TimeInterval = 3
    /// A running feed that delivers no frame for this long is treated as stalled.
    nonisolated static let stallThreshold: TimeInterval = 2
    /// Times the session is run again before the feed is reported as failed.
    nonisolated static let maximumRecoveryAttempts = 2
    nonisolated static let watchdogInterval: Duration = .milliseconds(500)

    enum Action: Equatable, Sendable {
        /// A frame arrived recently.
        case healthy
        /// No recent frame yet, but the session is still within its deadline.
        case waiting
        /// Run the session again with the same configuration.
        case rerun
        /// Recovery did not help: pause the session and tell the user.
        case fail
    }

    /// - Parameters:
    ///   - expectedSince: when frames were last expected to start (session start, resume or rerun).
    ///   - lastFrameAt: when the latest frame arrived, if any.
    ///   - attempts: reruns already made since the feed was last healthy.
    nonisolated static func action(now: Date, expectedSince: Date, lastFrameAt: Date?, attempts: Int) -> Action {
        if let lastFrameAt, now.timeIntervalSince(lastFrameAt) < stallThreshold { return .healthy }
        let deliveredSinceExpected = lastFrameAt.map { $0 >= expectedSince } ?? false
        let base = deliveredSinceExpected ? (lastFrameAt ?? expectedSince) : expectedSince
        let limit = deliveredSinceExpected ? stallThreshold : firstFrameDeadline
        if now.timeIntervalSince(base) < limit { return .waiting }
        return attempts < maximumRecoveryAttempts ? .rerun : .fail
    }

    enum FailureKind: Equatable, Sendable {
        /// Camera access was revoked or never granted.
        case cameraDenied
        /// A sensor or tracking failure that a fresh session usually clears.
        case restartable
        case fatal
    }

    nonisolated static func failureKind(domain: String, code: Int) -> FailureKind {
        guard domain == ARError.errorDomain, let arCode = ARError.Code(rawValue: code) else { return .fatal }
        switch arCode {
        case .cameraUnauthorized: return .cameraDenied
        case .sensorUnavailable, .sensorFailed, .worldTrackingFailed: return .restartable
        default: return .fatal
        }
    }

    /// A critically hot device must not start the camera; the thermal observer resumes it later.
    nonisolated static func mayStartSession(thermalState: ProcessInfo.ThermalState) -> Bool {
        thermalState != .critical
    }

    /// Average brightness (0–255) of a 16×16 grid over the luma plane. Reads 256 bytes and keeps
    /// nothing; nil when the buffer has no readable luma plane.
    nonisolated static func averageLuma(_ buffer: CVPixelBuffer) -> Int? {
        guard CVPixelBufferGetPlaneCount(buffer) > 0,
              CVPixelBufferLockBaseAddress(buffer, .readOnly) == kCVReturnSuccess else { return nil }
        defer { _ = CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(buffer, 0) else { return nil }
        let width = CVPixelBufferGetWidthOfPlane(buffer, 0)
        let height = CVPixelBufferGetHeightOfPlane(buffer, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
        guard width > 0, height > 0, stride >= width else { return nil }
        let pixels = base.assumingMemoryBound(to: UInt8.self)
        var total = 0
        for row in 0..<16 {
            let y = min(height - 1, (row * 2 + 1) * height / 32)
            for column in 0..<16 {
                let x = min(width - 1, (column * 2 + 1) * width / 32)
                total += Int(pixels[y * stride + x])
            }
        }
        return total / 256
    }
}

/// Reports a camera that delivers frames but only black ones (covered lens, failed sensor, no light).
struct DarkCameraFeedDetector: Sendable {
    /// Video-range luma is 16 for pure black; a covered lens stays at or just above it.
    nonisolated static let darkLuma = 20
    nonisolated static let minimumDuration: TimeInterval = 5
    private var darkSince: Date?

    init() {}

    /// Returns true once the feed has been dark for `minimumDuration` without a brighter sample.
    mutating func update(luma: Int, now: Date) -> Bool {
        guard luma <= Self.darkLuma else {
            darkSince = nil
            return false
        }
        let since = darkSince ?? now
        darkSince = since
        return now.timeIntervalSince(since) >= Self.minimumDuration
    }

    mutating func reset() { darkSince = nil }
}
