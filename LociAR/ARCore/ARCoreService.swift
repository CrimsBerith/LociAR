import ARKit
import CoreLocation
import Foundation
import Observation
import OSLog
@preconcurrency import ARCoreCloudAnchors
@preconcurrency import ARCoreGARSession
@preconcurrency import ARCoreGeospatial

/// Google ARCore on top of the app's existing ARKit session: `ARPinningEngine` forwards every
/// ARFrame here and ARCore adds Geospatial (VPS) localization and Cloud Anchors. There is no second
/// camera session. Authorization is keyless: a one-hour token from the `getArcoreToken` callable,
/// refreshed before it expires; no Google credential ships in the app.
@MainActor
@Observable
final class ARCoreService {
    enum Availability: Equatable {
        case notStarted
        case unavailable(String)
        case running(geospatial: Bool)
    }

    private(set) var availability: Availability = .notStarted
    /// Earth is tracking and localized; accuracy values are meters / degrees.
    private(set) var isEarthTracking = false
    private(set) var horizontalAccuracy: Double?
    private(set) var yawAccuracy: Double?
    private(set) var lastError: String?

    @ObservationIgnored private var session: GARSession?
    @ObservationIgnored private let callables: CallableClient?
    @ObservationIgnored private var tokenExpiry: Date?
    @ObservationIgnored private var tokenTask: Task<Void, Never>?
    @ObservationIgnored private var lastPublish = Date.distantPast
    @ObservationIgnored private let logger = Logger(subsystem: "com.khankartal.lociar", category: "arcore")

    /// Refresh this long before the token's one-hour expiry.
    nonisolated static let tokenRefreshMargin: TimeInterval = 5 * 60

    init(callables: CallableClient?) {
        self.callables = callables
    }

    /// False in previews, UI tests and emulator builds, where ARCore never starts.
    var isEnabled: Bool { callables != nil }

    /// Latest ARCore frame (nil until ARKit frames flow and ARCore started).
    @ObservationIgnored private(set) var latestFrame: GARFrame?

    /// Called by ARPinningEngine on the main actor for every ARKit frame.
    func consume(_ frame: ARFrame) {
        guard callables != nil else { return }
        if session == nil { start() }
        guard let session else { return }
        refreshTokenIfNeeded()
        do {
            let garFrame = try session.update(frame)
            latestFrame = garFrame
            publishEarthState(garFrame)
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func start() {
        guard session == nil else { return }
        do {
            let created = try GARSession.session()
            let configuration = GARSessionConfiguration()
            configuration.cloudAnchorMode = .enabled
            let geospatialSupported = created.isGeospatialModeSupported(.enabled)
            if geospatialSupported { configuration.geospatialMode = .enabled }
            do {
                try created.setConfiguration(configuration)
                availability = .running(geospatial: geospatialSupported)
            } catch {
                // Geospatial needs precise location permission; keep Cloud Anchors without it.
                configuration.geospatialMode = .disabled
                try created.setConfiguration(configuration)
                availability = .running(geospatial: false)
                logger.info("Geospatial disabled: \(error.localizedDescription, privacy: .public)")
            }
            session = created
            refreshTokenIfNeeded()
        } catch {
            availability = .unavailable(error.localizedDescription)
            logger.error("ARCore session failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func refreshTokenIfNeeded() {
        guard tokenTask == nil, let callables else { return }
        if let tokenExpiry, tokenExpiry.timeIntervalSinceNow > Self.tokenRefreshMargin { return }
        tokenTask = Task { [weak self] in
            struct Response: Decodable, Sendable { let token: String; let expiresAt: Date }
            do {
                let response: Response = try await callables.call("getArcoreToken")
                guard let self else { return }
                self.session?.setAuthToken(response.token)
                self.tokenExpiry = response.expiresAt
                self.tokenTask = nil
            } catch {
                guard let self else { return }
                self.lastError = error.localizedDescription
                // Back off one minute before the next attempt.
                self.tokenExpiry = Date().addingTimeInterval(Self.tokenRefreshMargin + 60)
                self.tokenTask = nil
            }
        }
    }

    private func publishEarthState(_ frame: GARFrame) {
        let now = Date()
        guard now.timeIntervalSince(lastPublish) >= 0.5 else { return }
        lastPublish = now
        guard let earth = frame.earth, earth.earthState == .enabled else {
            if isEarthTracking { isEarthTracking = false }
            return
        }
        let tracking = earth.trackingState == .tracking
        if isEarthTracking != tracking { isEarthTracking = tracking }
        if let transform = earth.cameraGeospatialTransform {
            horizontalAccuracy = transform.horizontalAccuracy
            yawAccuracy = transform.orientationYawAccuracy
        }
    }

    /// VPS (Street View based) coverage at a coordinate; works anywhere, no need to be there.
    func vpsAvailability(at coordinate: CLLocationCoordinate2D) async -> String {
        if session == nil { start() }
        guard let session else { return "ARCore başlatılamadı" }
        refreshTokenIfNeeded()
        // The very first check can race the token fetch; wait for it briefly.
        for _ in 0..<50 where tokenExpiry == nil { try? await Task.sleep(for: .milliseconds(100)) }
        return await withCheckedContinuation { continuation in
            _ = session.checkVPSAvailability(coordinate: coordinate) { availability in
                continuation.resume(returning: Self.describe(availability))
            }
        }
    }

    // MARK: - Cloud Anchors

    /// Cloud Anchors live up to 365 days with keyless authorization.
    nonisolated static let cloudAnchorTTLDays = 365

    /// True once ARCore runs and holds a valid token (hosting/resolving needs both).
    var isReadyForCloudAnchors: Bool {
        guard session != nil, let tokenExpiry else { return false }
        return tokenExpiry.timeIntervalSinceNow > 60
    }

    /// Waits up to `timeout` for ARCore + token (the first ARKit frames start the session).
    func waitUntilReady(timeout: Duration = .seconds(8)) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while ContinuousClock.now < deadline {
            if isReadyForCloudAnchors { return true }
            try? await Task.sleep(for: .milliseconds(200))
        }
        return isReadyForCloudAnchors
    }

    /// Whether the last few seconds of camera motion describe the surface well enough to host.
    func isHostingQualitySufficient(for transform: simd_float4x4) -> Bool {
        guard let session, let quality = try? session.estimateFeatureMapQualityForHosting(transform) else { return false }
        return quality == .sufficient || quality == .good
    }

    /// Hosts `anchor` as a Cloud Anchor. Returns its identifier, or nil on failure/timeout
    /// (callers then fall back to the ARKit world map).
    func hostCloudAnchor(_ anchor: ARAnchor, timeout: Duration = .seconds(60)) async -> String? {
        guard let session, isReadyForCloudAnchors else { return nil }
        let result: String? = await withCheckedContinuation { continuation in
            let once = ResumeOnce<String>(continuation)
            do {
                let future = try session.hostCloudAnchor(anchor, ttlDays: Self.cloudAnchorTTLDays) { identifier, state in
                    once.resume(state == .success ? identifier : nil)
                }
                pendingFutures.append(future)
            } catch {
                once.resume(nil)
            }
            Task { try? await Task.sleep(for: timeout); once.resume(nil) }
        }
        pendingFutures.removeAll()
        if result == nil { logger.info("Cloud Anchor hosting failed or timed out") }
        return result
    }

    /// Resolves a hosted Cloud Anchor in the current ARKit world and returns its transform.
    func resolveCloudAnchor(_ identifier: String, timeout: Duration = .seconds(20)) async -> simd_float4x4? {
        guard let session, isReadyForCloudAnchors else { return nil }
        let result: simd_float4x4? = await withCheckedContinuation { continuation in
            let once = ResumeOnce<simd_float4x4>(continuation)
            do {
                let future = try session.resolveCloudAnchor(identifier) { anchor, state in
                    guard state == .success, let anchor, anchor.hasValidTransform else { once.resume(nil); return }
                    once.resume(anchor.transform)
                }
                pendingFutures.append(future)
            } catch {
                once.resume(nil)
            }
            Task { try? await Task.sleep(for: timeout); once.resume(nil) }
        }
        pendingFutures.removeAll()
        return result
    }

    /// Keeps async ARCore futures alive until their callbacks run.
    @ObservationIgnored private var pendingFutures: [NSObject] = []

    // MARK: - Geospatial

    /// Earth is localized well enough to geo-tag a pin (see GeospatialPose thresholds).
    var canGeoTag: Bool {
        guard isEarthTracking, let horizontalAccuracy, let yawAccuracy else { return false }
        return horizontalAccuracy <= GeospatialPose.maximumHorizontalAccuracy && yawAccuracy <= GeospatialPose.maximumYawAccuracy
    }

    /// Converts an ARKit world transform (e.g. the pin) to a precise geospatial pose.
    func geospatialPose(for transform: simd_float4x4) -> GeospatialPose? {
        guard canGeoTag, let session, let geo = try? session.geospatialTransform(transform: transform) else { return nil }
        let q = geo.eastUpSouthQTarget
        let pose = GeospatialPose(
            latitude: geo.coordinate.latitude,
            longitude: geo.coordinate.longitude,
            altitude: geo.altitude,
            eusQuaternion: [q.vector.x, q.vector.y, q.vector.z, q.vector.w],
            horizontalAccuracy: geo.horizontalAccuracy,
            verticalAccuracy: geo.verticalAccuracy,
            yawAccuracy: geo.orientationYawAccuracy
        )
        return pose.isValid ? pose : nil
    }

    /// Converts a stored geospatial pose to a transform in the current ARKit world.
    func transform(for pose: GeospatialPose) -> simd_float4x4? {
        guard isEarthTracking, let horizontalAccuracy, horizontalAccuracy <= 10,
              let session, pose.eusQuaternion.count == 4 else { return nil }
        let q = simd_quatf(ix: pose.eusQuaternion[0], iy: pose.eusQuaternion[1], iz: pose.eusQuaternion[2], r: pose.eusQuaternion[3])
        let coordinate = CLLocationCoordinate2D(latitude: pose.latitude, longitude: pose.longitude)
        return try? session.transform(coordinate: coordinate, altitude: pose.altitude, eastUpSouthQTarget: q)
    }

    /// Waits for Earth localization good enough to place geospatial content.
    func waitForEarthLocalization(timeout: Duration = .seconds(15)) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while ContinuousClock.now < deadline {
            if isEarthTracking, let horizontalAccuracy, horizontalAccuracy <= 10 { return true }
            try? await Task.sleep(for: .milliseconds(250))
        }
        return false
    }

    nonisolated static func describe(_ availability: GARVPSAvailability) -> String {
        switch availability {
        case .available: "✅ VPS mevcut"
        case .unavailable: "❌ VPS yok"
        case .errorNotAuthorized: "⚠️ Yetki yok (token / ARCore API)"
        case .errorNetworkConnection: "⚠️ Ağ hatası"
        case .errorResourceExhausted: "⚠️ Kota aşıldı"
        case .errorInternal: "⚠️ İç hata"
        default: "❓ Bilinmiyor"
        }
    }
}

/// Resumes a continuation exactly once (ARCore callback vs. timeout race).
private final class ResumeOnce<Value: Sendable>: @unchecked Sendable {
    private var continuation: CheckedContinuation<Value?, Never>?
    private let lock = NSLock()

    init(_ continuation: CheckedContinuation<Value?, Never>) { self.continuation = continuation }

    func resume(_ value: Value?) {
        lock.lock()
        let pending = continuation
        continuation = nil
        lock.unlock()
        pending?.resume(returning: value)
    }
}
