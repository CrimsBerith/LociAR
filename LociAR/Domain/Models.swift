import Foundation

enum PinSessionState: String, Codable, Sendable, CaseIterable {
    case idle
    case permissionRequired
    case initializing
    case coaching
    case scanning
    case candidateReady
    case placing
    case approximateOffered
    case placed
    case mapping
    case publishReady
    case relocalizing
    case resolved
    case interrupted
    case failed

    func canTransition(to next: PinSessionState) -> Bool {
        if next == self { return true }
        if next == .failed || next == .interrupted || next == .idle { return true }
        switch self {
        case .idle: return [.permissionRequired, .initializing].contains(next)
        case .permissionRequired: return next == .initializing
        case .initializing: return [.coaching, .scanning, .relocalizing].contains(next)
        case .coaching: return [.initializing, .scanning, .relocalizing].contains(next)
        case .scanning: return [.candidateReady, .placing, .approximateOffered, .coaching, .relocalizing].contains(next)
        case .candidateReady: return [.scanning, .placing, .approximateOffered, .relocalizing].contains(next)
        case .placing: return [.placed, .approximateOffered, .scanning, .relocalizing].contains(next)
        case .approximateOffered: return [.placed, .scanning, .coaching, .relocalizing].contains(next)
        // A physical pin whose world map could not be saved may be swapped for an explicit
        // approximate placement (user confirms in CreatePostView).
        case .placed: return [.mapping, .publishReady, .scanning, .relocalizing, .approximateOffered].contains(next)
        case .mapping: return [.publishReady, .placed, .scanning, .relocalizing, .approximateOffered].contains(next)
        case .publishReady: return [.scanning, .relocalizing].contains(next)
        case .relocalizing: return [.resolved, .coaching, .scanning].contains(next)
        case .resolved: return [.relocalizing, .scanning].contains(next)
        case .interrupted: return [.relocalizing, .initializing].contains(next)
        case .failed: return [.initializing, .relocalizing].contains(next)
        }
    }
}

enum PinQuality: String, Codable, Sendable, CaseIterable {
    case planeGeometry
    case estimatedPlane
    case freeSpaceApproximate

    var isPhysicalSurface: Bool { self != .freeSpaceApproximate }
}

enum PinHitSource: String, Codable, Sendable {
    case planeGeometry
    case estimatedPlane
    case sceneMesh
    case frontOfCamera
    case legacyUnknown
}

enum SurfaceAlignment: String, Codable, Sendable {
    case horizontal
    case vertical
    case angled
    case freeSpace = "free_space"
    case unknown
}

enum TrackingQuality: String, Codable, Sendable {
    case unknown
    case limited
    case normal
    case unavailable
}

enum WorldMappingQuality: String, Codable, Sendable {
    case notAvailable
    case limited
    case extending
    case mapped

    var canPersist: Bool { self == .limited || self == .extending || self == .mapped }
}

struct Vector3: Codable, Hashable, Sendable {
    var x: Float
    var y: Float
    var z: Float
}

struct PhysicalRectMeters: Codable, Hashable, Sendable {
    var width: Float
    var height: Float

    static let sizeScale: Float = 1.5
    static let preview = PhysicalRectMeters(width: 0.18 * sizeScale, height: 0.10 * sizeScale)
    static let `default` = PhysicalRectMeters(width: 0.30 * sizeScale, height: 0.34 * sizeScale)
    static let minimum = PhysicalRectMeters(width: 0.08 * sizeScale, height: 0.05 * sizeScale)
    static let textMaximum = PhysicalRectMeters(width: 0.24 * sizeScale, height: 0.09 * sizeScale)
    static let textMinimumHeight: Float = 0.030 * sizeScale
    static let externalMaximumHeight: Float = 0.20 * sizeScale
    static let metersPerPixel: Float = 0.00048 * sizeScale
    static let previewCornerRadius: Float = 0.014 * sizeScale
}

struct GeoPose: Codable, Hashable, Sendable {
    var latitude: Double
    var longitude: Double
    var altitude: Double?
    var heading: Double
    var accuracy: Double?
}

/// Precise pose from Google ARCore Geospatial (VPS). Present only when Earth tracking was
/// localized well enough at pin time; old posts decode it as nil.
struct GeospatialPose: Codable, Hashable, Sendable {
    var latitude: Double
    var longitude: Double
    var altitude: Double
    /// East-Up-South orientation quaternion (x, y, z, w).
    var eusQuaternion: [Float]
    var horizontalAccuracy: Double
    var verticalAccuracy: Double
    var yawAccuracy: Double

    /// Pins are only geo-tagged when ARCore reports at most this horizontal error (meters).
    nonisolated static let maximumHorizontalAccuracy: Double = 5
    nonisolated static let maximumYawAccuracy: Double = 15

    var isValid: Bool {
        abs(latitude) <= 90 && abs(longitude) <= 180 && altitude.isFinite
            && eusQuaternion.count == 4 && eusQuaternion.allSatisfy(\.isFinite)
            && horizontalAccuracy >= 0 && horizontalAccuracy <= Self.maximumHorizontalAccuracy
            && yawAccuracy >= 0 && yawAccuracy <= Self.maximumYawAccuracy
    }
}

struct WorldLockPersistence: Codable, Hashable, Sendable {
    enum Kind: String, Codable, Sendable {
        case arkitWorldMap = "arkit_world_map"
        /// Google ARCore Cloud Anchor (hosted with keyless auth, up to 365 days).
        case arcoreCloudAnchor = "arcore_cloud_anchor"
    }

    var version: Int = 1
    var kind: Kind = .arkitWorldMap
    var originalNativeAnchorId: UUID
    var assetURI: String?
    var assetURL: String?
    var referenceImageURI: String?
    var storagePath: String?
    var cloudAnchorId: String?
    var hostedAt: Date
    var expiresAt: Date?

    /// A Cloud Anchor that can still be resolved.
    var resolvableCloudAnchorId: String? {
        guard kind == .arcoreCloudAnchor, !isExpired, let cloudAnchorId, !cloudAnchorId.isEmpty else { return nil }
        return cloudAnchorId
    }

    var isExpired: Bool {
        guard let expiresAt else { return false }
        return expiresAt < Date()
    }

    var expiresWithin24Hours: Bool {
        guard let expiresAt else { return false }
        let interval = expiresAt.timeIntervalSinceNow
        return interval > 0 && interval < 86_400
    }
}

struct SurfaceAnchor: Codable, Hashable, Sendable, Identifiable {
    var id: UUID
    var transform: [Float]
    var pinQuality: PinQuality
    var hitSource: PinHitSource
    var surfaceAlignment: SurfaceAlignment
    var trackingQuality: TrackingQuality
    var worldMappingStatus: WorldMappingQuality
    var surfaceNormal: Vector3?
    var physicalRectMeters: PhysicalRectMeters?
    var geoPose: GeoPose?
    var geospatial: GeospatialPose?
    var capturedAt: Date
    var persistence: WorldLockPersistence?

    init(
        id: UUID = UUID(),
        transform: [Float],
        pinQuality: PinQuality,
        hitSource: PinHitSource,
        surfaceAlignment: SurfaceAlignment,
        trackingQuality: TrackingQuality,
        worldMappingStatus: WorldMappingQuality,
        surfaceNormal: Vector3? = nil,
        physicalRectMeters: PhysicalRectMeters? = nil,
        geoPose: GeoPose? = nil,
        geospatial: GeospatialPose? = nil,
        capturedAt: Date = Date(),
        persistence: WorldLockPersistence? = nil
    ) {
        self.id = id
        self.transform = transform
        self.pinQuality = pinQuality
        self.hitSource = hitSource
        self.surfaceAlignment = surfaceAlignment
        self.trackingQuality = trackingQuality
        self.worldMappingStatus = worldMappingStatus
        self.surfaceNormal = surfaceNormal
        self.physicalRectMeters = physicalRectMeters
        self.geoPose = geoPose
        self.geospatial = geospatial
        self.capturedAt = capturedAt
        self.persistence = persistence
    }
}

struct AnchorBundle: Codable, Hashable, Sendable {
    var schemaVersion: Int
    var provider: String
    var coordinateSpace: String
    var anchor: SurfaceAnchor

    init(schemaVersion: Int = 2, provider: String? = nil, coordinateSpace: String? = nil, anchor: SurfaceAnchor) {
        self.schemaVersion = schemaVersion
        self.provider = provider ?? (anchor.pinQuality == .freeSpaceApproximate ? "native_ios_camera" : "arkit")
        self.coordinateSpace = coordinateSpace ?? (anchor.pinQuality == .freeSpaceApproximate ? "camera_free_space" : "arkit_world")
        self.anchor = anchor
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, provider, coordinateSpace, anchor
        // Legacy fields stored directly on the bundle.
        case nativeAnchorId, planeTransform, surfaceNormal, physicalRectMeters
        case trackingQuality, surfaceAlignment, geoPose, geospatial, persistence, capturedAt
        case pinQuality, hitSource, worldMappingStatus
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try values.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
        provider = try values.decodeIfPresent(String.self, forKey: .provider) ?? "arkit"
        coordinateSpace = try values.decodeIfPresent(String.self, forKey: .coordinateSpace) ?? "arkit_world"
        if let nested = try values.decodeIfPresent(SurfaceAnchor.self, forKey: .anchor) {
            anchor = nested
            return
        }

        let quality = try values.decodeIfPresent(PinQuality.self, forKey: .pinQuality) ?? .estimatedPlane
        let nativeID = (try? values.decodeIfPresent(UUID.self, forKey: .nativeAnchorId)) ?? UUID()
        anchor = SurfaceAnchor(
            id: nativeID,
            transform: try values.decodeIfPresent([Float].self, forKey: .planeTransform) ?? [],
            pinQuality: quality,
            hitSource: try values.decodeIfPresent(PinHitSource.self, forKey: .hitSource) ?? .legacyUnknown,
            surfaceAlignment: try values.decodeIfPresent(SurfaceAlignment.self, forKey: .surfaceAlignment) ?? (quality == .freeSpaceApproximate ? .freeSpace : .unknown),
            trackingQuality: try values.decodeIfPresent(TrackingQuality.self, forKey: .trackingQuality) ?? .unknown,
            worldMappingStatus: try values.decodeIfPresent(WorldMappingQuality.self, forKey: .worldMappingStatus) ?? .notAvailable,
            surfaceNormal: try values.decodeIfPresent(Vector3.self, forKey: .surfaceNormal),
            physicalRectMeters: try values.decodeIfPresent(PhysicalRectMeters.self, forKey: .physicalRectMeters),
            geoPose: try values.decodeIfPresent(GeoPose.self, forKey: .geoPose),
            geospatial: try? values.decodeIfPresent(GeospatialPose.self, forKey: .geospatial),
            capturedAt: try values.decodeIfPresent(Date.self, forKey: .capturedAt) ?? Date(),
            persistence: try values.decodeIfPresent(WorldLockPersistence.self, forKey: .persistence)
        )
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(schemaVersion, forKey: .schemaVersion)
        try values.encode(provider, forKey: .provider)
        try values.encode(coordinateSpace, forKey: .coordinateSpace)
        // Preserve the existing JSONB shape while adding v2 quality fields.
        try values.encode(anchor.id, forKey: .nativeAnchorId)
        try values.encode(anchor.transform, forKey: .planeTransform)
        try values.encodeIfPresent(anchor.surfaceNormal, forKey: .surfaceNormal)
        try values.encodeIfPresent(anchor.physicalRectMeters, forKey: .physicalRectMeters)
        try values.encode(anchor.trackingQuality, forKey: .trackingQuality)
        try values.encode(anchor.surfaceAlignment, forKey: .surfaceAlignment)
        try values.encodeIfPresent(anchor.geoPose, forKey: .geoPose)
        try values.encodeIfPresent(anchor.geospatial, forKey: .geospatial)
        try values.encodeIfPresent(anchor.persistence, forKey: .persistence)
        try values.encode(anchor.capturedAt, forKey: .capturedAt)
        try values.encode(anchor.pinQuality, forKey: .pinQuality)
        try values.encode(anchor.hitSource, forKey: .hitSource)
        try values.encode(anchor.worldMappingStatus, forKey: .worldMappingStatus)
    }
}

enum PostStatus: String, Codable, Sendable {
    case draft
    case pendingReview = "pending_review"
    case active
    case removed
    case blockedProtectedZone = "blocked_protected_zone"
    case flagged
}
enum Visibility: String, Codable, Sendable { case `public`, friends, `private` }
enum AgeRating: String, Codable, Sendable { case all, plus13 = "13_plus", plus16 = "16_plus", plus18 = "18_plus" }

struct LociUser: Codable, Hashable, Sendable, Identifiable {
    var id: UUID
    var handle: String
    var avatarURL: URL?
    var email: String?
    var role: String = "user"
}

enum ContentSource: Hashable, Sendable {
    case text(String)
    case image(URL)
    case video(URL)
    case spotify(URL)
    case youtube(URL)
    case facebook(URL)
    case instagram(URL)
    case x(URL)
    case external(URL)
}

enum ExternalMediaPlatform: String, CaseIterable, Hashable, Identifiable, Sendable {
    case spotify = "Spotify"
    case youtube = "YouTube"
    case facebook = "Facebook"
    case instagram = "Instagram"
    case x = "X"

    var id: Self { self }

    var appLaunchURL: URL {
        switch self {
        case .spotify: URL(string: "spotify:")!
        case .youtube: URL(string: "youtube://")!
        case .facebook: URL(string: "fb://")!
        case .instagram: URL(string: "instagram://")!
        case .x: URL(string: "twitter://")!
        }
    }

    var webLaunchURL: URL {
        switch self {
        case .spotify: URL(string: "https://open.spotify.com/search")!
        case .youtube: URL(string: "https://www.youtube.com")!
        case .facebook: URL(string: "https://www.facebook.com")!
        case .instagram: URL(string: "https://www.instagram.com")!
        case .x: URL(string: "https://x.com")!
        }
    }

    var linkHint: String {
        switch self {
        case .spotify: String(localized: "open.spotify.com bağlantısı")
        case .youtube: String(localized: "youtube.com veya youtu.be bağlantısı")
        case .facebook: String(localized: "facebook.com gönderi, video veya Reels bağlantısı")
        case .instagram: String(localized: "instagram.com gönderi veya Reels bağlantısı")
        case .x: String(localized: "x.com gönderi bağlantısı")
        }
    }
}

extension ContentSource {
    var externalMedia: (platform: ExternalMediaPlatform, url: URL)? {
        switch self {
        case .spotify(let url): (.spotify, url)
        case .youtube(let url): (.youtube, url)
        case .facebook(let url): (.facebook, url)
        case .instagram(let url): (.instagram, url)
        case .x(let url): (.x, url)
        default: nil
        }
    }
}

enum ExternalMediaParser {
    static func parseSharedText(_ input: String) -> ContentSource? {
        if let direct = parse(input) { return direct }
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }
        let range = NSRange(input.startIndex..<input.endIndex, in: input)
        for match in detector.matches(in: input, options: [], range: range) {
            guard let url = match.url, let parsed = parse(url.absoluteString) else { continue }
            return parsed
        }
        return nil
    }

    static func parse(_ input: String) -> ContentSource? {
        let clean = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: clean),
              components.scheme?.lowercased() == "https",
              components.user == nil,
              components.password == nil,
              let url = components.url,
              let host = components.host?.lowercased() else { return nil }

        let rawPathParts = components.path.split(separator: "/").map(String.init)
        if host == "spotify.link", rawPathParts.count == 1, !rawPathParts[0].isEmpty {
            return .spotify(url)
        }
        let spotifyParts = (rawPathParts.first?.lowercased().hasPrefix("intl-") == true)
            ? Array(rawPathParts.dropFirst())
            : rawPathParts
        if host == "open.spotify.com", spotifyParts.count >= 2,
           ["track", "album", "playlist", "episode", "show", "artist"].contains(spotifyParts[0].lowercased()) {
            return .spotify(url)
        }
        if host == "youtu.be", rawPathParts.count == 1, !rawPathParts[0].isEmpty {
            return .youtube(url)
        }
        if ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].contains(host) {
            let first = rawPathParts.first?.lowercased()
            let isWatch = components.path == "/watch" && components.queryItems?.contains(where: { $0.name == "v" && !($0.value ?? "").isEmpty }) == true
            let isKnownVideoPath = ["shorts", "live", "embed"].contains(first) && rawPathParts.count >= 2
            if isWatch || isKnownVideoPath { return .youtube(url) }
        }
        if host == "fb.watch", !rawPathParts.isEmpty {
            return .facebook(url)
        }
        if ["facebook.com", "www.facebook.com", "m.facebook.com"].contains(host) {
            let first = rawPathParts.first?.lowercased()
            let second = rawPathParts.count > 1 ? rawPathParts[1].lowercased() : nil
            let isDirectMedia = ["reel", "reels", "videos"].contains(first) && rawPathParts.count >= 2
            let isProfilePost = rawPathParts.count >= 3 && ["posts", "videos"].contains(second)
            let isSharedMedia = first == "share" && rawPathParts.count >= 3 && ["p", "r", "v"].contains(second)
            let isWatch = first == "watch" && components.queryItems?.contains(where: { $0.name == "v" && !($0.value ?? "").isEmpty }) == true
            if isDirectMedia || isProfilePost || isSharedMedia || isWatch { return .facebook(url) }
        }
        if ["instagram.com", "www.instagram.com"].contains(host),
           rawPathParts.count >= 2 {
            let first = rawPathParts[0].lowercased()
            if ["p", "reel", "reels", "tv"].contains(first) && !rawPathParts[1].isEmpty {
                return .instagram(url)
            }
            if first == "share" && rawPathParts.count >= 3 && ["p", "r"].contains(rawPathParts[1].lowercased()) {
                return .instagram(url)
            }
        }
        if ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "fixupx.com", "vxtwitter.com", "fxtwitter.com"].contains(host),
           rawPathParts.count >= 3, rawPathParts[1].lowercased() == "status",
           rawPathParts[2].allSatisfy(\.isNumber) {
            return .x(url)
        }
        return nil
    }
}

extension ContentSource: Codable {
    private enum CodingKeys: String, CodingKey { case platform, url, title, mediaKind }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let platform = try values.decodeIfPresent(String.self, forKey: .platform) ?? "other"
        let url = try values.decodeIfPresent(URL.self, forKey: .url)
        let title = try values.decodeIfPresent(String.self, forKey: .title) ?? ""
        let mediaKind = try values.decodeIfPresent(String.self, forKey: .mediaKind) ?? ""
        switch (platform.lowercased(), url) {
        case ("own_video", let url?): self = .video(url)
        case ("spotify", let url?): self = .spotify(url)
        case ("youtube", let url?): self = .youtube(url)
        case ("facebook", let url?): self = .facebook(url)
        case ("instagram", let url?): self = .instagram(url)
        case ("x", let url?), ("twitter", let url?): self = .x(url)
        case (_, let url?) where ["image", "photo"].contains(mediaKind): self = .image(url)
        case (_, let url?): self = .external(url)
        default: self = .text(title)
        }
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .text(let text):
            try values.encode("other", forKey: .platform)
            try values.encode(text, forKey: .title)
        case .image(let url):
            try values.encode("other", forKey: .platform)
            try values.encode(url, forKey: .url)
            try values.encode("image", forKey: .mediaKind)
        case .video(let url):
            try values.encode("own_video", forKey: .platform)
            try values.encode(url, forKey: .url)
            try values.encode("video", forKey: .mediaKind)
        case .spotify(let url):
            try values.encode("spotify", forKey: .platform)
            try values.encode(url, forKey: .url)
            try values.encode("embed", forKey: .mediaKind)
        case .youtube(let url):
            try values.encode("youtube", forKey: .platform)
            try values.encode(url, forKey: .url)
            try values.encode("embed", forKey: .mediaKind)
        case .facebook(let url):
            try values.encode("facebook", forKey: .platform)
            try values.encode(url, forKey: .url)
            try values.encode("embed", forKey: .mediaKind)
        case .instagram(let url):
            try values.encode("instagram", forKey: .platform)
            try values.encode(url, forKey: .url)
            try values.encode("embed", forKey: .mediaKind)
        case .x(let url):
            try values.encode("x", forKey: .platform)
            try values.encode(url, forKey: .url)
            try values.encode("embed", forKey: .mediaKind)
        case .external(let url):
            try values.encode("other", forKey: .platform)
            try values.encode(url, forKey: .url)
            try values.encode("link", forKey: .mediaKind)
        }
    }
}

struct EditLayer: Hashable, Sendable, Identifiable {
    enum Kind: String, Codable, Sendable { case drawing, text, image }
    var id: UUID
    var kind: Kind
    var text: String?
    var assetURL: URL?
    var points: [Float]
    var colorHex: String
    var opacity: Double
    var scale: Double
    var rotation: Double
}

extension EditLayer: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, type, text, uri, points, color, opacity, scale, rotation
        case x, y, zIndex, strokeWidth, fontSize, width, height
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        kind = try values.decode(Kind.self, forKey: .type)
        text = try values.decodeIfPresent(String.self, forKey: .text)
        assetURL = try values.decodeIfPresent(URL.self, forKey: .uri)
        if let pairs = try? values.decode([Vector2].self, forKey: .points) {
            points = pairs.flatMap { [$0.x, $0.y] }
        } else {
            points = []
        }
        colorHex = try values.decodeIfPresent(String.self, forKey: .color) ?? "#FFFFFF"
        opacity = try values.decodeIfPresent(Double.self, forKey: .opacity) ?? 1
        scale = try values.decodeIfPresent(Double.self, forKey: .scale) ?? 1
        rotation = try values.decodeIfPresent(Double.self, forKey: .rotation) ?? 0
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(kind, forKey: .type)
        try values.encode(0, forKey: .x)
        try values.encode(0, forKey: .y)
        try values.encode(scale, forKey: .scale)
        try values.encode(rotation, forKey: .rotation)
        try values.encode(opacity, forKey: .opacity)
        try values.encode(0, forKey: .zIndex)
        try values.encodeIfPresent(text, forKey: .text)
        try values.encodeIfPresent(assetURL, forKey: .uri)
        try values.encode(colorHex, forKey: .color)
        switch kind {
        case .drawing:
            let pairs = stride(from: 0, to: points.count - points.count % 2, by: 2).map { Vector2(x: points[$0], y: points[$0 + 1]) }
            try values.encode(pairs, forKey: .points)
            try values.encode(5, forKey: .strokeWidth)
        case .text:
            try values.encode(32, forKey: .fontSize)
        case .image:
            try values.encode(1_080, forKey: .width)
            try values.encode(1_920, forKey: .height)
        }
    }
}

private struct Vector2: Codable, Hashable, Sendable { let x: Float; let y: Float }

struct EditData: Hashable, Sendable {
    var version: Int = 1
    var layers: [EditLayer] = []
    var canvasWidth: Double = 1080
    var canvasHeight: Double = 1920
    var surfaceTextureURL: URL?
}

extension EditData: Codable {
    private enum CodingKeys: String, CodingKey { case version, layers, canvas, surfaceTextureUri }
    private struct Canvas: Codable { let width: Double; let height: Double }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1
        layers = try values.decodeIfPresent([EditLayer].self, forKey: .layers) ?? []
        let canvas = try values.decodeIfPresent(Canvas.self, forKey: .canvas) ?? Canvas(width: 1_080, height: 1_920)
        canvasWidth = canvas.width
        canvasHeight = canvas.height
        surfaceTextureURL = try values.decodeIfPresent(URL.self, forKey: .surfaceTextureUri)
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(version, forKey: .version)
        try values.encode(layers, forKey: .layers)
        try values.encode(Canvas(width: canvasWidth, height: canvasHeight), forKey: .canvas)
        try values.encodeIfPresent(surfaceTextureURL, forKey: .surfaceTextureUri)
    }
}

struct LociPost: Codable, Hashable, Sendable, Identifiable {
    var id: UUID
    var creatorID: UUID
    var creatorHandle: String?
    var createdAt: Date
    var caption: String
    var status: PostStatus
    var visibility: Visibility
    var ageRating: AgeRating
    var anchorBundle: AnchorBundle
    var editData: EditData
    var contentSource: ContentSource?
    var counts: PostCounts
}

struct PostCounts: Codable, Hashable, Sendable {
    var views: Int = 0
    var likes: Int = 0
    var comments: Int = 0
}

struct ActivityItem: Identifiable, Hashable, Sendable {
    var id = UUID()
    var symbol: String
    var title: String
    var detail: String
    var date: Date
}
