import Foundation
@preconcurrency import FirebaseFirestore

struct SocialActivity: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let kind: String
    let actorID: UUID?
    let recipientID: UUID
    let postID: UUID?
    let body: String
    let createdAt: Date
    let readAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, kind, body
        case actorID = "actor_id"
        case recipientID = "recipient_id"
        case postID = "post_id"
        case createdAt = "created_at"
        case readAt = "read_at"
    }

    /// Server-issued opaque identity; never derive it from a post or an actor.
    static func isValidID(_ id: String) -> Bool {
        (1...200).contains(id.utf8.count) && id.utf8.allSatisfy {
            (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 95 || $0 == 45
        }
    }

    static func unreadIDs(in items: [Self]) -> [String] {
        var seen = Set<String>()
        return items.filter { $0.readAt == nil && isValidID($0.id) && seen.insert($0.id).inserted }.map(\.id)
    }

    func markingRead(at date: Date) -> Self {
        Self(id: id, kind: kind, actorID: actorID, recipientID: recipientID, postID: postID,
             body: body, createdAt: createdAt, readAt: readAt ?? date)
    }
}

extension SocialActivity {
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let id = try values.decode(String.self, forKey: .id)
        guard Self.isValidID(id) else {
            throw DecodingError.dataCorruptedError(forKey: .id, in: values, debugDescription: "Invalid opaque activity id")
        }
        self.init(id: id, kind: try values.decode(String.self, forKey: .kind),
                  actorID: try values.decodeIfPresent(UUID.self, forKey: .actorID),
                  recipientID: try values.decode(UUID.self, forKey: .recipientID),
                  postID: try values.decodeIfPresent(UUID.self, forKey: .postID),
                  body: try values.decode(String.self, forKey: .body),
                  createdAt: try values.decode(Date.self, forKey: .createdAt),
                  readAt: try values.decodeIfPresent(Date.self, forKey: .readAt))
    }
}

struct LociCollection: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let ownerID: UUID
    let title: String
    let description: String?
    let visibility: Visibility
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, description, visibility
        case ownerID = "owner_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct LociComment: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let postID: UUID
    let userID: UUID
    let username: String
    let text: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, username, text
        case postID = "post_id"
        case userID = "user_id"
        case createdAt = "created_at"
    }

    /// Older pages overlap after concurrent inserts/refreshes. Keep one row per ID in display order.
    static func merging(_ existing: [Self], with incoming: [Self]) -> [Self] {
        var byID = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { _, latest in latest })
        for comment in incoming { byID[comment.id] = comment }
        return byID.values.sorted {
            $0.createdAt == $1.createdAt ? $0.id.uuidString < $1.id.uuidString : $0.createdAt < $1.createdAt
        }
    }
}

struct CommentPageCursor: Equatable, Sendable {
    let postID: UUID
    let documentID: String
    let seconds: Int64
    let nanoseconds: Int32
    let serverToken: String?

    init(postID: UUID, documentID: String, seconds: Int64, nanoseconds: Int32, serverToken: String? = nil) {
        self.postID = postID; self.documentID = documentID
        self.seconds = seconds; self.nanoseconds = nanoseconds; self.serverToken = serverToken
    }

    func isValid(for requestedPostID: UUID) -> Bool {
        postID == requestedPostID && !documentID.isEmpty && !documentID.contains("/")
            && seconds >= -62_135_596_800 && seconds <= 253_402_300_799
            && nanoseconds >= 0 && nanoseconds < 1_000_000_000
    }
}

struct LociCommentPage: Sendable {
    let comments: [LociComment]
    let olderCursor: CommentPageCursor?
}

struct ActivityPage: Sendable { let items: [SocialActivity]; let next: String? }
struct PostMembership: Sendable { let liked: Bool; let saved: Bool }

protocol SocialRepository: Sendable {
    func membership(postID: UUID, userID: UUID) async throws -> PostMembership
    func isFollowing(targetID: UUID, userID: UUID) async throws -> Bool
    func activityPage(for userID: UUID, cursor: String?) async throws -> ActivityPage
    func activity(for userID: UUID) async throws -> [SocialActivity]
    func markActivityRead(ids: [String], for userID: UUID) async throws -> [String: Date]
    func savedPostIDs(for userID: UUID) async throws -> [UUID]
    func savedPostsPage(for userID: UUID, cursor: String?) async throws -> PostPage
    func likedPostIDs(for userID: UUID) async throws -> [UUID]
    func likeCount(for postID: UUID) async throws -> Int
    func setLiked(_ liked: Bool, postID: UUID, userID: UUID) async throws
    func blockAnonymousAuthor(postID: UUID, userID: UUID) async throws
    func recordView(postID: UUID, userID: UUID) async throws -> Int?
    func setSaved(_ saved: Bool, postID: UUID, userID: UUID) async throws
    func setFollowing(_ following: Bool, targetID: UUID, userID: UUID) async throws
    func followingIDs(for userID: UUID) async throws -> [UUID]
    func blockedUserIDs(for userID: UUID) async throws -> [UUID]
    func setBlocked(_ blocked: Bool, targetID: UUID, userID: UUID) async throws
    func collections(for userID: UUID) async throws -> [LociCollection]
    func createCollection(title: String, userID: UUID) async throws -> LociCollection
    func add(postID: UUID, to collectionID: UUID) async throws
    func postIDs(in collectionID: UUID) async throws -> [UUID]
    func collectionPostsPage(in collectionID: UUID, userID: UUID, cursor: String?) async throws -> PostPage
    func remove(postID: UUID, from collectionID: UUID) async throws
    func comments(for postID: UUID) async throws -> [LociComment]
    func commentPage(for postID: UUID, before cursor: CommentPageCursor?) async throws -> LociCommentPage
    func addComment(postID: UUID, user: LociUser, text: String) async throws -> LociComment
    func report(postID: UUID, userID: UUID, reason: String) async throws
    func reportComment(_ comment: LociComment, userID: UUID, reason: String) async throws
    func reportUser(targetID: UUID, userID: UUID, reason: String) async throws
    func deleteComment(id: UUID) async throws
}

extension SocialRepository {
    func membership(postID: UUID, userID: UUID) async throws -> PostMembership {
        async let liked = likedPostIDs(for: userID)
        async let saved = savedPostIDs(for: userID)
        return try await .init(liked: liked.contains(postID), saved: saved.contains(postID))
    }
    func isFollowing(targetID: UUID, userID: UUID) async throws -> Bool {
        try await followingIDs(for: userID).contains(targetID)
    }
    func blockAnonymousAuthor(postID _: UUID, userID _: UUID) async throws { throw AuthFlowError.unsupported }
}

/// Social rows live in top-level Firestore collections whose document IDs encode the pair
/// (e.g. likes/<post>_<user>) so writes are idempotent. Counters and activity events are
/// maintained by Cloud Function triggers.
final class FirestoreSocialRepository: SocialRepository, @unchecked Sendable {
    private let callables: CallableClient

    init(callables: CallableClient) { self.callables = callables }

    private var db: Firestore { Firestore.firestore() }
    private func key(_ id: UUID) -> String { FirebaseIdentity.key(id) }
    private func uuid(_ value: Any?) -> UUID? { (value as? String).flatMap(UUID.init(uuidString:)) }

    func membership(postID: UUID, userID: UUID) async throws -> PostMembership {
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        async let liked = db.collection("likes").document("\(key(postID))_\(key(userID))").getDocument()
        async let saved = db.collection("post_saves").document("\(key(userID))_\(key(postID))").getDocument()
        let result = try await PostMembership(liked: liked.exists, saved: saved.exists)
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        return result
    }

    func isFollowing(targetID: UUID, userID: UUID) async throws -> Bool {
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        let result = try await db.collection("follows").document("\(key(userID))_\(key(targetID))").getDocument().exists
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        return result
    }

    private func documents(_ query: Query) async throws -> [(String, [String: Any])] {
        try await query.getDocuments().documents.map { ($0.documentID, $0.data()) }
    }

    func activity(for userID: UUID) async throws -> [SocialActivity] { try await activityPage(for: userID, cursor: nil).items }
    func activityPage(for userID: UUID, cursor: String?) async throws -> ActivityPage {
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        struct Payload: Encodable { let userId: String; let cursor: String?; let pageSize: Int }
        struct Response: Decodable { let items: [SocialActivity]; let next: String? }
        let response: Response = try await callables.call("readActivity", payload: Payload(userId: key(userID), cursor: cursor, pageSize: cursor == nil ? 15 : 50))
        guard !Task.isCancelled, FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        return ActivityPage(items: response.items, next: response.next)
    }

    func markActivityRead(ids: [String], for userID: UUID) async throws -> [String: Date] {
        let ids = ids.filter(SocialActivity.isValidID)
        guard !ids.isEmpty else { return [:] }
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        struct Payload: Encodable, Sendable { let activityIds: [String]; let userId: String }
        struct Entry: Decodable, Sendable { let id: String; let readAt: Date }
        struct Response: Decodable, Sendable { let activities: [Entry] }
        let response: Response = try await callables.call("markActivityRead", payload: Payload(activityIds: ids, userId: key(userID)))
        let requested = Set(ids)
        return Dictionary(response.activities.filter { requested.contains($0.id) }.map { ($0.id, $0.readAt) }, uniquingKeysWith: { first, _ in first })
    }

    /// Upper bound for ordered display lists (collections, collection items). Membership lists
    /// (likes, saves, follows, blocks) are read whole: a truncated set would answer "liked?",
    /// "following?" or "blocked?" wrongly for older entries.
    nonisolated static let edgeListLimit = 500

    func savedPostIDs(for userID: UUID) async throws -> [UUID] {
        try await documents(db.collection("post_saves").whereField("user_id", isEqualTo: key(userID)))
            .compactMap { uuid($0.1["post_id"]) }
    }

    private struct EdgePageResponse: Decodable {
        let edgePageVersion: Int
        let page: BackendPostPageResponse
        private enum CodingKeys: CodingKey { case edgePageVersion }
        init(from decoder: Decoder) throws {
            edgePageVersion = try decoder.container(keyedBy: CodingKeys.self).decode(Int.self, forKey: .edgePageVersion)
            page = try BackendPostPageResponse(from: decoder)
        }
    }

    func savedPostsPage(for userID: UUID, cursor: String?) async throws -> PostPage {
        try await edgePage(mode: "saved", userID: userID, collectionID: nil, cursor: cursor)
    }

    func collectionPostsPage(in collectionID: UUID, userID: UUID, cursor: String?) async throws -> PostPage {
        try await edgePage(mode: "collection", userID: userID, collectionID: collectionID, cursor: cursor)
    }

    private func edgePage(mode: String, userID: UUID, collectionID: UUID?, cursor: String?) async throws -> PostPage {
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        struct Payload: Encodable { let mode: String; let collectionId: String?; let cursor: String? }
        let response: EdgePageResponse = try await callables.call("readPublicContent", payload: Payload(
            mode: mode, collectionId: collectionID.map(FirebaseIdentity.key), cursor: cursor))
        guard response.edgePageVersion == 1 else { throw BackendCallError.invalidResponse }
        let hidden = await HiddenPostStore.shared.hiddenIDs(owner: key(userID))
        guard !Task.isCancelled, FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        return PostPage(posts: response.page.posts.map { $0.domainPost() }.filter { !hidden.contains(key($0.id)) }, next: response.page.next)
    }

    func likedPostIDs(for userID: UUID) async throws -> [UUID] {
        try await documents(db.collection("likes").whereField("user_id", isEqualTo: key(userID)))
            .compactMap { uuid($0.1["post_id"]) }
    }

    func likeCount(for postID: UUID) async throws -> Int {
        struct Payload: Encodable { let postId: String }
        struct Response: Decodable { let count: Int }
        let response: Response = try await callables.call("readLikeCount", payload: Payload(postId: key(postID)))
        return response.count
    }

    func blockAnonymousAuthor(postID: UUID, userID: UUID) async throws {
        struct Payload: Encodable { let postId: String; let userId: String }
        struct Response: Decodable { let ok: Bool }
        let response: Response = try await callables.call("blockPostAuthor", payload: Payload(postId: key(postID), userId: key(userID)))
        guard response.ok else { throw BackendCallError.invalidResponse }
    }

    /// Idempotent edge write. Document IDs encode the pair (`<a>_<b>`), so creating an edge that
    /// already exists is a no-op and deleting a missing one is harmless. Counters and activity
    /// events are maintained by Cloud Functions triggers; clients never write them.
    private func setEdge(
        _ present: Bool,
        collection: String,
        id: String,
        data: @autoclosure () -> [String: Any]
    ) async throws {
        let ref = db.collection(collection).document(id)
        if present {
            guard try await !ref.getDocument().exists else { return }
            try await ref.setData(data())
        } else {
            try await ref.delete()
        }
    }

    func setLiked(_ liked: Bool, postID: UUID, userID: UUID) async throws {
        try await setEdge(
            liked, collection: "likes", id: "\(key(postID))_\(key(userID))",
            data: ["post_id": key(postID), "user_id": key(userID), "created_at": FieldValue.serverTimestamp()]
        )
    }

    func recordView(postID: UUID, userID: UUID) async throws -> Int? {
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        struct Payload: Encodable { let postId: String }
        struct Response: Decodable { let views: Int }
        let client = callables, postKey = key(postID)
        let count = try await ClientReadCaches.recordView(owner: userID, post: postID) {
            guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
            let response: Response = try await client.call("recordPostView", payload: Payload(postId: postKey))
            guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
            return response.views
        }
        guard !Task.isCancelled, FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        return count
    }

    func setSaved(_ saved: Bool, postID: UUID, userID: UUID) async throws {
        try await setEdge(
            saved, collection: "post_saves", id: "\(key(userID))_\(key(postID))",
            data: ["post_id": key(postID), "user_id": key(userID), "created_at": FieldValue.serverTimestamp()]
        )
    }

    func setFollowing(_ following: Bool, targetID: UUID, userID: UUID) async throws {
        guard targetID != userID else { return }
        try await setEdge(
            following, collection: "follows", id: "\(key(userID))_\(key(targetID))",
            data: ["follower_id": key(userID), "following_id": key(targetID), "created_at": FieldValue.serverTimestamp()]
        )
    }

    func followingIDs(for userID: UUID) async throws -> [UUID] {
        try await documents(db.collection("follows").whereField("follower_id", isEqualTo: key(userID)))
            .compactMap { uuid($0.1["following_id"]) }
    }

    func blockedUserIDs(for userID: UUID) async throws -> [UUID] {
        try await documents(db.collection("user_blocks").whereField("blocker_id", isEqualTo: key(userID)))
            .compactMap { uuid($0.1["blocked_id"]) }
    }

    func setBlocked(_ blocked: Bool, targetID: UUID, userID: UUID) async throws {
        guard targetID != userID else { return }
        try await setEdge(
            blocked, collection: "user_blocks", id: "\(key(userID))_\(key(targetID))",
            data: ["blocker_id": key(userID), "blocked_id": key(targetID), "created_at": FieldValue.serverTimestamp()]
        )
        if blocked { try await setFollowing(false, targetID: targetID, userID: userID) }
        await BlockListCache.shared.record(blocked: blocked, targetID: key(targetID))
        await MapRequestCoordinator.shared.invalidate()
    }

    func collections(for userID: UUID) async throws -> [LociCollection] {
        let rows = try await documents(
            db.collection("collections")
                .whereField("owner_id", isEqualTo: key(userID))
                .order(by: "updated_at", descending: true)
                .limit(to: Self.edgeListLimit)
        )
        return rows.compactMap { id, data in
            guard let collectionID = UUID(uuidString: id), let owner = uuid(data["owner_id"]) else { return nil }
            return LociCollection(
                id: collectionID,
                ownerID: owner,
                title: data["title"] as? String ?? "",
                description: data["description"] as? String,
                visibility: Visibility(rawValue: data["visibility"] as? String ?? "") ?? .private,
                createdAt: FirestoreJSON.date(data["created_at"]) ?? Date(),
                updatedAt: FirestoreJSON.date(data["updated_at"]) ?? Date()
            )
        }
    }

    func createCollection(title: String, userID: UUID) async throws -> LociCollection {
        let id = UUID()
        let now = Date()
        try await db.collection("collections").document(key(id)).setData([
            "id": key(id),
            "owner_id": key(userID),
            "title": title,
            "description": NSNull(),
            "visibility": Visibility.private.rawValue,
            "created_at": FieldValue.serverTimestamp(),
            "updated_at": FieldValue.serverTimestamp(),
        ])
        return LociCollection(id: id, ownerID: userID, title: title, description: nil, visibility: .private, createdAt: now, updatedAt: now)
    }

    func add(postID: UUID, to collectionID: UUID) async throws {
        guard let me = FirebaseIdentity.currentLUID() else { throw AuthFlowError.notSignedIn }
        let ref = db.collection("collection_items").document("\(key(collectionID))_\(key(postID))")
        guard try await !ref.getDocument().exists else { return }
        try await ref.setData([
            "collection_id": key(collectionID),
            "post_id": key(postID),
            "owner_id": key(me),
            "sort_order": Int(Date().timeIntervalSince1970) % 100_000,
            "created_at": FieldValue.serverTimestamp(),
        ])
    }

    func postIDs(in collectionID: UUID) async throws -> [UUID] {
        guard let me = FirebaseIdentity.currentLUID() else { return [] }
        return try await documents(
            db.collection("collection_items")
                .whereField("collection_id", isEqualTo: key(collectionID))
                .whereField("owner_id", isEqualTo: key(me))
                .order(by: "sort_order")
                .limit(to: Self.edgeListLimit)
        ).compactMap { uuid($0.1["post_id"]) }
    }

    func remove(postID: UUID, from collectionID: UUID) async throws {
        try await db.collection("collection_items").document("\(key(collectionID))_\(key(postID))").delete()
    }

    func comments(for postID: UUID) async throws -> [LociComment] {
        try await commentPage(for: postID, before: nil).comments
    }

    func commentPage(for postID: UUID, before cursor: CommentPageCursor?) async throws -> LociCommentPage {
        guard let viewerID = FirebaseIdentity.currentLUID() else { throw AuthFlowError.notSignedIn }
        if let cursor, !cursor.isValid(for: postID) || cursor.serverToken == nil { throw BackendCallError.invalidResponse }
        struct Request: Encodable { let mode = "comments"; let postId: String; let cursor: String? }
        struct Response: Decodable { let comments: [LociComment]; let next: String? }
        let page: Response = try await callables.call("readPublicContent", payload: Request(postId: key(postID), cursor: cursor?.serverToken))
        guard !Task.isCancelled, FirebaseIdentity.currentLUID() == viewerID else { throw AuthFlowError.notSignedIn }
        let next = page.next.map { CommentPageCursor(postID: postID, documentID: $0, seconds: 0, nanoseconds: 0, serverToken: $0) }
        return LociCommentPage(comments: LociComment.merging([], with: page.comments), olderCursor: next)
    }

    func addComment(postID: UUID, user: LociUser, text: String) async throws -> LociComment {
        let id = UUID()
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        try await db.collection("comments").document(key(id)).setData([
            "id": key(id),
            "post_id": key(postID),
            "user_id": key(user.id),
            "text": clean,
            "created_at": FieldValue.serverTimestamp(),
        ])
        return LociComment(id: id, postID: postID, userID: user.id, username: user.handle, text: clean, createdAt: Date())
    }

    func report(postID: UUID, userID: UUID, reason: String) async throws {
        try await fileReport(kind: "post", targetID: postID, userID: userID, reason: reason)
    }

    func reportComment(_ comment: LociComment, userID: UUID, reason: String) async throws {
        try await fileReport(kind: "comment", targetID: comment.id, userID: userID, reason: reason)
    }

    func reportUser(targetID: UUID, userID: UUID, reason: String) async throws {
        try await fileReport(kind: "user", targetID: targetID, userID: userID, reason: reason)
    }

    /// Allowed by rules for the comment's author and for the owner of the post it is on.
    func deleteComment(id: UUID) async throws {
        try await db.collection("comments").document(key(id)).delete()
    }

    private func fileReport(kind: String, targetID: UUID, userID: UUID, reason: String) async throws {
        struct Payload: Encodable { let targetKind: String; let targetId: String; let userId: String; let reason: String }
        struct Response: Decodable { let ok: Bool }
        let response: Response = try await callables.call("submitReport", payload: Payload(
            targetKind: kind, targetId: key(targetID), userId: key(userID), reason: reason))
        guard response.ok else { throw BackendCallError.invalidResponse }
    }
}

actor PreviewSocialRepository: SocialRepository {
    private var liked: Set<UUID> = []
    private var saved: Set<UUID> = []
    private var views: [UUID: Int] = [:]
    private var collectionItems: [UUID: [UUID]] = [:]

    func activity(for userID: UUID) async throws -> [SocialActivity] { [] }
    func markActivityRead(ids _: [String], for _: UUID) async throws -> [String: Date] { [:] }
    func savedPostIDs(for userID: UUID) async throws -> [UUID] { Array(saved) }
    func savedPostsPage(for userID: UUID, cursor: String?) async throws -> PostPage { PostPage(posts: [], next: nil) }
    func collectionPostsPage(in collectionID: UUID, userID: UUID, cursor: String?) async throws -> PostPage { PostPage(posts: [], next: nil) }
    func likedPostIDs(for userID: UUID) async throws -> [UUID] { Array(liked) }
    func likeCount(for postID: UUID) async throws -> Int { liked.contains(postID) ? 1 : 0 }
    func setLiked(_ value: Bool, postID: UUID, userID: UUID) async throws {
        if value { liked.insert(postID) } else { liked.remove(postID) }
    }
    func recordView(postID: UUID, userID: UUID) async throws -> Int? {
        views[postID, default: 0] += 1
        return views[postID] ?? 0
    }
    func setSaved(_ value: Bool, postID: UUID, userID: UUID) async throws {
        if value { saved.insert(postID) } else { saved.remove(postID) }
    }
    func setFollowing(_ following: Bool, targetID: UUID, userID: UUID) async throws {}
    func followingIDs(for userID: UUID) async throws -> [UUID] { [] }
    func blockedUserIDs(for userID: UUID) async throws -> [UUID] { [] }
    func setBlocked(_ blocked: Bool, targetID: UUID, userID: UUID) async throws {}
    func collections(for userID: UUID) async throws -> [LociCollection] { [] }
    func createCollection(title: String, userID: UUID) async throws -> LociCollection {
        LociCollection(id: UUID(), ownerID: userID, title: title, description: nil, visibility: .private, createdAt: Date(), updatedAt: Date())
    }
    func add(postID: UUID, to collectionID: UUID) async throws {
        collectionItems[collectionID, default: []].append(postID)
    }
    func postIDs(in collectionID: UUID) async throws -> [UUID] {
        collectionItems[collectionID] ?? []
    }
    func remove(postID: UUID, from collectionID: UUID) async throws {
        collectionItems[collectionID]?.removeAll { $0 == postID }
    }
    func comments(for postID: UUID) async throws -> [LociComment] { [] }
    func commentPage(for _: UUID, before _: CommentPageCursor?) async throws -> LociCommentPage {
        LociCommentPage(comments: [], olderCursor: nil)
    }
    func addComment(postID: UUID, user: LociUser, text: String) async throws -> LociComment {
        LociComment(id: UUID(), postID: postID, userID: user.id, username: user.handle, text: text, createdAt: Date())
    }
    func report(postID: UUID, userID: UUID, reason: String) async throws {}
    func reportComment(_ comment: LociComment, userID: UUID, reason: String) async throws {}
    func reportUser(targetID: UUID, userID: UUID, reason: String) async throws {}
    func deleteComment(id: UUID) async throws {}
}

extension SocialRepository {
    func activityPage(for userID: UUID, cursor: String?) async throws -> ActivityPage { ActivityPage(items: cursor == nil ? try await activity(for: userID) : [], next: nil) }
}

// MARK: - Invites

struct InviteCode: Identifiable, Equatable, Sendable {
    let code: String
    let redeemed: Bool
    var id: String { code }
}

enum InviteFlowError: LocalizedError, Equatable, Sendable {
    case invalid
    case rateLimited
    case needsInviteFirst
    case unavailable

    var errorDescription: String? {
        switch self {
        case .invalid: String(localized: "Davet kodu geçersiz ya da daha önce kullanılmış.")
        case .rateLimited: String(localized: "Çok fazla hatalı deneme. Bir süre sonra tekrar dene.")
        case .needsInviteFirst: String(localized: "Kendi kodlarını görmek için önce sana verilen davet kodunu gir.")
        case .unavailable: String(localized: "Davet işlemi şu anda yapılamıyor. Tekrar dene.")
        }
    }
}

/// Server contract: functions/src/invites.ts (`createInvites`, `redeemInvite`).
protocol InviteRepository: Sendable {
    /// Creates the caller's remaining codes (3 per user in total) and returns all of them.
    func myInvites() async throws -> [InviteCode]
    /// Redeems a code; succeeds silently when the account already redeemed one.
    func redeem(code: String) async throws
}

final class FirestoreInviteRepository: InviteRepository, @unchecked Sendable {
    private let callables: CallableClient

    init(callables: CallableClient) { self.callables = callables }

    private struct InvitesResponse: Decodable {
        struct Item: Decodable { let code: String; let redeemed: Bool }
        let invites: [Item]
    }

    func myInvites() async throws -> [InviteCode] {
        do {
            let data = try await callables.callRaw("createInvites", object: [String: String]())
            let response = try JSONDecoder().decode(InvitesResponse.self, from: data)
            return response.invites.map { InviteCode(code: $0.code, redeemed: $0.redeemed) }
        } catch BackendCallError.rejected(_, _, let reason) where reason == "invite_required" {
            throw InviteFlowError.needsInviteFirst
        } catch BackendCallError.rejected(_, _, let reason) where reason == "rate_limited" {
            throw InviteFlowError.rateLimited
        } catch BackendCallError.rejected {
            throw InviteFlowError.unavailable
        }
    }

    func redeem(code: String) async throws {
        do {
            _ = try await callables.callRaw("redeemInvite", object: ["code": code])
        } catch BackendCallError.rejected(_, _, let reason) where reason == "invite_invalid" {
            throw InviteFlowError.invalid
        } catch BackendCallError.rejected(_, _, let reason) where reason == "rate_limited" {
            throw InviteFlowError.rateLimited
        } catch BackendCallError.rejected {
            throw InviteFlowError.unavailable
        }
    }
}

/// Preview/UI-test builds: no backend, so invites are inert.
struct PreviewInviteRepository: InviteRepository {
    func myInvites() async throws -> [InviteCode] { [] }
    func redeem(code _: String) async throws {
        // Preview builds have no invitation backend.
    }
}
