import Foundation
import OSLog
@preconcurrency import FirebaseAuth
@preconcurrency import FirebaseFirestore

struct PostPublishReceipt: Decodable, Equatable, Sendable {
    let postID: UUID
    let status: PostStatus
    let placementState: String?
    let idempotentReplay: Bool
}

enum PostPublishError: LocalizedError, Sendable {
    case rejected(String)

    var errorDescription: String? {
        switch self {
        case .rejected(let message): message
        }
    }
}

struct PostPage: Sendable {
    let posts: [LociPost]
    let next: String?
}

/// One corrupt legacy row must not make every otherwise valid post on the page unavailable.
/// The cursor still belongs to the raw server page, including discarded rows.
struct BackendPostPageResponse: Decodable, Sendable {
    let posts: [BackendPostRow]
    let next: String?
    private enum CodingKeys: String, CodingKey { case posts, next }
    private struct Row: Decodable, Sendable {
        let value: BackendPostRow?
        init(from decoder: Decoder) throws { value = try? BackendPostRow(from: decoder) }
    }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        posts = try values.decode([Row].self, forKey: .posts).compactMap(\.value)
        next = try values.decodeIfPresent(String.self, forKey: .next)
    }
}

protocol PostRepository: Sendable {
    func nearby(latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [LociPost]
    func discoverPage(cursor: String?) async throws -> PostPage
    func myPostsPage(cursor: String?) async throws -> PostPage
    func publicPostsPage(creatorID: UUID, cursor: String?) async throws -> PostPage
    func discover() async throws -> [LociPost]
    func publish(_ post: LociPost) async throws -> PostPublishReceipt
    func myPosts(limit: Int) async throws -> [LociPost]
    func publicPosts(creatorID: UUID, limit: Int) async throws -> [LociPost]
    func publicProfile(creatorID: UUID) async throws -> PublicProfileProjection?
    func publicPost(id: UUID) async throws -> LociPost?
    func removeOwnPost(id: UUID) async throws
}

/// Public projections use readPublicContent for author fences and both block directions.
/// Owner lists use Firestore; writes use createPost / deleteOwnPost.
final class FirestorePostRepository: PostRepository, @unchecked Sendable {
    private let callables: CallableClient
    private let blockCache = BlockListCache.shared
    private let logger = Logger(subsystem: "com.khankartal.lociar", category: "posts")

    init(callables: CallableClient) { self.callables = callables }

    private var posts: CollectionReference { Firestore.firestore().collection("posts") }

    private typealias PublicResponse = BackendPostPageResponse
    private struct PublicRequest: Encodable {
        let mode: String
        var creatorId: String? = nil
        var postId: String? = nil
        var cursor: String? = nil
        var latitude: Double? = nil
        var longitude: Double? = nil
        var radiusMeters: Double? = nil
    }
    private func projected(_ request: PublicRequest) async throws -> PostPage {
        let response: PublicResponse = try await callables.call("readPublicContent", payload: request, timeout: 60)
        let posts = response.posts.map { $0.domainPost() }
        return PostPage(posts: await withoutHidden(posts), next: response.next)
    }
    func nearby(latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [LociPost] {
        try await projected(PublicRequest(mode: "nearby", latitude: latitude, longitude: longitude, radiusMeters: max(1,min(radiusMeters,20_000_000)))).posts
    }
    func discover() async throws -> [LociPost] { try await discoverPage(cursor: nil).posts }
    func discoverPage(cursor: String?) async throws -> PostPage { try await projected(PublicRequest(mode: "discover", cursor: cursor)) }
    func publicPostsPage(creatorID: UUID, cursor: String?) async throws -> PostPage {
        try await projected(PublicRequest(mode: "creator", creatorId: FirebaseIdentity.key(creatorID), cursor: cursor))
    }

    func publish(_ post: LociPost) async throws -> PostPublishReceipt {
        try Task.checkCancellation()
        guard FirebaseIdentity.currentLUID() == post.creatorID else { throw AuthFlowError.notSignedIn }
        // A lost createPost response can leave a completed post in the local queue. Read its
        // authoritative receipt before reopening a map draft or accessing already removed files.
        struct ExistingResponse: Decodable { let receipt: PostPublishReceipt? }
        let existing: ExistingResponse = try await callables.call("readPublicContent", payload: PublicRequest(mode: "own_receipt", postId: FirebaseIdentity.key(post.id)))
        guard FirebaseIdentity.currentLUID() == post.creatorID else { throw AuthFlowError.notSignedIn }
        if let receipt = existing.receipt { return receipt }
        // Posts queued before photo/video removal (29 Sep 2026) would be refused by Storage and
        // createPost; fail them permanently instead of retrying uploads.
        if post.containsDeviceMedia {
            throw PostPublishError.rejected(String(localized: "Fotoğraf ve video içeren postlar artık desteklenmiyor. Postu metin olarak yeniden oluştur."))
        }
        let worldMapReadyPost: LociPost
        do {
            worldMapReadyPost = try await WorldMapStore().uploadLocalPersistenceIfNeeded(in: post)
        } catch let error as WorldMapCodec.CodecError {
            // Retrying cannot make the map smaller: fail permanently with an actionable message.
            throw PostPublishError.rejected(error.localizedDescription)
        }
        let post = try await MediaAssetStore.uploadLocalAssets(in: worldMapReadyPost)
        guard let geo = post.anchorBundle.anchor.geoPose else { throw PostContractError.missingGeoPose }
        let placement = BackendPlacementContract(anchor: post.anchorBundle.anchor)
        let payload = CreatePostPayload(
            userId: FirebaseIdentity.key(post.creatorID),
            clientMutationId: post.id.uuidString.lowercased(),
            pose: PublishPose(geo: geo, surface: post.anchorBundle.anchor),
            refImageUri: "native-ar-reference://none", // camera frames are not stored (privacy)
            editData: post.editData,
            contentSource: post.contentSource,
            caption: post.caption,
            ageRating: post.ageRating,
            visibility: post.visibility,
            placementState: placement.state,
            placementQuality: placement.qualityScore,
            resolverStrategy: placement.resolverStrategy,
            nativeProvider: placement.nativeProvider,
            anchorBundle: post.anchorBundle
        )
        do {
            let response: CreatePostResponse = try await callables.call("createPost", payload: payload, timeout: 60)
            return PostPublishReceipt(
                postID: response.post.id,
                status: response.publishStatus,
                placementState: response.post.placementState,
                idempotentReplay: response.idempotentReplay ?? false
            )
        } catch BackendCallError.rejected(_, let message, let reason) where reason == "profile_missing" || message.contains("Profile missing") {
            // First-sign-in race: ensureProfile has not finished yet. Retryable, keep the uploads.
            throw PostContractError.profileNotReady
        } catch BackendCallError.rejected(_, let message, let reason) {
            // Server refused (validation, protected zone, rate limit): uploaded media is orphaned.
            await MediaAssetStore.removeRemoteAssets(ownerID: post.creatorID, postID: post.id)
            throw PostPublishError.rejected(Self.serverMessage(message, reason: reason))
        }
        // Network/transient errors propagate untouched; the call is idempotent on clientMutationId,
        // so a retry reuses the already-uploaded media.
    }

    func myPosts(limit: Int = 50) async throws -> [LociPost] {
        guard let me = FirebaseIdentity.currentLUID() else { return [] }
        let snapshot = try await posts
            .whereField("creator_id", isEqualTo: FirebaseIdentity.key(me))
            .order(by: "created_at", descending: true)
            .limit(to: max(1, min(limit, 200)))
            .getDocuments()
        return await materialize(snapshot.documents.map { ($0.documentID, $0.data()) })
    }

    func publicPosts(creatorID: UUID, limit: Int = 60) async throws -> [LociPost] {
        Array(try await publicPostsPage(creatorID: creatorID, cursor: nil).posts.prefix(limit))
    }
    func publicProfile(creatorID: UUID) async throws -> PublicProfileProjection? {
        struct Profile: Decodable { let id: UUID; let handle: String; let avatar_url: String?; let avatar_preset: String?; let bio: String?; let public_post_count: Int; let follower_count: Int; let following_count: Int }
        struct Response: Decodable { let profile: Profile? }
        let response: Response = try await callables.call("readPublicContent", payload: PublicRequest(mode: "profile", creatorId: FirebaseIdentity.key(creatorID)))
        guard let p = response.profile else { return nil }
        let avatar = await AvatarReference.resolve(avatarURL: p.avatar_url, preset: p.avatar_preset)
        return PublicProfileProjection(id: p.id, handle: p.handle, avatarURL: avatar, bio: p.bio,
            publicPostCount: p.public_post_count, followerCount: p.follower_count, followingCount: p.following_count)
    }
    func publicPost(id: UUID) async throws -> LociPost? {
        try await projected(PublicRequest(mode: "single", postId: FirebaseIdentity.key(id))).posts.first
    }

    func myPostsPage(cursor: String?) async throws -> PostPage {
        guard let me = FirebaseIdentity.currentLUID() else { return PostPage(posts: [], next: nil) }
        var query = posts.whereField("creator_id", isEqualTo: FirebaseIdentity.key(me))
            .order(by: "created_at", descending: true).order(by: FieldPath.documentID(), descending: true)
        if let cursor, let data = Data(base64Encoded: cursor), let position = try? JSONDecoder().decode(OwnCursor.self, from: data), position.owner == me {
            query = query.start(after: [Timestamp(seconds: position.seconds, nanoseconds: position.nanoseconds), position.id])
        } else if cursor != nil { throw BackendCallError.invalidResponse }
        let page = try await query.limit(to: 51).getDocuments()
        let docs = Array(page.documents.prefix(50))
        let next: String?
        if page.documents.count > 50, let last = docs.last, let timestamp = last.data()["created_at"] as? Timestamp {
            next = try JSONEncoder().encode(OwnCursor(owner: me, id: last.documentID, seconds: timestamp.seconds, nanoseconds: timestamp.nanoseconds)).base64EncodedString()
        } else { next = nil }
        return PostPage(posts: await materialize(docs.map { ($0.documentID, $0.data()) }), next: next)
    }
    private struct OwnCursor: Codable { let owner: UUID; let id: String; let seconds: Int64; let nanoseconds: Int32 }

    func removeOwnPost(id: UUID) async throws {
        let postId = FirebaseIdentity.key(id)
        struct Payload: Encodable { let postId: String }
        struct Response: Decodable { let removed: Bool }
        // Server marks the post removed, fixes counters and deletes its Storage folder.
        let response: Response = try await callables.call("deleteOwnPost", payload: Payload(postId: postId))
        guard response.removed else {
            throw PostPublishError.rejected(String(localized: "Post bulunamadı ya da zaten kaldırılmış."))
        }
    }

    nonisolated static func serverMessage(_ raw: String, reason: String? = nil) -> String {
        // Prefer the server's machine-readable reason; the English-text checks below stay as the
        // fallback for older server versions and for errors that carry no reason.
        switch reason {
        case "identity_unverified": return String(localized: "Yayınlamak için doğrulanmış Apple veya e-posta hesabı gerekiyor.")
        case "account_suspended": return String(localized: "Bu hesap şu anda yayın yapamaz. Destek ile iletişime geçin.")
        case "protected_zone": return String(localized: "Bu korumalı bölgede post yayınlanamaz.")
        case "draft_expired": return String(localized: "Fiziksel AR yüzey kaydı eksik. Yüzeyi yeniden tarayıp kesin kilit oluşturun.")
        case "rate_limited": return String(localized: "Bu bölge veya hesap için yayın sınırına ulaşıldı. Daha sonra tekrar deneyin.")
        case "invite_required": return String(localized: "Paylaşmak için davet kodu gerekiyor. Profil > Davet kodu bölümünden sana verilen kodu gir.")
        default: break
        }
        if raw.contains("verified Apple") || raw.contains("verified Apple, Google, or email identity") {
            return String(localized: "Yayınlamak için doğrulanmış Apple veya e-posta hesabı gerekiyor.")
        }
        if raw.contains("Content not allowed") { return String(localized: "Metin uygunsuz ifadeler içeriyor. Düzenleyip tekrar dene.") }
        if raw.contains("Invalid caption") { return String(localized: "Caption boş olamaz ve 220 karakteri geçemez.") }
        if raw.contains("Invalid pose") || raw.contains("GPS accuracy") {
            return String(localized: "Konum doğruluğu yayın için yeterli değil. Açık bir alanda tekrar deneyin.")
        }
        if raw.contains("protected zone") { return String(localized: "Bu korumalı bölgede post yayınlanamaz.") }
        if raw.contains("Only text posts") || raw.contains("Links are not allowed") || raw.contains("social media link") {
            return String(localized: "Postlar yalnızca metin içerebilir; fotoğraf, video ve bağlantı desteklenmiyor.")
        }
        if raw.contains("18+ content") { return String(localized: "18+ içerik bu sürümde kabul edilmez.") }
        if raw.contains("Invalid reference image") { return String(localized: "AR referans görüntüsü geçersiz. Yüzeyi yeniden tarayıp tekrar dene.") }
        if raw.contains("At least one edit layer") { return String(localized: "Yayınlamak için bir caption yaz.") }
        if raw.contains("Physical AR world lock evidence is incomplete") {
            return String(localized: "Fiziksel AR yüzey kaydı eksik. Yüzeyi yeniden tarayıp kesin kilit oluşturun.")
        }
        if raw.contains("Creation limit reached") { return String(localized: "Bu bölge veya hesap için yayın sınırına ulaşıldı. Daha sonra tekrar deneyin.") }
        if raw.contains("cannot publish") { return String(localized: "Bu hesap şu anda yayın yapamaz. Destek ile iletişime geçin.") }
        return raw.isEmpty ? String(localized: "Yayın sunucu tarafından reddedildi.") : raw
    }

    /// Drops posts the user reported (see HiddenPostStore). Never applied to `myPosts`.
    private func withoutHidden(_ posts: [LociPost]) async -> [LociPost] {
        guard let me = FirebaseIdentity.currentLUID().map(FirebaseIdentity.key) else { return posts }
        let hidden = await HiddenPostStore.shared.hiddenIDs(owner: me)
        guard !hidden.isEmpty else { return posts }
        return posts.filter { !hidden.contains(FirebaseIdentity.key($0.id)) }
    }

    private func materialize(_ documents: [(String, [String: Any])]) async -> [LociPost] {
        var rows: [BackendPostRow] = []
        for (id, data) in documents {
            do {
                rows.append(try FirestorePostMapper.row(id: id, data: data))
            } catch {
                // A post that cannot be decoded disappears from the feed; leave a trace for debugging.
                logger.error("Dropped undecodable post id=\(id, privacy: .public) error=\(String(describing: error), privacy: .public)")
            }
        }
        guard !rows.isEmpty else { return [] }
        let decodedRows = rows // immutable copy: the task group closure must not capture a `var`
        return await withTaskGroup(of: (Int, LociPost).self) { group in
            for (index, row) in decodedRows.enumerated() {
                group.addTask { (index, await MediaAssetStore.materializeRemoteAssets(in: row.domainPost())) }
            }
            var indexed: [(Int, LociPost)] = []
            indexed.reserveCapacity(decodedRows.count)
            for await item in group { indexed.append(item) }
            return indexed.sorted { $0.0 < $1.0 }.map(\.1)
        }
    }
}

/// Short-lived cache of the users the current user has blocked (their posts, profiles and comments
/// are hidden). Shared by the post and social repositories so a block takes effect immediately.
/// Fails closed: if the list cannot be loaded and nothing is cached, callers get an error instead
/// of unfiltered content.
actor BlockListCache {
    static let shared = BlockListCache()
    private var cached: (owner: String, at: Date, ids: Set<String>)?

    func blockedIDs() async throws -> Set<String> {
        guard let me = FirebaseIdentity.currentLUID().map(FirebaseIdentity.key) else { return [] }
        if let cached, cached.owner == me, Date().timeIntervalSince(cached.at) < 60 { return cached.ids }
        do {
            let ids = try await Self.fetch(blocker: me)
            cached = (me, Date(), ids)
            return ids
        } catch {
            if let cached, cached.owner == me { return cached.ids }
            throw error
        }
    }

    func invalidate() { cached = nil }

    /// Applies a block/unblock locally right away (the server write already succeeded).
    func record(blocked: Bool, targetID: String) {
        guard let me = FirebaseIdentity.currentLUID().map(FirebaseIdentity.key) else { return }
        guard var current = cached, current.owner == me else { return }
        if blocked { current.ids.insert(targetID) } else { current.ids.remove(targetID) }
        cached = current
    }

    private nonisolated static func fetch(blocker: String) async throws -> Set<String> {
        let snapshot = try await Firestore.firestore().collection("user_blocks")
            .whereField("blocker_id", isEqualTo: blocker)
            .getDocuments()
        return Set(snapshot.documents.compactMap { $0.data()["blocked_id"] as? String })
    }
}

/// Firestore document payloads crossing task-group boundaries (values are plain property lists).
struct DocumentBatch: @unchecked Sendable {
    let items: [(String, [String: Any])]
}

private struct CreatePostPayload: Encodable, Sendable {
    let userId: String
    let clientMutationId: String
    let pose: PublishPose
    let refImageUri: String
    let editData: EditData
    let contentSource: ContentSource?
    let caption: String
    let ageRating: AgeRating
    let visibility: Visibility
    let placementState: String
    let placementQuality: Double
    let resolverStrategy: [String]
    let nativeProvider: String?
    let anchorBundle: AnchorBundle
}

private struct CreatePostResponse: Decodable, Sendable {
    struct CreatedPost: Decodable, Sendable {
        let id: UUID
        let placementState: String?

        enum CodingKeys: String, CodingKey {
            case id
            case placementState = "placement_state"
        }
    }

    let post: CreatedPost
    let publishStatus: PostStatus
    let idempotentReplay: Bool?
}

struct BackendPlacementContract: Equatable, Sendable {
    let coordinateSpace: String
    let state: String
    let qualityScore: Double
    private(set) var resolverStrategy: [String]
    let nativeProvider: String?

    /// Cloud Anchors and uploaded world maps both count as a remote resolver.
    init(anchor: SurfaceAnchor) {
        let persistence = anchor.persistence
        let remote = persistence?.storagePath != nil || persistence?.resolvableCloudAnchorId != nil
        self.init(quality: anchor.pinQuality, hasRemotePersistence: remote)
        if anchor.pinQuality != .freeSpaceApproximate {
            var strategy: [String] = []
            if persistence?.resolvableCloudAnchorId != nil { strategy.append("cloud_anchor") }
            if persistence?.storagePath != nil { strategy.append("native_anchor") }
            if anchor.geospatial?.isValid == true { strategy.append("geospatial") }
            strategy.append("geo_pose")
            resolverStrategy = strategy
        }
    }

    init(quality: PinQuality, hasRemotePersistence: Bool) {
        switch quality {
        case .planeGeometry:
            coordinateSpace = "arkit_world"
            state = "placed"
            qualityScore = 1
            resolverStrategy = hasRemotePersistence ? ["native_anchor", "reference_image", "geo_pose"] : ["geo_pose"]
            nativeProvider = "arkit"
        case .estimatedPlane:
            coordinateSpace = "arkit_world"
            state = "placed"
            qualityScore = 0.78
            resolverStrategy = hasRemotePersistence ? ["native_anchor", "reference_image", "geo_pose"] : ["geo_pose"]
            nativeProvider = "arkit"
        case .freeSpaceApproximate:
            coordinateSpace = "camera_free_space"
            state = "free_space_approximate"
            qualityScore = 0.22
            resolverStrategy = ["geo_pose"]
            nativeProvider = nil
        }
    }
}

private struct PublishPose: Encodable, Sendable {
    let latitude: Double
    let longitude: Double
    let altitude: Double?
    let heading: Double
    let accuracy: Double?
    let anchor: PublishSurfaceAnchor

    init(geo: GeoPose, surface: SurfaceAnchor) {
        latitude = geo.latitude; longitude = geo.longitude; altitude = geo.altitude
        heading = geo.heading; accuracy = geo.accuracy
        anchor = PublishSurfaceAnchor(surface: surface)
    }
}

private struct PublishSurfaceAnchor: Encodable, Sendable {
    let coordinateSpace: String
    let provider: String?
    let x: Float; let y: Float; let z: Float
    let yaw: Float = 0; let pitch: Float = 0; let roll: Float = 0
    let capturedAt: Date
    let nativeAnchorId: UUID
    let trackingQuality: TrackingQuality
    let surfaceAlignment: SurfaceAlignment
    let surfaceNormal: Vector3?
    let physicalRectMeters: PhysicalRectMeters?
    let persistence: WorldLockPersistence?
    let geospatial: GeospatialPose?

    init(surface: SurfaceAnchor) {
        let placement = BackendPlacementContract(anchor: surface)
        coordinateSpace = placement.coordinateSpace
        provider = placement.nativeProvider ?? "native_ios_camera"
        x = surface.transform.count > 12 ? surface.transform[12] : 0
        y = surface.transform.count > 13 ? surface.transform[13] : 0
        z = surface.transform.count > 14 ? surface.transform[14] : 0
        capturedAt = surface.capturedAt; nativeAnchorId = surface.id
        trackingQuality = surface.trackingQuality; surfaceAlignment = surface.surfaceAlignment
        surfaceNormal = surface.surfaceNormal; physicalRectMeters = surface.physicalRectMeters
        persistence = surface.persistence
        geospatial = surface.geospatial?.isValid == true ? surface.geospatial : nil
    }
}

actor PreviewPostRepository: PostRepository {
    private var posts: [LociPost] = []
    func nearby(latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [LociPost] { posts }
    func discover() async throws -> [LociPost] { posts.filter(PublicSafetyPolicy.isListedInPublicDiscover) }
    func publish(_ post: LociPost) async throws -> PostPublishReceipt {
        posts.insert(post, at: 0)
        return PostPublishReceipt(postID: post.id, status: post.status, placementState: nil, idempotentReplay: false)
    }
    func myPosts(limit: Int) async throws -> [LociPost] { Array(posts.prefix(limit)) }
    func publicPosts(creatorID: UUID, limit: Int) async throws -> [LociPost] { Array(posts.filter { $0.creatorID == creatorID }.prefix(limit)) }
    func publicProfile(creatorID: UUID) async throws -> PublicProfileProjection? { nil }
    func publicPost(id: UUID) async throws -> LociPost? { posts.first { $0.id == id } }
    func removeOwnPost(id: UUID) async throws { posts.removeAll { $0.id == id } }
}

extension PostRepository {
    func discoverPage(cursor: String?) async throws -> PostPage { PostPage(posts: cursor == nil ? try await discover() : [], next: nil) }
    func myPostsPage(cursor: String?) async throws -> PostPage { PostPage(posts: cursor == nil ? try await myPosts(limit: 50) : [], next: nil) }
    func publicPostsPage(creatorID: UUID, cursor: String?) async throws -> PostPage { PostPage(posts: cursor == nil ? try await publicPosts(creatorID: creatorID, limit: 60) : [], next: nil) }
}
