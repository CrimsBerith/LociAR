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
    /// Expiry of the real ARCore token returned by the server. Nil when no valid token has arrived.
    @ObservationIgnored private var tokenExpiry: Date?
    /// Back-off deadline after a token fetch failure; not a real token, never used for ready check.
    @ObservationIgnored private var tokenRetryAt: Date?
    @ObservationIgnored private var tokenTask: Task<Void, Never>?
    @ObservationIgnored private var lastPublish = Date.distantPast
    @ObservationIgnored private var isStartFailed = false
    @ObservationIgnored private let logger = Logger(subsystem: "com.khankartal.lociar", category: "arcore")

    /// Observe location-auth changes so we can re-enable Geospatial once precise location is granted.
    @ObservationIgnored private let locationAuthObserver = CLLocationManager()
    @ObservationIgnored private var locationAuthDelegate: ARCoreLocationAuthDelegate?

    /// Refresh this long before the token's one-hour expiry.
    nonisolated static let tokenRefreshMargin: TimeInterval = 5 * 60

    init(callables: CallableClient?) {
        self.callables = callables
        let delegate = ARCoreLocationAuthDelegate()
        locationAuthDelegate = delegate
        locationAuthObserver.delegate = delegate
        delegate.onAuthChange = { [weak self] in
            Task { @MainActor [weak self] in self?.retryGeospatialIfNeeded() }
        }
    }

    /// False in previews, UI tests and emulator builds, where ARCore never starts.
    var isEnabled: Bool { callables != nil }

    /// ARCore is enabled and its session did not fail to start (cloud anchors / geospatial possible).
    var isUsable: Bool { isEnabled && !isStartFailed }

    /// Set by `ARCoreDisclosure` when the user acknowledges Google's sensor-data notice. ARCore does
    /// not process any frame before that.
    nonisolated static let disclosureAcknowledgedKey = "arcore_disclosure_acknowledged_v1"
    private var disclosureAcknowledged: Bool { UserDefaults.standard.bool(forKey: Self.disclosureAcknowledgedKey) }

    /// Called by ARPinningEngine on the main actor for every ARKit frame.
    func consume(_ frame: ARFrame) {
        guard callables != nil, !isStartFailed, disclosureAcknowledged else { return }
        if session == nil { start() }
        guard let session else { return }
        refreshTokenIfNeeded()
        do {
            let garFrame = try session.update(frame)
            publishEarthState(garFrame)
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func start() {
        guard session == nil, !isStartFailed else { return }
        do {
            let created = try GARSession.session()
            let configuration = GARSessionConfiguration()
            configuration.cloudAnchorMode = .enabled
            let geospatialSupported = created.isGeospatialModeSupported(.enabled)
            if geospatialSupported { configuration.geospatialMode = .enabled }
            do {
                var configErr: NSError?
                created.setConfiguration(configuration, error: &configErr)
                if let e = configErr { throw e }
                availability = .running(geospatial: geospatialSupported)
            } catch {
                // Geospatial needs precise location permission; keep Cloud Anchors without it.
                configuration.geospatialMode = .disabled
                var configErr: NSError?
                created.setConfiguration(configuration, error: &configErr)
                if let e = configErr { throw e }
                availability = .running(geospatial: false)
                logger.info("Geospatial disabled: \(error.localizedDescription, privacy: .public)")
            }
            session = created
            refreshTokenIfNeeded()
        } catch {
            isStartFailed = true
            availability = .unavailable(error.localizedDescription)
            logger.error("ARCore session failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Re-enables Geospatial on the existing session when location permission improves.
    private func retryGeospatialIfNeeded() {
        guard case .running(geospatial: false) = availability, let session else { return }
        guard session.isGeospatialModeSupported(.enabled) else { return }
        let configuration = GARSessionConfiguration()
        configuration.cloudAnchorMode = .enabled
        configuration.geospatialMode = .enabled
        var configErr: NSError?
        session.setConfiguration(configuration, error: &configErr)
        if configErr == nil {
            availability = .running(geospatial: true)
            logger.info("Geospatial re-enabled after location permission change")
        }
    }

    private func refreshTokenIfNeeded() {
        guard tokenTask == nil, let callables else { return }
        if let tokenExpiry, tokenExpiry.timeIntervalSinceNow > Self.tokenRefreshMargin { return }
        if let tokenRetryAt, tokenRetryAt.timeIntervalSinceNow > 0 { return }
        tokenTask = Task { [weak self] in
            struct Response: Decodable, Sendable { let token: String; let expiresAt: Date; let expiresIn: Double? }
            do {
                let response: Response = try await callables.call("getArcoreToken")
                guard let self else { return }
                self.session?.setAuthToken(response.token)
                // expiresIn is relative, so a wrong device clock cannot make a fresh token look expired
                // (or an expired one look valid); expiresAt is the fallback for older servers.
                self.tokenExpiry = response.expiresIn.map { Date().addingTimeInterval($0) } ?? response.expiresAt
                self.tokenRetryAt = nil
                self.tokenTask = nil
            } catch {
                guard let self else { return }
                self.lastError = error.localizedDescription
                // Back off one minute before the next attempt. tokenExpiry stays nil so
                // isReadyForCloudAnchors correctly returns false while we have no real token.
                self.tokenRetryAt = Date().addingTimeInterval(60)
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
        if session == nil, disclosureAcknowledged { start() }
        guard let session else { return String(localized: "ARCore başlatılamadı") }
        refreshTokenIfNeeded()
        // Wait up to 5 s for the first token before making the call.
        for _ in 0..<50 where tokenExpiry == nil && tokenRetryAt == nil {
            do { try await Task.sleep(for: .milliseconds(100)) } catch { return String(localized: "İptal edildi") }
        }
        let result: String? = await withCheckedContinuation { continuation in
            let once = ResumeOnce<String>(continuation)
            _ = session.checkVPSAvailability(coordinate: coordinate) { availability in
                once.resume(Self.describe(availability))
            }
            // Guard against ARCore never calling back (e.g. no network).
            let timeoutTask = Task { try? await Task.sleep(for: .seconds(10)); once.resume(nil) }
            once.setOnResume { timeoutTask.cancel() }
        }
        return result ?? String(localized: "⚠️ VPS zaman aşımı")
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
        guard isUsable else { return false }
        let deadline = ContinuousClock.now + timeout
        while ContinuousClock.now < deadline {
            if isReadyForCloudAnchors { return true }
            if isStartFailed { return false }
            do { try await Task.sleep(for: .milliseconds(200)) } catch { return false }
        }
        return isReadyForCloudAnchors
    }

    /// Whether the features seen in the last few seconds, from the given **camera** transform
    /// (`ARFrame.camera.transform`, not the pin), are good enough to host a Cloud Anchor.
    func isHostingQualitySufficient(cameraTransform: simd_float4x4) -> Bool {
        guard let session else { return false }
        do {
            let quality = try session.estimateFeatureMapQualityForHosting(cameraTransform)
            return quality == .sufficient || quality == .good
        } catch {
            // NotTracking / IllegalState: simply not ready yet.
            return false
        }
    }

    /// Hosts `anchor` as a Cloud Anchor and registers it to this user. Returns its identifier, or
    /// nil on failure, timeout or cancellation (callers then fall back to the ARKit world map).
    func hostCloudAnchor(_ anchor: ARAnchor, timeout: Duration = .seconds(60)) async -> String? {
        guard let session, isReadyForCloudAnchors else { return nil }
        let result: String? = await runFuture(timeout: timeout) { once in
            try session.hostCloudAnchor(anchor, ttlDays: Self.cloudAnchorTTLDays) { identifier, state in
                once.resume(state == .success ? identifier : nil)
            }
        }
        guard let hostedId = result else {
            logger.info("Cloud Anchor hosting failed, timed out or was cancelled")
            return nil
        }
        // The backend only accepts anchors registered to this user (takeover protection). An anchor
        // that never gets registered is deleted by the server's orphan sweep (cleanup.ts).
        return await register(hostedId)
    }

    private func register(_ hostedId: String) async -> String? {
        guard let callables else { return nil }
        struct Registration: Encodable, Sendable { let cloudAnchorId: String }
        struct Ack: Decodable, Sendable { let registered: Bool }
        for (attempt, backoff) in [Duration.zero, .seconds(1), .seconds(3)].enumerated() {
            if backoff > .zero {
                do { try await Task.sleep(for: backoff) } catch { return nil }
            }
            do {
                let ack: Ack = try await callables.call("registerCloudAnchor", payload: Registration(cloudAnchorId: hostedId))
                return ack.registered ? hostedId : nil
            } catch let error as BackendCallError {
                // Rejected (quota, ownership): retrying cannot help.
                logger.error("registerCloudAnchor rejected: \(error.localizedDescription, privacy: .public)")
                return nil
            } catch {
                logger.error("registerCloudAnchor attempt \(attempt + 1) failed: \(error.localizedDescription, privacy: .public)")
            }
        }
        return nil
    }

    /// Resolves a hosted Cloud Anchor in the current ARKit world and returns its transform.
    func resolveCloudAnchor(_ identifier: String, timeout: Duration = .seconds(20)) async -> simd_float4x4? {
        guard let session, isReadyForCloudAnchors else { return nil }
        return await runFuture(timeout: timeout) { once in
            try session.resolveCloudAnchor(identifier) { anchor, state in
                guard state == .success, let anchor, anchor.hasValidTransform else { once.resume(nil); return }
                once.resume(anchor.transform)
            }
        }
    }

    /// Keeps each async ARCore future alive until its callback runs, keyed per operation so
    /// concurrent host/resolve calls never drop each other's futures.
    @ObservationIgnored private var pendingFutures: [UUID: GARFuture] = [:]

    /// Starts an ARCore future and waits for its callback. On timeout or task cancellation the
    /// future itself is cancelled, so ARCore stops hosting/resolving in the background.
    private func runFuture<Value: Sendable>(
        timeout: Duration,
        _ start: (ResumeOnce<Value>) throws -> GARFuture
    ) async -> Value? {
        let id = UUID()
        let once = ResumeOnce<Value>()
        let result: Value? = await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                once.attach(continuation)
                do {
                    pendingFutures[id] = try start(once)
                } catch {
                    logger.error("ARCore future failed to start: \(error.localizedDescription, privacy: .public)")
                    once.resume(nil)
                }
                let timeoutTask = Task { try? await Task.sleep(for: timeout); once.resume(nil) }
                once.setOnResume { timeoutTask.cancel() }
            }
        } onCancel: {
            once.resume(nil)
        }
        if let future = pendingFutures.removeValue(forKey: id), future.state == .pending {
            _ = future.cancel()
        }
        return result
    }

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
            do { try await Task.sleep(for: .milliseconds(250)) } catch { return false }
        }
        return false
    }

    nonisolated static func describe(_ availability: GARVPSAvailability) -> String {
        switch availability {
        case .available: "✅ VPS mevcut"
        case .unavailable: "❌ VPS yok"
        case .errorNotAuthorized: "⚠️ Yetki yok (token / ARCore API)"
        case .errorNetworkConnection: String(localized: "⚠️ Ağ hatası")
        case .errorResourceExhausted: String(localized: "⚠️ Kota aşıldı")
        case .errorInternal: String(localized: "⚠️ İç hata")
        default: "❓ Bilinmiyor"
        }
    }
}

/// Resumes a continuation exactly once (ARCore callback vs. timeout vs. cancellation race).
/// A resume that arrives before the continuation is attached is remembered and delivered on attach.
final class ResumeOnce<Value: Sendable>: @unchecked Sendable {
    private var continuation: CheckedContinuation<Value?, Never>?
    private var finished = false
    private var earlyValue: Value?
    private var onResume: (() -> Void)?
    private let lock = NSLock()

    init() {}

    convenience init(_ continuation: CheckedContinuation<Value?, Never>) {
        self.init()
        attach(continuation)
    }

    func attach(_ continuation: CheckedContinuation<Value?, Never>) {
        lock.lock()
        if finished {
            let value = earlyValue
            lock.unlock()
            continuation.resume(returning: value)
        } else {
            self.continuation = continuation
            lock.unlock()
        }
    }

    /// Side effect for the first (and only) resume, e.g. cancelling the timeout task. Runs at once
    /// if the resume already happened.
    func setOnResume(_ action: @escaping () -> Void) {
        lock.lock()
        if finished {
            lock.unlock()
            action()
        } else {
            onResume = action
            lock.unlock()
        }
    }

    func resume(_ value: Value?) {
        lock.lock()
        guard !finished else { lock.unlock(); return }
        finished = true
        let pending = continuation
        continuation = nil
        if pending == nil { earlyValue = value }
        let action = onResume
        onResume = nil
        lock.unlock()
        action?()
        pending?.resume(returning: value)
    }
}

/// Minimal CLLocationManagerDelegate that forwards authorization-change events.
private final class ARCoreLocationAuthDelegate: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
    var onAuthChange: (() -> Void)?

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        onAuthChange?()
    }
}
