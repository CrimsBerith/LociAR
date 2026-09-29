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
