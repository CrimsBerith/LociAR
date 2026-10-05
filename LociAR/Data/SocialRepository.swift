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

    func markingRead(at date: Date) -> Self {
        Self(id: id, kind: kind, actorID: actorID, recipientID: recipientID, postID: postID,
             body: body, createdAt: createdAt, readAt: readAt ?? date)
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

protocol SocialRepository: Sendable {
    func activityPage(for userID: UUID, cursor: String?) async throws -> ActivityPage
    func activity(for userID: UUID) async throws -> [SocialActivity]
    func markActivityRead(ids: [String], for userID: UUID) async throws -> [String: Date]
    func savedPostIDs(for userID: UUID) async throws -> [UUID]
    func likedPostIDs(for userID: UUID) async throws -> [UUID]
    func likeCount(for postID: UUID) async throws -> Int
    func setLiked(_ liked: Bool, postID: UUID, userID: UUID) async throws
    func recordView(postID: UUID, userID: UUID) async throws -> Int
    func setSaved(_ saved: Bool, postID: UUID, userID: UUID) async throws
    func setFollowing(_ following: Bool, targetID: UUID, userID: UUID) async throws
    func followingIDs(for userID: UUID) async throws -> [UUID]
    func blockedUserIDs(for userID: UUID) async throws -> [UUID]
    func setBlocked(_ blocked: Bool, targetID: UUID, userID: UUID) async throws
    func collections(for userID: UUID) async throws -> [LociCollection]
    func createCollection(title: String, userID: UUID) async throws -> LociCollection
    func add(postID: UUID, to collectionID: UUID) async throws
    func postIDs(in collectionID: UUID) async throws -> [UUID]
    func remove(postID: UUID, from collectionID: UUID) async throws
    func comments(for postID: UUID) async throws -> [LociComment]
    func commentPage(for postID: UUID, before cursor: CommentPageCursor?) async throws -> LociCommentPage
    func addComment(postID: UUID, user: LociUser, text: String) async throws -> LociComment
    func report(postID: UUID, userID: UUID, reason: String) async throws
    func reportComment(_ comment: LociComment, userID: UUID, reason: String) async throws
    func reportUser(targetID: UUID, userID: UUID, reason: String) async throws
    func deleteComment(id: UUID) async throws
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

    private func documents(_ query: Query) async throws -> [(String, [String: Any])] {
        try await query.getDocuments().documents.map { ($0.documentID, $0.data()) }
    }

    func activity(for userID: UUID) async throws -> [SocialActivity] { try await activityPage(for: userID, cursor: nil).items }
    private struct ActivityCursor: Codable { let owner: UUID; let id: String; let seconds: Int64; let nanoseconds: Int32 }
    func activityPage(for userID: UUID, cursor: String?) async throws -> ActivityPage {
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        var query = db.collection("activity_events").whereField("recipient_id", isEqualTo: key(userID))
            .order(by: "created_at", descending: true).order(by: FieldPath.documentID(), descending: true)
        if let cursor, let data = Data(base64Encoded: cursor), let position = try? JSONDecoder().decode(ActivityCursor.self, from: data), position.owner == userID {
            query = query.start(after: [Timestamp(seconds: position.seconds, nanoseconds: position.nanoseconds), position.id])
        } else if cursor != nil { throw BackendCallError.invalidResponse }
        let snapshot = try await query.limit(to: 51).getDocuments()
        let documents = Array(snapshot.documents.prefix(50))
        let rows = documents.map { ($0.documentID, $0.data()) }
        let items: [SocialActivity] = rows.compactMap { id, data in
            guard let recipient = uuid(data["recipient_id"]) else { return nil }
            return SocialActivity(
                id: id,
                kind: data["kind"] as? String ?? "activity",
                actorID: uuid(data["actor_id"]),
                recipientID: recipient,
                postID: uuid(data["post_id"]),
                body: data["body"] as? String ?? "",
                createdAt: FirestoreJSON.date(data["created_at"]) ?? Date(),
                readAt: FirestoreJSON.date(data["read_at"])
            )
        }
        let next: String?
        if snapshot.documents.count > 50, let last = documents.last, let timestamp = last.data()["created_at"] as? Timestamp {
            next = try JSONEncoder().encode(ActivityCursor(owner: userID, id: last.documentID, seconds: timestamp.seconds, nanoseconds: timestamp.nanoseconds)).base64EncodedString()
        } else { next = nil }
        guard !Task.isCancelled, FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        return ActivityPage(items: items, next: next)
    }

    func markActivityRead(ids: [String], for userID: UUID) async throws -> [String: Date] {
        guard !ids.isEmpty else { return [:] }
        guard FirebaseIdentity.currentLUID() == userID else { throw AuthFlowError.notSignedIn }
        struct Payload: Encodable, Sendable { let activityIds: [String]; let userId: String }
        struct Entry: Decodable, Sendable { let id: String; let readAt: Date }
        struct Response: Decodable, Sendable { let activities: [Entry] }
        let response: Response = try await callables.call("markActivityRead", payload: Payload(activityIds: ids, userId: key(userID)))
        return Dictionary(response.activities.map { ($0.id, $0.readAt) }, uniquingKeysWith: { first, _ in first })
    }

    func savedPostIDs(for userID: UUID) async throws -> [UUID] {
        try await documents(db.collection("post_saves").whereField("user_id", isEqualTo: key(userID)))
            .compactMap { uuid($0.1["post_id"]) }
    }

    func likedPostIDs(for userID: UUID) async throws -> [UUID] {
        try await documents(db.collection("likes").whereField("user_id", isEqualTo: key(userID)))
            .compactMap { uuid($0.1["post_id"]) }
    }

    func likeCount(for postID: UUID) async throws -> Int {
        let snapshot = try await db.collection("likes")
            .whereField("post_id", isEqualTo: key(postID))
            .count
            .getAggregation(source: .server)
        return snapshot.count.intValue
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

    func recordView(postID: UUID, userID: UUID) async throws -> Int {
        _ = userID // The function derives identity from the ID token.
        struct Payload: Encodable { let postId: String }
        struct Response: Decodable { let views: Int }
        let response: Response = try await callables.call("recordPostView", payload: Payload(postId: key(postID)))
        return response.views
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
    }

    func collections(for userID: UUID) async throws -> [LociCollection] {
        let rows = try await documents(
            db.collection("collections")
                .whereField("owner_id", isEqualTo: key(userID))
                .order(by: "updated_at", descending: true)
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
        if let cursor, !cursor.isValid(for: postID) { throw BackendCallError.invalidResponse }
        var query = db.collection("comments")
            .whereField("post_id", isEqualTo: key(postID))
            .order(by: "created_at", descending: true)
            .order(by: FieldPath.documentID(), descending: true)
        if let cursor {
            query = query.start(after: [Timestamp(seconds: cursor.seconds, nanoseconds: cursor.nanoseconds), cursor.documentID])
        }
        // Read one lookahead row; cursors use raw rows so blocked authors cannot stop pagination.
        let snapshot = try await query.limit(to: 51).getDocuments()
        let rows = Array(snapshot.documents.prefix(50))
        struct EligibilityRequest: Encodable { let mode = "eligible_authors"; let authorIds: [String] }
        struct EligibilityResponse: Decodable { let authorIds: [String] }
        let eligibility: EligibilityResponse = try await callables.call("readPublicContent", payload: EligibilityRequest(authorIds: Array(Set(rows.compactMap { $0.data()["user_id"] as? String }))))
        let eligible = Set(eligibility.authorIds)
        guard !Task.isCancelled, FirebaseIdentity.currentLUID() == viewerID else { throw AuthFlowError.notSignedIn }
        let comments = rows.compactMap { document -> LociComment? in
            let data = document.data()
            guard let commentID = UUID(uuidString: document.documentID), let user = uuid(data["user_id"]),
                  eligible.contains(key(user)) else { return nil }
            return LociComment(
                id: commentID,
                postID: postID,
                userID: user,
                username: data["username"] as? String ?? "loci",
                text: data["text"] as? String ?? "",
                createdAt: FirestoreJSON.date(data["created_at"]) ?? Date()
            )
        }
        let olderCursor: CommentPageCursor?
        if snapshot.documents.count > 50 {
            guard let last = rows.last, let timestamp = last.data()["created_at"] as? Timestamp else { throw BackendCallError.invalidResponse }
            olderCursor = CommentPageCursor(postID: postID, documentID: last.documentID, seconds: timestamp.seconds, nanoseconds: timestamp.nanoseconds)
        } else {
            olderCursor = nil
        }
        return LociCommentPage(comments: LociComment.merging([], with: comments), olderCursor: olderCursor)
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
        try await fileReport(postID: key(postID), userID: userID, reason: reason, metadata: ["source": "native_ios"])
    }

    func reportComment(_ comment: LociComment, userID: UUID, reason: String) async throws {
        try await fileReport(postID: key(comment.postID), userID: userID, reason: reason, metadata: [
            "source": "native_ios",
            "target": "comment",
            "comment_id": key(comment.id),
            "author_id": key(comment.userID),
            "text": String(comment.text.prefix(500)),
        ])
    }

    func reportUser(targetID: UUID, userID: UUID, reason: String) async throws {
        try await fileReport(postID: nil, userID: userID, reason: reason, metadata: [
            "source": "native_ios",
            "target": "user",
            "reported_user_id": key(targetID),
        ])
    }

    /// Allowed by rules for the comment's author and for the owner of the post it is on.
    func deleteComment(id: UUID) async throws {
        try await db.collection("comments").document(key(id)).delete()
    }

    private func fileReport(postID: String?, userID: UUID, reason: String, metadata: [String: String]) async throws {
        try await db.collection("moderation_flags").document(key(UUID())).setData([
            "post_id": postID ?? NSNull(),
            "user_id": key(userID),
            "reason": String(reason.prefix(500)),
            "status": "open",
            "metadata": metadata,
            "created_at": FieldValue.serverTimestamp(),
        ])
    }
}

actor PreviewSocialRepository: SocialRepository {
    private var liked: Set<UUID> = []
    private var saved: Set<UUID> = []
    private var views: [UUID: Int] = [:]
    private var collectionItems: [UUID: [UUID]] = [:]

    func activity(for userID: UUID) async throws -> [SocialActivity] { [] }
    func markActivityRead(ids: [String], for userID: UUID) async throws -> [String: Date] { [:] }
    func savedPostIDs(for userID: UUID) async throws -> [UUID] { Array(saved) }
    func likedPostIDs(for userID: UUID) async throws -> [UUID] { Array(liked) }
    func likeCount(for postID: UUID) async throws -> Int { liked.contains(postID) ? 1 : 0 }
    func setLiked(_ value: Bool, postID: UUID, userID: UUID) async throws {
        if value { liked.insert(postID) } else { liked.remove(postID) }
    }
    func recordView(postID: UUID, userID: UUID) async throws -> Int {
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
    func commentPage(for postID: UUID, before cursor: CommentPageCursor?) async throws -> LociCommentPage {
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
