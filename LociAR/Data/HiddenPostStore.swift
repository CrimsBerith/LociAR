import Foundation

/// Posts the user reported are hidden on this device right away, before moderators act on the
/// report (App Review Guideline 1.2: the reporter should not keep seeing the content). Scoped per
/// account so a shared device does not leak one user's hidden list to another.
actor HiddenPostStore {
    static let shared = HiddenPostStore()

    private let defaults: UserDefaults
    private static let keyPrefix = "hidden_post_ids."

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func clear(owner: String) { defaults.removeObject(forKey: Self.keyPrefix + owner) }

    func hide(_ postID: UUID, owner: String) {
        var ids = hiddenIDs(owner: owner)
        ids.insert(postID.uuidString.lowercased())
        defaults.set(Array(ids), forKey: Self.keyPrefix + owner)
    }

    func hiddenIDs(owner: String) -> Set<String> {
        Set(defaults.stringArray(forKey: Self.keyPrefix + owner) ?? [])
    }
}
