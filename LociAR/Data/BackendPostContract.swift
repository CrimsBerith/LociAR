import Foundation

enum PostContractError: LocalizedError {
    case missingGeoPose
    case profileNotReady

    var errorDescription: String? {
        switch self {
        case .missingGeoPose: "Yayınlamak için geçerli GPS konumu gerekiyor. Konum iznini açıp tekrar deneyin."
        case .profileNotReady: "Profilin henüz hazırlanıyor. Post birazdan otomatik olarak yeniden denenecek."
        }
    }
}

struct BackendPostRow: Decodable, Sendable {
    let id: UUID
    let creatorID: UUID
    let creatorHandle: String?
    let createdAt: Date
    let pose: BackendPose
    let editData: EditData
    let contentSource: ContentSource?
    let linkPreview: LinkPreview?
    let caption: String
    let status: PostStatus
    let visibility: Visibility
    let ageRating: AgeRating
    let anchorBundle: AnchorBundle?
    let viewsCount: Int?
    let likesCount: Int?
    let commentsCount: Int?

    enum CodingKeys: String, CodingKey {
        case id, pose, caption, status, visibility
        case creatorID = "creator_id"
        case creatorHandle = "creator_handle"
        case createdAt = "created_at"
        case editData = "edit_data"
        case contentSource = "content_source"
        case linkPreview = "link_preview"
        case ageRating = "age_rating"
        case anchorBundle = "anchor_bundle"
        case viewsCount = "views_count"
        case likesCount = "likes_count"
        case commentsCount = "comments_count"
    }

    func domainPost() -> LociPost {
        var bundle = anchorBundle ?? pose.fallbackAnchorBundle
        if bundle.anchor.geoPose == nil {
            bundle.anchor.geoPose = GeoPose(
                latitude: pose.latitude, longitude: pose.longitude, altitude: pose.altitude,
                heading: pose.heading, accuracy: pose.accuracy
            )
        }
        return LociPost(
            id: id, creatorID: creatorID, creatorHandle: creatorHandle, createdAt: createdAt,
            caption: caption, status: status, visibility: visibility, ageRating: ageRating,
            anchorBundle: bundle, editData: editData, contentSource: contentSource,
            counts: PostCounts(views: viewsCount ?? 0, likes: likesCount ?? 0, comments: commentsCount ?? 0),
            linkPreview: (linkPreview?.isEmpty ?? true) ? nil : linkPreview
        )
    }
}

struct BackendPose: Codable, Hashable, Sendable {
    let latitude: Double
    let longitude: Double
    let altitude: Double?
    let heading: Double
    let accuracy: Double?
    let anchor: BackendSurfaceAnchor?

    var fallbackAnchorBundle: AnchorBundle {
        let physical = anchor?.coordinateSpace == "arkit_world"
        let surface = SurfaceAnchor(
            id: anchor?.nativeAnchorID ?? UUID(),
            transform: anchor?.matrix ?? Array(repeating: 0, count: 16),
            pinQuality: physical ? .estimatedPlane : .freeSpaceApproximate,
            hitSource: physical ? .legacyUnknown : .frontOfCamera,
            surfaceAlignment: anchor?.surfaceAlignment ?? (physical ? .unknown : .freeSpace),
            trackingQuality: anchor?.trackingQuality ?? .unknown,
            worldMappingStatus: .notAvailable,
            surfaceNormal: anchor?.surfaceNormal,
            physicalRectMeters: anchor?.physicalRectMeters,
            geoPose: GeoPose(latitude: latitude, longitude: longitude, altitude: altitude, heading: heading, accuracy: accuracy),
            capturedAt: anchor?.capturedAt ?? Date(),
            persistence: anchor?.persistence
        )
        return AnchorBundle(schemaVersion: 1, provider: anchor?.provider ?? "arkit", coordinateSpace: anchor?.coordinateSpace ?? "arkit_world", anchor: surface)
    }
}

struct BackendSurfaceAnchor: Codable, Hashable, Sendable {
    let coordinateSpace: String
    let provider: String?
    let x: Float
    let y: Float
    let z: Float
    let yaw: Float
    let pitch: Float
    let roll: Float
    let capturedAt: Date?
    let nativeAnchorID: UUID?
    let trackingQuality: TrackingQuality?
    let surfaceAlignment: SurfaceAlignment?
    let surfaceNormal: Vector3?
    let physicalRectMeters: PhysicalRectMeters?
    let persistence: WorldLockPersistence?

    enum CodingKeys: String, CodingKey {
        case coordinateSpace, provider, x, y, z, yaw, pitch, roll, capturedAt
        case nativeAnchorID = "nativeAnchorId"
        case trackingQuality, surfaceAlignment, surfaceNormal, physicalRectMeters, persistence
    }

    var matrix: [Float] {
        var result = Array(repeating: Float(0), count: 16)
        result[0] = 1; result[5] = 1; result[10] = 1; result[15] = 1
        result[12] = x; result[13] = y; result[14] = z
        return result
    }
}

struct PublicProfileProjection: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let handle: String
    let avatarURL: URL?
    let bio: String?
    let publicPostCount: Int
    let followerCount: Int
    let followingCount: Int

    enum CodingKeys: String, CodingKey {
        case id, handle, bio
        case avatarURL = "avatar_url"
        case publicPostCount = "public_post_count"
        case followerCount = "follower_count"
        case followingCount = "following_count"
    }
}
