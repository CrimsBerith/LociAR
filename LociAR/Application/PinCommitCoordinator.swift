import Foundation
import OSLog

/// Saves a freshly placed pin so other people can find it again, the same way on every screen
/// (Paylaş tab, map "Yeni yüzey", "Önüme yerleştir"):
///
/// 1. geo-tag the pin with ARCore Geospatial when Earth is localized,
/// 2. host it as a Google Cloud Anchor (waits, cancellably, until ARCore has seen the surface),
/// 3. otherwise fall back to the ARKit world map.
///
/// Approximate (free-space) pins and local preview sessions need no persistence.
@MainActor
enum PinCommitCoordinator {
    enum Outcome: Equatable {
        /// The engine's current anchor now carries geo-tag / persistence; use it for the post.
        case committed
        /// Neither a Cloud Anchor nor the world map could be saved.
        case worldMapFailed(String)
        /// The task was cancelled (screen closed, tab changed).
        case cancelled
    }

    /// How long to wait for ARCore to see the surface well enough to host.
    static let hostingQualityWait: Duration = .seconds(20)

    private static let logger = Logger(subsystem: "com.khankartal.lociar", category: "pin-commit")

    /// `status` receives the banner text to show while saving (nil when done).
    static func commit(
        _ anchor: SurfaceAnchor,
        engine: ARPinningEngine,
        arcore: ARCoreService,
        isOnline: Bool,
        isLocalPreview: Bool,
        status: (String?) -> Void
    ) async -> Outcome {
        guard anchor.pinQuality.isPhysicalSurface, !isLocalPreview else { return .committed }
        if anchor.persistence != nil { return .committed }
        defer { status(nil) }

        // Geo-tag the pin precisely when ARCore Geospatial is localized (outdoors, VPS coverage).
        if let transform = engine.currentPinTransform, let geospatial = arcore.geospatialPose(for: transform) {
            engine.attachGeospatial(geospatial)
        }

        // 1) Google Cloud Anchor: exact surface for every viewer, no world-map upload.
        if isOnline, let persistence = await hostCloudAnchor(for: anchor, engine: engine, arcore: arcore, status: status) {
            // The engine's pin changed while hosting ("Tekrar tara", approximate fallback): the
            // persistence belongs to the old surface, so do not attach it to the new pin.
            guard engine.currentAnchor?.id == anchor.id else { return .cancelled }
            engine.attachPersistence(persistence)
            return .committed
        }
        if Task.isCancelled { return .cancelled }
        guard engine.currentAnchor?.id == anchor.id else { return .cancelled }

        // 2) Fallback: ARKit world map (offline, no token, or hosting failed).
        status(String(localized: "Yüzey kaydı hazırlanıyor…"))
        do {
            let package = try await engine.saveWorldMap()
            if Task.isCancelled || engine.currentAnchor?.id != anchor.id { return .cancelled }
            engine.attachPersistence(package.persistence)
            return .committed
        } catch {
            if Task.isCancelled { return .cancelled }
            logger.error("world_map_save_failed: \(error.localizedDescription, privacy: .public)")
            return .worldMapFailed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }

    /// Hosts the pin as a Cloud Anchor. Returns nil to fall back to the world map.
    private static func hostCloudAnchor(
        for anchor: SurfaceAnchor,
        engine: ARPinningEngine,
        arcore: ARCoreService,
        status: (String?) -> Void
    ) async -> WorldLockPersistence? {
        guard arcore.isUsable else { return nil }
        status(String(localized: "Google AR hazırlanıyor…"))
        guard await arcore.waitUntilReady(), let arAnchor = engine.currentPinARAnchor() else { return nil }

        func sufficient() -> Bool {
            guard let camera = engine.currentCameraTransform else { return false }
            return arcore.isHostingQualitySufficient(cameraTransform: camera)
        }
        let deadline = ContinuousClock.now + hostingQualityWait
        while !sufficient(), ContinuousClock.now < deadline {
            status(String(localized: "Telefonu yüzeyin etrafında yavaşça gezdir…"))
            do { try await Task.sleep(for: .milliseconds(400)) } catch { return nil }
        }
        guard sufficient() else { return nil }

        status(String(localized: "Yüzey Google AR'a kaydediliyor…"))
        guard let cloudAnchorId = await arcore.hostCloudAnchor(arAnchor), !Task.isCancelled else { return nil }
        var persistence = WorldLockPersistence(originalNativeAnchorId: engine.currentAnchor?.id ?? anchor.id, hostedAt: Date())
        persistence.kind = .arcoreCloudAnchor
        persistence.cloudAnchorId = cloudAnchorId
        persistence.expiresAt = Calendar.current.date(byAdding: .day, value: ARCoreService.cloudAnchorTTLDays, to: Date())
        return persistence
    }
}
