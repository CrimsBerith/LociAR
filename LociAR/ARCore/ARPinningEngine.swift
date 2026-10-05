@preconcurrency import ARKit
@preconcurrency import AVFoundation
import Foundation
import Observation
import OSLog
@preconcurrency import RealityKit
import UIKit

struct PinDiagnosticSnapshot: Codable, Sendable {
    var timestamp: Date
    var state: PinSessionState
    var trackingQuality: TrackingQuality
    var mappingQuality: WorldMappingQuality
    var pinQuality: PinQuality?
    var hitSource: PinHitSource?
    var surfaceAlignment: SurfaceAlignment?
    var anchorID: UUID?
    var message: String
    var rawFeaturePointCount: Int = 0
    var planeAnchorCount: Int = 0
    var meshAnchorCount: Int = 0
    var secondsSinceSessionStart: Double?
    var secondsSincePhysicalPin: Double?
}

struct SavedWorldMapPackage: Sendable {
    var mapData: Data
    var referenceImageData: Data?
    var persistence: WorldLockPersistence
}

enum ARPinningError: LocalizedError {
    case unsupported
    case cameraDenied
    case noAnchor
    case mappingNotReady
    case mapUnavailable
    case invalidWorldMap
    case anchorMissing
    case renderAnchorMissing
    case renderContentUnavailable

    var errorDescription: String? {
        switch self {
        case .unsupported: "Bu cihaz gelişmiş AR yüzey taramasını desteklemiyor."
        case .cameraDenied: "Kamera izni verilmedi."
        case .noAnchor: "Önce bir yüzey seçin."
        case .mappingNotReady: "Yüzey kaydı henüz hazır değil. Çevreyi yavaşça tarayın."
        case .mapUnavailable: "Yüzey kaydı oluşturulamadı."
        case .invalidWorldMap: "Kaydedilmiş yüzey bilgisi açılamadı."
        case .anchorMissing: "Postun bağlı olduğu yüzey kaydı bulunamadı."
        case .renderAnchorMissing: "Yüzey bulundu ancak post anchor'ı sahneye bağlanamadı."
        case .renderContentUnavailable: "Postun yüzey içeriği hazırlanamadı."
        }
    }
}

@MainActor
@Observable
final class ARPinningEngine: NSObject {
    nonisolated static let relocalizationTimeoutSeconds = 45
    nonisolated static let approximateDistanceMeters: Float = 0.8
    nonisolated static let candidateSampleMinimumInterval: TimeInterval = 0.06
    nonisolated static let candidateProbeMinimumInterval: TimeInterval = 0.12
    nonisolated static let estimatedStabilityDuration: TimeInterval = 0.2
    nonisolated static let estimatedMaximumPositionDrift: Float = 0.035
    nonisolated static let estimatedMaximumNormalDriftDegrees: Float = 7
    nonisolated static let mappingReadinessTimeoutSeconds: TimeInterval = 15
    nonisolated static let worldMapCaptureMaximumAttempts = 6
    private(set) var state: PinSessionState = .idle
    /// Set when state transitions to `.failed` via a typed `ARPinningError`; nil for free-form failures.
    private(set) var failureReason: ARPinningError?
    private(set) var trackingQuality: TrackingQuality = .unknown
    private(set) var mappingQuality: WorldMappingQuality = .notAvailable
    private(set) var candidateQuality: PinQuality?
    private(set) var currentAnchor: SurfaceAnchor?
    private(set) var statusMessage = "AR hazır değil."
    private(set) var diagnostics: [PinDiagnosticSnapshot] = []
    private(set) var isRelocalizedContentVisible = false
    private(set) var cameraPitchDegrees: Double = 0
    private(set) var cameraYawDegrees: Double?
    private(set) var rawFeaturePointCount = 0
    private(set) var planeAnchorCount = 0
    private(set) var meshAnchorCount = 0

    private(set) var hasRecentCameraFrame = false

    @ObservationIgnored let arView: ARView
    @ObservationIgnored private var trackedRaycast: ARTrackedRaycast?
    @ObservationIgnored private var latestEstimatedResult: ARRaycastResult?
    @ObservationIgnored private var candidateSamples: [CandidateSample] = []
    @ObservationIgnored private var lastCandidateProbeDate: Date?
    @ObservationIgnored private var relocalizationTimeoutTask: Task<Void, Never>?
    @ObservationIgnored private var relocalizationDeadline: Date?
    @ObservationIgnored private var anchorEntities: [UUID: AnchorEntity] = [:]
    @ObservationIgnored private let geoPoseCapture = GeoPoseCaptureService()
    @ObservationIgnored private var notificationTokens: [NSObjectProtocol] = []
    @ObservationIgnored private let contentRenderer = SpatialContentRenderer()
    @ObservationIgnored private var videoPlayers: [UUID: AVPlayer] = [:]
    @ObservationIgnored private var activeInitialWorldMap: ARWorldMap?
    @ObservationIgnored private var pausedForThermalPressure = false
    /// AR is paused because the device is too hot (resumes on its own when it cools down).
    var isPausedForThermalPressure: Bool { state == .interrupted && pausedForThermalPressure }
    @ObservationIgnored private var compassWorldAlignment = false
    @ObservationIgnored private var lastFrameReceivedAt: Date?
    @ObservationIgnored private var lastFrameCountersAt = Date.distantPast
    @ObservationIgnored private var sessionStartedAt: Date?
    @ObservationIgnored private var physicalPinPlacedAt: Date?
    @ObservationIgnored private var lastFrameDiagnosticAt: Date?
    @ObservationIgnored private var arViewHosts: [WeakARViewHost] = []
    @ObservationIgnored private let logger = Logger(subsystem: "com.khankartal.lociar", category: "ARPinning")

    private struct CandidateSample {
        var date: Date
        var position: SIMD3<Float>
        var normal: SIMD3<Float>
    }

    var mappingDiagnosticSummary: String {
        let tracking = switch trackingQuality {
        case .unknown: "bilinmiyor"
        case .limited: "sınırlı"
        case .normal: "normal"
        case .unavailable: "kullanılamıyor"
        }
        let mapping = switch mappingQuality {
        case .notAvailable: "başlamadı"
        case .limited: "sınırlı"
        case .extending: "genişliyor"
        case .mapped: "hazır"
        }
        return String(localized: "Takip \(tracking.localizedUI) · Harita \(mapping.localizedUI) · \(rawFeaturePointCount) özellik · \(planeAnchorCount) düzlem · \(meshAnchorCount) mesh")
    }

    /// Receives every ARKit frame on the main actor (wired to ARCoreService by AppContainer).
    @ObservationIgnored var frameSink: (@MainActor (ARFrame) -> Void)?

    override init() {
        arView = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)
        super.init()
        arView.renderOptions = [
            .disableCameraGrain,
            .disableMotionBlur,
            .disableDepthOfField,
            .disableHDR,
            .disableAREnvironmentLighting,
        ]
        arView.session.delegate = self
        observeLifecycle()
    }

    deinit { notificationTokens.forEach(NotificationCenter.default.removeObserver) }

    func requestCameraAndStart() async {
        if UITestFixtures.cameraPermissionDenied {
            transition(to: .failed, error: .cameraDenied)
            return
        }
#if targetEnvironment(simulator)
        markSimulatorCameraReady()
        return
#else
        guard ARWorldTrackingConfiguration.isSupported else {
            transition(to: .failed, error: .unsupported)
            return
        }

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            startSession(reset: state == .failed)
        case .notDetermined:
            transition(to: .permissionRequired, message: "Yüzey taraması için kamera izni gerekiyor.")
            let allowed = await AVCaptureDevice.requestAccess(for: .video)
            if allowed { startSession(reset: true) }
            else { transition(to: .failed, error: .cameraDenied) }
        default:
            transition(to: .failed, error: .cameraDenied)
        }
#endif
    }

    /// Ensures a previously paused AR view receives a current camera frame.
    /// Used when SwiftUI keeps the AR tab alive while switching tabs.
    func ensureLiveCameraSession() async -> Bool {
        if UITestFixtures.cameraPermissionDenied {
            transition(to: .failed, error: .cameraDenied)
            return false
        }
#if targetEnvironment(simulator)
        markSimulatorCameraReady()
        return true
#else
        if let lastFrameReceivedAt,
           Date().timeIntervalSince(lastFrameReceivedAt) < 1 {
            return true
        }
        if state != .idle && state != .failed && state != .permissionRequired {
            stopSession()
        }
        lastFrameReceivedAt = nil
        await requestCameraAndStart()
        guard state != .failed else { return false }
        if await waitForLiveCameraFrame() { return true }
        transition(to: .failed, message: "Kameradan canlı görüntü alınamadı. Tekrar deneyin.")
        return false
#endif
    }

    /// Starts a clean placement session and does not return success until the
    /// physical camera has delivered a new frame. This prevents a paused or
    /// stale AR session from presenting a black surface when creating a pin.
    func prepareNewPinSession(compassAligned: Bool = false) async -> Bool {
        if UITestFixtures.cameraPermissionDenied {
            transition(to: .failed, error: .cameraDenied)
            return false
        }
#if targetEnvironment(simulator)
        stopSession()
        compassWorldAlignment = compassAligned
        cameraYawDegrees = nil
        activeInitialWorldMap = nil
        clearPlacedAnchors()
        latestEstimatedResult = nil
        candidateSamples.removeAll()
        candidateQuality = nil
        markSimulatorCameraReady()
        return true
#else
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            transition(to: .permissionRequired, message: "Yüzey taraması için kamera izni gerekiyor.")
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                transition(to: .failed, error: .cameraDenied)
                return false
            }
        default:
            transition(to: .failed, error: .cameraDenied)
            return false
        }

        stopSession()
        compassWorldAlignment = compassAligned
        cameraYawDegrees = nil
        activeInitialWorldMap = nil
        clearPlacedAnchors()
        latestEstimatedResult = nil
        candidateSamples.removeAll()
        candidateQuality = nil
        trackingQuality = .unknown
        mappingQuality = .notAvailable
        lastFrameReceivedAt = nil
        startSession(reset: true)

        if await waitForLiveCameraFrame() { return true }
        transition(to: .failed, message: "Kameradan canlı görüntü alınamadı. Tekrar deneyin.")
        return false
#endif
    }

    private func waitForLiveCameraFrame() async -> Bool {
        for _ in 0..<60 {
            if let lastFrameReceivedAt,
               Date().timeIntervalSince(lastFrameReceivedAt) < 1 {
                return true
            }
            try? await Task.sleep(for: .milliseconds(100))
        }
        return false
    }

#if targetEnvironment(simulator)
    private func markSimulatorCameraReady(
        message: String = "Simülatör kamerası sınırlı. Pin arayüzü açık."
    ) {
        trackingQuality = .normal
        hasRecentCameraFrame = true
        lastFrameReceivedAt = Date()
        if state == .idle || state == .failed || state == .interrupted || state == .permissionRequired {
            transition(to: .initializing, message: message)
        }
        if state == .initializing {
            transition(to: .scanning, message: message)
        } else if state != .failed {
            statusMessage = message
        }
    }
#endif

    func startSession(reset: Bool = false) {
#if targetEnvironment(simulator)
        markSimulatorCameraReady()
        return
#else
        guard ARWorldTrackingConfiguration.isSupported else {
            transition(to: .failed, error: .unsupported)
            return
        }
        transition(to: .initializing, message: "Kamera hazırlanıyor…")
        hasRecentCameraFrame = false
        lastFrameReceivedAt = nil
        trackedRaycast?.stopTracking()
        trackedRaycast = nil
        let configuration = makeConfiguration()
        let options: ARSession.RunOptions = reset ? [.resetTracking, .removeExistingAnchors] : []
        sessionStartedAt = Date()
        physicalPinPlacedAt = nil
        lastFrameDiagnosticAt = nil
        rawFeaturePointCount = 0
        planeAnchorCount = 0
        meshAnchorCount = 0
        arView.session.run(configuration, options: options)
        beginTrackedRaycastWhenReady()
#endif
    }

    func stopSession() {
        trackedRaycast?.stopTracking()
        trackedRaycast = nil
        videoPlayers.values.forEach { $0.pause() }
        videoPlayers.removeAll()
        for entity in anchorEntities.values { entity.removeFromParent() }
        anchorEntities.removeAll()
        relocalizationTimeoutTask?.cancel()
        relocalizationTimeoutTask = nil
        relocalizationDeadline = nil
        arView.session.pause()
        activeInitialWorldMap = nil
        lastFrameReceivedAt = nil
        hasRecentCameraFrame = false
        compassWorldAlignment = false
        cameraYawDegrees = nil
        trackingQuality = .unknown
        mappingQuality = .notAvailable
        rawFeaturePointCount = 0
        planeAnchorCount = 0
        meshAnchorCount = 0
        sessionStartedAt = nil
        physicalPinPlacedAt = nil
        lastFrameDiagnosticAt = nil
        candidateQuality = nil
        latestEstimatedResult = nil
        candidateSamples.removeAll()
        transition(to: .idle, message: "AR oturumu durduruldu.")
    }

    func restartTracking() {
        stopSession()
        activeInitialWorldMap = nil
        clearPlacedAnchors()
        latestEstimatedResult = nil
        candidateSamples.removeAll()
        startSession(reset: true)
    }

    func registerARViewHost(_ host: UIView) {
        arViewHosts.removeAll { $0.view == nil }
        if !arViewHosts.contains(where: { $0.view === host }) {
            arViewHosts.append(WeakARViewHost(host))
        }
        activateARViewHost(host)
    }

    func activateARViewHost(_ host: UIView) {
        guard arView.superview !== host else {
            arView.frame = host.bounds
            return
        }
        arView.removeFromSuperview()
        arView.frame = host.bounds
        arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(arView)
    }

    func unregisterARViewHost(_ host: UIView) {
        arViewHosts.removeAll { $0.view == nil || $0.view === host }
        if arView.superview === host { arView.removeFromSuperview() }
        if let fallback = arViewHosts.reversed().compactMap(\.view).first(where: { $0.window != nil }) {
            activateARViewHost(fallback)
        }
    }

    func requestPin() {
        transition(to: .placing, message: "Yüzey doğrulanıyor…")
        let point = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        if let query = arView.makeRaycastQuery(from: point, allowing: .existingPlaneGeometry, alignment: .any),
           let exact = arView.session.raycast(query).first {
            place(result: exact, quality: .planeGeometry, source: .planeGeometry)
            return
        }

        guard trackingQuality == .normal else {
            transition(to: .approximateOffered, message: "Tarama henüz hazır değil. Çevreyi taramaya devam edin veya yaklaşık yerleştirin.")
            return
        }

        if isCandidateStable, latestEstimatedResult != nil {
            transition(
                to: .approximateOffered,
                message: "Yalnız tahmini yüzey bulundu. Fiziksel kilit için düzlemi taramaya devam edin veya yaklaşık yerleştirmeyi açıkça seçin."
            )
            return
        }

        transition(
            to: .approximateOffered,
            message: "Bu noktada kararlı yüzey bulunamadı. Merkez halkayı yüzey üzerinde gezdirin veya yaklaşık yerleştirmeyi seçin."
        )
    }

    /// Also valid after a physical pin whose world map could not be saved (`.placed`/`.mapping`):
    /// the physical anchor is then replaced by a new approximate one without persistence.
    func offerApproximatePlacement() {
        let allowed: [PinSessionState] = [.scanning, .candidateReady, .approximateOffered, .placed, .mapping]
        guard allowed.contains(state) else { return }
        transition(to: .approximateOffered, message: "Yaklaşık yerleştirme seçildi. İçerik kameranın 0,8 m önünde konumlanacak.")
    }

    func placeApproximate() {
        guard state == .approximateOffered else {
            recordDiagnostic("Yaklaşık yerleştirme açık kullanıcı onayı olmadan reddedildi.")
            return
        }
#if targetEnvironment(simulator)
        let cameraTransform = arView.session.currentFrame?.camera.transform ?? matrix_identity_float4x4
#else
        guard let frame = arView.session.currentFrame else {
            transition(to: .failed, message: "Kamera pozu alınamadı. Tekrar deneyin.")
            return
        }
        let cameraTransform = frame.camera.transform
#endif
        var translation = matrix_identity_float4x4
        translation.columns.3.z = -Self.approximateDistanceMeters
        let transform = cameraTransform * translation
        place(
            transform: transform,
            quality: .freeSpaceApproximate,
            source: .frontOfCamera,
            alignment: .freeSpace
        )
    }

    /// The ARKit anchor of the current pin (what ARCore hosts as a Cloud Anchor).
    func currentPinARAnchor() -> ARAnchor? {
        guard let id = currentAnchor?.id else { return nil }
        return arView.session.currentFrame?.anchors.first { $0.name == anchorName(for: id) }
    }

    /// Current pin transform (for geo-tagging).
    var currentPinTransform: simd_float4x4? {
        currentAnchor.flatMap { Self.unflatten($0.transform) }
    }

    /// Camera transform of the latest frame (what ARCore's hosting-quality estimate expects).
    var currentCameraTransform: simd_float4x4? {
        arView.session.currentFrame?.camera.transform
    }

    /// Shows a post at a transform found by ARCore (resolved Cloud Anchor or Geospatial pose).
    /// `physical` distinguishes a surface-exact Cloud Anchor from a geospatial placement.
    func placeResolvedForViewing(transform: simd_float4x4, anchor sourceAnchor: SurfaceAnchor, physical: Bool) {
        if state != .scanning && state != .candidateReady && state != .approximateOffered {
            transition(to: .scanning, message: "Konum bulundu, içerik hazırlanıyor…")
        }
        transition(to: .placing, message: "İçerik yerleştiriliyor…")
        place(
            transform: transform,
            quality: physical ? sourceAnchor.pinQuality : .estimatedPlane,
            source: physical ? sourceAnchor.hitSource : .estimatedPlane,
            alignment: sourceAnchor.surfaceAlignment == .unknown ? .vertical : sourceAnchor.surfaceAlignment,
            id: sourceAnchor.id,
            captureGeoPose: false
        )
        currentAnchor?.geoPose = sourceAnchor.geoPose
        currentAnchor?.geospatial = sourceAnchor.geospatial
        currentAnchor?.persistence = sourceAnchor.persistence
        isRelocalizedContentVisible = true
        if state == .placed { transition(to: .relocalizing, message: "İçerik açılıyor…") }
        if state == .relocalizing || state == .placed {
            transition(to: .resolved, message: physical ? "Yüzey bulundu. İçerik hazır." : "Konum bulundu. İçerik hazır.")
        }
    }

    /// Records the precise geospatial pose of the current pin.
    func attachGeospatial(_ pose: GeospatialPose) {
        currentAnchor?.geospatial = pose
    }

    func placeApproximateForViewing(anchor sourceAnchor: SurfaceAnchor) throws {
#if targetEnvironment(simulator)
        let cameraTransform = arView.session.currentFrame?.camera.transform ?? matrix_identity_float4x4
#else
        guard let frame = arView.session.currentFrame else { throw ARPinningError.mapUnavailable }
        let cameraTransform = frame.camera.transform
#endif
        if state != .scanning && state != .candidateReady && state != .approximateOffered {
            transition(to: .scanning, message: "Yaklaşık görünüm hazırlanıyor…")
        }
        transition(to: .placing, message: "Yaklaşık görünüm yerleştiriliyor…")
        var translation = matrix_identity_float4x4
        translation.columns.3.z = -Self.approximateDistanceMeters
        place(
            transform: cameraTransform * translation,
            quality: .freeSpaceApproximate,
            source: .frontOfCamera,
            alignment: .freeSpace,
            id: sourceAnchor.id,
            captureGeoPose: false
        )
        currentAnchor?.geoPose = sourceAnchor.geoPose
        currentAnchor?.persistence = sourceAnchor.persistence
        isRelocalizedContentVisible = true
        if state == .placed {
            transition(to: .relocalizing, message: "Yaklaşık görünüm açılıyor…")
        }
        if state == .relocalizing || state == .placed {
            transition(to: .resolved, message: "Yaklaşık görünüm kameranın 0,8 m önünde açıldı.")
        }
    }

    func placeVerticalWallForViewing(anchor sourceAnchor: SurfaceAnchor) throws {
#if targetEnvironment(simulator)
        let cameraTransform = arView.session.currentFrame?.camera.transform ?? matrix_identity_float4x4
#else
        guard let frame = arView.session.currentFrame else { throw ARPinningError.mapUnavailable }
        let cameraTransform = frame.camera.transform
#endif
        if state != .scanning && state != .candidateReady && state != .approximateOffered {
            transition(to: .scanning, message: "Dikey duvar yüzeyi hazırlanıyor…")
        }
        transition(to: .placing, message: "Dikey duvara yerleştiriliyor…")
        var translation = matrix_identity_float4x4
        translation.columns.3.z = -Self.approximateDistanceMeters
        let transform = cameraTransform * translation
        place(
            transform: transform,
            quality: .planeGeometry,
            source: .planeGeometry,
            alignment: .vertical,
            resolvedNormal: SIMD3<Float>(0, 0, 1),
            id: sourceAnchor.id,
            captureGeoPose: false
        )
        currentAnchor?.geoPose = sourceAnchor.geoPose
        currentAnchor?.persistence = sourceAnchor.persistence
        currentAnchor?.physicalRectMeters = sourceAnchor.physicalRectMeters
        isRelocalizedContentVisible = true
        if state == .placed {
            transition(to: .relocalizing, message: "Dikey duvar görünümü açılıyor…")
        }
        if state == .relocalizing || state == .placed {
            transition(to: .resolved, message: "Yüzey bulundu. İçerik hazır.")
        }
    }

    func saveWorldMap() async throws -> SavedWorldMapPackage {
        guard let anchor = currentAnchor else { throw ARPinningError.noAnchor }
        guard await waitForPersistableMapping() else {
            transition(to: .mapping, message: ARPinningError.mappingNotReady.localizedDescription)
            throw ARPinningError.mappingNotReady
        }
        transition(to: .mapping, message: "Yüzey kaydı hazırlanıyor…")

        let worldMap = try await captureCurrentWorldMap()
        let sendableMap = SendableWorldMap(map: worldMap)
        let mapData = try await Task.detached(priority: .utility) {
            try NSKeyedArchiver.archivedData(withRootObject: sendableMap.map, requiringSecureCoding: true)
        }.value
        // No camera frame is stored with a pin: relocalization uses the world map only, and a
        // frame could show people, homes or plates (privacy) while nothing ever read it back.
        var persistence = WorldLockPersistence(
            originalNativeAnchorId: anchor.id,
            hostedAt: Date()
        )
        let local = try await Task.detached(priority: .utility) {
            try Self.writeLocalPackage(mapData: mapData, referenceData: nil, anchorID: anchor.id)
        }.value
        persistence.assetURI = local.mapURL.absoluteString
        persistence.referenceImageURI = nil
        currentAnchor?.persistence = persistence
        transition(to: .publishReady, message: "Yüzey kaydı hazır. Post yayınlanabilir.")
        return SavedWorldMapPackage(mapData: mapData, referenceImageData: nil, persistence: persistence)
    }

    private func waitForPersistableMapping() async -> Bool {
        let deadline = Date().addingTimeInterval(Self.mappingReadinessTimeoutSeconds)
        while Date() < deadline {
            if mappingQuality.canPersist,
               trackingQuality == .normal || trackingQuality == .limited {
                return true
            }
            try? await Task.sleep(for: .milliseconds(100))
        }
        return mappingQuality.canPersist && (trackingQuality == .normal || trackingQuality == .limited)
    }

    private func captureCurrentWorldMap() async throws -> ARWorldMap {
        var lastError: Error = ARPinningError.mapUnavailable
        for attempt in 1...Self.worldMapCaptureMaximumAttempts {
            guard mappingQuality.canPersist,
                  trackingQuality == .normal || trackingQuality == .limited else {
                throw ARPinningError.mappingNotReady
            }
            do {
                let map = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<ARWorldMap, Error>) in
                    arView.session.getCurrentWorldMap { map, error in
                        if let map { continuation.resume(returning: map) }
                        else { continuation.resume(throwing: error ?? ARPinningError.mapUnavailable) }
                    }
                }
                recordDiagnostic("World-map \(attempt). denemede alındı; \(map.anchors.count) anchor içeriyor.")
                return map
            } catch {
                lastError = error
                recordDiagnostic("World-map alma denemesi \(attempt)/\(Self.worldMapCaptureMaximumAttempts) başarısız: \(error.localizedDescription)")
                if attempt < Self.worldMapCaptureMaximumAttempts {
                    try await Task.sleep(for: .milliseconds(250))
                }
            }
        }
        throw lastError
    }

    func restoreWorldMap(data: Data, expectedAnchor: SurfaceAnchor?) async throws {
        let unarchived = try await Task.detached(priority: .userInitiated) {
            // Accepts both compressed (uploaded) and raw archives.
            let raw = try WorldMapCodec.decode(data)
            return try NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: raw).map(SendableWorldMap.init(map:))
        }.value
        guard let worldMap = unarchived?.map else {
            throw ARPinningError.invalidWorldMap
        }
        let restoredAnchor: ARAnchor?
        if let expectedAnchor {
            guard let match = worldMap.anchors.first(where: { $0.name == anchorName(for: expectedAnchor.id) }) else {
                throw ARPinningError.anchorMissing
            }
            restoredAnchor = match
        } else {
            restoredAnchor = nil
        }
        clearPlacedAnchors()
        currentAnchor = expectedAnchor
        activeInitialWorldMap = worldMap
        trackedRaycast?.stopTracking()
        trackedRaycast = nil
        let configuration = makeConfiguration()
        configuration.initialWorldMap = worldMap
        isRelocalizedContentVisible = false
        relocalizationDeadline = Date().addingTimeInterval(TimeInterval(Self.relocalizationTimeoutSeconds))
        transition(to: .relocalizing, message: "Dünya konumu hazırlanıyor. Post desene bağlı değil.")
        arView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])

        if let expectedAnchor, let restored = restoredAnchor {
            installEntity(for: restored, visible: false, quality: expectedAnchor.pinQuality, alignment: expectedAnchor.surfaceAlignment)
        }
        beginRelocalizationTimeout()
    }

    /// Reuses a still-valid ARKit world coordinate space when a post is opened
    /// immediately after it was pinned. A fresh app launch has no preserved
    /// anchor/entity, so persisted posts still go through ARWorldMap relocalization.
    func resumePreservedWorldLock(anchorID: UUID) async -> Bool {
        guard currentAnchor?.id == anchorID,
              let entity = anchorEntities[anchorID] else { return false }

        guard await ensureLiveCameraSession() else { return false }
        for _ in 0..<50 where trackingQuality != .normal {
            try? await Task.sleep(for: .milliseconds(100))
        }
        guard trackingQuality == .normal,
              arView.session.currentFrame?.anchors.contains(where: {
                  $0.name == anchorName(for: anchorID)
              }) == true else { return false }

        transition(to: .relocalizing, message: "Korunan fiziksel yüzey doğrulanıyor…")
        entity.isEnabled = true
        isRelocalizedContentVisible = true
        transition(to: .resolved, message: "AR lock yeniden bulundu.")
        return true
    }

    /// Starts a clean physical-surface scan after ARWorldMap relocalization
    /// cannot recognize a low-feature environment.
    func prepareGuidedRelock() async -> Bool {
        await prepareNewPinSession()
    }

    /// Relocks the post to the live ARKit plane in front of the camera.
    /// World-map visual features are ignored so a changed floor/wall pattern
    /// still keeps the post in the room.
    func recoverWithoutVisualPattern(from sourceAnchor: SurfaceAnchor) async throws {
        guard await beginAimAssistedReveal() else { throw ARPinningError.cameraDenied }
        for _ in 0..<120 {
            if revealIfSurfaceReady(from: sourceAnchor) { return }
            try? await Task.sleep(for: .milliseconds(100))
        }
        throw ARPinningError.noAnchor
    }

    func beginAimAssistedReveal() async -> Bool {
        relocalizationTimeoutTask?.cancel()
        relocalizationTimeoutTask = nil
        relocalizationDeadline = nil
        activeInitialWorldMap = nil
        return await prepareNewPinSession(compassAligned: true)
    }

    /// Places the saved post on the plane currently in front of the camera.
    /// Returns false until tracking and a real plane are ready. No user confirm.
    @discardableResult
    func revealIfSurfaceReady(from sourceAnchor: SurfaceAnchor) -> Bool {
        if state == .resolved, currentAnchor?.id == sourceAnchor.id { return true }
        guard trackingQuality == .normal else { return false }
        guard arView.bounds.width > 1, arView.bounds.height > 1 else { return false }

        let preferred = raycastAlignment(for: sourceAnchor.surfaceAlignment)
        let point = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        guard let result = existingPlane(at: point, alignment: preferred) else {
            return false
        }

        switch state {
        case .scanning, .candidateReady:
            transition(to: .placing, message: "Post dünya konumunda açılıyor…")
        case .placing, .placed, .relocalizing:
            break
        default:
            return false
        }

        place(
            transform: result.worldTransform,
            quality: .planeGeometry,
            source: .planeGeometry,
            alignment: surfaceAlignment(result: result),
            resolvedNormal: surfaceNormal(for: result),
            id: sourceAnchor.id,
            captureGeoPose: false
        )
        currentAnchor?.geoPose = sourceAnchor.geoPose
        currentAnchor?.persistence = sourceAnchor.persistence
        currentAnchor?.physicalRectMeters = sourceAnchor.physicalRectMeters
        if state == .placed {
            transition(to: .relocalizing, message: "Post dünya konumunda duruyor.")
        }
        isRelocalizedContentVisible = true
        if state == .relocalizing || state == .placed {
            transition(to: .resolved, message: "Yüzey bulundu. İçerik hazır.")
        }
        return state == .resolved
    }

    /// Reattaches the saved post only to a currently detected ARKit plane.
    /// This deliberately rejects estimated/free-space placement.
    func confirmGuidedRelock(from sourceAnchor: SurfaceAnchor) throws {
        guard revealIfSurfaceReady(from: sourceAnchor) else {
            throw ARPinningError.noAnchor
        }
    }

    func attachPersistence(_ persistence: WorldLockPersistence) {
        currentAnchor?.persistence = persistence
        transition(to: .publishReady, message: persistence.storagePath == nil ? "Yüzey kaydı cihazda hazır." : "Yüzey kaydı güvenli depolamaya yüklendi.")
    }

    func diagnosticsJSON() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(diagnostics)
    }

    func render(post: LociPost) async throws {
        guard let anchorEntity = anchorEntities[post.anchorBundle.anchor.id],
              let model = anchorEntity.findEntity(named: "surface-content") as? ModelEntity else {
            throw ARPinningError.renderAnchorMissing
        }
        if case .video(let url)? = post.contentSource {
            let size = SpatialContentRenderer.physicalSize(for: post)
            model.model?.mesh = MeshResource.generatePlane(
                width: size.width,
                height: size.height,
                cornerRadius: min(size.width, size.height) * 0.04
            )
            let player = AVPlayer(url: url)
            model.model?.materials = [VideoMaterial(avPlayer: player)]
            videoPlayers[post.id] = player
            player.play()
            return
        }
        guard let image = await contentRenderer.render(post) else { throw ARPinningError.renderContentUnavailable }
        let size = SpatialContentRenderer.physicalSize(
            for: post,
            renderedPixelSize: CGSize(width: image.width, height: image.height)
        )
        model.model?.mesh = MeshResource.generatePlane(
            width: size.width,
            height: size.height,
            cornerRadius: min(size.width, size.height) * 0.04
        )
        var options = TextureResource.CreateOptions(semantic: .color)
        options.mipmapsMode = .allocateAndGenerateAll
        let texture = try TextureResource.generate(from: image, withName: "lociar-\(post.id)", options: options)
        var material = UnlitMaterial()
        material.color = .init(tint: .white, texture: .init(texture))
        material.blending = .transparent(opacity: .init(floatLiteral: 1.0))
        model.model?.materials = [material]
    }

    var isCandidateStable: Bool {
        guard candidateSamples.count >= 5,
              let first = candidateSamples.first,
              let last = candidateSamples.last,
              last.date.timeIntervalSince(first.date) >= Self.estimatedStabilityDuration else { return false }
        let maxDistance = candidateSamples.map { simd_distance($0.position, first.position) }.max() ?? .greatestFiniteMagnitude
        let maxAngle = candidateSamples.map { sample -> Float in
            let dot = min(1, max(-1, simd_dot(sample.normal, first.normal)))
            return acos(dot) * 180 / .pi
        }.max() ?? .greatestFiniteMagnitude
        return maxDistance <= Self.estimatedMaximumPositionDrift && maxAngle <= Self.estimatedMaximumNormalDriftDegrees
    }

    private var supportsSceneReconstruction: Bool {
        ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }

    private func makeConfiguration() -> ARWorldTrackingConfiguration {
        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal, .vertical]
        configuration.worldAlignment = compassWorldAlignment ? .gravityAndHeading : .gravity
        configuration.environmentTexturing = .none
        configuration.isLightEstimationEnabled = false
        if supportsSceneReconstruction {
            configuration.sceneReconstruction = .mesh
        }
        return configuration
    }

    private func observeLifecycle() {
        let center = NotificationCenter.default
        notificationTokens.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.state != .idle else { return }
                self.arView.session.pause()
                self.transition(to: .interrupted, message: "Uygulama arka planda; AR oturumu duraklatıldı.")
            }
        })
        notificationTokens.append(center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.state == .interrupted, !self.pausedForThermalPressure else { return }
                self.resumeInterruptedSession()
            }
        })
        notificationTokens.append(center.addObserver(forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if ProcessInfo.processInfo.thermalState == .critical {
                    // Nothing to pause (and nothing to resume later) when AR is not running.
                    guard self.state != .idle else { return }
                    self.pausedForThermalPressure = true
                    self.arView.session.pause()
                    self.transition(to: .interrupted, message: "Cihaz sıcaklığı yüksek; AR geçici olarak duraklatıldı.")
                } else if self.pausedForThermalPressure {
                    self.pausedForThermalPressure = false
                    if UIApplication.shared.applicationState == .active, self.state == .interrupted {
                        self.resumeInterruptedSession()
                    }
                }
            }
        })
        notificationTokens.append(center.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { [weak self] _ in
            Task {
                guard let self else { return }
                await self.contentRenderer.handleMemoryPressure()
            }
        })
    }

    private func resumeInterruptedSession() {
        guard let activeInitialWorldMap else {
            startSession(reset: false)
            return
        }
        transition(to: .relocalizing, message: "AR oturumu yeniden eşleştiriliyor.")
        let configuration = makeConfiguration()
        configuration.initialWorldMap = activeInitialWorldMap
        arView.session.run(configuration)
        beginRelocalizationTimeout()
    }

    private func beginTrackedRaycastWhenReady(attempt: Int = 0) {
        guard state != .idle, state != .failed else { return }
        guard trackedRaycast == nil else { return }
        guard arView.bounds.width > 1,
              arView.bounds.height > 1,
              arView.session.currentFrame != nil else {
            scheduleTrackedRaycastRetry(attempt: attempt)
            return
        }
        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        guard let query = arView.makeRaycastQuery(from: center, allowing: .estimatedPlane, alignment: .any) else {
            scheduleTrackedRaycastRetry(attempt: attempt)
            return
        }
        trackedRaycast = arView.session.trackedRaycast(query) { [weak self] results in
            guard let result = results.first else { return }
            Task { @MainActor in self?.acceptCandidate(result) }
        }
    }

    private func scheduleTrackedRaycastRetry(attempt: Int) {
        guard attempt < 120 else {
            transition(to: .failed, message: "AR raycast hazırlanamadı. Tekrar deneyin.")
            return
        }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(50))
            guard !Task.isCancelled else { return }
            self?.beginTrackedRaycastWhenReady(attempt: attempt + 1)
        }
    }

    private func acceptCandidate(_ result: ARRaycastResult) {
        guard currentAnchor == nil else { return }
        switch state {
        case .placed, .mapping, .publishReady, .resolved, .relocalizing, .idle, .failed, .interrupted:
            return
        default:
            break
        }
        latestEstimatedResult = result
        guard trackingQuality == .normal else {
            candidateSamples.removeAll()
            candidateQuality = nil
            transition(to: .scanning, message: "Tarama netleşiyor; telefonu yavaş hareket ettirin.")
            return
        }
        let now = Date()
        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        if let query = arView.makeRaycastQuery(from: center, allowing: .existingPlaneGeometry, alignment: .any),
           arView.session.raycast(query).first != nil {
            candidateQuality = .planeGeometry
            transition(to: .candidateReady, message: "Yüzey hazır. Yüzeye sabitle’ye dokunun.")
            return
        }
        guard Self.shouldAppendCandidateSample(last: candidateSamples.last?.date, now: now) else { return }
        let transform = result.worldTransform
        let position = SIMD3(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        let normal = surfaceNormal(for: result)
        candidateSamples.append(CandidateSample(date: now, position: position, normal: normal))
        if candidateSamples.count > 5 { candidateSamples.removeFirst(candidateSamples.count - 5) }
        candidateQuality = nil
        if isCandidateStable {
            candidateQuality = .estimatedPlane
            transition(to: .candidateReady, message: "Yüzey hazır. Yüzeye sabitle’ye dokunun.")
        } else {
            transition(to: .scanning, message: "Yüzey doğrulanıyor; sabit tutun.")
        }
    }

    private func probeCenterCandidateIfNeeded(now: Date = Date()) {
        guard state == .scanning, trackingQuality == .normal, currentAnchor == nil else { return }
        if let lastCandidateProbeDate,
           now.timeIntervalSince(lastCandidateProbeDate) < Self.candidateProbeMinimumInterval {
            return
        }
        lastCandidateProbeDate = now
        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        guard arView.bounds.width > 1, arView.bounds.height > 1 else { return }

        if let exactQuery = arView.makeRaycastQuery(from: center, allowing: .existingPlaneGeometry, alignment: .any),
           let exact = arView.session.raycast(exactQuery).first {
            acceptCandidate(exact)
            return
        }
        if let estimatedQuery = arView.makeRaycastQuery(from: center, allowing: .estimatedPlane, alignment: .any),
           let estimated = arView.session.raycast(estimatedQuery).first {
            acceptCandidate(estimated)
        }
    }

    nonisolated static func shouldAppendCandidateSample(last: Date?, now: Date) -> Bool {
        guard let last else { return true }
        return now.timeIntervalSince(last) >= candidateSampleMinimumInterval
    }

    private func place(result: ARRaycastResult, quality: PinQuality, source: PinHitSource) {
        place(
            transform: result.worldTransform,
            quality: quality,
            source: source,
            alignment: surfaceAlignment(result: result),
            resolvedNormal: surfaceNormal(for: result)
        )
    }

    private func place(
        transform: simd_float4x4,
        quality: PinQuality,
        source: PinHitSource,
        alignment: SurfaceAlignment,
        resolvedNormal: SIMD3<Float>? = nil,
        id: UUID = UUID(),
        captureGeoPose: Bool = true
    ) {
        trackedRaycast?.stopTracking()
        trackedRaycast = nil
        clearPlacedAnchors()
        let anchor = ARAnchor(name: anchorName(for: id), transform: transform)
        arView.session.add(anchor: anchor)
        installEntity(for: anchor, visible: true, quality: quality, alignment: alignment)
        let normal = resolvedNormal ?? normalizedSurfaceNormal(transform)
        let surfaceAnchor = SurfaceAnchor(
            id: id,
            transform: Self.flatten(transform),
            pinQuality: quality,
            hitSource: source,
            surfaceAlignment: alignment,
            trackingQuality: trackingQuality,
            worldMappingStatus: mappingQuality,
            surfaceNormal: quality.isPhysicalSurface ? Vector3(x: normal.x, y: normal.y, z: normal.z) : nil,
            physicalRectMeters: .default
        )
        currentAnchor = surfaceAnchor
        if quality.isPhysicalSurface { physicalPinPlacedAt = Date() }
        if captureGeoPose {
            Task { @MainActor [weak self] in
                guard let self, let pose = await geoPoseCapture.capture() else { return }
                self.currentAnchor?.geoPose = pose
                self.recordDiagnostic("GPS ve heading placement'a eklendi.")
            }
        }
        candidateQuality = quality
        let label = quality == .freeSpaceApproximate ? "Yaklaşık yerleştirme · 0,8 m" : "Fiziksel yüzeye sabitlendi"
        transition(to: .placed, message: label)
    }

    private func installEntity(for anchor: ARAnchor, visible: Bool, quality: PinQuality?, alignment: SurfaceAlignment) {
        let entity = AnchorEntity(anchor: anchor)
        let mesh = MeshResource.generatePlane(
            width: PhysicalRectMeters.preview.width,
            height: PhysicalRectMeters.preview.height,
            cornerRadius: PhysicalRectMeters.previewCornerRadius
        )
        let color: UIColor = quality == .freeSpaceApproximate ? .systemOrange : .systemMint
        let material = SimpleMaterial(color: color.withAlphaComponent(0.82), isMetallic: false)
        let model = ModelEntity(mesh: mesh, materials: [material])
        model.name = "surface-content"
        if alignment == .horizontal {
            model.orientation = simd_quatf(angle: -.pi / 2, axis: SIMD3<Float>(1, 0, 0))
            model.position.y = 0.003
        } else {
            model.position.z = 0.003
        }
        entity.addChild(model)
        entity.isEnabled = visible
        arView.scene.addAnchor(entity)
        if let id = UUID(uuidString: anchor.name?.replacingOccurrences(of: "lociar_surface_", with: "") ?? "") {
            anchorEntities[id] = entity
        }
    }

    private func clearPlacedAnchors() {
        videoPlayers.values.forEach { $0.pause() }
        videoPlayers.removeAll()
        for entity in anchorEntities.values { entity.removeFromParent() }
        anchorEntities.removeAll()
        for anchor in arView.session.currentFrame?.anchors ?? [] where anchor.name?.hasPrefix("lociar_surface_") == true {
            arView.session.remove(anchor: anchor)
        }
        currentAnchor = nil
        isRelocalizedContentVisible = false
    }

    private func beginRelocalizationTimeout() {
        guard relocalizationTimeoutTask == nil else { return }
        if relocalizationDeadline == nil {
            relocalizationDeadline = Date().addingTimeInterval(TimeInterval(Self.relocalizationTimeoutSeconds))
        }
        relocalizationTimeoutTask = Task { @MainActor [weak self] in
            guard let self, let deadline = self.relocalizationDeadline else { return }
            let remaining = max(0, deadline.timeIntervalSinceNow)
            try? await Task.sleep(for: .seconds(remaining))
            guard !Task.isCancelled else { return }
            self.relocalizationTimeoutTask = nil
            if self.activeInitialWorldMap != nil,
               ![.resolved, .failed, .idle].contains(self.state) {
                self.relocalizationDeadline = nil
                self.transition(to: .failed, message: "Kaydedilen çevre bulunamadı. Post desene değil konuma bağlı; mevcut yüzeye bağlanılıyor.")
            } else if self.state == .resolved {
                self.relocalizationDeadline = nil
            }
        }
    }

    private func transition(to next: PinSessionState, message: String) {
        guard state.canTransition(to: next) else {
            let rejected = "Geçersiz AR durum geçişi: \(state.rawValue) → \(next.rawValue)"
            diagnostics.append(makeDiagnosticSnapshot(message: rejected))
            return
        }
        state = next
        if next != .failed { failureReason = nil }
        statusMessage = message
        logger.info("AR state=\(next.rawValue, privacy: .public) tracking=\(self.trackingQuality.rawValue, privacy: .public) mapping=\(self.mappingQuality.rawValue, privacy: .public) message=\(message, privacy: .public)")
        diagnostics.append(makeDiagnosticSnapshot(message: message))
        if diagnostics.count > 500 { diagnostics.removeFirst(diagnostics.count - 500) }
    }

    private func transition(to next: PinSessionState, error: ARPinningError) {
        if next == .failed { failureReason = error }
        transition(to: next, message: error.localizedDescription)
    }

    private func recordDiagnostic(_ message: String) {
        diagnostics.append(makeDiagnosticSnapshot(message: message))
        if diagnostics.count > 500 { diagnostics.removeFirst(diagnostics.count - 500) }
    }

    private func makeDiagnosticSnapshot(message: String) -> PinDiagnosticSnapshot {
        let now = Date()
        return PinDiagnosticSnapshot(
            timestamp: now,
            state: state,
            trackingQuality: trackingQuality,
            mappingQuality: mappingQuality,
            pinQuality: currentAnchor?.pinQuality ?? candidateQuality,
            hitSource: currentAnchor?.hitSource,
            surfaceAlignment: currentAnchor?.surfaceAlignment,
            anchorID: currentAnchor?.id,
            message: message,
            rawFeaturePointCount: rawFeaturePointCount,
            planeAnchorCount: planeAnchorCount,
            meshAnchorCount: meshAnchorCount,
            secondsSinceSessionStart: sessionStartedAt.map { now.timeIntervalSince($0) },
            secondsSincePhysicalPin: physicalPinPlacedAt.map { now.timeIntervalSince($0) }
        )
    }

    private func raycastAlignment(for alignment: SurfaceAlignment) -> ARRaycastQuery.TargetAlignment {
        switch alignment {
        case .horizontal: return .horizontal
        case .vertical: return .vertical
        case .angled, .freeSpace, .unknown: return .any
        }
    }

    private func existingPlane(
        at point: CGPoint,
        alignment: ARRaycastQuery.TargetAlignment
    ) -> ARRaycastResult? {
        guard let query = arView.makeRaycastQuery(
            from: point,
            allowing: .existingPlaneGeometry,
            alignment: alignment
        ) else { return nil }
        return arView.session.raycast(query).first
    }

    private func surfaceAlignment(result: ARRaycastResult) -> SurfaceAlignment {
        switch result.targetAlignment {
        case .horizontal: return .horizontal
        case .vertical: return .vertical
        case .any:
            let normal = normalizedSurfaceNormal(result.worldTransform)
            if abs(normal.y) > 0.75 { return .horizontal }
            if abs(normal.y) < 0.35 { return .vertical }
            return .angled
        @unknown default: return .unknown
        }
    }

    private func normalizedSurfaceNormal(_ transform: simd_float4x4) -> SIMD3<Float> {
        simd_normalize(SIMD3(transform.columns.2.x, transform.columns.2.y, transform.columns.2.z))
    }

    private func surfaceNormal(for result: ARRaycastResult) -> SIMD3<Float> {
        let transform = result.worldTransform
        switch result.targetAlignment {
        case .horizontal:
            return simd_normalize(SIMD3(transform.columns.1.x, transform.columns.1.y, transform.columns.1.z))
        case .vertical, .any:
            return normalizedSurfaceNormal(transform)
        @unknown default:
            return normalizedSurfaceNormal(transform)
        }
    }

    private func anchorName(for id: UUID) -> String { "lociar_surface_\(id.uuidString)" }

    static func unflatten(_ values: [Float]) -> simd_float4x4? {
        guard values.count == 16 else { return nil }
        return simd_float4x4(
            SIMD4(values[0], values[1], values[2], values[3]),
            SIMD4(values[4], values[5], values[6], values[7]),
            SIMD4(values[8], values[9], values[10], values[11]),
            SIMD4(values[12], values[13], values[14], values[15])
        )
    }

    static func flatten(_ matrix: simd_float4x4) -> [Float] {
        [matrix.columns.0, matrix.columns.1, matrix.columns.2, matrix.columns.3].flatMap { [$0.x, $0.y, $0.z, $0.w] }
    }

    nonisolated private static func writeLocalPackage(mapData: Data, referenceData: Data?, anchorID: UUID) throws -> (mapURL: URL, referenceURL: URL?) {
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw ARPinningError.mapUnavailable
        }
        var directory = support.appendingPathComponent("LociARWorldMaps", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.path
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        let mapURL = directory.appendingPathComponent("\(anchorID.uuidString).lociarmap")
        try mapData.write(to: mapURL, options: .atomic)
        var referenceURL: URL?
        if let referenceData {
            let url = directory.appendingPathComponent("\(anchorID.uuidString).jpg")
            try referenceData.write(to: url, options: .atomic)
            referenceURL = url
        }
        return (mapURL, referenceURL)
    }
}

private struct SendableWorldMap: @unchecked Sendable { let map: ARWorldMap }
/// ARFrame is not Sendable; it is handed to the main actor once and not retained there.
private struct SendableARFrame: @unchecked Sendable { let frame: ARFrame }
private final class WeakARViewHost {
    weak var view: UIView?
    init(_ view: UIView) { self.view = view }
}

extension ARPinningEngine: ARSessionDelegate {
    nonisolated func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        let quality: TrackingQuality
        let message: String
        switch camera.trackingState {
        case .normal:
            quality = .normal
            message = "Tracking hazır."
        case .limited(let reason):
            quality = .limited
            switch reason {
            case .initializing: message = "AR başlatılıyor."
            case .excessiveMotion: message = "Cihazı daha yavaş hareket ettirin."
            case .insufficientFeatures: message = "Daha dokulu veya aydınlık bir yüzeye yönelin."
            case .relocalizing: message = "Kaydedilmiş çevre aranıyor."
            @unknown default: message = "Tracking sınırlı."
            }
        case .notAvailable:
            quality = .unavailable
            message = "Tracking kullanılamıyor."
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.trackingQuality = quality
            let contentLocked: Bool = {
                switch self.state {
                case .placed, .mapping, .publishReady, .resolved: return self.currentAnchor != nil
                default: return false
                }
            }()
            let trackingMessage: String
            if contentLocked, quality == .limited {
                trackingMessage = "Çevre değişti; post dünya konumunda duruyor."
            } else {
                trackingMessage = message
            }
            if quality != .normal, !contentLocked {
                self.candidateSamples.removeAll()
                self.candidateQuality = nil
            }
            if quality == .normal,
               self.trackedRaycast == nil,
               self.activeInitialWorldMap == nil,
               self.currentAnchor == nil {
                self.beginTrackedRaycastWhenReady()
            }
            if self.state == .relocalizing {
                if quality == .normal {
                    self.isRelocalizedContentVisible = true
                    self.anchorEntities.values.forEach { $0.isEnabled = true }
                    self.transition(to: .resolved, message: "AR lock yeniden bulundu.")
                } else {
                    // During initial-world-map recovery ARKit normally reports
                    // `.limited(.relocalizing)`. Keep the dedicated state so the
                    // bounded recovery timer cannot be bypassed by the generic
                    // initializing/scanning transitions below.
                    self.transition(to: .relocalizing, message: trackingMessage)
                }
            } else if self.state == .resolved, quality == .unavailable {
                self.transition(to: .relocalizing, message: "Tracking kesildi. Post dünya konumunda bekliyor.")
                self.beginRelocalizationTimeout()
            } else if contentLocked {
                self.isRelocalizedContentVisible = true
                self.anchorEntities.values.forEach { $0.isEnabled = true }
            } else if ![.idle, .permissionRequired, .placed, .publishReady, .mapping, .resolved, .failed].contains(self.state) {
                self.transition(to: quality == .normal ? .scanning : .initializing, message: trackingMessage)
            }
        }
    }

    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let quality: WorldMappingQuality
        switch frame.worldMappingStatus {
        case .notAvailable: quality = .notAvailable
        case .limited: quality = .limited
        case .extending: quality = .extending
        case .mapped: quality = .mapped
        @unknown default: quality = .notAvailable
        }
        let lookingX = Double(-frame.camera.transform.columns.2.x)
        let lookingY = Double(-frame.camera.transform.columns.2.y)
        let lookingZ = Double(-frame.camera.transform.columns.2.z)
        let pitch = asin(max(-1, min(1, lookingY))) * 180 / .pi
        var yaw = atan2(lookingX, -lookingZ) * 180 / .pi
        if yaw < 0 { yaw += 360 }
        let featurePointCount = frame.rawFeaturePoints?.points.count ?? 0
        let planeCount = frame.anchors.reduce(into: 0) { count, anchor in
            if anchor is ARPlaneAnchor { count += 1 }
        }
        let meshCount = frame.anchors.reduce(into: 0) { count, anchor in
            if anchor is ARMeshAnchor { count += 1 }
        }
        let sample = FrameSample(
            quality: quality, pitch: pitch, yaw: yaw,
            featurePointCount: featurePointCount, planeCount: planeCount, meshCount: meshCount
        )
        // No delegateQueue is set, so ARKit calls this on the main thread: handle the frame inline
        // instead of allocating a Task per frame (60 Hz). The fallback hop keeps it safe if a
        // delegate queue is ever configured.
        let forwarded = SendableARFrame(frame: frame)
        if Thread.isMainThread {
            MainActor.assumeIsolated { self.handleFrame(forwarded.frame, sample: sample) }
        } else {
            Task { @MainActor [weak self] in self?.handleFrame(forwarded.frame, sample: sample) }
        }
    }

    private struct FrameSample: Sendable {
        let quality: WorldMappingQuality
        let pitch: Double
        let yaw: Double
        let featurePointCount: Int
        let planeCount: Int
        let meshCount: Int
    }

    /// Diagnostic counters change nearly every frame; publishing them at most this often keeps
    /// views that read them from re-rendering at frame rate.
    nonisolated static let frameCountersMinimumInterval: TimeInterval = 0.25

    private func handleFrame(_ frame: ARFrame, sample: FrameSample) {
        // ARCore (Geospatial + Cloud Anchors) runs on these same ARKit frames, every frame.
        frameSink?(frame)
        let now = Date()
        let quality = sample.quality
        let mappingChanged = mappingQuality != quality
        lastFrameReceivedAt = now
        if !hasRecentCameraFrame { hasRecentCameraFrame = true }
        if mappingChanged { mappingQuality = quality }
        if let anchor = currentAnchor, anchor.worldMappingStatus != quality {
            currentAnchor?.worldMappingStatus = quality
        }
        if mappingChanged || now.timeIntervalSince(lastFrameCountersAt) >= Self.frameCountersMinimumInterval {
            lastFrameCountersAt = now
            if rawFeaturePointCount != sample.featurePointCount { rawFeaturePointCount = sample.featurePointCount }
            if planeAnchorCount != sample.planeCount { planeAnchorCount = sample.planeCount }
            if meshAnchorCount != sample.meshCount { meshAnchorCount = sample.meshCount }
        }
        if abs(cameraPitchDegrees - sample.pitch) >= 1.5 {
            cameraPitchDegrees = sample.pitch
        }
        if compassWorldAlignment {
            let shouldPublish = cameraYawDegrees.map { abs($0 - sample.yaw) >= 1.5 } ?? true
            if shouldPublish { cameraYawDegrees = sample.yaw }
        } else if cameraYawDegrees != nil {
            cameraYawDegrees = nil
        }
        if mappingChanged || lastFrameDiagnosticAt.map({ now.timeIntervalSince($0) >= 5 }) != false {
            lastFrameDiagnosticAt = now
            let message = "AR frame: \(mappingDiagnosticSummary)"
            logger.info("\(message, privacy: .public)")
            recordDiagnostic(message)
        }
        probeCenterCandidateIfNeeded()
    }

    nonisolated func sessionWasInterrupted(_ session: ARSession) {
        Task { @MainActor [weak self] in
#if targetEnvironment(simulator)
            self?.hasRecentCameraFrame = true
#else
            self?.hasRecentCameraFrame = false
            self?.transition(to: .interrupted, message: "AR oturumu kesildi.")
#endif
        }
    }

    nonisolated func sessionInterruptionEnded(_ session: ARSession) {
        Task { @MainActor [weak self] in
            guard let self, !self.pausedForThermalPressure else { return }
#if targetEnvironment(simulator)
            self.hasRecentCameraFrame = true
            if self.state == .interrupted { self.transition(to: .scanning, message: "Simülatör kamerası sınırlı. Pin arayüzü açık.") }
#else
            self.resumeInterruptedSession()
#endif
        }
    }

    nonisolated func session(_ session: ARSession, didFailWithError error: Error) {
        Task { @MainActor [weak self] in
#if targetEnvironment(simulator)
            self?.hasRecentCameraFrame = true
            self?.trackingQuality = .normal
            if self?.state == .failed || self?.state == .interrupted {
                self?.transition(to: .initializing, message: "Simülatör kamerası sınırlı. Pin arayüzü açık.")
            }
            if self?.state == .initializing {
                self?.transition(to: .scanning, message: "Simülatör kamerası sınırlı. Pin arayüzü açık.")
            }
#else
            self?.hasRecentCameraFrame = false
            self?.transition(to: .failed, message: "AR oturumu beklenmedik şekilde durdu. Tekrar deneyin.")
#endif
        }
    }

    nonisolated func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool { true }
}
