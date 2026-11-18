import Foundation

/// Posts the user reported are hidden on this device right away, before moderators act on the
/// report (App Review Guideline 1.2: the reporter should not keep seeing the content). Scoped per
/// account so a shared device does not leak one user's hidden list to another.
actor HiddenPostStore {
    static let shared = HiddenPostStore()

    private let defaults: UserDefaults
    private static let keyPrefix = "hidden_post_ids."
    /// Reports are rate limited and the server also filters reported posts, so a few hundred IDs is ample.
    static let limit = 500
    /// Feed filtering reads this on every load; decode UserDefaults once per account.
    private var cache: [String: [String]] = [:]

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func clear(owner: String) { cache[owner] = nil; defaults.removeObject(forKey: Self.keyPrefix + owner) }

    func hide(_ postID: UUID, owner: String) {
        let id = postID.uuidString.lowercased()
        var ids = ordered(owner: owner).filter { $0 != id }
        ids.append(id) // newest last; the oldest fall off past the limit
        if ids.count > Self.limit { ids.removeFirst(ids.count - Self.limit) }
        cache[owner] = ids
        defaults.set(ids, forKey: Self.keyPrefix + owner)
    }

    func hiddenIDs(owner: String) -> Set<String> { Set(ordered(owner: owner)) }

    private func ordered(owner: String) -> [String] {
        if let cached = cache[owner] { return cached }
        let ids = defaults.stringArray(forKey: Self.keyPrefix + owner) ?? []
        cache[owner] = ids
        return ids
    }
}
