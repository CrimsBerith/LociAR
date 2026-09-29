import Foundation
@preconcurrency import FirebaseAuth
@preconcurrency import FirebaseFirestore

struct PostPublishReceipt: Equatable, Sendable {
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

protocol PostRepository: Sendable {
    func nearby(latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [LociPost]
    func discover() async throws -> [LociPost]
    func publish(_ post: LociPost) async throws -> PostPublishReceipt
    func myPosts(limit: Int) async throws -> [LociPost]
    func publicPosts(creatorID: UUID, limit: Int) async throws -> [LociPost]
    func publicProfile(creatorID: UUID) async throws -> PublicProfileProjection?
    func publicPost(id: UUID) async throws -> LociPost?
    func removeOwnPost(id: UUID) async throws
}

/// Posts are read straight from Firestore (Security Rules expose active public posts and the
/// caller's own posts); writes go through the createPost / deleteOwnPost Cloud Functions.
final class FirestorePostRepository: PostRepository, @unchecked Sendable {
    private let callables: CallableClient
    private let blockCache = BlockListCache.shared

    init(callables: CallableClient) { self.callables = callables }

    private var posts: CollectionReference { Firestore.firestore().collection("posts") }

    func nearby(latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [LociPost] {
        let radius = max(1, min(radiusMeters, 20_000_000))
        let prefixes = Geohash.coverPrefixes(latitude: latitude, longitude: longitude, radiusMeters: radius)
        var documents: [String: [String: Any]] = [:]

        let publicBase = posts
            .whereField("status", isEqualTo: PostStatus.active.rawValue)
            .whereField("visibility", isEqualTo: Visibility.public.rawValue)
        if prefixes.isEmpty {
            for doc in try await publicBase.order(by: "created_at", descending: true).limit(to: 200).getDocuments().documents {
                documents[doc.documentID] = doc.data()
            }
        } else {
            try await withThrowingTaskGroup(of: DocumentBatch.self) { group in
                for prefix in prefixes {
                    group.addTask {
                        let snapshot = try await publicBase
                            .order(by: "geohash")
                            .start(at: [prefix])
                            .end(at: [prefix + "~"])
                            .limit(to: 200)
                            .getDocuments()
                        return DocumentBatch(items: snapshot.documents.map { ($0.documentID, $0.data()) })
                    }
                }
                for try await batch in group {
                    for (id, data) in batch.items { documents[id] = data }
                }
            }
        }

        // The creator also sees their own pending/flagged posts on the map (Supabase parity).
        if let me = FirebaseIdentity.currentLUID() {
            let own = try? await posts
                .whereField("creator_id", isEqualTo: FirebaseIdentity.key(me))
                .order(by: "created_at", descending: true)
                .limit(to: 100)
                .getDocuments()
            for doc in own?.documents ?? [] {
                let status = doc.data()["status"] as? String
                if ["active", "pending_review", "flagged"].contains(status ?? "") { documents[doc.documentID] = doc.data() }
            }
        }

        let blocked = try await blockCache.blockedIDs()
        let me = FirebaseIdentity.currentLUID().map(FirebaseIdentity.key)
        let ranked = documents.compactMap { id, data -> (String, [String: Any], Double, Double)? in
            guard let lat = data["lat"] as? Double, let lng = data["lng"] as? Double else { return nil }
            let distance = Geohash.distanceMeters(latitude, longitude, lat, lng)
            guard distance <= radius else { return nil }
            let creator = data["creator_id"] as? String ?? ""
            let isOwn = creator == me
            guard isOwn || (FirestorePostMapper.isPubliclyListed(data) && !blocked.contains(creator)) else { return nil }
            let score = (data["engagement_score"] as? NSNumber)?.doubleValue ?? 0
            return (id, data, score, distance)
        }
        .sorted { $0.2 == $1.2 ? $0.3 < $1.3 : $0.2 > $1.2 }
        .prefix(100)
        return await materialize(ranked.map { ($0.0, $0.1) })
    }

    func discover() async throws -> [LociPost] {
        let snapshot = try await posts
            .whereField("status", isEqualTo: PostStatus.active.rawValue)
            .whereField("visibility", isEqualTo: Visibility.public.rawValue)
            .order(by: "created_at", descending: true)
            .limit(to: 50)
            .getDocuments()
        let blocked = try await blockCache.blockedIDs()
        let rows = snapshot.documents
            .map { ($0.documentID, $0.data()) }
            .filter { FirestorePostMapper.isPubliclyListed($0.1) && !blocked.contains($0.1["creator_id"] as? String ?? "") }
        return await materialize(rows).filter(PublicSafetyPolicy.isListedInPublicDiscover)
    }

    func publish(_ post: LociPost) async throws -> PostPublishReceipt {
        // Posts queued before photo/video removal (29 Sep 2026) would be refused by Storage and
        // createPost; fail them permanently instead of retrying uploads.
        if post.containsDeviceMedia {
            throw PostPublishError.rejected("Fotoğraf ve video içeren postlar artık desteklenmiyor. Postu metin veya sosyal bağlantı ile yeniden oluştur.")
        }
        let worldMapReadyPost = try await WorldMapStore().uploadLocalPersistenceIfNeeded(in: post)
        let post = try await MediaAssetStore.uploadLocalAssets(in: worldMapReadyPost)
        guard let geo = post.anchorBundle.anchor.geoPose else { throw PostContractError.missingGeoPose }
        let placement = BackendPlacementContract(quality: post.anchorBundle.anchor.pinQuality, hasRemotePersistence: post.anchorBundle.anchor.persistence?.storagePath != nil)
        let payload = CreatePostPayload(
            clientMutationId: post.id.uuidString.lowercased(),
            pose: PublishPose(geo: geo, surface: post.anchorBundle.anchor),
            refImageUri: post.anchorBundle.anchor.persistence?.referenceImageURI ?? "native-ar-reference://pending",
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
            let response: CreatePostResponse = try await callables.call("createPost", payload: payload)
            return PostPublishReceipt(
                postID: response.post.id,
                status: response.publishStatus,
                placementState: response.post.placementState,
                idempotentReplay: response.idempotentReplay ?? false
            )
        } catch BackendCallError.rejected(_, let message) where message.contains("Profile missing") {
            // First-sign-in race: ensureProfile has not finished yet. Retryable, keep the uploads.
            throw PostContractError.profileNotReady
        } catch BackendCallError.rejected(_, let message) {
            // Server refused (validation, protected zone, rate limit): uploaded media is orphaned.
            await MediaAssetStore.removeRemoteAssets(ownerID: post.creatorID, postID: post.id)
            throw PostPublishError.rejected(Self.serverMessage(message))
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
        let creator = FirebaseIdentity.key(creatorID)
        guard !(try await blockCache.blockedIDs()).contains(creator) else { return [] }
        let snapshot = try await posts
            .whereField("creator_id", isEqualTo: creator)
            .whereField("status", isEqualTo: PostStatus.active.rawValue)
            .whereField("visibility", isEqualTo: Visibility.public.rawValue)
            .order(by: "created_at", descending: true)
            .limit(to: max(1, min(limit, 100)))
            .getDocuments()
        let rows = snapshot.documents.map { ($0.documentID, $0.data()) }.filter { FirestorePostMapper.isPubliclyListed($0.1) }
        return await materialize(rows)
    }

    func publicProfile(creatorID: UUID) async throws -> PublicProfileProjection? {
        let id = FirebaseIdentity.key(creatorID)
        guard !(try await blockCache.blockedIDs()).contains(id) else { return nil }
        let snapshot = try await Firestore.firestore().collection("profiles").document(id).getDocument()
        guard let data = snapshot.data(),
              data["deleted_at"] == nil || data["deleted_at"] is NSNull,
              (data["suspended"] as? Bool) != true else { return nil }
        let avatar = await AvatarReference.resolve(
            avatarURL: data["avatar_url"] as? String,
            preset: data["avatar_preset"] as? String
        )
        return PublicProfileProjection(
            id: creatorID,
            handle: data["handle"] as? String ?? "loci",
            avatarURL: avatar,
            bio: data["bio"] as? String,
            publicPostCount: (data["public_post_count"] as? NSNumber)?.intValue ?? 0,
            followerCount: (data["follower_count"] as? NSNumber)?.intValue ?? 0,
            followingCount: (data["following_count"] as? NSNumber)?.intValue ?? 0
        )
    }

    func publicPost(id: UUID) async throws -> LociPost? {
        // Rules deny reads of documents the caller may not see; treat that as "not found".
        guard let snapshot = try? await posts.document(FirebaseIdentity.key(id)).getDocument(),
              let data = snapshot.data(),
              FirestorePostMapper.isPubliclyListed(data),
              let row = try? FirestorePostMapper.row(id: snapshot.documentID, data: data) else { return nil }
        if try await blockCache.blockedIDs().contains(data["creator_id"] as? String ?? "") { return nil }
        return await MediaAssetStore.materializeRemoteAssets(in: row.domainPost())
    }

    func removeOwnPost(id: UUID) async throws {
        let postId = FirebaseIdentity.key(id)
        struct Payload: Encodable { let postId: String }
        struct Response: Decodable { let removed: Bool }
        // Server marks the post removed, fixes counters and deletes its Storage folder.
        let response: Response = try await callables.call("deleteOwnPost", payload: Payload(postId: postId))
        guard response.removed else {
            throw PostPublishError.rejected("Post bulunamadı ya da zaten kaldırılmış.")
        }
    }

    nonisolated static func serverMessage(_ raw: String) -> String {
        if raw.contains("verified Apple") || raw.contains("verified Apple, Google, or email identity") {
            return "Yayınlamak için doğrulanmış Apple veya e-posta hesabı gerekiyor."
        }
        if raw.contains("Invalid caption") { return "Caption boş olamaz ve 220 karakteri geçemez." }
        if raw.contains("Invalid pose") || raw.contains("GPS accuracy") {
            return "Konum doğruluğu yayın için yeterli değil. Açık bir alanda tekrar deneyin."
        }
        if raw.contains("protected zone") { return "Bu korumalı bölgede post yayınlanamaz." }
        if raw.contains("Only text posts") { return "Postlar yalnızca metin ve sosyal medya bağlantısı içerebilir; fotoğraf ve video desteklenmiyor." }
        if raw.contains("Only social media links") { return "Yalnızca Spotify, YouTube, Instagram, X ve Facebook bağlantıları eklenebilir." }
        if raw.contains("Invalid social media link") { return "Sosyal medya bağlantısı geçersiz. Paylaşım bağlantısını uygulamadan tekrar kopyala." }
        if raw.contains("18+ content") { return "18+ içerik bu sürümde kabul edilmez." }
        if raw.contains("Invalid reference image") { return "AR referans görüntüsü geçersiz. Yüzeyi yeniden tarayıp tekrar dene." }
        if raw.contains("At least one edit layer") { return "Yayın için caption veya sosyal bağlantı ekleyin." }
        if raw.contains("Physical AR world lock evidence is incomplete") {
            return "Fiziksel AR yüzey kaydı eksik. Yüzeyi yeniden tarayıp kesin kilit oluşturun."
        }
        if raw.contains("Creation limit reached") { return "Bu bölge veya hesap için yayın sınırına ulaşıldı. Daha sonra tekrar deneyin." }
        if raw.contains("cannot publish") { return "Bu hesap şu anda yayın yapamaz. Destek ile iletişime geçin." }
        return raw.isEmpty ? "Yayın sunucu tarafından reddedildi." : raw
    }

    private func materialize(_ documents: [(String, [String: Any])]) async -> [LociPost] {
        let rows = documents.compactMap { try? FirestorePostMapper.row(id: $0.0, data: $0.1) }
        guard !rows.isEmpty else { return [] }
        return await withTaskGroup(of: (Int, LociPost).self) { group in
            for (index, row) in rows.enumerated() {
                group.addTask { (index, await MediaAssetStore.materializeRemoteAssets(in: row.domainPost())) }
            }
            var indexed: [(Int, LociPost)] = []
            indexed.reserveCapacity(rows.count)
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
    let resolverStrategy: [String]
    let nativeProvider: String?

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

    init(surface: SurfaceAnchor) {
        let placement = BackendPlacementContract(quality: surface.pinQuality, hasRemotePersistence: surface.persistence?.storagePath != nil)
        coordinateSpace = placement.coordinateSpace
        provider = placement.nativeProvider ?? "native_ios_camera"
        x = surface.transform.count > 12 ? surface.transform[12] : 0
        y = surface.transform.count > 13 ? surface.transform[13] : 0
        z = surface.transform.count > 14 ? surface.transform[14] : 0
        capturedAt = surface.capturedAt; nativeAnchorId = surface.id
        trackingQuality = surface.trackingQuality; surfaceAlignment = surface.surfaceAlignment
        surfaceNormal = surface.surfaceNormal; physicalRectMeters = surface.physicalRectMeters
        persistence = surface.persistence
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
